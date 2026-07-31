"""Loan Concierge orchestrator.

Streams the mortgage-assessment flow as SSE events. As each of the four IQs is
invoked it emits ``iq_active`` events (active -> done) so the frontend can show,
side by side, exactly which Microsoft IQ is working at any moment.

The MOCK path is fully self-contained. The FOUNDRY path shows where a real Azure
AI Foundry Agent Service run would be wired in; it falls back to MOCK if the SDK
or configuration is unavailable so the demo never hard-fails on stage.
"""

from __future__ import annotations

import asyncio
import re
from typing import AsyncIterator

from .config import settings
from .connectors import FabricIQ, FoundryIQ, WebIQ, WorkIQ
from .iq_events import (
    IQ,
    IQStatus,
    done_event,
    error_event,
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
    """Core demo flow. Yields SSE frames."""
    borrower = _extract_borrower(message)

    work, fabric, web = WorkIQ(), FabricIQ(), WebIQ()
    foundry = FoundryIQ()

    try:
        yield message_event("assistant", f"Starting mortgage assessment for {borrower}...")

        # 1) Work IQ - gather the borrower's documents from M365.
        async for frame in _emit_iq(IQ.WORK, work.source, f"Collecting {borrower}'s documents"):
            yield frame
        work_result = await work.run(borrower)
        yield iq_event(IQ.WORK, IQStatus.DONE, work_result["detail"], work.source)

        # 2) Fabric IQ - pull governed business data.
        async for frame in _emit_iq(IQ.FABRIC, fabric.source, "Querying credit, income, valuation"):
            yield frame
        fabric_result = await fabric.run(borrower)
        yield iq_event(IQ.FABRIC, IQStatus.DONE, fabric_result["detail"], fabric.source)

        # 3) Web IQ - ground on live market + regulatory context.
        async for frame in _emit_iq(IQ.WEB, web.source, "Fetching today's rates + rules"):
            yield frame
        web_result = await web.run(message)
        yield iq_event(IQ.WEB, IQStatus.DONE, web_result["detail"], web.source)

        # 4) Foundry IQ - reason + ground on underwriting guidelines.
        async for frame in _emit_iq(IQ.FOUNDRY, foundry.source, "Reasoning over all IQ inputs"):
            yield frame
        decision = await foundry.run(work_result, fabric_result, web_result)
        yield iq_event(IQ.FOUNDRY, IQStatus.DONE, decision["detail"], foundry.source)

        # Stream the final recommendation token-by-token.
        summary = _format_summary(borrower, fabric_result, web_result, decision)
        for chunk in _tokenize(summary):
            yield token_event(chunk)
            await asyncio.sleep(0.02)

        yield done_event()
    except Exception as exc:  # noqa: BLE001 - surface any failure to the UI
        yield error_event(str(exc))
        yield done_event()


def _format_summary(borrower: str, fabric: dict, web: dict, decision: dict) -> str:
    reasons = "\n".join(f"  - {r}" for r in decision["reasons"])
    conditions = decision["conditions"] or ["None"]
    conditions_txt = "\n".join(f"  - {c}" for c in conditions)
    return (
        f"Recommendation for {borrower}: {decision['decision']}\n\n"
        f"Loan: ${fabric['loan_amount']:,} on a ${fabric['property_value']:,} property "
        f"(LTV {fabric['ltv']:.0%}, DTI {fabric['dti']:.0%}, FICO {fabric['credit_score']}).\n"
        f"Today's 30-yr fixed benchmark: {web['avg_30yr_fixed']}%.\n\n"
        f"Why:\n{reasons}\n\n"
        f"Conditions:\n{conditions_txt}\n"
    )


def _tokenize(text: str):
    for word in text.replace("\n", " \n ").split(" "):
        yield word + " "
