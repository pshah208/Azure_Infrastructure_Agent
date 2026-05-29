@description('Deployment environment.')
param environment string

@description('Azure region.')
param location string

@description('Azure SRE Agent name.')
param agentName string = 'sre-${environment}-${location}-001'

@description('Resource tags.')
param tags object = {}

@description('Resource IDs of monitored resource groups.')
param monitoredResourceGroupIds array

@description('Log Analytics Workspace resource ID for diagnostics.')
param logAnalyticsWorkspaceId string

@description('Grant Contributor access for remediation actions (disabled by default for least privilege).')
param enableRemediationAccess bool = false

// NOTE: Azure SRE Agent is currently preview; API shape may change.
// Reference: https://github.com/MicrosoftDocs/azure-docs/blob/main/articles/sre-agent/deploy-iac.md
#disable-next-line BCP081
resource sreAgent 'Microsoft.App/agents@2025-05-01-preview' = {
  name: agentName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    knowledgeGraphConfiguration: {
      managedResources: monitoredResourceGroupIds
    }
    actionConfiguration: {
      accessLevel: enableRemediationAccess ? 'High' : 'Low'
      mode: enableRemediationAccess ? 'Automatic' : 'Review'
    }
    upgradeChannel: 'Preview'
  }
}

resource sreAgentDiag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: sreAgent
  name: 'diag-${agentName}'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

module monitoredResourceGroupRbac 'sre-agent-rbac.bicep' = [for (monitoredResourceGroupId, i) in monitoredResourceGroupIds: {
  name: 'sre-agent-rbac-${i}'
  scope: resourceGroup(split(monitoredResourceGroupId, '/')[2], split(monitoredResourceGroupId, '/')[4])
  params: {
    principalId: sreAgent.identity.principalId
    enableRemediationAccess: enableRemediationAccess
  }
}]

@description('Resource ID of the Azure SRE Agent.')
output agentResourceId string = sreAgent.id

@description('Name of the Azure SRE Agent.')
output agentName string = sreAgent.name

@description('Principal ID of the Azure SRE Agent managed identity.')
output agentPrincipalId string = sreAgent.identity.principalId
