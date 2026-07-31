"""Work IQ - Microsoft 365 + Graph work context.

In a real deployment this connector calls Microsoft Graph to read the loan
officer's borrower correspondence, document-collection status from SharePoint,
and calendar. For the demo it returns a canned document-intake summary.
"""

from __future__ import annotations

from typing import Any


class WorkIQ:
    name = "work"
    display = "Work IQ"
    source = "Microsoft 365 + Graph"

    async def run(self, borrower: str) -> dict[str, Any]:
        # Real mode: query Microsoft Graph (Mail.Read, Files.Read.All) for the
        # borrower's submitted documents and outstanding items.
        return {
            "detail": f"Reading {borrower}'s email + SharePoint document folder",
            "documents_received": ["Pay stubs (2)", "W-2 (2023)", "Bank statements (3 mo)"],
            "documents_missing": ["Homeowner's insurance quote"],
            "last_contact": "Borrower replied 2 days ago confirming employment",
        }
