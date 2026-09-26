# Naming standard

Use CAF-style names for Azure resources:

`<resource-type>-<workload>-<environment>-<region-code>-<instance>`

For resources with global naming restrictions, remove hyphens and shorten the workload while preserving the same intent.

## Defaults for PlayerIQ MVP

| Field | Value |
|---|---|
| Workload | `playeriq` |
| Environment | `dev` |
| Primary region | Canada Central |
| Primary region code | `cc` |
| Fallback region | East US 2 |
| Fallback region code | `eus2` |
| Instance | `001` |

## Examples

| Resource | Name pattern |
|---|---|
| Resource group | `rg-playeriq-dev-cc-001` |
| Container Apps environment | `cae-playeriq-dev-cc-001` |
| Container App | `ca-api-playeriq-dev-cc-001` |
| Log Analytics workspace | `log-playeriq-dev-cc-001` |
| Application Insights | `appi-playeriq-dev-cc-001` |
| Service Bus namespace | `sb-playeriq-dev-cc-<unique>` |
| SQL server | `sql-playeriq-dev-cc-<unique>` |
| Key Vault | `kv-piq-dev-cc-<unique>` |
| Storage account | `stpiqdevcc<unique>` |
| Azure AI Search | `srch-playeriq-dev-cc-<unique>` |
| Foundry AI Services account | `ai-playeriq-dev-cc-<unique>` |

