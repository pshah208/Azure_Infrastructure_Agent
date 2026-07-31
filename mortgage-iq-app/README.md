# Mortgage IQ — the 4 Microsoft IQs, live

A demo mortgage-origination app that runs on **Azure Container Apps** and is
orchestrated by **Azure AI Foundry agents**. Its purpose is to make the four
Microsoft IQs tangible: as the *Loan Concierge* agent works an application, the
UI shows **side by side which IQ layer is active in real time**.

| IQ | Grounding source | Role in the app |
|----|------------------|-----------------|
| **Work IQ** | Microsoft 365 + Graph | Borrower documents, email, collaboration context |
| **Fabric IQ** | Microsoft Fabric (OneLake) | Governed business data: credit, income, valuation |
| **Foundry IQ** | Azure AI Foundry (agents + AI Search) | Reasoning + knowledge grounding on underwriting guidelines |
| **Web IQ** | Grounding with Bing | Live market rates and regulatory context |

## The showcase feature

The orchestrator streams **Server-Sent Events**. Each time an IQ tool runs it
emits an `iq_active` event (`active` → `done`). The React frontend renders four
IQ cards that **light up, pulse, and report what they're doing** as the agent
moves through the flow — so an audience can literally watch the intelligence
layers hand off to each other.

## Architecture

See `docs/architecture.drawio` (open in https://app.diagrams.net).

```
Users → Front Door → Container Apps env (web SPA · BFF/orchestrator · 4 IQ connectors)
                          │
                          ├─ Foundry IQ  → Azure AI Foundry (agents, models, AI Search)
                          ├─ Work IQ     → Microsoft 365 + Graph
                          ├─ Fabric IQ   → Microsoft Fabric OneLake
                          └─ Web IQ      → Grounding with Bing
```

## Repository layout

```
mortgage-iq-app/
├── azure.yaml                 # azd manifest (azd up)
├── infra/                     # Bicep IaC
│   ├── main.bicep
│   └── modules/               # observability · registry · ai-foundry · fabric · container-apps
├── src/
│   ├── orchestrator/          # FastAPI + SSE + Foundry agent host
│   │   └── app/
│   │       ├── main.py        # /api/chat (SSE), /api/config, /health
│   │       ├── orchestrator.py# Loan Concierge flow — emits iq_active events
│   │       └── connectors/    # work_iq · fabric_iq · foundry_iq · web_iq
│   └── web/                   # React + Vite + TS frontend
│       └── src/components/    # IQPanel · IQCard (the live IQ visual) · ChatPanel
└── docs/architecture.drawio
```

## Run locally (mock mode — no Azure required)

Two terminals:

```powershell
# 1) Orchestrator
cd src/orchestrator
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 2) Frontend
cd src/web
npm install
npm run dev
```

Open http://localhost:5173 and send *"Run a mortgage assessment for Jordan
Rivera"*. Watch the four IQ cards activate in sequence.

## Switch to real Azure AI Foundry

1. Provision infra: `azd up` (or `az deployment group create` with `infra/main.bicep`).
2. Set `AI_MODE=foundry` and `FOUNDRY_PROJECT_ENDPOINT` (plus the grounding
   variables in `.env.example`) on the orchestrator container app.
3. Redeploy the orchestrator.

## Add the dataset to Fabric later (Fabric IQ runbook)

Fabric **capacity** and **data** are decoupled: you can deploy the whole app now
(mock data) and drop a real dataset into Fabric afterward **without changing
code** - the `fabric_iq` connector switches from canned to live purely via env
vars. The Bicep only provisions the F2 *capacity*; the workspace, warehouse and
data are added below.

1. **Create a workspace** in the Fabric portal and **assign the F2 capacity** to
   it (Workspace settings -> License -> the `fab...` capacity from the Bicep).
2. **Create a Lakehouse or Warehouse** in the workspace.
3. **Load the borrower dataset.** Create a table matching the schema the
   connector expects (upload CSV/Parquet to OneLake, or use a Dataflow Gen2 /
   notebook):

   | column | type | notes |
   |---|---|---|
   | `full_name` | varchar | matched against the chat request |
   | `credit_score` | int | |
   | `annual_income` | decimal | |
   | `monthly_debt` | decimal | |
   | `loan_amount` | decimal | |
   | `property_value` | decimal | LTV/DTI are computed by the connector |

   Default table name is `dbo.borrowers` (override with `FABRIC_BORROWER_TABLE`).
4. **Grant the orchestrator's managed identity access** to the workspace
   (add it as a Viewer/Contributor member) so it can query with Entra auth - no
   secrets. The connector authenticates with `DefaultAzureCredential`.
5. **Copy the SQL analytics endpoint** from the Warehouse/Lakehouse
   (`<workspace>.datawarehouse.fabric.microsoft.com`).
6. **Set env vars on the orchestrator container app** and restart:
   `AI_MODE=foundry`, `FOUNDRY_PROJECT_ENDPOINT=<...>`,
   `FABRIC_SQL_ENDPOINT=<endpoint>`, `FABRIC_DATABASE=<warehouse-or-lakehouse>`.

The connector queries Fabric only when **all** of `AI_MODE=foundry`,
`FABRIC_SQL_ENDPOINT` and `FABRIC_DATABASE` are set (`settings.use_fabric`); if a
query returns no row or fails, it **falls back to the canned profile** so a live
demo never hard-fails. Requires the *ODBC Driver 18 for SQL Server* in the
orchestrator image (add to the Dockerfile before enabling the live path).

## Prerequisites on the subscription

Registering these resource providers (one-time, free) and confirming these
entitlements is required for full capability:

- Providers: `Microsoft.App`, `Microsoft.ContainerRegistry`,
  `Microsoft.CognitiveServices`, `Microsoft.Search`, `Microsoft.OperationalInsights`,
  `Microsoft.Insights`, `Microsoft.ManagedIdentity`, `Microsoft.Bing`, `Microsoft.Fabric`.
- **Azure OpenAI / Foundry model quota** in your region.
- **Microsoft Fabric** capacity (F-SKU) for Fabric IQ. The Bicep provisions an
  **F2** capacity by default (`infra/modules/fabric.bicep`). Set
  `fabricAdminMembers` to at least one Entra object ID, or `deployFabric=false`
  to skip it. F2 suits a single-presenter demo; step up to F4/F8 for concurrent
  users. Pause the capacity between demos to save cost.
- **Grounding with Bing** resource for Web IQ.
- **Microsoft 365 / Copilot** licensing (tenant-side) for Work IQ.

## Deployment note (frontend → orchestrator)

The SPA calls the orchestrator via `/api`. In Container Apps the web app's nginx
proxies `/api` to the internal orchestrator app; locally, Vite proxies `/api` to
`localhost:8000`.
