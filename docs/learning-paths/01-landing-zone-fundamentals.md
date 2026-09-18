# 01 – Azure Landing Zone Fundamentals

## Objectives

By the end of this track you will be able to:

- [ ] Explain the purpose of the Microsoft Cloud Adoption Framework (CAF) and its five phases
- [ ] Describe the Enterprise-Scale Landing Zone architecture and why it uses a hub-and-spoke topology
- [ ] Identify the Management Group hierarchy used in this repo and the rationale for each level
- [ ] Distinguish between a *Platform* Landing Zone and a *Workload* Landing Zone
- [ ] Deploy the landing zone in this repo and validate a successful deployment

---

## Concepts

### What Is a Landing Zone?

An Azure Landing Zone is a pre-configured, policy-enforced Azure environment that provides a **secure, scalable, and governed foundation** for workloads. Think of it as the "paved road" — teams can deploy applications without reinventing networking, RBAC, or policy on every project.

CAF distinguishes between the platform landing zone and workload landing zones. A workload landing zone is the environment where a workload team deploys and operates its resources within platform guardrails.

| Archetype | Purpose | Examples in this repo |
|---|---|---|
| **Platform** | Shared infrastructure consumed by all workloads | Hub VNet, Log Analytics, Azure Firewall |
| **Workload** | Workload-specific environment | Spoke VNets (`var.spokes` in Terraform) |
| **Sandbox** | Isolated experimentation, loosely governed | Not deployed here — intentional |

### Management Group Hierarchy

The CAF Enterprise-Scale pattern recommends this hierarchy:

```
Tenant Root Group
└── <Organisation>
    ├── Platform
    │   ├── Connectivity
    │   ├── Identity
    │   └── Management
    └── Landing Zones
        ├── Corp (connected)
        └── Online (internet-facing)
```

**Why?** Management Group scope allows you to apply Azure Policy and RBAC once at a high level and have it inherit to all child subscriptions — no need to repeat governance on every subscription.

### Hub-and-Spoke Network Model

```
                ┌─────────────────────────────────┐
                │           Hub VNet               │
                │  ┌──────────┐  ┌──────────────┐ │
                │  │ Firewall │  │   Bastion    │ │
                │  └────┬─────┘  └──────────────┘ │
                │       │ UDR (0.0.0.0/0)         │
                └───────┼─────────────────────────┘
           VNet Peering │           VNet Peering
         ┌──────────────┼──────────────────────┐
         ▼              ▼                       ▼
    Spoke (Dev)    Spoke (Staging)         Spoke (Prod)
```

- **Hub**: Centralises shared network services (Firewall, Bastion, DNS, VPN/ExpressRoute gateway).
- **Spokes**: Workload-specific VNets peered to the hub. Traffic between spokes is routed through the hub Firewall (forced by UDRs — User-Defined Routes).
- **Benefit**: Security inspection at a single chokepoint; spokes stay small and governed.

### Key Governance Controls

| Control | Mechanism | Where in this repo |
|---|---|---|
| Required tags | Azure Policy (Deny) | `terraform/landing-zone/modules/policy/` |
| Diagnostic settings | Azure Monitor diagnostic-settings initiatives (`allLogs`/`audit`) with remediation | Policy module (audit baseline) |
| Least-privilege access | RBAC role assignments | Not in IaC (environment-specific) |
| Threat detection | Microsoft Defender for Cloud | `main.tf` — `azurerm_security_center_subscription_pricing` |

---

## Repo Code Walkthrough

### Terraform entry point

**File**: [`terraform/landing-zone/main.tf`](../../terraform/landing-zone/main.tf)

```hcl
module "hub_network" {
  source   = "./modules/hub-network"
  ...
}

module "spoke_network" {
  for_each = var.spokes
  source   = "./modules/spoke-network"
  ...
}
```

The root module orchestrates three child modules: `hub-network`, `spoke-network`, and `policy`. This is the CAF pattern of separating platform and application concerns into distinct modules with clear input/output contracts.

### Hub network module

**File**: `terraform/landing-zone/modules/hub-network/main.tf`

Key resources to study in order:

1. `azurerm_virtual_network` — hub address space
2. `azurerm_subnet` — `AzureFirewallSubnet` (must be named exactly this for Azure Firewall)
3. `azurerm_firewall` — Standard SKU, zone-redundant across AZs 1/2/3
4. `azurerm_bastion_host` — requires its own dedicated subnet `AzureBastionSubnet /27+`
5. `azurerm_log_analytics_workspace` — central diagnostics sink

### Bicep equivalent

**File**: [`bicep/landing-zone/main.bicep`](../../bicep/landing-zone/main.bicep)

`targetScope = 'subscription'` — the deployment creates a resource group and all resources within it at subscription scope. Compare this to the Terraform approach where the provider is configured at the subscription level.

---

## Checkpoint Questions

1. Why does `AzureFirewallSubnet` need to be at least `/26`?
2. What is the purpose of a UDR on spoke subnets with `0.0.0.0/0 → Azure Firewall`?
3. Why is the Log Analytics workspace deployed in the hub rather than per-spoke?
4. What does `DeployIfNotExists` (DINE) mean, and why is it used for diagnostic settings?

<details>
<summary>Answers (reveal after attempting)</summary>

1. Azure Firewall requires a minimum of 64 IPs in its dedicated subnet (`/26`). A `/27` gives only 32 IPs, which is insufficient for future scale.
2. The UDR forces all egress traffic from spokes through the Azure Firewall for inspection and logging before reaching the internet or other spokes — centralised security enforcement.
3. A single LAW (Log Analytics Workspace) reduces cost (no per-workspace overhead), simplifies cross-subscription queries, and enforces a single retention policy for all diagnostic logs.
4. DINE is an Azure Policy effect that can deploy a related resource such as a diagnostic setting. Microsoft recommends using the built-in diagnostic-settings initiatives where available; those assignments still require a remediation task to apply to existing resources.

</details>

---

## Hands-On Exercise

Deploy the Terraform landing zone to a **sandbox subscription** and validate each component:

```bash
# 1. Clone the repo and navigate to the landing zone
git clone https://github.com/pshah208/Copilot-4-AzureAdmin101
cd Copilot-4-AzureAdmin101/terraform/landing-zone

# 2. Copy and edit the example vars file
cp terraform.tfvars.example terraform.tfvars
# Edit: subscription_id, tenant_id, location, tags

# 3. Authenticate
az login
az account set --subscription "<your-sandbox-subscription-id>"

# 4. Deploy
terraform init
terraform plan -out=tfplan
terraform apply tfplan

# 5. Validate hub resources exist
az network vnet list --resource-group rg-connectivity-<env>-<region>-001 --output table

# 6. Verify Firewall is running
az network firewall show \
  --name afw-hub-<env>-<region>-001 \
  --resource-group rg-connectivity-<env>-<region>-001 \
  --query "provisioningState"

# 7. Check policy compliance (allow 15 min for evaluation)
az policy state list \
  --resource-group rg-connectivity-<env>-<region>-001 \
  --query "[?complianceState=='NonCompliant'].[resourceId,policyDefinitionName]" \
  --output table
```

**Expected result**: All resources show `"Succeeded"` provisioningState. Policy compliance may show initial non-compliance for tags — verify the DINE remediation task runs.

**Clean up**:
```bash
terraform destroy
```

---

## Further Reading

| Topic | Link |
|---|---|
| CAF Landing Zone conceptual architecture | https://learn.microsoft.com/azure/cloud-adoption-framework/ready/landing-zone/ |
| Azure landing zone reference architectures | https://learn.microsoft.com/azure/cloud-adoption-framework/ready/landing-zone/ |
| Management Group design | https://learn.microsoft.com/azure/cloud-adoption-framework/ready/landing-zone/design-area/resource-org-management-groups |
| Hub-and-spoke topology | https://learn.microsoft.com/azure/architecture/reference-architectures/hybrid-networking/hub-spoke |
| Azure Firewall sizing | https://learn.microsoft.com/azure/firewall/firewall-faq |
| Diagnostic settings at scale | https://learn.microsoft.com/azure/azure-monitor/platform/diagnostic-settings-policy-built-in |
