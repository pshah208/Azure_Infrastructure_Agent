> [!WARNING]
> ## ⚠️ Disclaimer
>
> **This tool is provided "AS IS", without warranty of any kind, express or implied.** It is intended for educational, evaluation, and experimental purposes only. Before using any prompts, Infrastructure-as-Code templates, scripts, or AI-generated outputs from this repository in a production environment, you **must independently evaluate, test, and validate** them against your organisation's security, compliance, and operational requirements.
>
> **Use at your own risk.** The author(s) and contributors accept no liability for any direct, indirect, incidental, or consequential damages — including but not limited to data loss, service outages, security incidents, unexpected Azure costs, or compliance violations — arising from the use, misuse, or inability to use this tool. AI-generated content (including Copilot suggestions, diagrams, and IaC code) may contain errors, omissions, or insecure defaults and **must be reviewed by a qualified Azure professional** before deployment.

---

# 🚀 Copilot for Azure Administration 101

> **GitHub Copilot** supercharged with Azure-native skills, MCP servers, and Infrastructure-as-Code templates to accelerate cloud architecture, deployment, and operations.

---

## 🎓 Teaching Mode

Copilot in this repo works in two modes:

| Mode | Behaviour |
|---|---|
| **Default (Doer Mode)** | Produces Azure artifacts — IaC, diagrams, policies, KQL — directly. Concise and action-focused. |
| **Teaching Mode (opt-in)** | Produces the artifact **and** explains the *why*, trade-offs, failure modes, Microsoft Learn links, and a hands-on exercise. |

**Teaching Mode is OFF by default.** Toggle it with any of these phrases:

```
teach mode on          # ON for the rest of the conversation
enable teaching mode   # ON for the rest of the conversation
/teach on              # ON for the rest of the conversation
explain as you build   # One-shot: ON for next response only

teach mode off         # OFF
disable teaching mode  # OFF
/teach off             # OFF
just do it             # Silences teaching for the current response only
```

Copilot confirms each toggle inline (`✅ Teaching Mode: ON` / `Teaching Mode: OFF`).

👉 See [LEARNING.md](LEARNING.md) for the full learning guide, activation phrases, and the six learning tracks in [`docs/learning-paths/`](docs/learning-paths/).

---

## ✨ Capabilities Overview

| Capability | Description |
|---|---|
| 🏗️ Azure Landing Zone | Design & deploy CAF Enterprise-Scale landing zones |
| 🎨 Architecture Diagramming | Generate Draw.io diagrams with official Azure icons |
| 🔧 Terraform IaC | Modular Terraform templates for Azure resources |
| 💪 Bicep IaC | Idiomatic Bicep modules for Azure deployments |
| 🔍 Troubleshooting | Systematic Azure issue diagnosis & remediation |
| 📚 Microsoft Learn | AI-assisted learning from official Microsoft docs |
| 🔒 Security & Governance | Policy, RBAC, Defender for Cloud out-of-the-box |
| 🛡️ Azure Policy & Governance | Author policy definitions, initiatives, and remediation tasks |
| 💰 Cost Optimisation | FinOps analysis, budget alerts, right-sizing, RI/SP recommendations |
| 📊 Monitoring & KQL | KQL queries, Azure Monitor alerts, Workbooks, and observability strategy |
| 🧭 Landing Zone Assessment | Audit existing landing zones against CAF design areas and WAF pillars with scored, evidence-based findings |

---

## 📂 Repository Structure

```
.
├── .github/
│   ├── copilot-instructions.md          # Global Copilot custom instructions (incl. Teaching Mode)
│   └── prompts/                         # Copilot skill prompt files
│       ├── azure-landing-zone.prompt.md
│       ├── azure-architecture-design.prompt.md
│       ├── azure-troubleshooting.prompt.md
│       ├── azure-policy-governance.prompt.md
│       ├── azure-cost-optimization.prompt.md
│       ├── azure-monitoring-kql.prompt.md
│       ├── azure-landing-zone-assessment.prompt.md
│       ├── azure-teaching-mode.prompt.md    # NEW: deep-dive teaching skill
│       ├── drawio-architecture.prompt.md
│       ├── drawio-icon-verification.prompt.md
│       ├── drawio-export-publish.prompt.md
│       ├── terraform-bicep-deployment.prompt.md
│       └── references/                  # Supporting reference files
│           └── azure2-complete-catalog.txt
├── .vscode/
│   └── mcp.json                         # MCP server configurations
├── docs/
│   └── learning-paths/                  # NEW: self-paced learning tracks
│       ├── 01-landing-zone-fundamentals.md
│       ├── 02-iac-with-terraform-vs-bicep.md
│       ├── 03-networking-hub-spoke.md
│       ├── 04-policy-and-governance.md
│       ├── 05-monitoring-and-kql.md
│       └── 06-finops-basics.md
├── LEARNING.md                          # NEW: teaching mode guide & track index
├── terraform/
│   └── landing-zone/                    # Hub-and-spoke landing zone (Terraform)
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       ├── versions.tf
│       ├── terraform.tfvars.example
│       └── modules/
│           ├── hub-network/
│           ├── spoke-network/
│           └── policy/
└── bicep/
    └── landing-zone/                    # Hub-and-spoke landing zone (Bicep)
        ├── main.bicep
        ├── parameters/
        │   └── dev.bicepparam
        └── modules/
            ├── hub-network.bicep
            ├── spoke-network.bicep
            ├── log-analytics.bicep
            ├── sre-agent.bicep
            ├── sre-agent-rbac.bicep
            └── arc-vm-extensions.bicep
```

---

## 🤖 GitHub Copilot Skills

Skills are prompt files stored in `.github/prompts/`. Open a prompt file in VS Code and reference it in GitHub Copilot Chat (e.g., `#file:.github/prompts/drawio-architecture.prompt.md` as context).

### 1. 🏗️ Azure Landing Zone

**File**: `.github/prompts/azure-landing-zone.prompt.md`

Helps you design and deploy a complete Azure Landing Zone following the **Microsoft Cloud Adoption Framework (CAF) Enterprise-Scale** pattern:

- Management Group hierarchy design
- Hub-and-spoke / Virtual WAN connectivity model
- Identity, security, and governance baseline
- Terraform / Bicep deployment artefacts

**Example prompt**:
> *"Design a hub-and-spoke landing zone for a financial services company with 3 spoke subscriptions, ExpressRoute connectivity, and strict PCI-DSS compliance requirements."*

---

### 2. 🎨 Azure Architecture Design

**File**: `.github/prompts/azure-architecture-design.prompt.md`

Produces well-architected Azure solution designs covering all **five WAF pillars**:

- Service selection with justification
- Network topology with NSG rules and private endpoints
- Identity & RBAC model
- Monitoring and alerting strategy
- Cost estimate

**Example prompt**:
> *"Design a multi-region active-active web application architecture for a retail e-commerce platform expecting 100k concurrent users during peak events."*

---

### 3. 🔍 Azure Troubleshooting

**File**: `.github/prompts/azure-troubleshooting.prompt.md`

Systematic diagnostic framework covering:

- Activity Log & Service Health review
- Resource-type specific diagnostic sources (NSG Flow Logs, App Insights, Firewall logs)
- Root cause analysis methodology
- Step-by-step remediation with Azure CLI / PowerShell
- KQL queries for Log Analytics validation

**Example prompt**:
> *"VMs in a spoke VNet cannot reach resources in the hub after deploying Azure Firewall. Traffic appears to be dropped."*

---

### 4. 🎨 Draw.io Architecture Diagramming

**File**: `.github/prompts/drawio-architecture.prompt.md`

Creates professional Azure architecture diagrams as `.drawio` files using the **official Azure2 icon catalog (638 verified icons)**, the `drawio/create_diagram` MCP tool, and CLI export to PNG/SVG/PDF.

- Conceptual, logical, physical, and network-topology diagrams
- Professional VNet/subnet containment patterns with color-coded zones
- Verified icon paths grepped from `references/azure2-complete-catalog.txt` before use
- Export to PNG, SVG, or PDF via the draw.io CLI

**Example prompt**:
> *"Create a Draw.io diagram for a hub-and-spoke network with Azure Firewall, Bastion, ExpressRoute gateway, and three spoke VNets for dev, staging, and production."*

---

### 5. 🔧 Terraform & Bicep Deployment

**File**: `.github/prompts/terraform-bicep-deployment.prompt.md`

Generates production-ready IaC code following best practices:

- Remote state management (Azure Blob Storage)
- Modular structure with reusable components
- Security defaults (Key Vault secrets, Managed Identity, TLS 1.2)
- GitHub Actions CI/CD pipeline with plan/apply stages and drift detection

**Example prompt**:
> *"Create a Terraform module for an AKS cluster with Azure CNI, Azure AD integration, cluster autoscaler, and a Log Analytics workspace for Container Insights."*

---

### 6. 🛡️ Azure Policy & Governance

**File**: `.github/prompts/azure-policy-governance.prompt.md`

Author Azure Policy definitions, initiatives, assignments, exemptions, and remediation tasks following CAF governance patterns:

- Built-in vs custom policy definitions with all supported effects (Deny, Audit, DINE, Modify, Append)
- Initiative design scoped to Management Group, Subscription, or Resource Group
- Tagging policies enforcing `Environment`, `CostCenter`, `Owner`, `CreatedBy`
- Diagnostic settings enforcement via DeployIfNotExists policies
- Authoring policies in both Bicep and Terraform

**Example prompt**:
> *"Create a policy initiative that enforces required tags and diagnostic settings on all resources in the production management group, and generate the remediation tasks to bring existing resources into compliance."*

---

### 7. 💰 Cost Optimisation & FinOps

**File**: `.github/prompts/azure-cost-optimization.prompt.md`

Drive Azure cost optimisation and FinOps practices across your subscriptions:

- Azure Cost Management queries and multi-threshold budget alerts
- Reserved Instances, Savings Plans, and Spot VM sizing recommendations
- Right-sizing analysis for VMs, SQL, App Service, AKS, and Redis
- Auto-shutdown scheduling, dev/test pricing, and B-series burstable VMs
- Tagging strategy for cost allocation and KQL queries against cost exports

**Example prompt**:
> *"Analyse our Azure dev/test environment and give me a prioritised list of cost reduction actions with estimated monthly savings in USD."*

---

### 8. 📊 Monitoring, KQL & Observability

**File**: `.github/prompts/azure-monitoring-kql.prompt.md`

Author KQL queries, Azure Monitor alert rules, Workbooks, and a full observability strategy:

- KQL fundamentals (summarize, project, extend, join, let, render) with a recipe library
- Coverage of key tables: AzureActivity, Perf, SigninLogs, AppRequests, ContainerLog, and more
- Alert rule design (metric, log, activity log) with dynamic thresholds and action groups
- Workbook authoring guidance for performance, reliability, and security dashboards

**Example prompt**:
> *"Create KQL queries and alert rules to detect VM CPU saturation above 90%, failed Azure deployments in the Activity Log, and sign-in failure spikes in Entra ID."*

---

### 9. 🔎 Draw.io Icon Verification

**File**: `.github/prompts/drawio-icon-verification.prompt.md`

Strict Azure2 icon path verification workflow before any diagram is generated:

- Step-by-step grep procedure against `references/azure2-complete-catalog.txt`
- Verified vs unverified path examples with clear do/don't guidance
- Fallback rules when an icon is missing (use closest category icon + descriptive label)
- Verification report format listing ✅ verified, ⚠️ substituted, and ❌ removed icons
- Hard gate: no unverified path may appear in generated diagram XML

**Example prompt**:
> *"Verify all icon paths in my hub-spoke diagram before generating the XML — list any substitutions or removals."*

---

### 10. 📤 Draw.io Export & Publish

**File**: `.github/prompts/drawio-export-publish.prompt.md`

Export Draw.io diagrams to PNG, SVG, or PDF via the draw.io CLI and publish to docs:

- draw.io CLI installation (Linux/macOS/Windows/CI) and key export flags
- Single and batch export scripts (Bash) with double-extension naming convention
- GitHub Actions workflow for automated export on push
- Embedding syntax for README, GitHub Wiki, MkDocs, and Docusaurus
- Recommended `diagrams/` + `exports/` directory layout

**Example prompt**:
> *"Export all .drawio files in my diagrams/ folder to PNG at 2× resolution and embed them in the README under the Architecture section."*

---

### 11. 🎓 Azure Teaching Mode (Deep-Dive)

**File**: `.github/prompts/azure-teaching-mode.prompt.md`

Point Copilot at any file in this repo for a structured deep-dive explanation:

- Line-by-line (or block-by-block) walkthrough of IaC, diagrams, or policy files
- Maps each resource to the relevant CAF/WAF principle with a summary table
- Surfaces failure modes and detection hints for each component
- Generates a step-by-step guided lab to reproduce the pattern from scratch
- Includes checkpoint questions with hidden answers

**Always teaching**: this skill is always in teaching mode — no `teach mode on` required.

**Example prompt**:
> *"Walk me through terraform/landing-zone/modules/hub-network/main.tf and explain every resource."*

---

### 12. 🧭 Azure Landing Zone Assessment

**File**: `.github/prompts/azure-landing-zone-assessment.prompt.md`

Performs a structured, read-only assessment of an existing Azure Landing Zone against **CAF design areas** and **WAF pillars**:

- Scope discovery across management groups, subscriptions, and network topology
- Evidence-based findings with query/command/source citations
- Maturity scoring per CAF design area and WAF pillar
- Severity-ranked remediation backlog with hand-off to the right skill

**Example prompt**:
> *"Assess our production landing zone against CAF and WAF and give me a prioritized remediation backlog."*

---

## 🔌 MCP Server Configuration

MCP (Model Context Protocol) servers extend GitHub Copilot with live tool capabilities. The configuration is in `.vscode/mcp.json`.

### Setup

1. **Install prerequisites** (Node.js 18+)
2. **Set environment variables** (see table below)
3. Open the repository in VS Code — MCP servers start automatically

### Available MCP Servers

| Server key in `mcp.json` | Type | Endpoint / Package | Purpose |
|---|---|---|---|
| `azure-mcp` | stdio | `@azure/mcp` (npm) | Manage Azure resources, query Resource Graph, read logs |
| `drawio-http` | http | `https://mcp.draw.io/mcp` | Create and edit Draw.io diagrams programmatically |
| `microsoft-learn` | http | `https://learn.microsoft.com/api/mcp` | Search and retrieve official Microsoft documentation |
| `terraform-mcp` | stdio | `@hashicorp/terraform-mcp-server` (npm) | Run Terraform plans, inspect state, explore modules |

### Required Environment Variables

```bash
# Azure MCP
export AZURE_SUBSCRIPTION_ID="<your-subscription-id>"
export AZURE_TENANT_ID="<your-tenant-id>"
export AZURE_CLIENT_ID="<your-client-id>"

# Terraform MCP (optional – Terraform Cloud)
export TF_TOKEN_app_terraform_io="<your-tfc-token>"
```

> **Tip**: Use `az login` or OIDC federated credentials for local and CI/CD authentication. The Azure MCP server will pick up your CLI credentials automatically. Avoid using long-lived `AZURE_CLIENT_SECRET` values where possible.

---

## 🏗️ Infrastructure as Code Templates

### Terraform – Azure Landing Zone

Deploys a **hub-and-spoke** network topology with:

| Component | Details |
|---|---|
| Hub VNet | Configurable address space |
| Azure Firewall | Standard SKU, zone-redundant |
| Azure Bastion | Standard SKU for secure VM access |
| VPN Gateway | Optional, Generation 2, BGP-enabled |
| Spoke VNets | N spokes via `var.spokes` map |
| VNet Peerings | Bidirectional hub ↔ spoke |
| Log Analytics | Central workspace for all diagnostics |
| Defender for Cloud | Servers, Storage, Key Vault plans |
| Azure Policy | Required tags + diagnostic settings |

#### Quick Start

```bash
cd terraform/landing-zone

# Copy and edit the example vars file
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your subscription ID, tenant ID, etc.

# Authenticate
az login
az account set --subscription "<your-subscription-id>"

# Deploy
tf init
tf plan
tf apply
```

---

### Bicep – Azure Landing Zone

Equivalent hub-and-spoke deployment using **Azure Bicep** with `targetScope = 'subscription'`.

#### Modules

| Module | Purpose |
|---|---|
| `modules/hub-network.bicep` | Deploys hub virtual network, firewall, bastion, and diagnostics |
| `modules/spoke-network.bicep` | Deploys spoke virtual networks, peering, and diagnostics |
| `modules/log-analytics.bicep` | Deploys central Log Analytics workspace |
| `modules/sre-agent.bicep` | Deploys Azure SRE Agent with managed identity and least-privilege RBAC |
| `modules/arc-vm-extensions.bicep` | Deploys Azure Arc VM extensions (AMA, Machine Configuration, optional Dependency Agent) |

#### Optional agent capabilities

- Set `deploySreAgent = true` to deploy Azure SRE Agent.
  - Provide `monitoredResourceGroupIds` (resource group IDs in scope).
  - Keep `enableSreAgentRemediationAccess = false` for read-only least privilege by default.
- Set `deployArcVmExtensions = true` to deploy extensions to an existing Arc machine.
  - Provide `arcMachineResourceGroupName`, `arcMachineName`, and `arcMachineOsType`.
  - Use extension toggles (`deployAzureMonitorAgent`, `deployMachineConfiguration`, `deployDependencyAgent`) as needed.

#### Quick Start

```bash
# Authenticate
az login
az account set --subscription "<your-subscription-id>"

# What-If (preview changes)
az deployment sub what-if \
  --location eastus \
  --template-file bicep/landing-zone/main.bicep \
  --parameters bicep/landing-zone/parameters/dev.bicepparam

# Deploy
az deployment sub create \
  --location eastus \
  --template-file bicep/landing-zone/main.bicep \
  --parameters bicep/landing-zone/parameters/dev.bicepparam
```

---

## 🔒 Security & Compliance Defaults

All templates enforce the following by default:

- ✅ **Tagging policy** – `Environment`, `CostCenter`, `Owner`, `CreatedBy` required on all resources
- ✅ **Diagnostic settings** – all resources stream logs to central Log Analytics
- ✅ **TLS 1.2 minimum** for all storage and web resources
- ✅ **Private endpoints** preferred over public endpoints for PaaS services
- ✅ **Managed Identities** for service-to-service authentication
- ✅ **Microsoft Defender for Cloud** enabled across Servers, Storage, and Key Vault
- ✅ **Zone-redundant** deployments for critical network resources (Firewall, Bastion, Gateways)

---

## 📚 References

| Resource | Link |
|---|---|
| Microsoft Cloud Adoption Framework | https://learn.microsoft.com/azure/cloud-adoption-framework/ |
| Azure Landing Zones | https://learn.microsoft.com/azure/cloud-adoption-framework/ready/landing-zone/ |
| Azure Well-Architected Framework | https://learn.microsoft.com/azure/well-architected/ |
| Terraform AzureRM Provider | https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs |
| Azure Bicep Documentation | https://learn.microsoft.com/azure/azure-resource-manager/bicep/ |
| Draw.io Azure Shape Library | https://diagrams.net |
| MCP Specification | https://modelcontextprotocol.io |

---

## 📖 Wiki

A guided, wiki-ready usage document is available at:

- [`docs/wiki/Home.md`](docs/wiki/Home.md)

You can copy this page into the repository GitHub Wiki as the Home page.

---

## 🤝 Contributing

1. Fork this repository
2. Create a feature branch: `git checkout -b feature/my-new-skill`
3. Add your skill prompt to `.github/prompts/`
4. Update this README
5. Open a pull request

---

*Built with ❤️ using GitHub Copilot, Azure, Terraform, and Bicep.*