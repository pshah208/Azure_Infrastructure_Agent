<#
.SYNOPSIS
  Clean up the Mortgage IQ v1 app resources after v2 is validated.

.DESCRIPTION
  Deletes the v1 application resource group (Container Apps, Azure AI Foundry,
  Azure AI Search, ACR, Log Analytics, App Insights, managed identity) and the
  v1 custom "Foundry Agents Data User" role definition.

  PRESERVES Microsoft Fabric (capacity + workspace + Lakehouse data) so the v2
  app can reuse it. v1 and v2 are fully independent resource groups; this script
  never touches the v2 resource group.

.PARAMETER ResourceGroup
  The v1 app resource group. Default: rg-mortgageiq-dev-eastus2

.PARAMETER V1RoleName
  Exact display name of the v1 custom role to remove. Default:
  "Foundry Agents Data User"  (the v2 role "... (mortgageiq2-dev)" is left alone).

.PARAMETER Force
  Skip the interactive confirmation.

.EXAMPLE
  ./cleanup-v1.ps1 -WhatIf     # preview only
  ./cleanup-v1.ps1             # delete with confirmation
  ./cleanup-v1.ps1 -Force      # delete without prompt
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$ResourceGroup = "rg-mortgageiq-dev-eastus2",
  [string]$V1RoleName    = "Foundry Agents Data User",
  [string]$FabricResourceGroup = "rg-Fabric",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "== Mortgage IQ v1 cleanup ==" -ForegroundColor Cyan
Write-Host "Deletes v1 app RG:      $ResourceGroup"
Write-Host "PRESERVES Fabric RG:    $FabricResourceGroup (capacity + workspace + data)" -ForegroundColor Yellow
Write-Host "Does NOT touch v2:      rg-mortgageiq2-dev-eastus2"
Write-Host ""

# Hard guards: never delete Fabric or the v2 resource group.
if ($ResourceGroup -ieq $FabricResourceGroup) { throw "Refusing to delete the Fabric resource group." }
if ($ResourceGroup -imatch "mortgageiq2")      { throw "Refusing to delete a v2 resource group." }

$exists = az group exists --name $ResourceGroup | ConvertFrom-Json
if (-not $exists) {
  Write-Host "Resource group '$ResourceGroup' not found; nothing to delete."
} else {
  Write-Host "Resources that will be deleted:"
  az resource list -g $ResourceGroup --query "[].{name:name,type:type}" -o table

  $proceed = $Force -or $PSCmdlet.ShouldProcess($ResourceGroup, "Delete resource group")
  if (-not $proceed) {
    $confirm = Read-Host "`nType the resource group name to confirm deletion"
    $proceed = ($confirm -eq $ResourceGroup)
  }
  if (-not $proceed) { Write-Host "Aborted - nothing deleted."; return }

  Write-Host "`nDeleting resource group '$ResourceGroup' ..." -ForegroundColor Red
  az group delete --name $ResourceGroup --yes
  Write-Host "Deleted '$ResourceGroup'." -ForegroundColor Green
}

# Remove the v1 custom role definition (exact name match protects the v2 role).
# Requires that its assignments are gone - the v1 MI is deleted with the RG.
$roleId = az role definition list --custom-role-only true --query "[?roleName=='$V1RoleName'].name | [0]" -o tsv
if ($roleId) {
  Write-Host "Deleting v1 custom role '$V1RoleName' ($roleId) ..."
  try {
    az role definition delete --name $roleId
    Write-Host "Deleted custom role." -ForegroundColor Green
  } catch {
    Write-Host "Could not delete the role yet (assignments may still be propagating). Re-run later." -ForegroundColor Yellow
  }
} else {
  Write-Host "v1 custom role '$V1RoleName' not found; skipping."
}

Write-Host "`nDone. Fabric preserved for v2 reuse. v2 resources untouched." -ForegroundColor Cyan
