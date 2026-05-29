@description('Principal ID to grant access to.')
param principalId string

@description('Grant Contributor access for remediation actions (disabled by default for least privilege).')
param enableRemediationAccess bool = false

var readerRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'acdd72a7-3385-48ef-bd42-f606fba81ae7')
var monitoringReaderRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '43d0d8ad-25c7-4714-9337-8ba259a9fe05')
var contributorRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')

resource readerRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, principalId, readerRoleDefinitionId)
  properties: {
    roleDefinitionId: readerRoleDefinitionId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

resource monitoringReaderRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, principalId, monitoringReaderRoleDefinitionId)
  properties: {
    roleDefinitionId: monitoringReaderRoleDefinitionId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

resource contributorRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableRemediationAccess) {
  name: guid(resourceGroup().id, principalId, contributorRoleDefinitionId)
  properties: {
    roleDefinitionId: contributorRoleDefinitionId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}
