// Azure AI Foundry account + project (Foundry IQ layer).
// Uses the AIServices kind of Cognitive Services, which backs Azure AI Foundry.
param namePrefix string
param environmentName string
param location string
param tags object

@description('Model deployment name used by Foundry IQ reasoning.')
param modelDeploymentName string = 'gpt-5.4-mini'
@description('Model name.')
param modelName string = 'gpt-5.4-mini'
@description('Model version.')
param modelVersion string = '2026-03-17'
@description('Model capacity (thousands of tokens per minute).')
param modelCapacity int = 20

var accountName = toLower('ai-${namePrefix}-${environmentName}-${uniqueString(resourceGroup().id)}')

resource account 'Microsoft.CognitiveServices/accounts@2025-04-01-preview' = {
  name: substring(accountName, 0, min(length(accountName), 63))
  location: location
  tags: tags
  kind: 'AIServices'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    // Enables the Azure AI Foundry project experience on this account.
    allowProjectManagement: true
    customSubDomainName: substring(accountName, 0, min(length(accountName), 63))
    publicNetworkAccess: 'Enabled'
  }
}

resource project 'Microsoft.CognitiveServices/accounts/projects@2025-04-01-preview' = {
  parent: account
  name: '${namePrefix}-project'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    displayName: 'Mortgage IQ - Loan Concierge'
    description: 'Foundry project hosting the mortgage underwriting agents.'
  }
}

resource modelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2025-04-01-preview' = {
  parent: account
  name: modelDeploymentName
  sku: { name: 'GlobalStandard', capacity: modelCapacity }
  properties: {
    model: { format: 'OpenAI', name: modelName, version: modelVersion }
  }
}

output accountName string = account.name
output accountEndpoint string = account.properties.endpoint
output openaiEndpoint string = 'https://${account.name}.openai.azure.com/'
output modelDeploymentName string = modelDeployment.name
output projectName string = project.name
output projectEndpoint string = 'https://${account.name}.services.ai.azure.com/api/projects/${project.name}'
