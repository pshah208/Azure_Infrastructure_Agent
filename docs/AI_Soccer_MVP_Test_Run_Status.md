# PlayerIQ MVP test run status

## Synthetic data

Synthetic test data is available in:

`data/playeriq/synthetic/`

The dataset includes:

- `players.json`
- `matches.json`
- `observations.json`
- `coach-reviews.json`
- `training-plans.json`
- `fabric-semantic-model-seed.json`

It models a U14 central midfielder scenario and can be used to validate the data model, Cosmos DB container shape, report generation logic, coach-review workflow, and Fabric semantic-model assumptions.

## MP4 upload status

The deployed Azure Container App now runs the PlayerIQ MVP API image:

`acrpiqdeveus2vushfn4js52fm.azurecr.io/playeriq-api:0.5.2`

The endpoint is reachable:

`https://ca-api-playeriq-dev-eus2-002.salmonpebble-a4005584.eastus2.azurecontainerapps.io`

The frontend is reachable:

`https://ca-web-playeriq-dev-eus2-001.salmonpebble-a4005584.eastus2.azurecontainerapps.io`

The deployed frontend image is:

`acrpiqdeveus2vushfn4js52fm.azurecr.io/playeriq-frontend:0.3.2`

The deployed worker image is:

`acrpiqdeveus2vushfn4js52fm.azurecr.io/playeriq-worker:0.1.0`

The API-proxy MP4/MOV upload path works for the MVP:

- `GET /health` returns `status: ok`.
- `GET /api/foundry-agents` returns five application-to-Foundry agent mappings.
- `POST /api/analysis/video-evidence` invokes registered agent `playeriq-video-evidence`.
- `POST /api/analysis/agent-pipeline` invokes registered agents `playeriq-video-evidence`, `playeriq-player-analysis`, `playeriq-training-plan`, and `playeriq-coach-review`, returning `mode: foundry-agent`.
- `POST /api/foundry-agents/synthetic-data` invokes registered agent `playeriq-synthetic-data`, returning `mode: foundry-agent`.
- `GET /api/synthetic-test-data` returns the bundled synthetic dataset.
- `POST /api/analysis/synthetic` calls the deployed Foundry model and returns evidence-grounded coach feedback from the synthetic observations. The frontend **Use sample evidence only** button calls this path and renders the result.
- `POST /api/uploads` accepts a raw MP4/MOV body, writes it to the private `raw-videos` Blob container, upserts match/video metadata to Cosmos DB, and queues a Service Bus `video-processing` message.
- `GET /api/uploads/:matchId` returns the worker stage, video metadata, sampled-frame manifest, observation IDs, player analysis, training plan, and coach review.
- The worker downloads the private Blob, validates it with FFprobe, extracts timestamped JPEGs with FFmpeg, uploads thumbnails, and invokes the four processing agents.
- The frontend **Upload video & call Foundry** option polls the status endpoint and renders the completed worker results.
- Live validation job `match-worker-rbac-1790021906` completed successfully with the worker limited to `Azure Service Bus Data Receiver`, producing one sampled frame, one evidence record, player analysis, training plan, and approved coach review.

Direct browser-to-Blob upload initiation (`POST /api/uploads/initiate`) can create a user-delegation SAS and metadata record, but a public browser/client cannot currently use the returned Blob URL because tenant policy forces Storage public network access off. Use `POST /api/uploads` for the first frontend test unless the frontend is deployed with private network access to the storage private endpoint.

## What is still needed after upload

1. Authenticated user/team scoping.
2. Player tracking, target-player identification, pose estimation, and ball tracking for richer evidence.
3. Azure AI Search indexing when regional capacity becomes available.
4. Coach-facing evidence editing and approval persistence in the frontend.
