@description('Spoke name identifier.')
param spokeName string

@description('Deployment environment.')
param environment string

@description('Azure region.')
param location string

@description('VNet address space (CIDR).')
param addressSpace string

@description('Subnets array: [{ name, prefix }]')
param subnets array

@description('Hub VNet resource ID for peering.')
param hubVnetId string

@description('Hub VNet name for peering.')
param hubVnetName string

@description('Hub VNet resource group name for peering.')
param hubResourceGroupName string

@description('Log Analytics Workspace resource ID for diagnostics.')
param logAnalyticsWorkspaceId string

@description('Resource tags.')
param tags object = {}

// ─── Spoke VNet ───────────────────────────────────────────────────────────────

resource spokeVnet 'Microsoft.Network/virtualNetworks@2025-07-01' = {
  name: 'vnet-spoke-${spokeName}-${environment}-${location}-001'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [addressSpace]
    }
    subnets: [for subnet in subnets: {
      name: subnet.name
      properties: {
        addressPrefix: subnet.prefix
      }
    }]
  }
}

// ─── NSGs per subnet ─────────────────────────────────────────────────────────

resource nsgs 'Microsoft.Network/networkSecurityGroups@2025-07-01' = [for subnet in subnets: {
  name: 'nsg-${subnet.name}-${environment}-001'
  location: location
  tags: tags
  properties: {
    securityRules: []
  }
}]

// ─── Peering: Spoke → Hub ────────────────────────────────────────────────────

resource spokeToHub 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@2025-07-01' = {
  parent: spokeVnet
  name: 'peer-${spokeName}-to-hub'
  properties: {
    remoteVirtualNetwork: {
      id: hubVnetId
    }
    allowVirtualNetworkAccess: true
    allowForwardedTraffic: true
    useRemoteGateways: false
  }
}

// ─── Diagnostic Settings ─────────────────────────────────────────────────────

resource vnetDiag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: spokeVnet
  name: 'diag-vnet-spoke-${spokeName}'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

// ─── Outputs ─────────────────────────────────────────────────────────────────

@description('Resource ID of the spoke VNet.')
output spokeVnetId string = spokeVnet.id

@description('Name of the spoke VNet.')
output spokeVnetName string = spokeVnet.name
