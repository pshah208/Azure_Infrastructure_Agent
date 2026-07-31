"""Web IQ - web-scale grounding (Grounding with Bing).

Currently returns a canned market snapshot; the value is lightly varied by loan
size so different applications show different rate context. A future phase wires
this to a real Grounding-with-Bing connection on the Foundry agent.
"""

from __future__ import annotations

from typing import Any


class WebIQ:
    name = "web"
    display = "Web IQ"
    source = "Grounding with Bing"

    async def run(self, query: str, loan_amount: int = 0) -> dict[str, Any]:
        # Small deterministic variation so the demo does not look static.
        base = 6.52
        adjust = 0.05 if loan_amount and loan_amount > 500000 else 0.0
        return {
            "detail": "Checking today's market rates and TRID disclosure rules",
            "live": False,
            "data": {
                "avg_30yr_fixed": round(base + adjust, 2),
                "avg_15yr_fixed": round(base + adjust - 0.78, 2),
                "rate_trend": "down 0.08% week-over-week",
                "regulatory_note": "TRID: Loan Estimate must be delivered within 3 business days.",
            },
        }
