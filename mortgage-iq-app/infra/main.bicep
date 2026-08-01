// Mortgage IQ - main deployment.
// Deploys: Log Analytics + App Insights, Container Registry, user-assigned
// managed identity, Container Apps environment, the web + orchestrator apps,
// and an Azure AI Foundry account/project for the Foundry IQ layer.
targetScope = 'resourceGroup'

@description('Base name for all resources. Used with CAF-style suffixes.')
param namePrefix string = 'mortgageiq'

@description('Environment tag: dev | test | prod.')
param environmentName string = 'dev'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Container image for the orchestrator (BFF + Foundry agent host).')
param orchestratorImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Container image for the React web frontend.')
param webImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('AI mode passed to the orchestrator: mock | foundry.')
@allowed([ 'mock', 'foundry' ])
param aiMode string = 'mock'

@description('Fabric SQL analytics endpoint for the live Fabric IQ path (blank = mock data).')
param fabricSqlEndpoint string = ''

@description('Fabric Lakehouse/Warehouse database name for the live Fabric IQ path.')
param fabricDatabase string = ''

@description('Fabric table the borrower query reads.')
param fabricBorrowerTable string = 'dbo.borrowers'

@description('Fabric table the Work IQ document-intake query reads.')
param fabricDocumentsTable string = 'dbo.borrower_documents'

@description('Azure AI Search endpoint for the Foundry IQ knowledge base (blank = no knowledge grounding).')
param aiSearchEndpoint string = ''

@description('Azure AI Search admin/query key (secure).')
@secure()
param aiSearchKey string = ''

@description('Azure AI Search index name for underwriting guidelines.')
param aiSearchIndex string = 'mortgage-knowledge'

@description('Foundry agent name (ensured/created at runtime).')
param agentName string = 'mortgage-underwriter'

@description('Deploy a Microsoft Fabric capacity for the Fabric IQ layer.')
param deployFabric bool = true

@description('Fabric capacity SKU (F2 is the entry tier, sufficient for the demo).')
@allowed([ 'F2', 'F4', 'F8', 'F16', 'F32', 'F64' ])
param fabricSkuName string = 'F2'

@description('Entra object IDs (users/groups) to make Fabric capacity admins. Required when deployFabric = true.')
param fabricAdminMembers array = []

var tags = {
  application: 'mortgage-iq'
  env: environmentName
  workload: 'four-iqs-demo'
}

module observability 'modules/observability.bicep' = {
  name: 'observability'
  params: {
    namePrefix: namePrefix
    environmentName: environmentName
    location: location
    tags: tags
  }
}

module registry 'modules/registry.bicep' = {
  name: 'registry'
  params: {
    namePrefix: namePrefix
    environmentName: environmentName
    location: location
    tags: tags
  }
}

module foundry 'modules/ai-foundry.bicep' = {
  name: 'foundry'
  params: {
    namePrefix: namePrefix
    environmentName: environmentName
    location: location
    tags: tags
  }
}

module fabric 'modules/fabric.bicep' = if (deployFabric) {
  name: 'fabric'
  params: {
    namePrefix: namePrefix
    environmentName: environmentName
    location: location
    tags: tags
    fabricSkuName: fabricSkuName
    capacityAdminMembers: fabricAdminMembers
  }
}

module apps 'modules/container-apps.bicep' = {
  name: 'containerApps'
  params: {
    namePrefix: namePrefix
    environmentName: environmentName
    location: location
    tags: tags
    logAnalyticsCustomerId: observability.outputs.logAnalyticsCustomerId
    logAnalyticsSharedKey: observability.outputs.logAnalyticsSharedKey
    appInsightsConnectionString: observability.outputs.appInsightsConnectionString
    acrLoginServer: registry.outputs.loginServer
    acrName: registry.outputs.name
    orchestratorImage: orchestratorImage
    webImage: webImage
    aiMode: aiMode
    foundryProjectEndpoint: foundry.outputs.projectEndpoint
    foundryAccountName: foundry.outputs.accountName
    foundryOpenAiEndpoint: foundry.outputs.openaiEndpoint
    modelDeployment: foundry.outputs.modelDeploymentName
    fabricSqlEndpoint: fabricSqlEndpoint
    fabricDatabase: fabricDatabase
    fabricBorrowerTable: fabricBorrowerTable
    fabricDocumentsTable: fabricDocumentsTable
    aiSearchEndpoint: aiSearchEndpoint
    aiSearchKey: aiSearchKey
    aiSearchIndex: aiSearchIndex
    agentName: agentName
  }
}

output webUrl string = apps.outputs.webUrl
output orchestratorUrl string = apps.outputs.orchestratorUrl
output foundryAccountName string = foundry.outputs.accountName
output acrLoginServer string = registry.outputs.loginServer
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = registry.outputs.loginServer
output fabricCapacityName string = deployFabric ? fabric!.outputs.capacityName : 'not-deployed'
output fabricSku string = deployFabric ? fabric!.outputs.sku : 'none'
