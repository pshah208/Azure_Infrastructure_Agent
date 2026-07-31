// Container Apps environment + web (SPA) and orchestrator (BFF/agent host) apps.
param namePrefix string
param environmentName string
param location string
param tags object
param logAnalyticsCustomerId string
@secure()
param logAnalyticsSharedKey string
param appInsightsConnectionString string
param acrLoginServer string
param acrName string
param orchestratorImage string
param webImage string
param aiMode string
param foundryProjectEndpoint string
param foundryAccountName string = ''
param foundryOpenAiEndpoint string = ''
param modelDeployment string = 'gpt-5.4-mini'
param fabricSqlEndpoint string = ''
param fabricDatabase string = ''
param fabricBorrowerTable string = 'dbo.borrowers'
param fabricDocumentsTable string = 'dbo.borrower_documents'

resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${namePrefix}-${environmentName}'
  location: location
  tags: tags
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: acrName
}

// AcrPull for the managed identity so Container Apps can pull images.
var acrPullRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, uami.id, acrPullRoleId)
  scope: acr
  properties: {
    principalId: uami.properties.principalId
    roleDefinitionId: acrPullRoleId
    principalType: 'ServicePrincipal'
  }
}

// Cognitive Services OpenAI User so the identity can call the model with Entra auth.
resource foundryAccount 'Microsoft.CognitiveServices/accounts@2025-04-01-preview' existing = if (!empty(foundryAccountName)) {
  name: foundryAccountName
}
var openAiUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
resource openAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(foundryAccountName)) {
  name: guid(foundryAccountName, uami.id, openAiUserRoleId)
  scope: foundryAccount
  properties: {
    principalId: uami.properties.principalId
    roleDefinitionId: openAiUserRoleId
    principalType: 'ServicePrincipal'
  }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${namePrefix}-${environmentName}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsSharedKey
      }
    }
  }
}

resource orchestrator 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${namePrefix}-orchestrator'
  location: location
  tags: union(tags, { 'azd-service-name': 'orchestrator' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${uami.id}': {} }
  }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 8000
        transport: 'auto'
      }
      registries: [
        {
          server: acrLoginServer
          identity: uami.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'orchestrator'
          image: orchestratorImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'AI_MODE', value: aiMode }
            { name: 'FOUNDRY_PROJECT_ENDPOINT', value: foundryProjectEndpoint }
            { name: 'FOUNDRY_OPENAI_ENDPOINT', value: foundryOpenAiEndpoint }
            { name: 'FOUNDRY_MODEL_DEPLOYMENT', value: modelDeployment }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
            // Required so DefaultAzureCredential selects this user-assigned
            // identity for managed-identity token acquisition (Fabric + model).
            { name: 'AZURE_CLIENT_ID', value: uami.properties.clientId }
            { name: 'FABRIC_SQL_ENDPOINT', value: fabricSqlEndpoint }
            { name: 'FABRIC_DATABASE', value: fabricDatabase }
            { name: 'FABRIC_BORROWER_TABLE', value: fabricBorrowerTable }
            { name: 'FABRIC_DOCUMENTS_TABLE', value: fabricDocumentsTable }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
  dependsOn: [ acrPull ]
}

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${namePrefix}-web'
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${uami.id}': {} }
  }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 80
        transport: 'auto'
      }
      registries: [
        {
          server: acrLoginServer
          identity: uami.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: webImage
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'ORCHESTRATOR_URL', value: 'https://${orchestrator.properties.configuration.ingress.fqdn}' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
  dependsOn: [ acrPull ]
}

output webUrl string = 'https://${web.properties.configuration.ingress.fqdn}'
output orchestratorUrl string = orchestrator.properties.configuration.ingress.fqdn
