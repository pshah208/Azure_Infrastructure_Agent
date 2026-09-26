targetScope = 'subscription'

@description('Deployment environment.')
@allowed([
  'dev'
  'test'
  'prod'
])
param environment string = 'dev'

@description('Azure region. Use canadacentral first; use eastus2 as fallback.')
@allowed([
  'canadacentral'
  'eastus2'
])
param location string = 'canadacentral'

@description('Workload name.')
param workload string = 'playeriq'

@description('Owner tag.')
param owner string = 'shahpar'

@description('Cost center tag.')
param costCenter string = 'mvp'

@description('Deploy Azure AI Search. Disable when regional capacity is unavailable.')
param deploySearch bool = true

@description('Container image for the API app.')
param apiImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Container image for the worker app.')
param workerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Container image for the frontend app.')
param frontendImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Existing Microsoft Foundry project name associated with the AI Services account.')
param foundryProjectName string = 'ai-playeriq-dev-eus2-vus-project'

@description('Microsoft Foundry project endpoint used by the API to invoke registered agents.')
param foundryProjectEndpoint string = 'https://ai-playeriq-dev-eus2-vushfn4j.services.ai.azure.com/api/projects/ai-playeriq-dev-eus2-vus-project'

@description('Microsoft Entra tenant ID used for API access-token validation.')
param authTenantId string

@description('Client (application) ID of the PlayerIQ API app registration; the access-token audience.')
param authApiClientId string

@description('Client (application) ID of the PlayerIQ Frontend SPA app registration.')
param authSpaClientId string

@description('JSON array of {objectId, organizationId, playerIds} membership grants enforced server-side.')
@secure()
param authMembershipsJson string

var regionCode = location == 'canadacentral' ? 'cc' : 'eus2'
var resourceGroupName = 'rg-${workload}-${environment}-${regionCode}-001'
var commonTags = {
  Workload: workload
  Environment: environment
  Owner: owner
  CostCenter: costCenter
  ManagedBy: 'Bicep'
  Purpose: 'PlayerIQ MVP'
}

resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: resourceGroupName
  location: location
  tags: commonTags
}

module core 'modules/core.bicep' = {
  name: 'playeriq-core-${environment}-${regionCode}'
  scope: rg
  params: {
    environment: environment
    location: location
    workload: workload
    owner: owner
    costCenter: costCenter
    deploySearch: deploySearch
    apiImage: apiImage
    workerImage: workerImage
    frontendImage: frontendImage
    foundryProjectName: foundryProjectName
    foundryProjectEndpoint: foundryProjectEndpoint
    authTenantId: authTenantId
    authApiClientId: authApiClientId
    authSpaClientId: authSpaClientId
    authMembershipsJson: authMembershipsJson
  }
}

output resourceGroupName string = resourceGroupName
output resourceGroupId string = rg.id
output location string = location
output storageAccountName string = core.outputs.storageAccountName
output virtualNetworkName string = core.outputs.virtualNetworkName
output containerAppEnvironmentName string = core.outputs.containerAppEnvironmentName
output apiContainerAppFqdn string = core.outputs.apiContainerAppFqdn
output frontendContainerAppFqdn string = core.outputs.frontendContainerAppFqdn
output searchServiceName string = core.outputs.searchServiceName
output serviceBusNamespaceName string = core.outputs.serviceBusNamespaceName
output aiServicesAccountName string = core.outputs.aiServicesAccountName
output foundryCoachModelDeploymentName string = core.outputs.foundryCoachModelDeploymentName
output machineLearningWorkspaceName string = core.outputs.machineLearningWorkspaceName
output cosmosAccountName string = core.outputs.cosmosAccountName
output containerRegistryName string = core.outputs.containerRegistryName
output containerRegistryLoginServer string = core.outputs.containerRegistryLoginServer
