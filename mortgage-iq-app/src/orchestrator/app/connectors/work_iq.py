"""Work IQ - Microsoft 365 + Graph work context (borrower document intake).

MOCK (default)  -> canned document-intake summary.
FABRIC (live)   -> queries a synthetic ``borrower_documents`` table (an M365 /
                   SharePoint export) for per-borrower document status, last
                   contact and employment verification, via managed identity.

In production this connector would call Microsoft Graph directly; the table is a
stand-in so the demo shows dynamic, per-borrower Work IQ data.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from ..config import settings
from ..fabric_sql import query_one

logger = logging.getLogger("work_iq")

_MOCK: dict[str, Any] = {
    "documents_received": ["Pay stubs (2)", "W-2 (2023)", "Bank statements (3 mo)"],
    "documents_missing": ["Homeowner's insurance quote"],
    "employment_status": "Verified - employed 4 yrs",
    "last_contact": "Borrower replied 2 days ago confirming employment",
}


class WorkIQ:
    name = "work"
    display = "Work IQ"
    source = "Microsoft 365 + Graph"

    async def run(self, borrower: str) -> dict[str, Any]:
        if not settings.use_fabric:
            return {"detail": f"Reading {borrower}'s email + SharePoint document folder",
                    "live": False, "data": dict(_MOCK)}
        try:
            row = await asyncio.to_thread(query_one, settings.fabric_documents_table, "full_name", borrower)
            if row is None:
                return {"detail": f"No M365 records for {borrower}; using cached intake",
                        "live": False, "data": dict(_MOCK)}
            return {"detail": f"Read {borrower}'s M365 mail + SharePoint documents",
                    "live": True, "data": self._to_summary(row)}
        except Exception as exc:  # noqa: BLE001
            logger.exception("Work IQ query failed; using mock fallback: %s", exc)
            return {"detail": "M365 lookup unavailable - using cached intake",
                    "live": False, "data": dict(_MOCK)}

    @staticmethod
    def _to_summary(row: dict[str, Any]) -> dict[str, Any]:
        def split(v: Any) -> list[str]:
            if not v:
                return []
            return [s.strip() for s in str(v).split(";") if s.strip()]

        return {
            "documents_received": split(row.get("documents_received")),
            "documents_missing": split(row.get("documents_missing")),
            "employment_status": row.get("employment_status") or "Unknown",
            "last_contact": row.get("last_contact") or "No recent contact",
        }
