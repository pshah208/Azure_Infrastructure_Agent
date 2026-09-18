@description('Log Analytics Workspace name.')
param workspaceName string

@description('Azure region.')
param location string

@description('Data retention in days.')
param retentionDays int = 90

@description('Resource tags.')
param tags object = {}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2025-07-01' = {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionDays
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

@description('Resource ID of the Log Analytics Workspace.')
output workspaceId string = logAnalytics.id

@description('Workspace name.')
output workspaceName string = logAnalytics.name
