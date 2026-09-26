# PlayerIQ MVP API status

## Unreleased local increment: reports, history, and feedback

The working tree now includes a structured report UI, a player-history page,
organization-scoped report/observation retrieval, an API thumbnail proxy, and
append-only coach feedback with self-reported progress. Future worker jobs can
retrieve accepted, explicitly opted-in feedback as prompt context, with review
IDs recorded in report provenance. This is not automatic model training.

These changes are now deployed to Azure. The deployed image versions reflect
the new release: `playeriq-api:0.6.0`, `playeriq-worker:0.2.0`,
`playeriq-frontend:0.4.0`. Local Entra RBAC has been added, and its directory
registration, configuration, and live activation are complete.

### Local application RBAC

- Microsoft sign-in frontend with role-aware controls and dark-mode default.
- API verification of Entra access-token signatures, tenant, issuer, audience,
  delegated scope, authorized SPA client, expiry, and app roles.
- Viewer (read), Coach (read/upload/review), and Admin (Coach plus demos/direct
  agent calls). All roles remain limited to explicitly assigned organizations
  and players; an Azure Owner role is not an application role.
- Verified reviewer identity and exclusion of legacy unverified feedback from
  future coaching context.
- Fail-closed defaults; unauthenticated mock mode is explicit and loopback-only.

This is a live protection: unauthenticated calls to protected routes return
401 from the deployed API. See the API README for the exact configuration
contract and Entra object identifiers.

### Deployment, 2026-09-22 (live)

The user approved publishing after RBAC integration. A retest of Entra
permissions found that although the caller's directory role is Global Reader,
the tenant permits self-service app registration creation
(`allowedToCreateApps = true`) and app owners can self-assign app roles on
service principals they own — so no administrator handoff was required after
all. The following were self-provisioned and are now live:

- API app registration "PlayerIQ API" (`api://4626235d-cc85-41bd-9979-f88abc2d4f5b`)
  exposing the `access_as_user` delegated scope and the `PlayerIQ.Viewer`,
  `PlayerIQ.Coach`, and `PlayerIQ.Admin` app roles.
- SPA app registration "PlayerIQ Frontend"
  (`fe0dcec6-46f4-4a0d-a7d1-70c6cfef5176`) with redirect URIs for the live
  frontend and local dev.
- The caller's own account assigned `PlayerIQ.Admin` on the API service
  principal, scoped to `organizationId: "org-northshore-academy"`,
  `playerIds: ["*"]`.

Admin consent (`az ad app permission admin-consent`) still requires a tenant
admin and was not attempted to succeed; the tenant instead permits per-user
consent, so each signed-in user accepts a one-time consent prompt at first
sign-in.

| Field | Result |
|---|---|
| Target scope | `rg-playeriq-dev-eus2-001` in subscription `5d2da101-2909-479c-a12f-c07083da7c18` |
| Relevant policies | Inherited MCAPS deny/deploy/audit initiatives and Azure Security Baseline |
| Compliance posture | 15 noncompliant baseline policy definitions across eight resources (registry private networking, image assessment) remain audit-only and were deferred, not remediated, in this pass |
| Caller | `shahpar@MngEnvMCAP158982.onmicrosoft.com` |
| Effective roles | ARM Owner and User Access Administrator; Entra Global Reader |
| Permissions sufficient? | Yes — ARM deployment and Entra app creation/role assignment both succeeded without elevation |
| Naming standard | `docs/naming.md`; existing CAF resource names retained |
| SKU/region allow-list | `docs/allowed.md`; East US 2 retained |
| Design adjustments | Authenticated role/membership checks, protected images, verified reviewer identity, fail-closed configuration, and storage/Cosmos/Key Vault `publicNetworkAccess` corrected back to `Disabled` in the template to match the tenant's already-hardened live state (the template previously would have silently re-enabled public network access on redeploy) |

The upload worker parses real video with FFmpeg and sends sampled JPEG bytes to
Foundry. Legacy `/api/analysis/video-evidence` and `/api/analysis/agent-pipeline`
routes use metadata/synthetic examples and are now explicitly labelled as such
in local code. Existing reports are not retroactively made more accurate by the
new UI or worker guardrails.

The repository now includes a frontend-facing Node.js API in:

`app/playeriq-api/`

## Implemented

- Health endpoint.
- PlayerIQ Foundry agent catalog endpoint.
- Role-specific agent run endpoint.
- Video Evidence Agent endpoint for creating candidate timestamped observations from upload metadata, sampled-frame notes, and synthetic exemplars.
- Agent pipeline endpoint for creating observations, player analysis, a training plan, and coach-review records in one call.
- Synthetic Data Agent endpoint for creating new synthetic development records.
- Synthetic test-data endpoint.
- Foundry-backed synthetic player-development analysis endpoint.
- Direct-to-Blob upload initiation endpoint.
- Direct upload completion endpoint.
- Raw MP4/MOV API-proxy upload endpoint.
- Cosmos DB match/video metadata persistence.
- Service Bus `video-processing` queue message creation.
- Blob upload to the `raw-videos` container.
- Cosmos-backed `GET /api/uploads/:matchId` processing status and generated-record lookup.
- Queue-driven FFmpeg worker for video validation, frame extraction, thumbnail upload, and Foundry agent orchestration.
- Managed-identity based Azure SDK configuration.
- API tests for health, synthetic data, Foundry analysis contract, direct upload initiation, validation failure, and raw MP4 upload.

## Not implemented yet

- Live activation of the locally implemented authentication/authorization and
  Entra app-role/membership administration (no self-service admin UI yet).
- Advanced computer vision for player identity, tracking, pose estimation, and ball tracking.
- Azure AI Search indexing, because Search was deferred due to regional capacity.

## Current upload options for frontend

1. **Recommended for the first public frontend test:** send the raw MP4/MOV body to `POST /api/uploads` with the required `x-playeriq-*` headers.
2. **Private-network option for larger files:** call `POST /api/uploads/initiate`, upload the file directly to Blob using the returned URL, then call `POST /api/uploads/complete`. This only works from a client with private network access to the Storage private endpoint because tenant policy forces Storage public network access off.

## Live deployment

- Frontend: `https://ca-web-playeriq-dev-eus2-001.salmonpebble-a4005584.eastus2.azurecontainerapps.io`
- Endpoint: `https://ca-api-playeriq-dev-eus2-002.salmonpebble-a4005584.eastus2.azurecontainerapps.io`
- Image: `acrpiqdeveus2vushfn4js52fm.azurecr.io/playeriq-api:0.6.0`
- Worker image: `acrpiqdeveus2vushfn4js52fm.azurecr.io/playeriq-worker:0.2.0`
- Frontend image: `acrpiqdeveus2vushfn4js52fm.azurecr.io/playeriq-frontend:0.4.0`
- Runtime mode: Azure managed identity with Foundry project-scoped `Foundry User`.
- Foundry project endpoint: `https://ai-playeriq-dev-eus2-vushfn4j.services.ai.azure.com/api/projects/ai-playeriq-dev-eus2-vus-project`
- Foundry model deployment: `gpt-4-1-mini-playeriq-coach`
- Foundry endpoint: `https://ai-playeriq-dev-eus2-vushfn4j.cognitiveservices.azure.com/`
- Private endpoints: Blob Storage and Cosmos DB.
- Live validation: health reports `agentServiceEnabled: true`; all five registered Foundry agents passed direct smoke tests; a synthetic MP4 completed the queue, FFmpeg, Blob, Cosmos, and four-agent processing pipeline.
- Frontend validation: live page loads, health indicator shows Foundry connected, the sample-evidence button renders Foundry-generated feedback, and the MP4/MOV upload button polls `GET /api/uploads/:matchId` until completion.

## Foundry analysis endpoint

```http
POST /api/analysis/synthetic
Content-Type: application/json

{
  "playerId": "player-maya-shah-008",
  "matchId": "match-2026-09-18-u14-blue-lakeside"
}
```

The endpoint calls the `gpt-4-1-mini-playeriq-coach` deployment using managed identity and returns evidence-grounded JSON feedback with summary, strengths, improvement areas, recommended drills, evidence timestamps, and guardrails.

## PlayerIQ Foundry agent endpoints

```http
GET /api/foundry-agents
```

Returns the five MVP agent contracts and model bindings:

- `video-evidence-agent` → `playeriq-video-evidence`
- `player-analysis-agent` → `playeriq-player-analysis`
- `training-plan-agent` → `playeriq-training-plan`
- `coach-review-agent` → `playeriq-coach-review`
- `synthetic-data-agent` → `playeriq-synthetic-data`

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
