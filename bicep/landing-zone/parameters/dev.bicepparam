using '../main.bicep'

param environment = 'dev'
param location = 'eastus'
param costCenter = 'INFRA-001'
param owner = 'platform-team@example.com'

param hubVnetAddressSpace       = '10.0.0.0/16'
param hubFirewallSubnetPrefix   = '10.0.1.0/26'
param hubBastionSubnetPrefix    = '10.0.3.0/26'
param hubManagementSubnetPrefix = '10.0.2.0/24'

param logRetentionDays = 30
param enableDefender   = true
param deploySreAgent = false
param deployArcVmExtensions = false
param sreAgentName = 'sre-dev-eastus-001'
param monitoredResourceGroupIds = [
  '/subscriptions/<subscription-id>/resourceGroups/rg-management-dev-eastus-001'
]
param enableSreAgentRemediationAccess = false
param arcMachineResourceGroupName = 'rg-management-dev-eastus-001'
param arcMachineName = 'arc-machine-placeholder'
param arcMachineOsType = 'Linux'
param deployAzureMonitorAgent = true
param deployDependencyAgent = false
param deployMachineConfiguration = true

param spokes = [
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
