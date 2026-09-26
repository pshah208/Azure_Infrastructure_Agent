# PlayerIQ MVP Azure deployment result

Deployment completed for the PlayerIQ MVP resource stack.

## Subscription

| Field | Value |
|---|---|
| Subscription | `ME-MngEnvMCAP158982-shahpar-2` |
| Subscription ID | `5d2da101-2909-479c-a12f-c07083da7c18` |
| Tenant ID | `a310d811-2994-4f88-80fa-e50fb324af0b` |

## Final deployment

| Field | Value |
|---|---|
| Deployment name | `playeriq-mvp-dev-eus2-001` |
| Resource group | `rg-playeriq-dev-eus2-001` |
| Region | `eastus2` |
| Canada Central result | Attempted first; Cosmos DB capacity was unavailable |
| East US 2 result | Succeeded |
| Azure AI Search | Deferred because East US 2 reported regional capacity exhaustion for new Search services |
| API image | `acrpiqdeveus2vushfn4js52fm.azurecr.io/playeriq-api:0.6.0` |
| Worker image | `acrpiqdeveus2vushfn4js52fm.azurecr.io/playeriq-worker:0.2.0` |
| Frontend image | `acrpiqdeveus2vushfn4js52fm.azurecr.io/playeriq-frontend:0.4.0` |
| Foundry model deployment | `gpt-4-1-mini-playeriq-coach` |
| Foundry project | `ai-playeriq-dev-eus2-vus-project` |
| Registered Foundry agents | `playeriq-video-evidence`, `playeriq-player-analysis`, `playeriq-training-plan`, `playeriq-coach-review`, `playeriq-synthetic-data` |
| Upload path | Frontend MP4/MOV picker uploads through the API proxy, then polls the Cosmos-backed worker status while FFmpeg and the PlayerIQ Foundry agents process the clip |

## RBAC + dark theme release, 2026-09-22

| Field | Value |
|---|---|
| API app registration | `4626235d-cc85-41bd-9979-f88abc2d4f5b` ("PlayerIQ API"), scope `access_as_user`, app roles `PlayerIQ.Viewer`/`PlayerIQ.Coach`/`PlayerIQ.Admin` |
| SPA app registration | `fe0dcec6-46f4-4a0d-a7d1-70c6cfef5176` ("PlayerIQ Frontend") |
| Self-provisioned by | `shahpar@MngEnvMCAP158982.onmicrosoft.com` (Entra Global Reader only — tenant allows self-service app creation and owner self-assignment of app roles, so no admin handoff was needed) |
| Admin consent | Not granted (requires a tenant admin); tenant permits per-user consent instead, so each user consents once at first sign-in |
| New env vars on API container app | `AUTH_ENABLED`, `AUTH_TENANT_ID`, `AUTH_API_CLIENT_ID`, `AUTH_SPA_CLIENT_ID`, `AUTH_MEMBERSHIPS_JSON`, `ALLOW_ORIGIN` |
| Security fix bundled | Storage account, Cosmos DB, and Key Vault `publicNetworkAccess` corrected from `Enabled` to `Disabled` in `core.bicep` to match the tenant's already-hardened live state (the template previously would have silently re-enabled public network access on redeploy) |
| Live verification | `GET /health` OK; `GET /api/auth/config` returns real tenant/client/scope; unauthenticated `GET /api/players` returns `401`; frontend returns `200` |

## Deployed resources

| Resource | Name |
|---|---|
| Azure Container Apps environment | `cae-playeriq-dev-eus2-002` |
| API Container App | `ca-api-playeriq-dev-eus2-002` |
| Frontend Container App | `ca-web-playeriq-dev-eus2-001` |
| Worker Container App | `ca-worker-playeriq-dev-eus2-002` |
| API endpoint | `https://ca-api-playeriq-dev-eus2-002.salmonpebble-a4005584.eastus2.azurecontainerapps.io` |
| Frontend endpoint | `https://ca-web-playeriq-dev-eus2-001.salmonpebble-a4005584.eastus2.azurecontainerapps.io` |
| Virtual network | `vnet-playeriq-dev-eus2-001` |
| Private endpoints | Blob Storage and Cosmos DB |
| Storage account | `stpiqdeveus2vushfn4js52f` |
| Blob containers | `raw-videos`, `processed-clips`, `thumbnails`, `model-artifacts` |
| Service Bus namespace | `sb-playeriq-dev-eus2-vushfn4j` |
| Service Bus queue | `video-processing` |
| Cosmos DB account | `cosmos-playeriq-dev-eus2-vushfn4j` |
| Cosmos DB database | `cosmosdb-playeriq-dev-eus2-001` |
| Cosmos DB containers | `players`, `matches`, `observations` |
| Azure AI Services account | `ai-playeriq-dev-eus2-vushfn4j` |
| Foundry/OpenAI model deployment | `gpt-4-1-mini-playeriq-coach` |
| Azure Machine Learning workspace | `mlw-playeriq-dev-eus2-001` |
| Key Vault | `kv-piq-dev-eus2-vushfn4j` |
| Log Analytics workspace | `log-playeriq-dev-eus2-001` |
| Application Insights | `appi-playeriq-dev-eus2-001` |
| Azure Container Registry | `acrpiqdeveus2vushfn4js52fm` |

## Validation

- Bicep build succeeded.
- Required resource providers were registered.
- East US 2 deployment succeeded.
- API health endpoint returned `{"status":"ok","mode":"azure"}`.
- Synthetic dataset endpoint returned the bundled MVP dataset.
- Foundry project contains five active prompt-agent version 1 resources bound to `gpt-4-1-mini-playeriq-coach`.
- Direct smoke tests successfully invoked all five registered agents.
- API managed identity has project-scoped `Foundry User`.
- Agent catalog endpoint returns all five application-to-Foundry agent mappings.
- Agent pipeline endpoint invokes Video Evidence, Player Analysis, Training Plan, and Coach Review through real `agent_reference` calls and returns `mode: foundry-agent`.
- Synthetic Data endpoint invokes `playeriq-synthetic-data` and returns `mode: foundry-agent`.
- Foundry synthetic analysis endpoint returned evidence-grounded player feedback with `mode: foundry`.
- Worker uses 1 vCPU/2 GiB, scales from zero to two replicas from the Service Bus queue, and authenticates with its user-assigned managed identity. Its queue permission is limited to `Azure Service Bus Data Receiver`.
- Frontend landing/demo page returned `HTTP 200`, reported Foundry connected, and exposed the asynchronous `Upload video & call Foundry` flow.
- Live synthetic MP4 job `match-worker-rbac-1790021906` completed end to end after the least-privilege RBAC correction: Blob download, FFprobe validation, FFmpeg frame extraction, thumbnail upload, four Foundry agent calls, observation persistence, training plan, and coach review.
- `GET /api/uploads/:matchId` returned Cosmos-backed stages and generated records through `completed`.
- Service Bus `video-processing` queue returned to `activeMessageCount: 0` after the live run. Three historical dead-letter messages remain from earlier placeholder-worker testing.
- Failed Canada Central attempt was cleaned up by starting deletion for `rg-playeriq-dev-cc-001`.

## Notes

- Azure SQL was replaced with Cosmos DB for the MVP deployment because a management-group deny policy blocked SQL servers without Entra-only authentication during create-time evaluation.
- Azure AI Search remains represented in the IaC as an optional resource. Re-enable it with `deploySearch=true` when regional capacity is available.
- Storage and Cosmos DB were deployed behind private endpoints because tenant policy forces public network access off. The public frontend uses `POST /api/uploads` through the API for MVP upload testing.
- The upload-plus-Foundry frontend flow now stores and queues the selected video, polls its status, extracts timestamped JPEG evidence with FFmpeg, and runs the Video Evidence, Player Analysis, Training Plan, and Coach Review agents.
- The MVP samples frames rather than performing player tracking, pose estimation, or ball tracking. Those advanced computer-vision capabilities remain future model work.
- Foundry is connected through five registered prompt agents using the project Responses API. Hosted agent containers are not needed for these prompt-only roles; the local hosted-agent `azd` extension remains unavailable, but it no longer blocks this implementation.
- GPU compute was not provisioned. The Azure Machine Learning workspace is ready for future computer-vision experiments and GPU-backed inference when quota and workload demand are confirmed.
