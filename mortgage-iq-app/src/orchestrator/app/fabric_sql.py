"""Shared helper to query a Microsoft Fabric SQL analytics endpoint.

Authenticates with the container's managed identity (``DefaultAzureCredential``)
so no secrets are needed. Imports of pyodbc / azure-identity are local so the
MOCK demo has no hard dependency on the ODBC driver.
"""

from __future__ import annotations

import logging
import struct
from typing import Any

from .config import settings

logger = logging.getLogger("fabric_sql")

_TOKEN_SCOPE = "https://database.windows.net/.default"
_SQL_COPT_SS_ACCESS_TOKEN = 1256


def _connect():
    import pyodbc
    from azure.identity import DefaultAzureCredential

    credential = DefaultAzureCredential()
    token = credential.get_token(_TOKEN_SCOPE).token.encode("utf-16-le")
    token_struct = struct.pack(f"<I{len(token)}s", len(token), token)

    conn_str = (
        "Driver={ODBC Driver 18 for SQL Server};"
        f"Server={settings.fabric_sql_endpoint},1433;"
        f"Database={settings.fabric_database};"
        "Encrypt=yes;TrustServerCertificate=no;"
    )
    return pyodbc.connect(conn_str, attrs_before={_SQL_COPT_SS_ACCESS_TOKEN: token_struct})


def query_one(table: str, match_column: str, value: str) -> dict[str, Any] | None:
    """Return the first matching row (as a dict) or None."""
    query = f"SELECT TOP 1 * FROM {table} WHERE {match_column} = ?"
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(query, value)
        record = cursor.fetchone()
        if record is None:
            return None
        cols = [c[0] for c in cursor.description]
        return dict(zip(cols, record))
