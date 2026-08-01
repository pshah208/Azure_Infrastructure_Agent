"""Knowledge retrieval from Azure AI Search (the Foundry IQ knowledge base).

Returns the underwriting guideline snippets most relevant to a query. Uses the
search key when provided, otherwise falls back to managed-identity (AAD) auth.
Best-effort: returns an empty list on any failure so reasoning can continue.
"""

from __future__ import annotations

import logging
from typing import Any

from .config import settings

logger = logging.getLogger("knowledge")


def search_guidelines(query: str, top: int = 5) -> list[dict[str, Any]]:
    if not settings.ai_search_endpoint:
        return []
    try:
        from azure.search.documents import SearchClient

        if settings.ai_search_key:
            from azure.core.credentials import AzureKeyCredential

            credential: Any = AzureKeyCredential(settings.ai_search_key)
        else:
            from azure.identity import DefaultAzureCredential

            credential = DefaultAzureCredential()

        client = SearchClient(settings.ai_search_endpoint, settings.ai_search_index, credential)
        results = client.search(query, top=top)
        return [{"title": r.get("title"), "content": r.get("content")} for r in results]
    except Exception as exc:  # noqa: BLE001 - retrieval is best-effort
        logger.warning("Knowledge retrieval failed: %s", exc)
        return []
