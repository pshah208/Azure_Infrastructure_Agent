@description('Deployment environment.')
param environment string

@description('Azure region.')
param location string

@description('Hub VNet address space (CIDR).')
param hubVnetAddressSpace string

@description('AzureFirewallSubnet prefix (/26 or larger).')
param firewallSubnetPrefix string

@description('AzureBastionSubnet prefix (/26 or larger).')
param bastionSubnetPrefix string

@description('Management subnet prefix.')
param managementSubnetPrefix string

@description('Log Analytics Workspace resource ID for diagnostics.')
param logAnalyticsWorkspaceId string

@description('Resource tags.')
param tags object = {}

// ─── Hub Virtual Network ──────────────────────────────────────────────────────

resource hubVnet 'Microsoft.Network/virtualNetworks@2025-07-01' = {
  name: 'vnet-hub-${environment}-${location}-001'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [hubVnetAddressSpace]
    }
    subnets: [
      {
        name: 'AzureFirewallSubnet'
        properties: {
          addressPrefix: firewallSubnetPrefix
        }
      }
      {
        name: 'AzureBastionSubnet'
        properties: {
          addressPrefix: bastionSubnetPrefix
        }
      }
      {
        name: 'snet-management-${environment}-001'
        properties: {
          addressPrefix: managementSubnetPrefix
        }
      }
    ]
  }
}

// ─── Azure Firewall ───────────────────────────────────────────────────────────

resource firewallPip 'Microsoft.Network/publicIPAddresses@2025-07-01' = {
  name: 'pip-fw-hub-${environment}-${location}-001'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Regional'
  }
  zones: ['1', '2', '3']
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

resource firewall 'Microsoft.Network/azureFirewalls@2025-07-01' = {
  name: 'afw-hub-${environment}-${location}-001'
  location: location
  tags: tags
  zones: ['1', '2', '3']
  properties: {
    sku: {
      name: 'AZFW_VNet'
      tier: 'Standard'
    }
    ipConfigurations: [
      {
        name: 'ipconfig-hub'
        properties: {
          subnet: {
            id: '${hubVnet.id}/subnets/AzureFirewallSubnet'
          }
          publicIPAddress: {
            id: firewallPip.id
          }
        }
      }
    ]
  }
}

resource firewallDiag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: firewall
  name: 'diag-afw-hub'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        category: 'AzureFirewallApplicationRule'
        enabled: true
      }
      {
        category: 'AzureFirewallNetworkRule'
        enabled: true
      }
      {
        category: 'AzureFirewallDnsProxy'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

// ─── Azure Bastion ────────────────────────────────────────────────────────────

resource bastionPip 'Microsoft.Network/publicIPAddresses@2025-07-01' = {
  name: 'pip-bastion-hub-${environment}-${location}-001'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Regional'
  }
  zones: ['1', '2', '3']
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

resource bastion 'Microsoft.Network/bastionHosts@2025-07-01' = {
  name: 'bas-hub-${environment}-${location}-001'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
  }
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig-bastion'
        properties: {
          subnet: {
            id: '${hubVnet.id}/subnets/AzureBastionSubnet'
          }
          publicIPAddress: {
            id: bastionPip.id
          }
        }
      }
    ]
  }
}

// ─── Outputs ─────────────────────────────────────────────────────────────────

@description('Resource ID of the hub VNet.')
output hubVnetId string = hubVnet.id

@description('Name of the hub VNet.')
output hubVnetName string = hubVnet.name

@description('Private IP of the Azure Firewall.')
output firewallPrivateIp string = firewall.properties.ipConfigurations[0].properties.privateIPAddress
