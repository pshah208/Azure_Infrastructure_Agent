"""Create the AI Search index for underwriting guidelines and upload the docs.

Usage (local, one-time):
    pip install azure-search-documents==11.5.2
    $env:SEARCH_ENDPOINT="https://<service>.search.windows.net"
    $env:SEARCH_ADMIN_KEY="<admin-key>"
    python data/index_guidelines.py

The Foundry agent grounds on this index (the "Foundry IQ" knowledge source).
A simple keyword/semantic index is used - no embedding model required.
"""

from __future__ import annotations

import json
import os
import pathlib

from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchableField,
    SearchField,
    SearchFieldDataType,
    SearchIndex,
    SemanticConfiguration,
    SemanticField,
    SemanticPrioritizedFields,
    SemanticSearch,
    SimpleField,
)

INDEX_NAME = os.getenv("SEARCH_INDEX", "mortgage-knowledge")
ENDPOINT = os.environ["SEARCH_ENDPOINT"]
KEY = os.environ["SEARCH_ADMIN_KEY"]

cred = AzureKeyCredential(KEY)


def build_index() -> None:
    index_client = SearchIndexClient(ENDPOINT, cred)
    fields = [
        SimpleField(name="id", type=SearchFieldDataType.String, key=True),
        SearchableField(name="title", type=SearchFieldDataType.String),
        SearchableField(name="category", type=SearchFieldDataType.String, filterable=True),
        SearchableField(name="content", type=SearchFieldDataType.String),
    ]
    semantic = SemanticSearch(
        configurations=[
            SemanticConfiguration(
                name="default",
                prioritized_fields=SemanticPrioritizedFields(
                    title_field=SemanticField(field_name="title"),
                    content_fields=[SemanticField(field_name="content")],
                ),
            )
        ]
    )
    index = SearchIndex(name=INDEX_NAME, fields=fields, semantic_search=semantic)
    index_client.create_or_update_index(index)
    print(f"Index '{INDEX_NAME}' created/updated.")


def upload_docs() -> None:
    docs = json.loads(pathlib.Path(__file__).with_name("underwriting_guidelines.json").read_text())
    client = SearchClient(ENDPOINT, INDEX_NAME, cred)
    result = client.upload_documents(documents=docs)
    print(f"Uploaded {len(result)} guideline documents.")


if __name__ == "__main__":
    build_index()
    upload_docs()
