"""Loan Concierge orchestrator.

Streams the mortgage-assessment flow as SSE events. As each of the four IQs is
invoked it emits ``iq_active`` events (active -> done) plus an ``iq_data`` event
carrying the actual data that IQ returned, so the frontend shows - side by side -
which Microsoft IQ is working and exactly what it contributed.

Fabric IQ and Work IQ query live OneLake data when configured; Foundry IQ reasons
with the deployed model. Every step falls back to canned data/rules if a live
call fails, so the demo never hard-fails on stage.
"""

from __future__ import annotations

import asyncio
import re
from typing import Any, AsyncIterator

from .config import settings
from .connectors import FabricIQ, FoundryIQ, WebIQ, WorkIQ
from .iq_events import (
    IQ,
    IQStatus,
    done_event,
    error_event,
    iq_data_event,
    iq_event,
    message_event,
    token_event,
)

_BORROWER_RE = re.compile(r"for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)")


def _extract_borrower(message: str) -> str:
    match = _BORROWER_RE.search(message)
    if match:
        return match.group(1)
    return "the applicant"


async def _emit_iq(iq: IQ, source: str, active_detail: str):
    """Yield the 'active' frame, pause for demo visibility, caller yields 'done'."""
    yield iq_event(iq, IQStatus.ACTIVE, active_detail, source)
    await asyncio.sleep(settings.step_delay_seconds)


async def run_assessment(message: str) -> AsyncIterator[str]:
    """Route to the agentic flow (real Foundry agent + tools) when enabled,
    otherwise the deterministic pipeline. Falls back to the pipeline if the
    agent path fails so the demo never hard-fails."""
    if settings.use_agent:
        agent_failed = False
        async for frame in _run_agentic(message):
            if frame is _AGENT_FAILED:
                agent_failed = True
                break
            yield frame
        if not agent_failed:
            return
        # Agent unavailable (e.g. role not yet assigned) - fall back silently.
    async for frame in _run_pipeline(message):
        yield frame


_AGENT_FAILED = object()


async def _run_agentic(message: str) -> AsyncIterator[Any]:
    """Drive the blocking agent tool-call loop in a worker thread, draining its
    emitted SSE frames through a queue. Yields the sentinel _AGENT_FAILED if the
    agent errors before emitting anything."""
    from . import agent as agent_mod

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    emitted = {"count": 0, "error": None}

    def emit(frame: str) -> None:
        emitted["count"] += 1
        loop.call_soon_threadsafe(queue.put_nowait, frame)

    def worker() -> None:
        try:
            agent_mod.run_conversation(message, emit)
        except Exception as exc:  # noqa: BLE001
            emitted["error"] = exc
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    loop.run_in_executor(None, worker)

    while True:
        frame = await queue.get()
        if frame is None:
            break
        yield frame

    if emitted["error"] is not None and emitted["count"] == 0:
        yield _AGENT_FAILED
        return
    yield done_event()


async def _run_pipeline(message: str) -> AsyncIterator[str]:
    """Deterministic four-IQ pipeline. Yields SSE frames."""
    borrower = _extract_borrower(message)

    work, fabric, web = WorkIQ(), FabricIQ(), WebIQ()
    foundry = FoundryIQ()

    try:
        yield message_event("assistant", f"Starting mortgage assessment for {borrower}...")

        # 1) Work IQ - gather the borrower's documents from M365.
        async for frame in _emit_iq(IQ.WORK, work.source, f"Collecting {borrower}'s documents"):
            yield frame
        work_result = await work.run(borrower)
        yield iq_data_event(IQ.WORK, work_result["data"], work_result["live"])
        yield iq_event(IQ.WORK, IQStatus.DONE, work_result["detail"], work.source)

        # 2) Fabric IQ - pull governed business data.
        async for frame in _emit_iq(IQ.FABRIC, fabric.source, "Querying credit, income, valuation"):
            yield frame
        fabric_result = await fabric.run(borrower)
        yield iq_data_event(IQ.FABRIC, fabric_result["data"], fabric_result["live"])
        yield iq_event(IQ.FABRIC, IQStatus.DONE, fabric_result["detail"], fabric.source)

        # 3) Web IQ - ground on market + regulatory context.
        async for frame in _emit_iq(IQ.WEB, web.source, "Fetching today's rates + rules"):
            yield frame
        loan_amount = int(fabric_result["data"].get("loan_amount", 0))
        web_result = await web.run(message, loan_amount)
        yield iq_data_event(IQ.WEB, web_result["data"], web_result["live"])
        yield iq_event(IQ.WEB, IQStatus.DONE, web_result["detail"], web.source)

        # 4) Foundry IQ - reason over everything the other IQs gathered.
        async for frame in _emit_iq(IQ.FOUNDRY, foundry.source, "Reasoning over all IQ inputs"):
            yield frame
        decision = await foundry.run(borrower, work_result, fabric_result, web_result)
        yield iq_data_event(
            IQ.FOUNDRY,
            {"decision": decision["decision"], "knowledge_cited": decision.get("knowledge", [])},
            decision["live"],
        )
        yield iq_event(IQ.FOUNDRY, IQStatus.DONE, decision["detail"], foundry.source)

        # Stream the final recommendation token-by-token.
        narrative = decision.get("narrative") or ""
        for chunk in _tokenize(narrative):
            yield token_event(chunk)
            await asyncio.sleep(0.02)

        yield done_event()
    except Exception as exc:  # noqa: BLE001 - surface any failure to the UI
        yield error_event(str(exc))
        yield done_event()


def _tokenize(text: str):
    for word in text.replace("\n", " \n ").split(" "):
        yield word + " "
