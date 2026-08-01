"""Foundry IQ - reasoning + knowledge grounding in Azure AI Foundry.

Three layered paths (each falls back to the next so the demo never hard-fails):

1. AGENT (Phase 2) -> a real Foundry Agent grounded on the underwriting-guidelines
   knowledge base (Azure AI Search). The orchestrator retrieves the relevant
   guidelines and the agent reasons over them, citing guideline titles.
2. MODEL (Phase 1) -> a direct call to the deployed model with the gathered data.
3. RULES (mock)    -> a deterministic underwriting rules pass.

All paths return: { decision, reasons[], conditions[], narrative, knowledge[] }.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from typing import Any

from ..config import settings
from ..knowledge import search_guidelines

logger = logging.getLogger("foundry_iq")

_AGENT_INSTRUCTIONS = (
    "You are a mortgage underwriting assistant. Decide exactly one of: "
    "'Approve (conditional)', 'Approve', or 'Refer to underwriter'. Apply ONLY the "
    "GUIDELINES and DATA provided in the user message. Cite the guideline titles you "
    "relied on (in square brackets) inside each reason. Respond with STRICT JSON only: "
    '{"decision": str, "reasons": [str], "conditions": [str], "narrative": str}. '
    "The narrative is 3-6 short sentences and ends with a 'Sources:' line noting that "
    "credit/income came from Fabric IQ, documents/employment from Work IQ, rates from "
    "Web IQ, and underwriting rules from the Foundry IQ knowledge base."
)

_agents_client: Any = None
_agent_id: str | None = None
_agent_lock = threading.Lock()


class FoundryIQ:
    name = "foundry"
    display = "Azure AI Foundry (agent + AI Search)"
    source = "Azure AI Foundry"

    async def run(self, borrower: str, work: dict, fabric: dict, web: dict) -> dict[str, Any]:
        # Retrieve the relevant underwriting guidelines from the knowledge base
        # (works with the search key; no agent permissions required). These
        # ground every reasoning path below.
        guidelines = await asyncio.to_thread(
            search_guidelines, "credit score DTI LTV PMI documentation employment decision", 5
        )
        knowledge_titles = [g["title"] for g in guidelines if g.get("title")]

        if settings.use_agent:
            try:
                result = await asyncio.to_thread(
                    self._reason_with_agent, borrower, work, fabric, web, guidelines
                )
                result["detail"] = "Foundry agent reasoned over guidelines + IQ inputs"
                result["live"] = True
                result["knowledge"] = knowledge_titles
                return result
            except Exception as exc:  # noqa: BLE001
                logger.exception("Agent path failed; falling back to grounded model: %s", exc)

        if settings.use_model:
            try:
                result = await asyncio.to_thread(
                    self._reason_with_model, borrower, work, fabric, web, guidelines
                )
                grounded = " grounded on AI Search guidelines" if guidelines else ""
                result["detail"] = f"Reasoned with {settings.model_deployment}{grounded}"
                result["live"] = True
                result["knowledge"] = knowledge_titles
                return result
            except Exception as exc:  # noqa: BLE001
                logger.exception("Model path failed; using rules fallback: %s", exc)

        result = self._reason_with_rules(borrower, work, fabric, web)
        result["detail"] = "Deterministic underwriting rules (fallback)"
        result["live"] = False
        result["knowledge"] = knowledge_titles
        return result

    # ----- Phase 2: agent + knowledge grounding --------------------------

    def _reason_with_agent(self, borrower: str, work: dict, fabric: dict, web: dict,
                           guidelines: list[dict]) -> dict[str, Any]:
        from azure.ai.agents.models import ListSortOrder

        client = _get_agents_client()
        agent_id = _ensure_agent(client)

        payload = {
            "borrower": borrower,
            "work_iq": work.get("data", {}),
            "fabric_iq": fabric.get("data", {}),
            "web_iq": web.get("data", {}),
        }
        prompt = f"GUIDELINES:\n{json.dumps(guidelines)}\n\nDATA:\n{json.dumps(payload)}"

        thread = client.threads.create()
        client.messages.create(thread_id=thread.id, role="user", content=prompt)
        run = client.runs.create_and_process(thread_id=thread.id, agent_id=agent_id)
        if run.status != "completed":
            raise RuntimeError(f"agent run status={run.status} error={getattr(run, 'last_error', None)}")

        text = ""
        for m in client.messages.list(thread_id=thread.id, order=ListSortOrder.DESCENDING):
            if m.role == "assistant" and m.text_messages:
                text = m.text_messages[-1].text.value
                break
        parsed = _parse_json(text)
        return parsed

    # ----- Phase 1: direct model (grounded on retrieved guidelines) ------

    def _reason_with_model(self, borrower: str, work: dict, fabric: dict, web: dict,
                           guidelines: list[dict]) -> dict[str, Any]:
        from azure.identity import DefaultAzureCredential, get_bearer_token_provider
        from openai import AzureOpenAI

        token_provider = get_bearer_token_provider(
            DefaultAzureCredential(), "https://cognitiveservices.azure.com/.default"
        )
        client = AzureOpenAI(
            azure_endpoint=settings.foundry_openai_endpoint,
            azure_ad_token_provider=token_provider,
            api_version=settings.openai_api_version,
        )
        payload = {
            "borrower": borrower,
            "work_iq": work.get("data", {}),
            "fabric_iq": fabric.get("data", {}),
            "web_iq": web.get("data", {}),
        }
        user_content = f"GUIDELINES:\n{json.dumps(guidelines)}\n\nDATA:\n{json.dumps(payload)}"
        completion = client.chat.completions.create(
            model=settings.model_deployment,
            messages=[
                {"role": "system", "content": _AGENT_INSTRUCTIONS},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        return _parse_json(completion.choices[0].message.content or "{}")

    # ----- fallback rules -------------------------------------------------

    def _reason_with_rules(self, borrower: str, work: dict, fabric: dict, web: dict) -> dict[str, Any]:
        f = fabric.get("data", {})
        w = work.get("data", {})
        web_d = web.get("data", {})
        credit = f.get("credit_score", 0)
        ltv = f.get("ltv", 1.0)
        dti = f.get("dti", 1.0)
        missing = w.get("documents_missing", [])

        reasons: list[str] = []
        decision = "Approve (conditional)"

        if credit >= 680:
            reasons.append(f"Credit score {credit} meets the 680 conforming threshold. (Fabric IQ)")
        else:
            decision = "Refer to underwriter"
            reasons.append(f"Credit score {credit} is below the 680 threshold. (Fabric IQ)")

        if ltv <= 0.80:
            reasons.append(f"LTV {ltv:.0%} is within the 80% no-PMI limit. (Fabric IQ)")
        else:
            reasons.append(f"LTV {ltv:.0%} exceeds 80% - PMI required. (Fabric IQ)")

        if dti <= 0.43:
            reasons.append(f"DTI {dti:.0%} is within the 43% QM limit. (Fabric IQ)")
        else:
            decision = "Refer to underwriter"
            reasons.append(f"DTI {dti:.0%} exceeds the 43% QM limit. (Fabric IQ)")

        conditions = [f"Collect: {item} (Work IQ)" for item in missing]
        rate = web_d.get("avg_30yr_fixed")
        if rate:
            conditions.append(f"Lock quote referenced today's 30-yr fixed at {rate}%. (Web IQ)")

        narrative = _format_narrative(borrower, decision, f, web_d, reasons, conditions)
        return {"decision": decision, "reasons": reasons, "conditions": conditions, "narrative": narrative}


def _get_agents_client():
    global _agents_client
    if _agents_client is None:
        from azure.ai.agents import AgentsClient
        from azure.identity import DefaultAzureCredential

        _agents_client = AgentsClient(
            endpoint=settings.foundry_project_endpoint, credential=DefaultAzureCredential()
        )
    return _agents_client


def _ensure_agent(client) -> str:
    """Find the underwriter agent by name, creating it once if needed."""
    global _agent_id
    if _agent_id:
        return _agent_id
    with _agent_lock:
        if _agent_id:
            return _agent_id
        for a in client.list_agents():
            if a.name == settings.agent_name:
                _agent_id = a.id
                return _agent_id
        agent = client.create_agent(
            model=settings.model_deployment,
            name=settings.agent_name,
            instructions=_AGENT_INSTRUCTIONS,
        )
        _agent_id = agent.id
        return _agent_id


def _parse_json(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except Exception:  # noqa: BLE001 - tolerate fenced or wrapped JSON
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
        raise


def _format_narrative(borrower, decision, f, web_d, reasons, conditions) -> str:
    reason_txt = "\n".join(f"  - {r}" for r in reasons)
    cond_txt = "\n".join(f"  - {c}" for c in (conditions or ["None"]))
    return (
        f"Recommendation for {borrower}: {decision}\n\n"
        f"Loan: ${f.get('loan_amount', 0):,} on a ${f.get('property_value', 0):,} property "
        f"(LTV {f.get('ltv', 0):.0%}, DTI {f.get('dti', 0):.0%}, FICO {f.get('credit_score', 0)}).\n"
        f"Today's 30-yr fixed benchmark: {web_d.get('avg_30yr_fixed', 'n/a')}%.\n\n"
        f"Why:\n{reason_txt}\n\n"
        f"Conditions:\n{cond_txt}\n\n"
        f"Sources: credit/income - Fabric IQ; documents/employment - Work IQ; "
        f"rates/regulatory - Web IQ; rules - Foundry IQ."
    )
