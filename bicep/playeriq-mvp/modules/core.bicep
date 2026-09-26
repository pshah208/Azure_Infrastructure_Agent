targetScope = 'resourceGroup'

@description('Deployment environment.')
param environment string

@description('Azure region.')
param location string

@description('Workload name.')
param workload string

@description('Owner tag.')
param owner string

@description('Cost center tag.')
param costCenter string

@description('Deploy Azure AI Search. Disable when regional capacity is unavailable.')
param deploySearch bool

@description('Container image for the API app.')
param apiImage string

@description('Container image for the worker app.')
param workerImage string

@description('Container image for the frontend app.')
param frontendImage string

@description('Existing Microsoft Foundry project name associated with the AI Services account.')
param foundryProjectName string

@description('Microsoft Foundry project endpoint used by the API to invoke registered agents.')
param foundryProjectEndpoint string

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
var uniqueSuffix = uniqueString(resourceGroup().id)
var shortSuffix = take(uniqueSuffix, 8)
var commonTags = {
  Workload: workload
  Environment: environment
  Owner: owner
  CostCenter: costCenter
  ManagedBy: 'Bicep'
  Purpose: 'PlayerIQ MVP'
}

var storageAccountName = take('stpiq${environment}${regionCode}${uniqueSuffix}', 24)
var keyVaultName = take('kv-piq-${environment}-${regionCode}-${shortSuffix}', 24)
var logAnalyticsName = 'log-${workload}-${environment}-${regionCode}-001'
var appInsightsName = 'appi-${workload}-${environment}-${regionCode}-001'
var virtualNetworkName = 'vnet-${workload}-${environment}-${regionCode}-001'
var containerAppsSubnetName = 'snet-containerapps-${workload}-${environment}-${regionCode}-001'
var privateEndpointsSubnetName = 'snet-private-endpoints-${workload}-${environment}-${regionCode}-001'
var containerAppsEnvironmentName = 'cae-${workload}-${environment}-${regionCode}-002'
var apiContainerAppName = 'ca-api-${workload}-${environment}-${regionCode}-002'
var workerContainerAppName = 'ca-worker-${workload}-${environment}-${regionCode}-002'
var frontendContainerAppName = 'ca-web-${workload}-${environment}-${regionCode}-001'
var apiIdentityName = 'id-api-${workload}-${environment}-${regionCode}-001'
var workerIdentityName = 'id-worker-${workload}-${environment}-${regionCode}-001'
var frontendIdentityName = 'id-web-${workload}-${environment}-${regionCode}-001'
var storageBlobPrivateEndpointName = 'pe-${storageAccountName}-blob'
var storageBlobPrivateDnsZoneName = 'privatelink.blob.core.windows.net'
var cosmosPrivateEndpointName = 'pe-${cosmosAccountName}-sql'
var cosmosPrivateDnsZoneName = 'privatelink.documents.azure.com'
var containerAppsSubnetId = resourceId('Microsoft.Network/virtualNetworks/subnets', virtualNetworkName, containerAppsSubnetName)
var privateEndpointsSubnetId = resourceId('Microsoft.Network/virtualNetworks/subnets', virtualNetworkName, privateEndpointsSubnetName)
var serviceBusNamespaceName = 'sb-${workload}-${environment}-${regionCode}-${shortSuffix}'
var cosmosAccountName = 'cosmos-${workload}-${environment}-${regionCode}-${shortSuffix}'
var cosmosDatabaseName = 'cosmosdb-${workload}-${environment}-${regionCode}-001'
var searchServiceName = 'srch-${workload}-${environment}-${regionCode}-${shortSuffix}'
var aiServicesAccountName = 'ai-${workload}-${environment}-${regionCode}-${shortSuffix}'
var foundryCoachModelDeploymentName = 'gpt-4-1-mini-playeriq-coach'
var machineLearningWorkspaceName = 'mlw-${workload}-${environment}-${regionCode}-001'
var containerRegistryName = take('acrpiq${environment}${regionCode}${uniqueSuffix}', 50)
var acrPullRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
var storageBlobDataContributorRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
var storageBlobDataOwnerRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b')
var storageBlobDelegatorRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'db58b8e5-c6ad-4a2a-8342-4190687cbf4a')
var serviceBusDataSenderRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '69a216fc-b8fb-44d8-bc22-1f3c2cd27a39')
var serviceBusDataReceiverRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0')
var cognitiveServicesOpenAIUserRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
var foundryUserRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '53ca6127-db72-4b80-b1b0-d745d6d5456d')
var cosmosDataContributorRoleDefinitionId = '${cosmos.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: commonTags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  tags: commonTags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2026-09-01-preview' = {
  name: containerRegistryName
  location: location
  tags: commonTags
  sku: {
    name: 'Standard'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

resource apiIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: apiIdentityName
  location: location
  tags: commonTags
}

resource workerIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: workerIdentityName
  location: location
  tags: commonTags
}

resource frontendIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: frontendIdentityName
  location: location
  tags: commonTags
}

resource virtualNetwork 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: virtualNetworkName
  location: location
  tags: commonTags
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.42.0.0/16'
      ]
    }
    subnets: [
      {
        name: containerAppsSubnetName
        properties: {
          addressPrefix: '10.42.0.0/23'
          delegations: [
            {
              name: 'container-apps-environment'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: privateEndpointsSubnetName
        properties: {
          addressPrefix: '10.42.2.0/24'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: commonTags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Disabled'
  }
}

resource storageBlobPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: storageBlobPrivateDnsZoneName
  location: 'global'
  tags: commonTags
}

resource storageBlobPrivateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: storageBlobPrivateDnsZone
  name: 'link-${virtualNetwork.name}'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetwork.id
    }
  }
}

resource storageBlobPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: storageBlobPrivateEndpointName
  location: location
  tags: commonTags
  properties: {
    subnet: {
      id: privateEndpointsSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${storage.name}-blob'
        properties: {
          privateLinkServiceId: storage.id
          groupIds: [
            'blob'
          ]
        }
      }
    ]
  }
  dependsOn: [
    virtualNetwork
  ]
}

resource storageBlobPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  parent: storageBlobPrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'blob'
        properties: {
          privateDnsZoneId: storageBlobPrivateDnsZone.id
        }
      }
    ]
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

resource rawVideos 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'raw-videos'
  properties: {
    publicAccess: 'None'
  }
}

resource processedClips 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'processed-clips'
  properties: {
    publicAccess: 'None'
  }
}

resource thumbnails 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'thumbnails'
  properties: {
    publicAccess: 'None'
  }
}

resource modelArtifacts 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'model-artifacts'
  properties: {
    publicAccess: 'None'
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: commonTags
  properties: {
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enablePurgeProtection: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Disabled'
    sku: {
      family: 'A'
      name: 'standard'
    }
  }
}

resource serviceBus 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: serviceBusNamespaceName
  location: location
  tags: commonTags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: true
  }
}

resource processingQueue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: serviceBus
  name: 'video-processing'
  properties: {
    lockDuration: 'PT5M'
    maxDeliveryCount: 5
    deadLetteringOnMessageExpiration: true
  }
}

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosAccountName
  location: location
  tags: commonTags
  kind: 'GlobalDocumentDB'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    minimalTlsVersion: 'Tls12'
    publicNetworkAccess: 'Disabled'
    disableLocalAuth: true
    enableFreeTier: false
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
  }
}

resource cosmosPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: cosmosPrivateDnsZoneName
  location: 'global'
  tags: commonTags
}

resource cosmosPrivateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: cosmosPrivateDnsZone
  name: 'link-${virtualNetwork.name}'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetwork.id
    }
  }
}

resource cosmosPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: cosmosPrivateEndpointName
  location: location
  tags: commonTags
  properties: {
    subnet: {
      id: privateEndpointsSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${cosmos.name}-sql'
        properties: {
          privateLinkServiceId: cosmos.id
          groupIds: [
            'Sql'
          ]
        }
      }
    ]
  }
  dependsOn: [
    virtualNetwork
  ]
}

resource cosmosPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  parent: cosmosPrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'cosmosSql'
        properties: {
          privateDnsZoneId: cosmosPrivateDnsZone.id
        }
      }
    ]
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: cosmosDatabaseName
  properties: {
    resource: {
      id: cosmosDatabaseName
    }
  }
}

resource cosmosPlayers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: 'players'
  properties: {
    resource: {
      id: 'players'
      partitionKey: {
        paths: [
          '/organizationId'
        ]
        kind: 'Hash'
      }
    }
  }
}

resource cosmosMatches 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: 'matches'
  properties: {
    resource: {
      id: 'matches'
      partitionKey: {
        paths: [
          '/organizationId'
        ]
        kind: 'Hash'
      }
    }
  }
}

resource cosmosObservations 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: 'observations'
  properties: {
    resource: {
      id: 'observations'
      partitionKey: {
        paths: [
          '/matchId'
        ]
        kind: 'Hash'
      }
    }
  }
}

resource search 'Microsoft.Search/searchServices@2023-11-01' = if (deploySearch) {
  name: searchServiceName
  location: location
  tags: commonTags
  sku: {
    name: 'basic'
  }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
    publicNetworkAccess: 'enabled'
    disableLocalAuth: true
  }
}

resource aiServices 'Microsoft.CognitiveServices/accounts@2023-05-01' = {
  name: aiServicesAccountName
  location: location
  tags: commonTags
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: aiServicesAccountName
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

resource foundryCoachModel 'Microsoft.CognitiveServices/accounts/deployments@2023-05-01' = {
  parent: aiServices
  name: foundryCoachModelDeploymentName
  sku: {
    name: 'Standard'
    capacity: 10
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4.1-mini'
      version: '2025-04-14'
    }
    raiPolicyName: 'Microsoft.Default'
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
  }
}

resource foundryProject 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' existing = {
  parent: aiServices
  name: foundryProjectName
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: containerAppsEnvironmentName
  location: location
  tags: commonTags
  properties: {
    vnetConfiguration: {
      infrastructureSubnetId: containerAppsSubnetId
      internal: false
    }
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
  dependsOn: [
    virtualNetwork
  ]
}

resource apiContainerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: apiContainerAppName
  location: location
  tags: commonTags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${apiIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: apiIdentity.id
        }
      ]
      ingress: {
        external: true
        targetPort: 80
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          resources: {
            cpu: json('0.5')
            memory: '1.0Gi'
          }
          env: [
            {
              name: 'AZURE_CLIENT_ID'
              value: apiIdentity.properties.clientId
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsights.properties.ConnectionString
            }
            {
              name: 'FOUNDRY_ENDPOINT'
              value: aiServices.properties.endpoint
            }
            {
              name: 'FOUNDRY_PROJECT_ENDPOINT'
              value: foundryProjectEndpoint
            }
            {
              name: 'FOUNDRY_MODEL_DEPLOYMENT_NAME'
              value: foundryCoachModel.name
            }
            {
              name: 'FOUNDRY_API_VERSION'
              value: '2024-10-21'
            }
            {
              name: 'STORAGE_ACCOUNT_NAME'
              value: storage.name
            }
            {
              name: 'RAW_VIDEOS_CONTAINER_NAME'
              value: rawVideos.name
            }
            {
              name: 'COSMOS_ENDPOINT'
              value: cosmos.properties.documentEndpoint
            }
            {
              name: 'COSMOS_DATABASE_NAME'
              value: cosmosDatabase.name
            }
            {
              name: 'MATCHES_CONTAINER_NAME'
              value: cosmosMatches.name
            }
            {
              name: 'SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE'
              value: '${serviceBus.name}.servicebus.windows.net'
            }
            {
              name: 'VIDEO_PROCESSING_QUEUE_NAME'
              value: processingQueue.name
            }
            {
              name: 'MAX_UPLOAD_BYTES'
              value: '524288000'
            }
            {
              name: 'SYNTHETIC_DATA_PATH'
              value: './data/playeriq/synthetic'
            }
            {
              name: 'ALLOW_ORIGIN'
              value: 'https://${frontendContainerApp.properties.configuration.ingress.fqdn}'
            }
            {
              name: 'AUTH_ENABLED'
              value: 'true'
            }
            {
              name: 'AUTH_TENANT_ID'
              value: authTenantId
            }
            {
              name: 'AUTH_API_CLIENT_ID'
              value: authApiClientId
            }
            {
              name: 'AUTH_SPA_CLIENT_ID'
              value: authSpaClientId
            }
            {
              name: 'AUTH_MEMBERSHIPS_JSON'
              value: authMembershipsJson
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
  dependsOn: [
    apiAcrPull
  ]
}

resource workerContainerApp 'Microsoft.App/containerApps@2024-10-02-preview' = {
  name: workerContainerAppName
  location: location
  tags: commonTags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${workerIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: workerIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: workerImage
          resources: {
            cpu: json('1.0')
            memory: '2.0Gi'
          }
          env: [
            {
              name: 'AZURE_CLIENT_ID'
              value: workerIdentity.properties.clientId
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsights.properties.ConnectionString
            }
            {
              name: 'STORAGE_ACCOUNT_NAME'
              value: storage.name
            }
            {
              name: 'RAW_VIDEOS_CONTAINER_NAME'
              value: rawVideos.name
            }
            {
              name: 'THUMBNAILS_CONTAINER_NAME'
              value: thumbnails.name
            }
            {
              name: 'COSMOS_ENDPOINT'
              value: cosmos.properties.documentEndpoint
            }
            {
              name: 'COSMOS_DATABASE_NAME'
              value: cosmosDatabase.name
            }
            {
              name: 'MATCHES_CONTAINER_NAME'
              value: cosmosMatches.name
            }
            {
              name: 'OBSERVATIONS_CONTAINER_NAME'
              value: cosmosObservations.name
            }
            {
              name: 'SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE'
              value: '${serviceBus.name}.servicebus.windows.net'
            }
            {
              name: 'VIDEO_PROCESSING_QUEUE_NAME'
              value: processingQueue.name
            }
            {
              name: 'FOUNDRY_PROJECT_ENDPOINT'
              value: foundryProjectEndpoint
            }
            {
              name: 'FOUNDRY_MODEL_DEPLOYMENT_NAME'
              value: foundryCoachModel.name
            }
            {
              name: 'VIDEO_EVIDENCE_AGENT_NAME'
              value: 'playeriq-video-evidence'
            }
            {
              name: 'PLAYER_ANALYSIS_AGENT_NAME'
              value: 'playeriq-player-analysis'
            }
            {
              name: 'TRAINING_PLAN_AGENT_NAME'
              value: 'playeriq-training-plan'
            }
            {
              name: 'COACH_REVIEW_AGENT_NAME'
              value: 'playeriq-coach-review'
            }
            {
              name: 'MAX_SAMPLE_FRAMES'
              value: '8'
            }
            {
              name: 'MAX_VIDEO_DURATION_SECONDS'
              value: '7200'
            }
            {
              name: 'TEMP_ROOT'
              value: '/tmp/playeriq'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
        rules: [
          {
            name: 'service-bus-video-processing'
            custom: {
              type: 'azure-servicebus'
              metadata: {
                queueName: processingQueue.name
                namespace: serviceBus.name
                messageCount: '1'
              }
              identity: workerIdentity.id
            }
          }
        ]
      }
    }
  }
  dependsOn: [
    workerAcrPull
  ]
}

resource frontendContainerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: frontendContainerAppName
  location: location
  tags: commonTags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${frontendIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: frontendIdentity.id
        }
      ]
      ingress: {
        external: true
        targetPort: 80
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: frontendImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
  dependsOn: [
    frontendAcrPull
  ]
}

resource apiStorageBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, apiIdentityName, 'storage-blob-data-contributor')
  scope: storage
  properties: {
    roleDefinitionId: storageBlobDataContributorRoleDefinitionId
    principalId: apiIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource apiStorageBlobDelegator 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, apiIdentityName, 'storage-blob-delegator')
  scope: storage
  properties: {
    roleDefinitionId: storageBlobDelegatorRoleDefinitionId
    principalId: apiIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource apiStorageBlobOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, apiIdentityName, 'storage-blob-data-owner')
  scope: storage
  properties: {
    roleDefinitionId: storageBlobDataOwnerRoleDefinitionId
    principalId: apiIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource apiServiceBusSender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(serviceBus.id, apiIdentityName, 'service-bus-data-sender')
  scope: serviceBus
  properties: {
    roleDefinitionId: serviceBusDataSenderRoleDefinitionId
    principalId: apiIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource apiFoundryOpenAIUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aiServices.id, apiIdentityName, 'cognitive-services-openai-user')
  scope: aiServices
  properties: {
    roleDefinitionId: cognitiveServicesOpenAIUserRoleDefinitionId
    principalId: apiIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource apiFoundryProjectUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryProject.id, apiIdentityName, 'foundry-user')
  scope: foundryProject
  properties: {
    roleDefinitionId: foundryUserRoleDefinitionId
    principalId: apiIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource apiAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, apiIdentityName, 'acr-pull')
  scope: containerRegistry
  properties: {
    roleDefinitionId: acrPullRoleDefinitionId
    principalId: apiIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource workerAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, workerIdentityName, 'acr-pull')
  scope: containerRegistry
  properties: {
    roleDefinitionId: acrPullRoleDefinitionId
    principalId: workerIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource workerStorageBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, workerIdentityName, 'storage-blob-data-contributor')
  scope: storage
  properties: {
    roleDefinitionId: storageBlobDataContributorRoleDefinitionId
    principalId: workerIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource workerServiceBusReceiver 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(serviceBus.id, workerIdentityName, 'service-bus-data-receiver-v2')
  scope: serviceBus
  properties: {
    roleDefinitionId: serviceBusDataReceiverRoleDefinitionId
    principalId: workerIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource workerFoundryProjectUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryProject.id, workerIdentityName, 'foundry-user')
  scope: foundryProject
  properties: {
    roleDefinitionId: foundryUserRoleDefinitionId
    principalId: workerIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource frontendAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, frontendIdentityName, 'acr-pull')
  scope: containerRegistry
  properties: {
    roleDefinitionId: acrPullRoleDefinitionId
    principalId: frontendIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource apiCosmosDataContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmos
  name: guid(cosmos.id, apiIdentityName, 'cosmos-data-contributor')
  properties: {
    roleDefinitionId: cosmosDataContributorRoleDefinitionId
    principalId: apiIdentity.properties.principalId
    scope: cosmos.id
  }
}

resource workerCosmosDataContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmos
  name: guid(cosmos.id, workerIdentityName, 'cosmos-data-contributor')
  properties: {
    roleDefinitionId: cosmosDataContributorRoleDefinitionId
    principalId: workerIdentity.properties.principalId
    scope: cosmos.id
  }
}

resource machineLearningWorkspace 'Microsoft.MachineLearningServices/workspaces@2024-04-01' = {
  name: machineLearningWorkspaceName
  location: location
  tags: commonTags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    friendlyName: 'PlayerIQ MVP ML Workspace'
    description: 'Workspace for PlayerIQ MVP computer-vision experiments and future GPU inference.'
    storageAccount: storage.id
    keyVault: keyVault.id
    applicationInsights: appInsights.id
    publicNetworkAccess: 'Enabled'
  }
}

output storageAccountName string = storage.name
output virtualNetworkName string = virtualNetwork.name
output keyVaultName string = keyVault.name
output logAnalyticsWorkspaceName string = logAnalytics.name
output applicationInsightsName string = appInsights.name
output containerAppEnvironmentName string = containerAppsEnvironment.name
output apiContainerAppName string = apiContainerApp.name
output apiContainerAppFqdn string = apiContainerApp.properties.configuration.ingress.fqdn
output frontendContainerAppName string = frontendContainerApp.name
output frontendContainerAppFqdn string = frontendContainerApp.properties.configuration.ingress.fqdn
output workerContainerAppName string = workerContainerApp.name
output serviceBusNamespaceName string = serviceBus.name
output videoProcessingQueueName string = processingQueue.name
output searchServiceName string = deploySearch ? search.name : ''
output aiServicesAccountName string = aiServices.name
output foundryCoachModelDeploymentName string = foundryCoachModel.name
output machineLearningWorkspaceName string = machineLearningWorkspace.name
output cosmosAccountName string = cosmos.name
output cosmosDatabaseName string = cosmosDatabase.name
output containerRegistryName string = containerRegistry.name
output containerRegistryLoginServer string = containerRegistry.properties.loginServer
