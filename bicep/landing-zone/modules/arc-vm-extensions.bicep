@description('Azure region.')
param location string

@description('Name of the Arc-enabled machine (Microsoft.HybridCompute/machines).')
param arcMachineName string

@description('Operating system type for the Arc machine.')
@allowed([
  'Windows'
  'Linux'
])
param osType string

@description('Log Analytics Workspace resource ID used by monitoring extensions.')
param logAnalyticsWorkspaceId string

@description('Resource tags.')
param tags object = {}

@description('Deploy Azure Monitor Agent extension.')
param deployAzureMonitorAgent bool = true

@description('Deploy Dependency Agent extension.')
param deployDependencyAgent bool = false

@description('Deploy Machine Configuration extension.')
param deployMachineConfiguration bool = true

resource arcMachine 'Microsoft.HybridCompute/machines@2023-10-03-preview' existing = {
  name: arcMachineName
}

resource azureMonitorAgentExtension 'Microsoft.HybridCompute/machines/extensions@2023-10-03-preview' = if (deployAzureMonitorAgent) {
  parent: arcMachine
  name: osType == 'Windows' ? 'AzureMonitorWindowsAgent' : 'AzureMonitorLinuxAgent'
  location: location
  tags: tags
  properties: {
    publisher: 'Microsoft.Azure.Monitor'
    type: osType == 'Windows' ? 'AzureMonitorWindowsAgent' : 'AzureMonitorLinuxAgent'
    typeHandlerVersion: '1.0'
    settings: {
      workspaceId: logAnalyticsWorkspaceId
    }
    autoUpgradeMinorVersion: true
    enableAutomaticUpgrade: true
  }
}

resource machineConfigurationExtension 'Microsoft.HybridCompute/machines/extensions@2023-10-03-preview' = if (deployMachineConfiguration) {
  parent: arcMachine
  name: 'Microsoft.GuestConfiguration'
  location: location
  tags: tags
  properties: {
    publisher: 'Microsoft.GuestConfiguration'
    type: osType == 'Windows' ? 'ConfigurationforWindows' : 'ConfigurationforLinux'
    typeHandlerVersion: '1.0'
    autoUpgradeMinorVersion: true
    enableAutomaticUpgrade: true
  }
}

resource dependencyAgentExtension 'Microsoft.HybridCompute/machines/extensions@2023-10-03-preview' = if (deployDependencyAgent) {
  parent: arcMachine
  name: osType == 'Windows' ? 'DependencyAgentWindows' : 'DependencyAgentLinux'
  location: location
  tags: tags
  properties: {
    publisher: 'Microsoft.Azure.Monitoring.DependencyAgent'
    type: osType == 'Windows' ? 'DependencyAgentWindows' : 'DependencyAgentLinux'
    typeHandlerVersion: '9.10'
    autoUpgradeMinorVersion: true
    enableAutomaticUpgrade: true
  }
}

var deployedExtensionResourceIds = concat(
  deployAzureMonitorAgent ? [azureMonitorAgentExtension.id] : [],
  deployMachineConfiguration ? [machineConfigurationExtension.id] : [],
  deployDependencyAgent ? [dependencyAgentExtension.id] : []
)

@description('Resource IDs of Arc machine extensions deployed by this module.')
output deployedExtensionResourceIds array = deployedExtensionResourceIds
