"""Fabric IQ - enterprise business data via Microsoft Fabric / OneLake.

MOCK (default)  -> canned underwriting profile.
FABRIC (live)   -> queries the Fabric SQL analytics endpoint for the borrower's
                   credit, income and property valuation (managed-identity auth).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from ..config import settings
from ..fabric_sql import query_one

logger = logging.getLogger("fabric_iq")

_MOCK_PROFILE: dict[str, Any] = {
    "credit_score": 742,
    "annual_income": 128000,
    "monthly_debt": 1850,
    "loan_amount": 480000,
    "property_value": 600000,
    "ltv": 0.80,
    "dti": 0.34,
}


class FabricIQ:
    name = "fabric"
    display = "Fabric IQ"
    source = "Microsoft Fabric (OneLake)"

    async def run(self, borrower: str) -> dict[str, Any]:
        if not settings.use_fabric:
            return {"detail": "Pulling credit, income and property valuation from OneLake",
                    "live": False, "data": dict(_MOCK_PROFILE)}
        try:
            row = await asyncio.to_thread(query_one, settings.fabric_borrower_table, "full_name", borrower)
            if row is None:
                logger.warning("No Fabric row for '%s'; using mock fallback", borrower)
                return {"detail": f"No record for {borrower}; using cached profile",
                        "live": False, "data": dict(_MOCK_PROFILE)}
            return {"detail": "Queried credit, income and valuation from Fabric OneLake",
                    "live": True, "data": self._to_profile(row)}
        except Exception as exc:  # noqa: BLE001
            logger.exception("Fabric query failed; using mock fallback: %s", exc)
            return {"detail": "Fabric query unavailable - using cached profile",
                    "live": False, "data": dict(_MOCK_PROFILE)}

    @staticmethod
    def _to_profile(row: dict[str, Any]) -> dict[str, Any]:
        loan = float(row.get("loan_amount") or 0)
        value = float(row.get("property_value") or 0)
        income = float(row.get("annual_income") or 0)
        monthly_debt = float(row.get("monthly_debt") or 0)
        ltv = round(loan / value, 4) if value else 0.0
        dti = round(monthly_debt / (income / 12), 4) if income else 0.0
        return {
            "credit_score": int(row.get("credit_score") or 0),
            "annual_income": int(income),
            "monthly_debt": int(monthly_debt),
            "loan_amount": int(loan),
            "property_value": int(value),
            "ltv": ltv,
            "dti": dti,
        }
