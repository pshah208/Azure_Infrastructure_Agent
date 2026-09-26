# PlayerIQ API

Frontend-facing MVP API for PlayerIQ upload/session testing.

## Application RBAC (local implementation; not yet deployed)

The API validates Microsoft Entra **v2 access tokens** using the tenant's signing
keys. Signature, expiry, issuer, API audience, tenant, SPA client, delegated
`access_as_user` scope, and app roles are checked before protected handlers run.
ID tokens, arbitrary identity headers, and tokens in query strings are not
accepted. These application roles are separate from Azure resource RBAC:

| App-role value | Allowed actions within assigned organizations/players |
|---|---|
| `PlayerIQ.Viewer` | Read history, saved reports, and evidence images |
| `PlayerIQ.Coach` | Viewer actions plus upload clips and submit coach reviews |
| `PlayerIQ.Admin` | Coach actions plus synthetic demos and direct agent calls |

App roles are tenant-wide for this application; the strongest assigned role
applies within every explicit membership. There is no global data-admin bypass.
A Viewer can be limited to a single player's records. Roles and memberships are
not editable through the MVP frontend: an Entra administrator assigns app roles,
and the deployment owner maintains server-side membership configuration.

Every `/api` route except `/api/auth/config` requires a valid access token.
Unlisted routes default to denied. `/` and `/health` remain public for discovery
and health probes. Responses containing private data use `Cache-Control: no-store`.

Required authentication settings:

| Environment variable | Required value |
|---|---|
| `AUTH_ENABLED` | Defaults to `true`; keep enabled for Azure |
| `AUTH_TENANT_ID` | Single-tenant Entra directory GUID |
| `AUTH_API_CLIENT_ID` | API app-registration client GUID; v2 token audience |
| `AUTH_SPA_CLIENT_ID` | Frontend SPA app-registration client GUID |
| `AUTH_MEMBERSHIPS_JSON` | Explicit user-object-ID to organization/player grants |
| `ALLOW_ORIGIN` | Exact HTTPS frontend origin, without a trailing slash |

Membership format (example identifiers, not a deployed grant):

```json
[
  {
    "objectId": "44444444-4444-4444-8444-444444444444",
    "organizationId": "org-northshore-academy",
    "playerIds": ["player-maya-shah-008"]
  }
]
```

Use `playerIds: ["*"]` only when that user should access every player in the
specified organization. Organization wildcards are prohibited. Multiple grants
can be supplied for the same user. Empty membership configuration grants nobody
access. Names, email addresses, submitted organization IDs, and submitted roles
cannot grant permissions. Membership edits require a restart/redeployment;
Entra app-role changes take effect when a new access token is issued.

`GET /api/auth/config` returns public MSAL settings (`enabled`, `tenantId`,
`clientId`, `scope`). `GET /api/auth/me` returns the authenticated identity,
permissions, and only that user's memberships. Send `Authorization: Bearer
<access-token>` with all other API requests, including image requests. The
frontend fetches private images with authorization rather than placing tokens
in image URLs.

The Entra registrations described above are live: single-tenant API
registration `4626235d-cc85-41bd-9979-f88abc2d4f5b` issuing v2 tokens, the
`access_as_user` delegated scope, the three user app-role values above, and
SPA registration `fe0dcec6-46f4-4a0d-a7d1-70c6cfef5176` with the exact
frontend redirect URIs. The SPA has delegated access to that API. Users need
explicit app-role assignments; the caller's own account has been assigned
`PlayerIQ.Admin`. No browser client secret, Graph permissions, or Azure
management token is needed by the PlayerIQ frontend. Authorization uses code
flow with PKCE, not implicit flow. Tenant-admin consent was not granted (that
still requires a directory admin), but the tenant permits per-user consent, so
each signed-in user accepts a one-time consent prompt on first sign-in.

**Deployed 2026-09-22:** registrations and role assignments were created by the
caller despite holding only Entra Global Reader, because this tenant permits
self-service app registration creation and app owners may self-assign app
roles on service principals they own. The Bicep templates now supply
`AUTH_TENANT_ID`, `AUTH_API_CLIENT_ID`, `AUTH_SPA_CLIENT_ID`, and
`AUTH_MEMBERSHIPS_JSON` to the API container app. The registry policy-audit
findings (private networking, image assessment) remain deferred as
audit-only/non-blocking. Live sign-in and live authorization have been
validated: `GET /api/auth/config` returns real tenant/client/scope data and
unauthenticated calls to protected routes return `401`.

### Explicit local mock mode

For synthetic-only local development set `AUTH_ENABLED=false`,
`ENABLE_MOCK_AZURE=true`, and `NODE_ENV=development` (or `test`). All three
conditions are required. The server binds only to loopback in that mode and
rejects non-loopback API connections. Never use this mode behind a public proxy.
Omitting authentication configuration does not enable a bypass: startup fails.
Mock reviews remain unverified and are not eligible for worker coaching reuse.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/auth/config` | Public sign-in settings, never secrets or membership lists |
| `GET` | `/api/auth/me` | Verified identity, app roles, permissions, and memberships |
| `GET` | `/api/foundry-agents` | Lists the PlayerIQ Foundry agent contracts and model deployment bindings |
| `POST` | `/api/foundry-agents/:agentId/run` | Runs a specific agent contract through the configured Foundry/Azure AI model deployment |
| `POST` | `/api/foundry-agents/synthetic-data` | Generates a new synthetic player/match/observation/training-plan test record |
| `POST` | `/api/analysis/video-evidence` | Uses the Video Evidence Agent contract to create candidate timestamped observations from upload metadata, sampled-frame notes, and synthetic examples |
| `POST` | `/api/analysis/agent-pipeline` | Runs Video Evidence, Player Analysis, Training Plan, and Coach Review agents in sequence and returns generated records |
| `GET` | `/api/synthetic-test-data` | Returns bundled synthetic MVP dataset |
| `POST` | `/api/analysis/synthetic` | Calls the Foundry model deployment to generate evidence-grounded player feedback from synthetic observations |
| `POST` | `/api/uploads/initiate` | Creates a direct-to-Blob upload URL and match document for private-network clients |
| `POST` | `/api/uploads/complete` | Marks direct upload complete and queues video processing |
| `POST` | `/api/uploads` | Accepts raw MP4/MOV body through the API, writes to Blob, records Cosmos metadata, and queues processing |
| `GET` | `/api/uploads/:matchId?organizationId=...` | Retrieves the saved report, actual observation records, frame manifest, and latest 100 human feedback entries |
| `GET` | `/api/players/:playerId/matches?organizationId=...` | Lists uploads newest first, 20 per page; pass returned `nextContinuationToken` as `continuationToken` |
| `GET` | `/api/uploads/:matchId/frames/:index?organizationId=...` | Proxies a JPEG from the upload's stored frame manifest; no public Blob access needed |
| `POST` | `/api/uploads/:matchId/reviews` | Appends human feedback without overwriting the original AI report |

## Player history and feedback (local implementation; not yet deployed)

History is backed by the existing Cosmos `matches` container, not browser storage.
Human feedback uses separate `coachFeedback` documents in that container so worker
status updates cannot overwrite it. Queries explicitly select `documentType`,
organization, player, and the reviewed processing job.

Organization IDs remain query scope, not proof of access. The local implementation
now checks that scope against server-configured authenticated membership before
retrieving data. The deployed version has not yet received these protections.
Do not expose the updated library or upload sensitive youth footage until its
secured deployment is complete. The browser never connects directly to Cosmos.

Review request fields:

```json
{
  "organizationId": "org-northshore-academy",
  "playerId": "player-maya-shah-008",
  "reviewer": "Trial coach",
  "decision": "accepted",
  "notes": "Visible body position improved in this clip.",
  "correctedSummary": "Positioning is visible; scanning frequency is not established.",
  "progress": "improved",
  "useForCoaching": true
}
```

`decision` is `accepted`, `needs_changes`, or `rejected`. `progress` is a
**coach-reported** `improved`, `unchanged`, `needs_work`, or `not_assessed` value,
not a measured improvement score. `notes` is required. In authenticated mode the
API ignores submitted reviewer identity and derives the display name, object ID,
and tenant ID from the verified token, with `reviewerIdentityVerified: true`.
`reviewer` is required only in explicit local mock mode, where identity remains
unverified.
`useForCoaching` must be an explicit boolean and can only be true for accepted
feedback. Only server-verified reviews are eligible for future coaching context.
Add another review to supersede an earlier one; accepted feedback can be revoked
for future jobs with a newer non-consenting review. Existing reports and in-flight
jobs retain their recorded context snapshot.

The worker can use recent accepted/opted-in reviews as historical prompt context
on subsequent clips for the same player and organization. This does **not**
fine-tune a model or automatically establish longitudinal improvement.

New uploads reject duplicate match IDs with HTTP 409. Use one new ID per clip,
but retain the same player ID to build history. Status URLs now include
`organizationId`; clients must preserve that query parameter.

## Evidence path distinction

`POST /api/uploads` queues the worker, which downloads actual video bytes,
extracts JPEGs, and sends those bytes to Foundry as `input_image`.
The separate `/api/analysis/video-evidence` and `/api/analysis/agent-pipeline`
endpoints are metadata/synthetic-example demos, not raw-video parsers. Their
responses explicitly include `rawVideoProcessed: false` and
`evidenceSource: demo-metadata-and-synthetic-examples`. The sample button remains
synthetic. Mock runtime produces deterministic fixture outputs only for tests.

## Direct-to-Blob upload flow

Use this flow only when the frontend/client can reach the Storage account over private networking. In the deployed MVP tenant, Storage public network access is forced off, so public browser clients should use the API-proxy flow below.

```http
POST /api/uploads/initiate
Content-Type: application/json

{
  "organizationId": "org-northshore-academy",
  "playerId": "player-maya-shah-008",
  "fileName": "clip.mp4",
  "contentType": "video/mp4",
  "sizeBytes": 12345678,
  "matchName": "U14 Blue vs Lakeside FC"
}
```

The response contains an `uploadUrl` for a `PUT` request to Blob Storage.

After upload:

```http
POST /api/uploads/complete
Content-Type: application/json

{
  "organizationId": "org-northshore-academy",
  "playerId": "player-maya-shah-008",
  "matchId": "<matchId>",
  "videoAssetId": "<videoAssetId>",
  "blobName": "<blobName>"
}
```

## API-proxy upload flow

For a simple frontend test, upload the raw MP4/MOV body directly:

```http
POST /api/uploads
Content-Type: video/mp4
x-playeriq-organization-id: org-northshore-academy
x-playeriq-player-id: player-maya-shah-008
x-playeriq-file-name: clip.mp4
x-playeriq-match-name: U14 Blue vs Lakeside FC
```

The request body is the binary video file.

## Foundry agent contracts

The MVP defines five PlayerIQ agent mappings in `src/agentDefinitions.js`, each connected to a registered Foundry prompt agent:

- `video-evidence-agent` → `playeriq-video-evidence`
- `player-analysis-agent` → `playeriq-player-analysis`
- `training-plan-agent` → `playeriq-training-plan`
- `coach-review-agent` → `playeriq-coach-review`
- `synthetic-data-agent` → `playeriq-synthetic-data`

The backend invokes these registered prompt agents through the Foundry project Responses API using `agent_reference`. All currently use `gpt-4-1-mini-playeriq-coach`. `FOUNDRY_VISION_MODEL_DEPLOYMENT_NAME` remains available for a future vision-capable model binding.

```http
POST /api/analysis/video-evidence
Content-Type: application/json

{
  "playerId": "player-maya-shah-008",
  "matchId": "match-2026-09-18-u14-blue-lakeside",
  "fileName": "clip.mp4",
  "sampledFrameNotes": [
    "00:42 player receives centrally with pressure arriving from right shoulder"
  ]
}
```

```http
POST /api/analysis/agent-pipeline
Content-Type: application/json

{
  "playerId": "player-maya-shah-008",
  "matchId": "match-2026-09-18-u14-blue-lakeside",
  "fileName": "clip.mp4",
  "sampledFrameNotes": [
    "00:42 player receives centrally with pressure arriving from right shoulder"
  ]
}
```

```http
POST /api/foundry-agents/synthetic-data
Content-Type: application/json

{
  "scenario": "U13 winger crossing and recovery run test"
}
```

## Foundry synthetic feedback flow

```http
POST /api/analysis/synthetic
Content-Type: application/json

{
  "playerId": "player-maya-shah-008",
  "matchId": "match-2026-09-18-u14-blue-lakeside"
}
```

The deployed API uses managed identity to call the `gpt-4-1-mini-playeriq-coach` model deployment and returns evidence-grounded JSON feedback.

## Required Azure configuration

The deployed Container App uses managed identity and these environment variables:

- `AZURE_CLIENT_ID`
- `STORAGE_ACCOUNT_NAME`
- `RAW_VIDEOS_CONTAINER_NAME`
- `COSMOS_ENDPOINT`
- `COSMOS_DATABASE_NAME`
- `MATCHES_CONTAINER_NAME`
- `SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE`
- `VIDEO_PROCESSING_QUEUE_NAME`
- `FOUNDRY_ENDPOINT`
- `FOUNDRY_PROJECT_ENDPOINT`
- `FOUNDRY_MODEL_DEPLOYMENT_NAME`
- `FOUNDRY_VISION_MODEL_DEPLOYMENT_NAME` (optional)
- `FOUNDRY_API_VERSION`
- `APPLICATIONINSIGHTS_CONNECTION_STRING`
