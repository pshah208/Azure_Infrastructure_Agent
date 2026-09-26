# Allowed regions and SKUs

This allow-list is scoped to the PlayerIQ MVP deployment.

## Regions

| Priority | Azure region | Location name | Region code |
|---|---|---|---|
| Primary | Canada Central | `canadacentral` | `cc` |
| Fallback | East US 2 | `eastus2` | `eus2` |

## SKUs

| Service | Allowed MVP SKU |
|---|---|
| Azure Container Apps | Consumption workload profiles |
| Azure Container Registry | Standard |
| Azure Blob Storage | Standard LRS, StorageV2 |
| Azure Service Bus | Standard |
| Azure Cosmos DB for NoSQL | Serverless |
| Azure AI Search | Basic |
| Azure Key Vault | Standard |
| Log Analytics | PerGB2018 |
| Application Insights | Workspace-based |
| Azure AI Services / Foundry | S0 |
| Azure OpenAI model deployment | Standard `gpt-4.1-mini` for MVP coach feedback |
| Azure Machine Learning | Workspace only; no GPU compute quota allocated by default |

## Security defaults

- Use managed identities for Azure service access.
- Disable Blob public access.
- Require HTTPS and TLS 1.2 or later where supported.
- Store application secrets in Key Vault.
- Enable diagnostic-ready observability with Log Analytics and Application Insights.
- Do not provision always-on GPU compute until real video-processing demand is validated.
