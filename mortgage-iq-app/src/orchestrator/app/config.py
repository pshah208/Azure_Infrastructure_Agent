"""Runtime configuration for the mortgage IQ orchestrator.

The demo runs in one of two modes:

* ``MOCK`` (default)  - no Azure dependencies; the four IQ connectors return
  canned, realistic data so the frontend "which IQ is active" experience works
  out of the box.
* ``FOUNDRY``         - the orchestrator talks to a real Azure AI Foundry
  project / Agent Service. Enabled automatically when ``AI_MODE=foundry`` and
  ``FOUNDRY_PROJECT_ENDPOINT`` are set.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    ai_mode: str = os.getenv("AI_MODE", "mock").lower()
    foundry_project_endpoint: str = os.getenv("FOUNDRY_PROJECT_ENDPOINT", "")
    foundry_agent_id: str = os.getenv("FOUNDRY_AGENT_ID", "")
    model_deployment: str = os.getenv("FOUNDRY_MODEL_DEPLOYMENT", "gpt-5.4-mini")
    # Azure OpenAI endpoint on the Foundry account (https://<name>.openai.azure.com/).
    foundry_openai_endpoint: str = os.getenv("FOUNDRY_OPENAI_ENDPOINT", "")
    openai_api_version: str = os.getenv("FOUNDRY_OPENAI_API_VERSION", "2024-10-21")

    # Grounding / data source configuration (only used in FOUNDRY mode).
    ai_search_endpoint: str = os.getenv("AI_SEARCH_ENDPOINT", "")
    ai_search_index: str = os.getenv("AI_SEARCH_INDEX", "mortgage-knowledge")
    ai_search_key: str = os.getenv("AI_SEARCH_KEY", "")
    agent_name: str = os.getenv("FOUNDRY_AGENT_NAME", "mortgage-underwriter")
    # Opt-in: use the Foundry Agent Service agent (requires the identity to have
    # the AIServices/agents data actions). Off by default; the grounded model
    # path is used otherwise (both cite the AI Search knowledge base).
    foundry_use_agent: bool = os.getenv("FOUNDRY_USE_AGENT", "false").lower() == "true"
    bing_connection_id: str = os.getenv("BING_CONNECTION_ID", "")
    fabric_sql_endpoint: str = os.getenv("FABRIC_SQL_ENDPOINT", "")
    fabric_database: str = os.getenv("FABRIC_DATABASE", "")
    fabric_borrower_table: str = os.getenv("FABRIC_BORROWER_TABLE", "dbo.borrowers")
    fabric_documents_table: str = os.getenv("FABRIC_DOCUMENTS_TABLE", "dbo.borrower_documents")
    graph_scopes: str = os.getenv("GRAPH_SCOPES", "Mail.Read Files.Read.All")

    # Pacing (seconds) so the IQ activity is visible during a live demo.
    step_delay_seconds: float = float(os.getenv("IQ_STEP_DELAY_SECONDS", "1.1"))

    @property
    def is_foundry(self) -> bool:
        return self.ai_mode == "foundry" and bool(self.foundry_project_endpoint)

    @property
    def use_fabric(self) -> bool:
        """Query real Fabric data only when foundry mode + a SQL endpoint are set."""
        return self.is_foundry and bool(self.fabric_sql_endpoint) and bool(self.fabric_database)

    @property
    def use_model(self) -> bool:
        """Use the deployed model for Foundry IQ reasoning when configured."""
        return self.is_foundry and bool(self.foundry_openai_endpoint) and bool(self.model_deployment)

    @property
    def use_agent(self) -> bool:
        """Use a Foundry Agent (opt-in) when the identity has agents data actions."""
        return self.is_foundry and self.foundry_use_agent


settings = Settings()
