# Azure Infrastructure Agent Wiki

Welcome to the guided documentation for using this repository effectively.

## 1) What this repository gives you

This repo helps you use GitHub Copilot for Azure administration with:

- Azure-focused Copilot prompt skills (`.github/prompts/`)
- MCP server integrations (`.vscode/mcp.json`)
- Terraform landing zone templates (`terraform/landing-zone/`)
- Bicep landing zone templates (`bicep/landing-zone/`)
- Learning tracks and teaching workflows (`LEARNING.md`, `docs/learning-paths/`)

## 2) Prerequisites

Before you start:

1. Install **VS Code**
2. Install **GitHub Copilot + Copilot Chat** extension
3. Install **Node.js 18+** (for MCP stdio servers)
4. Install **Azure CLI** and sign in (`az login`)
5. (Optional) Install **Terraform** if you want to run Terraform templates

## 3) Initial setup

1. Open this repository in VS Code.
2. Confirm MCP configuration exists at `.vscode/mcp.json`.
3. Set required environment variables:

```bash
export AZURE_SUBSCRIPTION_ID="<your-subscription-id>"
export AZURE_TENANT_ID="<your-tenant-id>"
export AZURE_CLIENT_ID="<your-client-id>"
# Optional, only for Terraform Cloud:
export TF_TOKEN_app_terraform_io="<your-tfc-token>"
```

4. Authenticate with Azure:

```bash
az login
az account set --subscription "<your-subscription-id>"
```

## 4) How to use Copilot skills in this repo

In Copilot Chat, attach a skill file as context, then ask for what you need.

Example:

```text
#file:.github/prompts/azure-landing-zone.prompt.md

Design a hub-and-spoke landing zone for a dev/test environment with 2 spoke subscriptions.
```

Common skill files:

- `azure-landing-zone.prompt.md`
- `azure-architecture-design.prompt.md`
- `azure-troubleshooting.prompt.md`
- `azure-policy-governance.prompt.md`
- `azure-monitoring-kql.prompt.md`
- `azure-cost-optimization.prompt.md`
- `terraform-bicep-deployment.prompt.md`
- `drawio-architecture.prompt.md`

## 5) Teaching Mode (optional, recommended for learning)

Teaching Mode gives explanations, trade-offs, failure modes, and exercises.

- Turn on: `teach mode on`
- Turn off: `teach mode off`
- One-shot explanation: `explain as you build`

See `LEARNING.md` for full details.

## 6) Deploy the provided IaC templates

### Terraform quick path

```bash
cd terraform/landing-zone
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars
terraform init
terraform plan
terraform apply
```

### Bicep quick path

```bash
az deployment sub what-if \
  --location eastus \
  --template-file bicep/landing-zone/main.bicep \
  --parameters bicep/landing-zone/parameters/dev.bicepparam

az deployment sub create \
  --location eastus \
  --template-file bicep/landing-zone/main.bicep \
  --parameters bicep/landing-zone/parameters/dev.bicepparam
```

## 7) Suggested usage flow for new users

1. Read `README.md` for capability overview
2. Read `LEARNING.md` for the learning path and teaching mode
3. Start with `azure-landing-zone.prompt.md`
4. Generate architecture/design
5. Generate Terraform/Bicep implementation
6. Use policy/monitoring/cost skills to harden and optimize
7. Use troubleshooting skill for operational issues

## 8) Where to go next

- Learning tracks: `docs/learning-paths/`
- Prompt skills: `.github/prompts/`
- MCP configuration: `.vscode/mcp.json`
- Terraform example: `terraform/landing-zone/`
- Bicep example: `bicep/landing-zone/`

