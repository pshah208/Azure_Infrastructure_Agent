"""Foundry IQ - reasoning + knowledge grounding in Azure AI Foundry.

This is the "brain": it grounds on the underwriting guideline knowledge base
(Azure AI Search) and reasons over everything the other three IQs gathered to
produce an underwriting recommendation. In MOCK mode the reasoning is a
deterministic rules pass so the demo is explainable; in FOUNDRY mode the model
deployment does the reasoning.
"""

from __future__ import annotations

from typing import Any


class FoundryIQ:
    name = "foundry"
    display = "Foundry IQ"
    source = "Azure AI Foundry (agents + AI Search)"

    async def run(self, work: dict, fabric: dict, web: dict) -> dict[str, Any]:
        credit = fabric.get("credit_score", 0)
        ltv = fabric.get("ltv", 1.0)
        dti = fabric.get("dti", 1.0)
        missing = work.get("documents_missing", [])

        reasons: list[str] = []
        decision = "Approve (conditional)"

        if credit >= 680:
            reasons.append(f"Credit score {credit} meets the 680 conforming threshold.")
        else:
            decision = "Refer to underwriter"
            reasons.append(f"Credit score {credit} is below the 680 threshold.")

        if ltv <= 0.80:
            reasons.append(f"LTV {ltv:.0%} is within the 80% no-PMI limit.")
        else:
            reasons.append(f"LTV {ltv:.0%} exceeds 80% - PMI required.")

        if dti <= 0.43:
            reasons.append(f"DTI {dti:.0%} is within the 43% QM limit.")
        else:
            decision = "Refer to underwriter"
            reasons.append(f"DTI {dti:.0%} exceeds the 43% QM limit.")

        conditions = [f"Collect: {item}" for item in missing]
        rate = web.get("avg_30yr_fixed")
        if rate:
            conditions.append(f"Lock quote referenced today's 30-yr fixed at {rate}%.")

        return {
            "detail": "Grounding on underwriting guidelines + reasoning over IQ inputs",
            "decision": decision,
            "reasons": reasons,
            "conditions": conditions,
        }
