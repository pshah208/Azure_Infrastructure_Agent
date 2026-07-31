// Azure Container Registry for the web + orchestrator images.
param namePrefix string
param environmentName string
param location string
param tags object

var acrName = toLower(replace('cr${namePrefix}${environmentName}${uniqueString(resourceGroup().id)}', '-', ''))

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: substring(acrName, 0, min(length(acrName), 50))
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: true
  }
}

output name string = acr.name
output loginServer string = acr.properties.loginServer
