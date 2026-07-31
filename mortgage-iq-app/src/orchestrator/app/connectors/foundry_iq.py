"""Foundry IQ - reasoning + recommendation in Azure AI Foundry.

Two paths:

* MODEL (live)   -> calls the deployed model (e.g. gpt-5.4-mini) with all the
  data gathered by Work / Fabric / Web IQ, and asks it to produce the
  underwriting recommendation, reasoning and per-fact source attribution.
* RULES (fallback / mock) -> a deterministic underwriting rules pass, used when
  no model is configured or the model call fails, so the demo never hard-fails.

Both return: { decision, reasons[], conditions[], narrative }.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from ..config import settings

logger = logging.getLogger("foundry_iq")

_SYSTEM_PROMPT = (
    "You are a mortgage underwriting assistant. Decide one of: "
    "'Approve (conditional)', 'Approve', or 'Refer to underwriter'. "
    "Use ONLY the data provided from the three source systems (Work IQ, Fabric IQ, "
    "Web IQ). Apply these rules: credit score below 680 => refer; DTI above 0.43 => "
    "refer; LTV above 0.80 requires PMI as a condition. Always attribute each fact "
    "to the IQ it came from. Respond with STRICT JSON only, no markdown, matching: "
    '{"decision": str, "reasons": [str], "conditions": [str], "narrative": str}. '
    "The narrative is 3-6 short sentences and must end with a 'Sources:' line that "
    "lists which IQ provided credit/income (Fabric IQ), documents/employment "
    "(Work IQ), and rates/regulatory context (Web IQ)."
)


class FoundryIQ:
    name = "foundry"
    display = "Azure AI Foundry (agents + AI Search)"
    source = "Azure AI Foundry"

    async def run(self, borrower: str, work: dict, fabric: dict, web: dict) -> dict[str, Any]:
        if settings.use_model:
            try:
                result = await asyncio.to_thread(self._reason_with_model, borrower, work, fabric, web)
                result["detail"] = f"Reasoned with {settings.model_deployment} over all IQ inputs"
                result["live"] = True
                return result
            except Exception as exc:  # noqa: BLE001
                logger.exception("Model reasoning failed; using rules fallback: %s", exc)

        result = self._reason_with_rules(borrower, work, fabric, web)
        result["detail"] = "Grounding on underwriting guidelines + rules reasoning"
        result["live"] = False
        return result

    # ----- live model path -----------------------------------------------

    def _reason_with_model(self, borrower: str, work: dict, fabric: dict, web: dict) -> dict[str, Any]:
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
        completion = client.chat.completions.create(
            model=settings.model_deployment,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(payload)},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        content = completion.choices[0].message.content or "{}"
        parsed = json.loads(content)
        return {
            "decision": parsed.get("decision", "Refer to underwriter"),
            "reasons": parsed.get("reasons", []),
            "conditions": parsed.get("conditions", []),
            "narrative": parsed.get("narrative", ""),
        }

    # ----- deterministic fallback ----------------------------------------

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

        narrative = self._format_narrative(borrower, decision, f, web_d, reasons, conditions)
        return {"decision": decision, "reasons": reasons, "conditions": conditions, "narrative": narrative}

    @staticmethod
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
            f"Sources: credit/income/valuation - Fabric IQ; documents/employment - Work IQ; "
            f"rates/regulatory - Web IQ; decision - Foundry IQ."
        )
