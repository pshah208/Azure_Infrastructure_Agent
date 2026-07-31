"""Web IQ - web-scale grounding (Grounding with Bing).

Real mode uses a Grounding-with-Bing connection attached to the Foundry agent to
retrieve current mortgage rates and regulatory context. For the demo it returns
a canned market snapshot.
"""

from __future__ import annotations

from typing import Any


class WebIQ:
    name = "web"
    display = "Web IQ"
    source = "Grounding with Bing"

    async def run(self, query: str) -> dict[str, Any]:
        # Real mode: Grounding with Bing tool call via the Foundry agent.
        return {
            "detail": "Checking today's market rates and TRID disclosure rules",
            "avg_30yr_fixed": 6.52,
            "avg_15yr_fixed": 5.74,
            "rate_trend": "down 0.08% week-over-week",
            "regulatory_note": "TRID: Loan Estimate must be delivered within 3 business days.",
        }
