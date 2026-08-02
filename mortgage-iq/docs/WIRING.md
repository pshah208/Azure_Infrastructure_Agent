# WIRING — Mortgage IQ v2

How every architectural seam is wired to a Microsoft service. Structure and
patterns follow the Lulu IQ RFP demo (`docs/WIRING.md` there).

## Identity & secrets (the spine)

- **`lib/azure/identity.ts`** — a single cached `DefaultAzureCredential`. In the
  Container App it binds to the user-assigned managed identity via the
  `AZURE_CLIENT_ID` env var Container Apps injects; locally it falls through to
  your `az login`. Every `lib/azure/*` client reaches for this.
- **`lib/azure/key-vault.ts`** — reads secrets (AI Search key, future Fabric SP
  secret) from Key Vault via the same credential. Endpoints stay non-secret in
  env; **secret *values* never land in env**.

## Foundry IQ — the Loan Concierge agent

- **Registration** — `scripts/foundry-agents-create.ts` creates/updates the
  `loan-concierge` agent in the project with the four **function tools**
  (`get_fabric_iq`, `get_work_iq`, `get_web_iq`,
  `lookup_underwriting_guidelines`). Optionally attaches an Azure AI Search
  knowledge tool if `FOUNDRY_SEARCH_CONNECTION_ID` is set. **This is what makes
  the agent + tools visible in the Foundry portal.**
- **Invocation** — `lib/azure/foundry.ts:invokeAgent(name, input, { tools })`
  resolves the agent id by display name (cached), creates a thread, posts the
  message, starts a run, and **drives the tool loop**: on `requires_action` it
  dispatches each function call to the matching `lib/iq` tool and submits the
  outputs, then continues until `completed`. This is the one extension over
  Lulu's `invokeAgent` (Lulu's agents use server-side tools, so it treats
  `requires_action` as terminal).
- **RBAC** — the identity needs `Cognitive Services OpenAI User` (call the model)
  and the **agents data-plane** actions (`Microsoft.CognitiveServices/accounts/
  AIServices/*`) to create/run agents. No built-in role grants the latter in
  some tenants — create a custom role (see below).

## Fabric IQ — borrower + document data

- **`lib/azure/fabric.ts`** — `queryOne(table, col, value)` opens an `mssql`
  pool against the Fabric **SQL analytics endpoint** using a managed-identity
  access token (`https://database.windows.net/.default`). Guarded by
  `isFabricConfigured()`; returns `null` when Fabric isn't configured so the IQ
  tools fall back to `data/borrowers.json` / `data/borrower_documents.json`.
- Tables: `dbo.borrowers`, `dbo.borrower_documents` (schema = the JSON shapes).

## Work IQ — Microsoft 365

`lib/iq/work-iq.ts` resolves in priority order:
1. **Microsoft Graph** (`lib/azure/graph.ts`) when `isGraphConfigured()` — reads a
   SharePoint document library (`GRAPH_DRIVE_ID`) organised as one folder per
   borrower under `GRAPH_BORROWERS_FOLDER`. Received documents = the files in that
   folder; missing = `GRAPH_REQUIRED_DOCUMENTS` minus what's present; last contact
   = most recent file modification. Auth is an Entra app (app-only Graph) whose
   client secret lives in Key Vault (`ENTRA_GRAPH_APP_SECRET_KV_SECRET`) — same
   KV→MI pattern as everything else. Permissions: `Sites.Read.All`,
   `Files.Read.All` (see `infra/entra-graph-permissions.json`).
2. **Fabric documents table** (`dbo.borrower_documents`) when Fabric is configured
   but Graph is not — a SharePoint/M365 export stand-in.
3. **Local synthetic JSON** otherwise.

The `get_work_iq` agent tool calls this, so switching Work IQ from synthetic to
Fabric to real Graph is purely configuration — the agent never changes.

## Web IQ — market rates

- **`lib/iq/web-iq.ts`** — fetches `WEB_IQ_RATES_URL` when set, else returns a
  synthetic snapshot lightly varied by loan size. The production path is a
  Grounding-with-Bing tool on the agent.

## Foundry IQ knowledge — Azure AI Search

- **`lib/azure/search.ts`** — retrieves guideline snippets from the
  `mortgage-knowledge` index using the AI Search key (Key Vault/env) or AAD;
  falls back to keyword-matching over `data/underwriting_guidelines.json`.
- **`scripts/aisearch-index-guidelines.ts`** — creates the index + uploads the
  guideline docs.

## Runtime modes (`lib/constants.ts:runtimeMode()`)

- **`local`** — nothing configured. IQ tools serve JSON; the deterministic
  reasoner answers. The app builds and runs with zero Azure.
- **`foundry`** — `FOUNDRY_PROJECT_ENDPOINT` set but `FOUNDRY_USE_AGENT=false`.
  (Reserved for a direct-model path.)
- **`agent`** — `FOUNDRY_USE_AGENT=true` + endpoint. The real agent drives the
  conversation and tool calls.

The concierge always **falls back to the local reasoner** if the agent path
throws, so a demo never hard-fails.

## Tenant capability note (important)

Server-side Foundry agent tools (AI Search tool, Bing grounding, OpenAPI) require
a Foundry-capable tenant. In some Microsoft demo tenants (e.g. CPI) these fail
with `server_error` and only **client-side function tools** work — which is
exactly what this app uses for the four IQs, so it runs there too. The optional
AI Search knowledge *tool* (`FOUNDRY_SEARCH_CONNECTION_ID`) is the one piece that
needs a capable tenant; without it, Foundry IQ still grounds via
`lib/azure/search.ts` retrieval passed into the agent's tool output.

## Custom role for the agents data plane

`infra/main.bicep` **creates this custom role and assigns it to the app identity
automatically** (no manual step). For reference, the definition is:

```json
{
  "properties": {
    "roleName": "Foundry Agents Data User",
    "assignableScopes": ["/subscriptions/<sub>/resourceGroups/<rg>"],
    "permissions": [{
      "actions": ["Microsoft.CognitiveServices/accounts/read"],
      "dataActions": ["Microsoft.CognitiveServices/accounts/AIServices/*"]
    }]
  }
}
```

`FOUNDRY_USE_AGENT` defaults to `true` in `infra/main.parameters.json`; the
concierge falls back to the local reasoner if the agent isn't reachable, so the
app is safe even before the postprovision hook finishes registering it.
