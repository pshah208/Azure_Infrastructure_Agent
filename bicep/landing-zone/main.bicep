targetScope = 'subscription'

@description('Deployment environment (dev | staging | prod).')
@allowed(['dev', 'staging', 'prod'])
param environment string

@description('Primary Azure region for the landing zone.')
param location string = 'eastus'

@description('Cost centre code for tagging.')
param costCenter string

@description('Team or individual responsible for this landing zone.')
param owner string

@description('Address space for the hub VNet.')
param hubVnetAddressSpace string = '10.0.0.0/16'

@description('Address prefix for AzureFirewallSubnet (/26 or larger).')
param hubFirewallSubnetPrefix string = '10.0.1.0/26'

@description('Address prefix for AzureBastionSubnet (/26 or larger).')
param hubBastionSubnetPrefix string = '10.0.3.0/26'

@description('Address prefix for the management subnet.')
param hubManagementSubnetPrefix string = '10.0.2.0/24'

@description('Log Analytics retention in days.')
param logRetentionDays int = 90

@description('Enable Microsoft Defender for Cloud.')
param enableDefender bool = true

@description('Deploy Azure SRE Agent resources.')
param deploySreAgent bool = false

@description('Deploy Arc VM extensions to an Arc-enabled server.')
param deployArcVmExtensions bool = false

@description('Azure SRE Agent name.')
param sreAgentName string = 'sre-${environment}-${location}-001'

@description('Resource IDs of resource groups monitored by Azure SRE Agent.')
param monitoredResourceGroupIds array = []

@description('Grant remediation (Contributor) access to the Azure SRE Agent.')
param enableSreAgentRemediationAccess bool = false

@description('Resource group name containing the Arc-enabled machine.')
param arcMachineResourceGroupName string = 'rg-management-${environment}-${location}-001'

@description('Arc-enabled machine name.')
param arcMachineName string = 'arc-machine-placeholder'

@description('Arc-enabled machine OS type.')
@allowed([
  'Windows'
  'Linux'
])
param arcMachineOsType string = 'Linux'

@description('Deploy Azure Monitor Agent extension on Arc-enabled machine.')
param deployAzureMonitorAgent bool = true

@description('Deploy Dependency Agent extension on Arc-enabled machine.')
param deployDependencyAgent bool = false

@description('Deploy Machine Configuration extension on Arc-enabled machine.')
param deployMachineConfiguration bool = true

@description('Spoke virtual networks to peer with the hub.')
param spokes array = [
  {
    name: 'workload-a'
    addressSpace: '10.10.0.0/16'
    subnets: [
      { name: 'snet-app',  prefix: '10.10.1.0/24' }
      { name: 'snet-data', prefix: '10.10.2.0/24' }
    ]
  }
  {
    name: 'workload-b'
    addressSpace: '10.20.0.0/16'
    subnets: [
      { name: 'snet-app', prefix: '10.20.1.0/24' }
    ]
  }
]

var commonTags = {
  Environment: environment
  CostCenter: costCenter
  Owner: owner
  CreatedBy: 'Bicep'
  ManagedBy: 'IaC'
}

// ─── Resource Groups ─────────────────────────────────────────────────────────

resource rgHubNetworking 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: 'rg-hub-networking-${environment}-${location}-001'
  location: location
  tags: commonTags
}

resource rgManagement 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: 'rg-management-${environment}-${location}-001'
  location: location
  tags: commonTags
}

resource rgSecurity 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: 'rg-security-${environment}-${location}-001'
  location: location
  tags: commonTags
}

resource rgSpokes 'Microsoft.Resources/resourceGroups@2023-07-01' = [for spoke in spokes: {
  name: 'rg-spoke-${spoke.name}-${environment}-${location}-001'
  location: location
  tags: commonTags
}]

resource rgArcMachines 'Microsoft.Resources/resourceGroups@2023-07-01' existing = if (deployArcVmExtensions) {
  name: arcMachineResourceGroupName
}

// ─── Log Analytics Workspace ─────────────────────────────────────────────────

module logAnalytics 'modules/log-analytics.bicep' = {
  scope: rgManagement
  name: 'deploy-log-analytics'
  params: {
    workspaceName: 'log-central-${environment}-${location}-001'
    location: location
    retentionDays: logRetentionDays
    tags: commonTags
  }
}

// ─── Hub Network ─────────────────────────────────────────────────────────────

module hubNetwork 'modules/hub-network.bicep' = {
  scope: rgHubNetworking
  name: 'deploy-hub-network'
  params: {
    environment: environment
    location: location
    hubVnetAddressSpace: hubVnetAddressSpace
    firewallSubnetPrefix: hubFirewallSubnetPrefix
    bastionSubnetPrefix: hubBastionSubnetPrefix
    managementSubnetPrefix: hubManagementSubnetPrefix
    logAnalyticsWorkspaceId: logAnalytics.outputs.workspaceId
    tags: commonTags
  }
}

// ─── Spoke Networks ───────────────────────────────────────────────────────────

module spokeNetworks 'modules/spoke-network.bicep' = [for (spoke, i) in spokes: {
  scope: rgSpokes[i]
  name: 'deploy-spoke-${spoke.name}'
  params: {
    spokeName: spoke.name
    environment: environment
    location: location
    addressSpace: spoke.addressSpace
    subnets: spoke.subnets
    hubVnetId: hubNetwork.outputs.hubVnetId
    hubVnetName: hubNetwork.outputs.hubVnetName
    hubResourceGroupName: rgHubNetworking.name
    logAnalyticsWorkspaceId: logAnalytics.outputs.workspaceId
    tags: commonTags
  }
}]

module sreAgent 'modules/sre-agent.bicep' = if (deploySreAgent) {
  scope: rgManagement
  name: 'deploy-sre-agent'
  params: {
    environment: environment
    location: location
    agentName: sreAgentName
    monitoredResourceGroupIds: monitoredResourceGroupIds
    logAnalyticsWorkspaceId: logAnalytics.outputs.workspaceId
    enableRemediationAccess: enableSreAgentRemediationAccess
    tags: commonTags
  }
}

module arcVmExtensions 'modules/arc-vm-extensions.bicep' = if (deployArcVmExtensions) {
  scope: rgArcMachines
  name: 'deploy-arc-vm-extensions'
  params: {
    location: location
    arcMachineName: arcMachineName
    osType: arcMachineOsType
    logAnalyticsWorkspaceId: logAnalytics.outputs.workspaceId
    deployAzureMonitorAgent: deployAzureMonitorAgent
    deployDependencyAgent: deployDependencyAgent
    deployMachineConfiguration: deployMachineConfiguration
    tags: commonTags
  }
}

// ─── Outputs ─────────────────────────────────────────────────────────────────

@description('Resource ID of the hub virtual network.')
output hubVnetId string = hubNetwork.outputs.hubVnetId

@description('Private IP address of the Azure Firewall.')
output firewallPrivateIp string = hubNetwork.outputs.firewallPrivateIp

@description('Resource ID of the central Log Analytics Workspace.')
output logAnalyticsWorkspaceId string = logAnalytics.outputs.workspaceId
