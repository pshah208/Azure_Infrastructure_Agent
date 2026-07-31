"""Fabric IQ - enterprise business data via Microsoft Fabric / OneLake.

Two execution paths, selected automatically by configuration:

* MOCK (default)  - returns a canned underwriting profile so the demo runs with
  no Azure or Fabric dependency.
* FABRIC (live)   - queries the Fabric Warehouse / Lakehouse SQL analytics
  endpoint for the borrower's credit, income and property valuation. Auth uses
  the container app's managed identity via ``azure-identity`` (no secrets), so
  once the dataset lands in Fabric you only set env vars - no code change.

Enable the live path by setting (see .env.example / README runbook):
    AI_MODE=foundry
    FOUNDRY_PROJECT_ENDPOINT=<...>
    FABRIC_SQL_ENDPOINT=<workspace>.datawarehouse.fabric.microsoft.com
    FABRIC_DATABASE=<lakehouse-or-warehouse-name>
    FABRIC_BORROWER_TABLE=dbo.borrowers   # optional, this is the default
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from ..config import settings

logger = logging.getLogger("fabric_iq")

# Canned profile used by the MOCK path and as a safe fallback if a live query
# fails mid-demo.
_MOCK_PROFILE: dict[str, Any] = {
    "detail": "Pulling credit, income and property valuation from OneLake",
    "credit_score": 742,
    "annual_income": 128000,
    "monthly_debt": 1850,
    "loan_amount": 480000,
    "property_value": 600000,
    "ltv": 0.80,
    "dti": 0.34,
}

# The Entra scope for Fabric / Azure SQL data-plane tokens.
_FABRIC_TOKEN_SCOPE = "https://database.windows.net/.default"


class FabricIQ:
    name = "fabric"
    display = "Fabric IQ"
    source = "Microsoft Fabric (OneLake)"

    async def run(self, borrower: str) -> dict[str, Any]:
        if not settings.use_fabric:
            return dict(_MOCK_PROFILE)

        # Run the blocking ODBC call in a worker thread so we don't stall the
        # event loop / SSE stream.
        try:
            row = await asyncio.to_thread(self._query_borrower, borrower)
            if row is None:
                logger.warning("No Fabric row for '%s'; using mock fallback", borrower)
                return dict(_MOCK_PROFILE)
            return self._to_profile(row)
        except Exception as exc:  # noqa: BLE001 - never hard-fail the live demo
            logger.exception("Fabric query failed; using mock fallback: %s", exc)
            fallback = dict(_MOCK_PROFILE)
            fallback["detail"] = "Fabric query unavailable - using cached profile"
            return fallback

    # ----- live path ------------------------------------------------------

    def _query_borrower(self, borrower: str) -> dict[str, Any] | None:
        """Query the Fabric SQL analytics endpoint using a managed-identity token.

        Imports are local so the MOCK demo has no hard dependency on the ODBC
        driver or azure-identity.
        """
        import struct

        import pyodbc
        from azure.identity import DefaultAzureCredential

        credential = DefaultAzureCredential()
        token = credential.get_token(_FABRIC_TOKEN_SCOPE).token.encode("utf-16-le")
        token_struct = struct.pack(f"<I{len(token)}s", len(token), token)
        # SQL_COPT_SS_ACCESS_TOKEN
        sql_copt_ss_access_token = 1256

        conn_str = (
            "Driver={ODBC Driver 18 for SQL Server};"
            f"Server={settings.fabric_sql_endpoint},1433;"
            f"Database={settings.fabric_database};"
            "Encrypt=yes;TrustServerCertificate=no;"
        )

        table = settings.fabric_borrower_table
        query = (
            "SELECT TOP 1 credit_score, annual_income, monthly_debt, "
            "loan_amount, property_value "
            f"FROM {table} WHERE full_name = ?"
        )

        with pyodbc.connect(conn_str, attrs_before={sql_copt_ss_access_token: token_struct}) as conn:
            cursor = conn.cursor()
            cursor.execute(query, borrower)
            record = cursor.fetchone()
            if record is None:
                return None
            cols = [c[0] for c in cursor.description]
            return dict(zip(cols, record))

    @staticmethod
    def _to_profile(row: dict[str, Any]) -> dict[str, Any]:
        loan = float(row.get("loan_amount") or 0)
        value = float(row.get("property_value") or 0)
        income = float(row.get("annual_income") or 0)
        monthly_debt = float(row.get("monthly_debt") or 0)
        ltv = round(loan / value, 4) if value else 0.0
        dti = round(monthly_debt / (income / 12), 4) if income else 0.0
        return {
            "detail": "Queried credit, income and valuation from Fabric OneLake",
            "credit_score": int(row.get("credit_score") or 0),
            "annual_income": int(income),
            "monthly_debt": int(monthly_debt),
            "loan_amount": int(loan),
            "property_value": int(value),
            "ltv": ltv,
            "dti": dti,
        }
