"""Agentic Foundry orchestration - the Loan Concierge agent.

A real Azure AI Foundry agent with four **function tools** that map to the four
Microsoft IQs. The model decides which tools to call for a given question, so any
new data in Fabric or Microsoft 365 is consumed live. As each tool runs, the
orchestrator emits the same ``iq_active`` / ``iq_data`` SSE events, so the IQ
side-panel lights up from the agent's *actual* tool calls.

The tools appear on the agent in the Foundry portal (Agents -> Tools).

Concurrency: the per-request emit callback and results are held in a
``threading.local`` because each request runs its agent loop in its own worker
thread, and the tool functions (whose signatures define the agent's tool schema)
cannot take extra parameters.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from typing import Any, Callable

from .config import settings
from .connectors import FabricIQ, WebIQ, WorkIQ
from .iq_events import IQ, IQStatus, iq_data_event, iq_event, token_event
from .knowledge import search_guidelines

logger = logging.getLogger("agent")

_ctx = threading.local()
_agent_client: Any = None
_agent_id: str | None = None
_agent_lock = threading.Lock()

_INSTRUCTIONS = (
    "You are the Loan Concierge, a helpful mortgage assistant. Answer the user's "
    "question conversationally and concisely. Tools available: get_fabric_iq "
    "(a borrower's credit/income/loan/valuation), get_work_iq (their document "
    "intake and employment from Microsoft 365), get_web_iq (current market rates "
    "and regulatory context), and lookup_underwriting_guidelines (the underwriting "
    "rulebook). Rules for tool use: if the user names a specific borrower and asks "
    "for an assessment, call get_fabric_iq, get_work_iq and lookup_underwriting_"
    "guidelines (and get_web_iq if rates are relevant), then give a clear "
    "recommendation - Approve, Approve (conditional), or Refer to underwriter - "
    "with conditions. If the user asks a GENERAL question that is not about a "
    "specific borrower, call ONLY lookup_underwriting_guidelines (or no tool). "
    "Never invent borrower data; only use what the tools return. Attribute facts to "
    "the IQ/tool they came from."
)


def _emit(frame: str) -> None:
    cb: Callable[[str], None] | None = getattr(_ctx, "emit", None)
    if cb:
        cb(frame)


# ----- function tools (their signatures define the agent's tool schema) -----

def get_fabric_iq(borrower: str) -> str:
    """Get a borrower's credit score, annual income, monthly debt, loan amount, property value, LTV and DTI from Microsoft Fabric (OneLake)."""
    _emit(iq_event(IQ.FABRIC, IQStatus.ACTIVE, f"Querying {borrower}'s credit, income, valuation", "Microsoft Fabric (OneLake)"))
    result = asyncio.run(FabricIQ().run(borrower))
    data = dict(result["data"])
    if settings.use_fabric and not result["live"]:
        data = {"note": f"No borrower record found for '{borrower}'."}
    _emit(iq_data_event(IQ.FABRIC, data, result["live"]))
    _emit(iq_event(IQ.FABRIC, IQStatus.DONE, result["detail"], "Microsoft Fabric (OneLake)"))
    return json.dumps(data)


def get_work_iq(borrower: str) -> str:
    """Get a borrower's document-intake status, missing documents, employment verification and last contact from Microsoft 365 (Work IQ)."""
    _emit(iq_event(IQ.WORK, IQStatus.ACTIVE, f"Collecting {borrower}'s documents", "Microsoft 365 + Graph"))
    result = asyncio.run(WorkIQ().run(borrower))
    data = dict(result["data"])
    if settings.use_fabric and not result["live"]:
        data = {"note": f"No Microsoft 365 records found for '{borrower}'."}
    _emit(iq_data_event(IQ.WORK, data, result["live"]))
    _emit(iq_event(IQ.WORK, IQStatus.DONE, result["detail"], "Microsoft 365 + Graph"))
    return json.dumps(data)


def get_web_iq(query: str) -> str:
    """Get today's mortgage market rates (30-yr and 15-yr fixed) and regulatory context from the web (Web IQ)."""
    _emit(iq_event(IQ.WEB, IQStatus.ACTIVE, "Fetching today's rates + rules", "Grounding with Bing"))
    result = asyncio.run(WebIQ().run(query, 0))
    _emit(iq_data_event(IQ.WEB, result["data"], result["live"]))
    _emit(iq_event(IQ.WEB, IQStatus.DONE, result["detail"], "Grounding with Bing"))
    return json.dumps(result["data"])


def lookup_underwriting_guidelines(query: str) -> str:
    """Look up the relevant mortgage underwriting guideline rules (credit score, DTI, LTV, PMI, documentation, decision matrix) from the Foundry IQ knowledge base."""
    _emit(iq_event(IQ.FOUNDRY, IQStatus.ACTIVE, "Grounding on underwriting guidelines", "Azure AI Foundry"))
    guidelines = search_guidelines(query, top=5)
    titles = [g["title"] for g in guidelines if g.get("title")]
    _emit(iq_data_event(IQ.FOUNDRY, {"knowledge_cited": titles}, bool(titles)))
    _emit(iq_event(IQ.FOUNDRY, IQStatus.DONE, "Retrieved underwriting guidelines", "Azure AI Foundry"))
    return json.dumps(guidelines)


_TOOL_FUNCS = {get_fabric_iq, get_work_iq, get_web_iq, lookup_underwriting_guidelines}
_DISPATCH = {f.__name__: f for f in _TOOL_FUNCS}


def _get_client():
    global _agent_client
    if _agent_client is None:
        from azure.ai.agents import AgentsClient
        from azure.identity import DefaultAzureCredential

        _agent_client = AgentsClient(
            endpoint=settings.foundry_project_endpoint, credential=DefaultAzureCredential()
        )
    return _agent_client


def _ensure_agent(client) -> str:
    global _agent_id
    if _agent_id:
        return _agent_id
    with _agent_lock:
        if _agent_id:
            return _agent_id
        from azure.ai.agents.models import FunctionTool

        tools = FunctionTool(functions=_TOOL_FUNCS)
        for a in client.list_agents():
            if a.name == settings.agent_name:
                # Keep instructions/tools in sync on redeploy.
                client.update_agent(agent_id=a.id, instructions=_INSTRUCTIONS, tools=tools.definitions)
                _agent_id = a.id
                return _agent_id
        agent = client.create_agent(
            model=settings.model_deployment,
            name=settings.agent_name,
            instructions=_INSTRUCTIONS,
            tools=tools.definitions,
        )
        _agent_id = agent.id
        logger.info("Created Loan Concierge agent %s", _agent_id)
        return _agent_id


def run_conversation(message: str, emit: Callable[[str], None]) -> None:
    """Blocking: run the agent tool-call loop, emitting SSE frames via ``emit``."""
    from azure.ai.agents.models import ListSortOrder, SubmitToolOutputsAction, ToolOutput

    _ctx.emit = emit
    client = _get_client()
    agent_id = _ensure_agent(client)

    thread = client.threads.create()
    client.messages.create(thread_id=thread.id, role="user", content=message)
    run = client.runs.create(thread_id=thread.id, agent_id=agent_id)

    while run.status in ("queued", "in_progress", "requires_action"):
        if run.status == "requires_action" and isinstance(run.required_action, SubmitToolOutputsAction):
            outputs = []
            for tc in run.required_action.submit_tool_outputs.tool_calls:
                func = _DISPATCH.get(tc.function.name)
                if not func:
                    outputs.append(ToolOutput(tool_call_id=tc.id, output=json.dumps({"error": "unknown tool"})))
                    continue
                try:
                    args = json.loads(tc.function.arguments or "{}")
                    result = func(**args)
                except Exception as exc:  # noqa: BLE001
                    logger.exception("tool %s failed: %s", tc.function.name, exc)
                    result = json.dumps({"error": str(exc)})
                outputs.append(ToolOutput(tool_call_id=tc.id, output=result))
            run = client.runs.submit_tool_outputs(thread_id=thread.id, run_id=run.id, tool_outputs=outputs)
        else:
            time.sleep(0.8)
            run = client.runs.get(thread_id=thread.id, run_id=run.id)

    if run.status != "completed":
        raise RuntimeError(f"agent run status={run.status} error={getattr(run, 'last_error', None)}")

    text = ""
    for m in client.messages.list(thread_id=thread.id, order=ListSortOrder.DESCENDING):
        if m.role == "assistant" and m.text_messages:
            text = m.text_messages[-1].text.value
            break
    for word in text.replace("\n", " \n ").split(" "):
        emit(token_event(word + " "))
        time.sleep(0.01)
