// Mortgage IQ v2 - single Next.js container app on Azure Container Apps, backed
// by Azure AI Foundry (agent + model), Azure AI Search (Foundry IQ knowledge),
// Key Vault (secrets) and a user-assigned managed identity. Fabric is external
// (its own capacity/workspace); the app reaches it via the SQL endpoint.
targetScope = 'resourceGroup'

@description('Base name for resources.')
param namePrefix string = 'mortgageiq2'
@description('Environment: dev | test | prod.')
param environmentName string = 'dev'
param location string = resourceGroup().location

@description('Container image for the Next.js web app (azd injects the built image).')
param webImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Model to deploy in the Foundry project.')
param modelName string = 'gpt-4o'
param modelVersion string = '2024-11-20'
param modelCapacity int = 20

@description('Enable the real Foundry Agent path (identity needs agents data-plane role).')
param foundryUseAgent bool = false
@description('Fabric SQL analytics endpoint (blank = local synthetic data).')
param fabricSqlEndpoint string = ''
param fabricDatabase string = ''

var tags = { application: 'mortgage-iq', env: environmentName, workload: 'four-iqs' }

resource law 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${namePrefix}-${environmentName}'
  location: location
  tags: tags
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${namePrefix}-${environmentName}'
  location: location
  tags: tags
  kind: 'web'
  properties: { Application_Type: 'web', WorkspaceResourceId: law.id }
}

resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${namePrefix}-${environmentName}'
  location: location
  tags: tags
}

var acrName = toLower(replace('cr${namePrefix}${environmentName}${uniqueString(resourceGroup().id)}', '-', ''))
resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: substring(acrName, 0, min(length(acrName), 50))
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: true }
}

var acrPullRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, uami.id, acrPullRoleId)
  scope: acr
  properties: { principalId: uami.properties.principalId, roleDefinitionId: acrPullRoleId, principalType: 'ServicePrincipal' }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: substring(toLower('kv${namePrefix}${uniqueString(resourceGroup().id)}'), 0, 24)
  location: location
  tags: tags
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
  }
}

// Key Vault Secrets User for the app identity.
var kvSecretsUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
resource kvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, uami.id, kvSecretsUserRoleId)
  scope: keyVault
  properties: { principalId: uami.properties.principalId, roleDefinitionId: kvSecretsUserRoleId, principalType: 'ServicePrincipal' }
}

resource search 'Microsoft.Search/searchServices@2023-11-01' = {
  name: 'srch-${namePrefix}-${environmentName}-${uniqueString(resourceGroup().id)}'
  location: location
  tags: tags
  sku: { name: 'basic' }
  properties: { replicaCount: 1, partitionCount: 1, authOptions: { aadOrApiKey: { aadAuthFailureMode: 'http401WithBearerChallenge' } } }
}

var accountName = toLower('ai-${namePrefix}-${environmentName}-${uniqueString(resourceGroup().id)}')
resource foundry 'Microsoft.CognitiveServices/accounts@2025-04-01-preview' = {
  name: substring(accountName, 0, min(length(accountName), 63))
  location: location
  tags: tags
  kind: 'AIServices'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    allowProjectManagement: true
    customSubDomainName: substring(accountName, 0, min(length(accountName), 63))
    publicNetworkAccess: 'Enabled'
  }
}

resource project 'Microsoft.CognitiveServices/accounts/projects@2025-04-01-preview' = {
  parent: foundry
  name: '${namePrefix}-project'
  location: location
  identity: { type: 'SystemAssigned' }
  properties: { displayName: 'Mortgage IQ - Loan Concierge' }
}

resource model 'Microsoft.CognitiveServices/accounts/deployments@2025-04-01-preview' = {
  parent: foundry
  name: modelName
  sku: { name: 'GlobalStandard', capacity: modelCapacity }
  properties: { model: { format: 'OpenAI', name: modelName, version: modelVersion } }
}

// OpenAI User for the app identity.
var openAiUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
resource openAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, uami.id, openAiUserRoleId)
  scope: foundry
  properties: { principalId: uami.properties.principalId, roleDefinitionId: openAiUserRoleId, principalType: 'ServicePrincipal' }
}

// Custom role granting the Foundry agents data-plane actions (no built-in role
// grants these). Assigned to the app identity so it can create/list/run the
// loan-concierge agent and its Fabric IQ / Work IQ function tools.
resource agentsDataRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(resourceGroup().id, 'foundry-agents-data-user')
  properties: {
    roleName: 'Foundry Agents Data User (${namePrefix}-${environmentName})'
    description: 'Data-plane access to Foundry agents, threads and runs.'
    assignableScopes: [ resourceGroup().id ]
    permissions: [
      {
        actions: [ 'Microsoft.CognitiveServices/accounts/read' ]
        dataActions: [ 'Microsoft.CognitiveServices/accounts/AIServices/*' ]
      }
    ]
  }
}

resource agentsDataAssign 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, uami.id, agentsDataRole.id)
  scope: foundry
  properties: { principalId: uami.properties.principalId, roleDefinitionId: agentsDataRole.id, principalType: 'ServicePrincipal' }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${namePrefix}-${environmentName}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: { customerId: law.properties.customerId, sharedKey: law.listKeys().primarySharedKey }
    }
  }
}

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${namePrefix}-web'
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${uami.id}': {} } }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: true, targetPort: 3000, transport: 'auto' }
      registries: [ { server: acr.properties.loginServer, identity: uami.id } ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: webImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'AZURE_CLIENT_ID', value: uami.properties.clientId }
            { name: 'AZURE_KEY_VAULT_URI', value: keyVault.properties.vaultUri }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
            { name: 'FOUNDRY_PROJECT_ENDPOINT', value: 'https://${foundry.name}.services.ai.azure.com/api/projects/${project.name}' }
            { name: 'FOUNDRY_MODEL_DEPLOYMENT', value: model.name }
            { name: 'FOUNDRY_USE_AGENT', value: string(foundryUseAgent) }
            { name: 'FOUNDRY_AGENT_CONCIERGE', value: 'loan-concierge' }
            { name: 'AI_SEARCH_ENDPOINT', value: 'https://${search.name}.search.windows.net' }
            { name: 'AI_SEARCH_INDEX', value: 'mortgage-knowledge' }
            { name: 'FABRIC_SQL_ENDPOINT', value: fabricSqlEndpoint }
            { name: 'FABRIC_DATABASE', value: fabricDatabase }
            { name: 'AZURE_REGION', value: location }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
  dependsOn: [ acrPull ]
}

output webUrl string = 'https://${web.properties.configuration.ingress.fqdn}'
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = acr.properties.loginServer
output FOUNDRY_PROJECT_ENDPOINT string = 'https://${foundry.name}.services.ai.azure.com/api/projects/${project.name}'
output FOUNDRY_MODEL_DEPLOYMENT string = model.name
output AI_SEARCH_ENDPOINT string = 'https://${search.name}.search.windows.net'
output searchEndpoint string = 'https://${search.name}.search.windows.net'
output identityClientId string = uami.properties.clientId
