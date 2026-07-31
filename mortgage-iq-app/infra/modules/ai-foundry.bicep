// Azure AI Foundry account + project (Foundry IQ layer).
// Uses the AIServices kind of Cognitive Services, which backs Azure AI Foundry.
param namePrefix string
param environmentName string
param location string
param tags object

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

output accountName string = account.name
output accountEndpoint string = account.properties.endpoint
output projectName string = project.name
output projectEndpoint string = 'https://${account.name}.services.ai.azure.com/api/projects/${project.name}'
