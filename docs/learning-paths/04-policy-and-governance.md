# 04 – Azure Policy and Governance

## Objectives

By the end of this track you will be able to:

- [ ] Explain the difference between Azure Policy effects (Deny, Audit, DINE, Modify, Append)
- [ ] Design a policy initiative scoped to a Management Group
- [ ] Understand RBAC (Role-Based Access Control) and the principle of least privilege in Azure
- [ ] Read the policy module in this repo and explain what it enforces
- [ ] Trigger and monitor a policy remediation task

---

## Concepts

### What Is Azure Policy?

Azure Policy evaluates resources against rules (policy definitions) and enforces compliance. Policies can **prevent** non-compliant resources from being created, **audit** existing ones, or **automatically remediate** non-compliance.

Policy sits at the control plane — it runs continuously, not just at deployment time.

### Policy Effects

| Effect | Triggers on | Behaviour |
|---|---|---|
| **Deny** | Create / update | Blocks the request if it violates the rule |
| **Audit** | Evaluation cycle | Marks resource non-compliant but does NOT block |
| **AuditIfNotExists** (AINE) | Evaluation cycle | Audits if a related resource is missing |
| **DeployIfNotExists** (DINE) | Evaluation cycle + trigger | Deploys a related resource if missing (e.g., diagnostic setting) |
| **Modify** | Create / update | Modifies properties on the resource (e.g., add a tag) |
| **Append** | Create / update | Appends additional values to a property |
| **Disabled** | Never | Used to disable a policy temporarily without removing the assignment |

### Policy Initiatives (Policy Sets)

An **initiative** groups multiple policy definitions into a single assignment. This is the recommended approach for governance baselines:

```
Initiative: "Landing Zone Governance Baseline"
├── Policy: Require tag 'Environment'
├── Policy: Require tag 'CostCenter'
├── Policy: Require tag 'Owner'
├── Initiative: Enable diagnostic settings by category group (`allLogs` or `audit`)
└── Policy: Deny public IP creation (Deny)
```

Assign the initiative once at the Management Group level — all child subscriptions and resource groups inherit it.

### RBAC in Azure

Azure RBAC controls **who** can do **what** on **which** resource. The model has three elements:

| Element | Description | Example |
|---|---|---|
| **Security principal** | Who | User, Service Principal, Managed Identity, Group |
| **Role definition** | What | Contributor, Reader, Network Contributor |
| **Scope** | Which resource | Subscription, Resource Group, Resource |

**Principle of least privilege**: assign the narrowest role at the narrowest scope.

Common built-in roles:

| Role | Permissions |
|---|---|
| Owner | Full control including RBAC assignments |
| Contributor | Create/manage resources, cannot manage RBAC |
| Reader | Read-only |
| Network Contributor | Manage networking resources, not compute |
| Monitoring Reader | Read monitoring data, logs |

For automation (Terraform remote state, Bicep deployments), use a **Service Principal** or **User-Assigned Managed Identity** with `Contributor` at the subscription scope — never use personal credentials.

### Managed Identities (MI)

A Managed Identity is a service principal managed by Azure — no secret rotation required. Two types:

| Type | When to use |
|---|---|
| **System-assigned MI** | One-to-one with a resource (e.g., a VM accesses Key Vault) |
| **User-assigned MI** | Shared across multiple resources (e.g., several VMs access the same storage) |

---

## Repo Code Walkthrough

### Policy module — Terraform

**File**: `terraform/landing-zone/modules/policy/main.tf`

The module deploys required-tag policies and assigns an audit policy for diagnostic settings. For production-scale deployments, prefer Microsoft's built-in diagnostic-settings initiatives, which cover supported resource types and can be assigned with a system-assigned managed identity plus a remediation task.

#### 1. Required Tags (Deny)

```hcl
resource "azurerm_policy_definition" "require_tags" {
  name         = "require-mandatory-tags"
  policy_type  = "Custom"
  mode         = "Indexed"
  display_name = "Require mandatory tags on all resources"

  policy_rule = jsonencode({
    if = {
      anyOf = [
        { field = "tags['Environment']", exists = "false" },
        { field = "tags['CostCenter']",  exists = "false" },
        { field = "tags['Owner']",       exists = "false" },
        { field = "tags['CreatedBy']",   exists = "false" }
      ]
    }
    then = { effect = "Deny" }
  })
}
```

This policy **blocks** resource creation if any of the four required tags are absent.

#### 2. Diagnostic Settings

```hcl
resource "azurerm_policy_definition" "diag_settings" {
  name         = "deploy-diagnostic-settings"
  policy_type  = "Custom"
  mode         = "Indexed"
  ...
  policy_rule = jsonencode({
    if   = { field = "type", equals = "Microsoft.Network/virtualNetworks" }
    then = {
      effect = "DeployIfNotExists"
      details = {
        type = "Microsoft.Insights/diagnosticSettings"
        ...
        deployment = { ... }  # ARM template to create diagnostic setting
      }
    }
  })
}
```

Assignments that use `DeployIfNotExists` require a **remediation task** to fix existing non-compliant resources. Without remediation, the assignment does not retroactively repair the existing estate.

### Policy Assignment

```hcl
resource "azurerm_resource_group_policy_assignment" "tags" {
  name                 = "assign-require-tags"
  resource_group_id    = var.resource_group_id
  policy_definition_id = azurerm_policy_definition.require_tags.id
}
```

In production, scope assignments to the Management Group, not individual resource groups.

### Bicep equivalent

**File**: `bicep/landing-zone/main.bicep` — uses `Microsoft.Authorization/policyDefinitions` and `Microsoft.Authorization/policyAssignments` resources, following the same tag-and-diagnostic pattern.

---

## Checkpoint Questions

1. You have a DINE policy assigned at the Management Group level. A VNet was created two days ago (before the assignment). Is it compliant? How do you fix it?
2. What is the difference between `Deny` and `Audit` effects, and when would you use Audit instead of Deny?
3. A service principal running your Terraform pipeline needs to create resources in subscription A. What is the minimum RBAC role and scope?
4. Why use a User-Assigned Managed Identity over a System-Assigned one for a fleet of 20 VMs accessing the same Key Vault?

<details>
<summary>Answers (reveal after attempting)</summary>

1. The existing VNet is **non-compliant** (the DINE effect only fires on create/update, not retroactively). You need to create a **remediation task** for the policy assignment. In the portal: Policy → Assignments → select the assignment → Create Remediation Task.
2. `Deny` blocks the operation — zero non-compliant resources can exist. `Audit` records non-compliance but doesn't block — useful when you need a grace period to let teams fix existing resources before enforcing strictly.
3. `Contributor` at the subscription scope (not Owner — the pipeline doesn't need to manage RBAC). If the pipeline only deploys to specific resource groups, scope to the resource group for least privilege.
4. A System-assigned MI is tied to one resource's lifecycle. With 20 VMs, you'd have 20 separate Key Vault access policies (one per MI). A User-assigned MI creates one identity, granted once to Key Vault, shared by all 20 VMs — simpler and easier to audit.

</details>

---

## Hands-On Exercise

Create a custom policy that denies storage accounts with public blob access and apply it to a resource group:

```bash
# 1. Create the policy definition
az policy definition create \
  --name "deny-storage-public-blob-access" \
  --display-name "Deny storage accounts with public blob access" \
  --description "Blocks creation of storage accounts that allow public blob access" \
  --rules '{
    "if": {
      "allOf": [
        { "field": "type", "equals": "Microsoft.Storage/storageAccounts" },
        { "field": "Microsoft.Storage/storageAccounts/allowBlobPublicAccess", "equals": "true" }
      ]
    },
    "then": { "effect": "Deny" }
  }' \
  --mode Indexed

# 2. Assign to a resource group
RG_ID=$(az group show --name rg-policy-lab-dev-eastus-001 --query id -o tsv)

az policy assignment create \
  --name "deny-storage-public-blob" \
  --policy "deny-storage-public-blob-access" \
  --scope $RG_ID

# 3. Test: try to create a non-compliant storage account (should fail)
az storage account create \
  --name stpolicylabtest01 \
  --resource-group rg-policy-lab-dev-eastus-001 \
  --allow-blob-public-access true
# Expected: RequestDisallowedByPolicy error

# 4. Create a compliant storage account (should succeed)
az storage account create \
  --name stpolicylabtest02 \
  --resource-group rg-policy-lab-dev-eastus-001 \
  --allow-blob-public-access false

# 5. Check compliance state
az policy state list \
  --resource-group rg-policy-lab-dev-eastus-001 \
  --query "[].{Resource:resourceId,State:complianceState}" \
  --output table
```

---

## Further Reading

| Topic | Link |
|---|---|
| Azure Policy overview | https://learn.microsoft.com/azure/governance/policy/overview |
| Policy effects explained | https://learn.microsoft.com/azure/governance/policy/concepts/effects |
| Initiative definitions | https://learn.microsoft.com/azure/governance/policy/concepts/initiative-definition-structure |
| RBAC best practices | https://learn.microsoft.com/azure/role-based-access-control/best-practices |
| Managed Identities | https://learn.microsoft.com/entra/identity/managed-identities-azure-resources/overview |
| Diagnostic settings initiatives | https://learn.microsoft.com/azure/azure-monitor/platform/diagnostic-settings-policy-built-in |
| CAF Govern methodology | https://learn.microsoft.com/azure/cloud-adoption-framework/govern/ |
