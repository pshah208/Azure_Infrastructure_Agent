# PlayerIQ MVP Azure deployment

This folder contains a subscription-scope Bicep deployment for the PlayerIQ MVP resource group and core Azure resources.

## Default deployment

Primary region: Canada Central (`canadacentral`)

Fallback region: East US 2 (`eastus2`)

```powershell
az deployment sub create `
  --location canadacentral `
  --template-file bicep\playeriq-mvp\main.bicep `
  --parameters location=canadacentral
```

If Canada Central is unavailable for one of the MVP services, rerun with:

```powershell
az deployment sub create `
  --location eastus2 `
  --template-file bicep\playeriq-mvp\main.bicep `
  --parameters location=eastus2
```

If Azure AI Search regional capacity is unavailable, deploy the rest of the MVP stack without Search:

```powershell
az deployment sub create `
  --location eastus2 `
  --template-file bicep\playeriq-mvp\main.bicep `
  --parameters location=eastus2 deploySearch=false
```

To deploy the live frontend API image:

```powershell
az deployment sub create `
  --location eastus2 `
  --template-file bicep\playeriq-mvp\main.bicep `
  --parameters location=eastus2 deploySearch=false apiImage=acrpiqdeveus2vushfn4js52fm.azurecr.io/playeriq-api:0.5.1 frontendImage=acrpiqdeveus2vushfn4js52fm.azurecr.io/playeriq-frontend:0.3.1 foundryProjectName=ai-playeriq-dev-eus2-vus-project foundryProjectEndpoint=https://ai-playeriq-dev-eus2-vushfn4j.services.ai.azure.com/api/projects/ai-playeriq-dev-eus2-vus-project
```

## Deployed resources

- Resource group
- Azure Container Apps environment
- API container app
- Frontend container app
- Worker placeholder container app
- Blob Storage account and MVP containers
- Blob Storage and Cosmos DB private endpoints
- Virtual network with Container Apps and private-endpoint subnets
- Azure Service Bus namespace and `video-processing` queue
- Azure Cosmos DB for NoSQL account, database, and MVP containers
- Azure Container Registry for MVP API images
- Azure AI Search Basic service
- Azure AI Services account for Foundry/MVP reasoning integration
- `gpt-4.1-mini` model deployment for MVP player-development coach feedback
- Log Analytics workspace
- Application Insights
- Key Vault
- Azure Machine Learning workspace for future CV/GPU experiments

The current deployment uses a VNet-integrated Container Apps environment because tenant policy forces Storage and Cosmos DB public network access off. Public frontend clients should upload video through `POST /api/uploads`; direct browser-to-Blob upload requires private network access to the Storage private endpoint.

The current API image exposes `GET /api/foundry-agents`, `POST /api/analysis/video-evidence`, `POST /api/analysis/agent-pipeline`, `POST /api/foundry-agents/synthetic-data`, and `POST /api/analysis/synthetic`. It invokes five registered Foundry prompt agents through the project Responses API using managed identity and `agent_reference`. The API identity receives the project-scoped `Foundry User` role through Bicep.

GPU compute is intentionally not provisioned by default. Add GPU-backed Azure Machine Learning compute only after real video-processing demand and quota are confirmed.
