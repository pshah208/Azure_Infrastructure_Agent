# Mortgage IQ (v2)

An **agentic** mortgage-underwriting demo on **Azure Container Apps + Azure AI
Foundry**, showcasing the four Microsoft IQs — **Work IQ, Fabric IQ, Foundry IQ,
Web IQ**. Rebuilt from the ground up following the structure and Foundry wiring
of the [Lulu IQ RFP demo](https://github.com/mcaps-microsoft/lulu-rfp-demo).

Ask the **Loan Concierge** anything about a mortgage application. It is a real
Azure AI Foundry agent that decides which **IQ tools** to call, gathers live
data, grounds on the underwriting knowledge base, and returns a recommendation —
with the IQ side-panel lighting up from the agent's *actual* tool calls.

## What changed vs v1 (and why it's better)

| Concern (v1) | v2 fix |
|---|---|
| "Feels like a chatbot with preset data" | Real Foundry **agent** with function tools; the model decides what to call |
| "No connections/config visible in Foundry" | Agent + tools are registered *in the project* by `scripts/foundry-agents-create.ts` (visible in the portal) |
| Split web + orchestrator, bespoke plumbing | Single **Next.js** app; clean `lib/azure/*` per-service clients (Lulu pattern) |
| Hard to run without Azure | **Local mode**: with nothing configured, the four IQ tools serve synthetic JSON and a deterministic reasoner answers |

## Architecture

```
Browser ──► Next.js (Azure Container Apps)
              app/api/assistant  ──►  lib/concierge.ts
                                        │  isFoundryAgentEnabled()?
                                        ├─ yes ─► lib/azure/foundry.ts invokeAgent("loan-concierge", …)
                                        │           └─ tool loop dispatches to lib/iq/* (live)
                                        └─ no  ─► local reasoner (calls lib/iq/* directly)

  lib/iq/*  ── Fabric IQ (lib/azure/fabric.ts · Fabric SQL)   ┐
              Work IQ   (Microsoft 365 / synthetic JSON)       ├─ each returns { data, detail, live }
              Web IQ    (rates API / synthetic)                │   and emits iq_active / iq_data SSE
              Foundry IQ knowledge (lib/azure/search.ts)      ┘
```

Key files, mirroring Lulu IQ:

| File | Role |
|---|---|
| `lib/azure/identity.ts` | one cached `DefaultAzureCredential` (MI-aware) |
| `lib/azure/foundry.ts` | `invokeAgent(name, input, { tools })` — resolve-by-name, thread/run/poll **+ function-tool loop** |
| `lib/azure/fabric.ts` | Fabric SQL query with MI token + config guard |
| `lib/azure/search.ts` | AI Search knowledge retrieval + fallback |
| `lib/azure/key-vault.ts` | secret reader |
| `lib/iq/*` | the four IQ tools (`{ data, detail, live }`) + tool registry |
| `lib/agents.ts` | metadata-driven agent/surface roster |
| `lib/concierge.ts` | SSE orchestration (agent path + local reasoner) |
| `scripts/foundry-agents-create.ts` | registers the `loan-concierge` agent + tools in the project |
| `scripts/aisearch-index-guidelines.ts` | creates the AI Search index + uploads guidelines |
| `app/api/*` | thin route handlers |

## Run locally (no Azure required)

```bash
npm install
npm run dev
# open http://localhost:3000 ; ask "Assess the mortgage application for Priya Nair"
```

In local mode the mode badge reads **Local**, the four IQ cards light up from the
deterministic reasoner, and data is served from `data/*.json`.

## Light up the real Azure services

`azd up` now does most of it in one shot:

1. **`azd up`** provisions everything — Container App, Foundry account+project+
   model, AI Search, Key Vault, the managed identity, its roles **including a
   custom "Foundry Agents Data User" role** (agents data plane), and the app with
   `FOUNDRY_USE_AGENT=true`. A **postprovision hook** then runs
   `foundry:create-agents`, so the **`loan-concierge` agent + its four IQ tools
   are registered in the Foundry project automatically** (visible in the portal).
2. **Index the knowledge base** (needs the AI Search admin key):
   `AI_SEARCH_ENDPOINT=... AI_SEARCH_KEY=... npm run search:index-guidelines`.
3. **Fabric IQ + Work IQ live data:** set `FABRIC_SQL_ENDPOINT` +
   `FABRIC_DATABASE` on the container app and load `data/borrowers.json` /
   `data/borrower_documents.json` into the Lakehouse tables `dbo.borrowers` /
   `dbo.borrower_documents`. Until then the tools serve the synthetic JSON.

The agent's `get_fabric_iq` / `get_work_iq` tools are **connected to Fabric IQ and
Work IQ** by their implementations in `lib/iq/*` (executed by the ACA app during
the agent's tool-call loop). No manual role or agent-registration step needed.

Config surface is documented in `.env.example`; secrets live in Key Vault.

See `docs/WIRING.md` for the full service-by-service wiring and the tenant
capability notes.
