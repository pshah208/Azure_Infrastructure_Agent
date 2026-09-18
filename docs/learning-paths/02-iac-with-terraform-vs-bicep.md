# 02 – IaC with Terraform vs. Azure Bicep

## Objectives

By the end of this track you will be able to:

- [ ] Explain the key differences between Terraform (HCL) and Azure Bicep as IaC tools
- [ ] Identify when each tool is the better choice for a given scenario
- [ ] Read and compare equivalent resources across this repo's Terraform and Bicep implementations
- [ ] Understand state management in Terraform and deployment modes in Bicep
- [ ] Run `what-if` / `plan` operations for both tools before applying changes

---

## Concepts

### The Core Difference

Both tools solve the same problem — declaring Azure infrastructure declaratively — but they have different design philosophies:

| Dimension | Terraform (HCL) | Azure Bicep |
|---|---|---|
| **Vendor** | HashiCorp (multi-cloud) | Microsoft (Azure-only) |
| **State** | External state file (required) | No state — ARM handles it |
| **Language** | HCL (HashiCorp Configuration Language) | Bicep DSL (compiles to ARM JSON) |
| **Multi-cloud** | ✅ AWS, GCP, Azure, K8s, etc. | ❌ Azure only |
| **Day-2 drift detection** | `terraform plan` shows drift vs. state | `what-if` shows drift vs. live ARM |
| **Module reuse** | Terraform Registry + local modules | Bicep Registry + local modules |
| **CI/CD integration** | GitHub Actions, Azure Pipelines, Atlantis | GitHub Actions, Azure Pipelines |
| **Learning curve** | Moderate (HCL + state concepts) | Lower (closer to ARM, Azure-native) |

### When to Choose Terraform

- Your organisation already uses Terraform for other clouds (AWS, GCP)
- You need a **Terraform Cloud / Enterprise** governance workflow (Sentinel policies, remote runs)
- Teams are already proficient in HCL
- You want the **Terraform Registry** ecosystem (thousands of community modules)
- Drift detection and state reconciliation are first-class requirements

### When to Choose Bicep

- Azure-only deployments — no multi-cloud requirement
- Teams familiar with ARM templates who want a cleaner syntax
- You want **zero external state management** overhead
- You're targeting **Azure Deployment Stacks** for lifecycle management
- Microsoft support is a priority (Bicep is the first-class ARM DSL)

### State Management (Terraform)

Terraform stores a *state file* that maps your HCL declarations to real Azure resource IDs. Without state, Terraform cannot know whether a resource already exists.

**Remote state** (required for teams) uses Azure Blob Storage:

```hcl
terraform {
  backend "azurerm" {
    resource_group_name  = "rg-tfstate-prod-eastus-001"
    storage_account_name = "stgtfstateprodeastus001"
    container_name       = "tfstate"
    key                  = "landing-zone/terraform.tfstate"
  }
}
```

State locking uses Azure Storage lease to prevent concurrent applies.

### Deployment Modes (Bicep / ARM)

Bicep deployments run in one of two modes:

| Mode | Behaviour | When to use |
|---|---|---|
| **Incremental** (default) | Adds/updates resources; does not delete resources absent from the template | Most deployments |
| **Complete** | Removes resources in the resource group not in the template | Full environment reconciliation (use carefully) |

---

## Repo Code Walkthrough

### Side-by-Side: Hub VNet

**Terraform** — `terraform/landing-zone/modules/hub-network/main.tf`:

```hcl
resource "azurerm_virtual_network" "hub" {
  name                = "vnet-hub-${var.environment}-${var.location}-001"
  location            = var.location
  resource_group_name = var.resource_group_name
  address_space       = [var.hub_address_space]
  tags                = var.tags
}
```

**Bicep** — `bicep/landing-zone/modules/hub-network.bicep`:

```bicep
resource hubVnet 'Microsoft.Network/virtualNetworks@2025-07-01' = {
  name: 'vnet-hub-${environment}-${location}-001'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [ hubAddressSpace ]
    }
  }
}
```

Both declare the same resource. Note:
- Terraform uses `azurerm_virtual_network` — the provider abstracts the ARM resource type
- Bicep uses the ARM resource type directly: `Microsoft.Network/virtualNetworks@2025-07-01`
- Bicep requires an explicit API version; this repo enables the `use-recent-api-versions` linter rule so stale versions are surfaced during authoring
- Terraform picks API versions internally through the provider

### Side-by-Side: Log Analytics Workspace

**Terraform** — uses the `azurerm_log_analytics_workspace` resource with `sku = "PerGB2018"` and `retention_in_days`.

**Bicep** — `bicep/landing-zone/modules/log-analytics.bicep` — uses `Microsoft.OperationalInsights/workspaces@2025-07-01`.

The Bicep module is standalone and reusable — it can be referenced from the root `main.bicep` using a `module` block:

```bicep
module law 'modules/log-analytics.bicep' = {
  name: 'law-deployment'
  params: {
    workspaceName: 'law-hub-${environment}-${location}-001'
    location: location
    retentionInDays: 90
  }
}
```

### Parameters vs. Variables

| Concept | Terraform | Bicep |
|---|---|---|
| Input values | `variable` blocks in `variables.tf` | `param` declarations with `@description()` |
| Sensitive values | `sensitive = true` on variable | `@secure()` decorator |
| Defaults | `default = <value>` in variable | `= <value>` after param type |
| Environment-specific values | `terraform.tfvars` file | `.bicepparam` file |

---

## Checkpoint Questions

1. What happens if two engineers run `terraform apply` simultaneously without remote state locking?
2. Why does Bicep require an explicit API version (for example, `@2025-07-01`) but Terraform does not?
3. In Bicep, what is the difference between `module` and `resource`?
4. You need to deploy the same infrastructure to Azure, AWS, and GCP. Which tool do you choose and why?

<details>
<summary>Answers (reveal after attempting)</summary>

1. Without state locking, both engineers read the same state simultaneously, make changes, and one overwrites the other's state — causing **state corruption** and potentially orphaned resources.
2. Bicep compiles directly to ARM JSON and ARM APIs are versioned; the API version determines which properties are available. Terraform's AzureRM provider pins to specific API versions internally and exposes a stable abstraction.
3. `resource` declares a single ARM resource. `module` is a reusable composition unit — it calls another Bicep file and can contain multiple resources. Analogous to Terraform's `resource` vs. `module`.
4. Terraform — it supports all three clouds with a single toolchain and workflow. Bicep is Azure-only.

</details>

---

## Hands-On Exercise

Compare `plan` / `what-if` output for both tools against the same intended state:

```bash
# === TERRAFORM ===
cd terraform/landing-zone
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars

az login
terraform init
terraform plan   # Shows what WILL be created/changed/destroyed

# After a first apply, make a small change (e.g., add a tag)
# and run plan again — observe the diff output

# === BICEP ===
cd ../../bicep/landing-zone

# What-if (preview changes without deploying)
az deployment sub what-if \
  --location eastus \
  --template-file main.bicep \
  --parameters parameters/dev.bicepparam \
  --output table

# Deploy
az deployment sub create \
  --location eastus \
  --template-file main.bicep \
  --parameters parameters/dev.bicepparam
```

**Observe**: `terraform plan` colour-codes additions (green `+`), deletions (red `-`), and in-place updates (yellow `~`). Bicep `what-if` uses `+` / `-` / `~` in a table format. Both show the same intended change, different UX.

---

## Further Reading

| Topic | Link |
|---|---|
| Terraform AzureRM provider docs | https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs |
| Bicep documentation | https://learn.microsoft.com/azure/azure-resource-manager/bicep/ |
| Bicep vs. Terraform comparison | https://learn.microsoft.com/azure/developer/terraform/comparing-terraform-and-bicep |
| Terraform remote state in Azure | https://learn.microsoft.com/azure/developer/terraform/store-state-in-azure-storage |
| Azure Deployment Stacks | https://learn.microsoft.com/azure/azure-resource-manager/bicep/deployment-stacks |
| Bicep best practices | https://learn.microsoft.com/azure/azure-resource-manager/bicep/best-practices |
