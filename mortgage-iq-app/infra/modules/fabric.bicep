// Microsoft Fabric capacity (Fabric IQ data layer).
// Default SKU is F2 - the entry tier, sufficient for the demo's low-volume
// OneLake / SQL analytics queries. Pause the capacity between demos to save cost.
param namePrefix string
param environmentName string
param location string
param tags object

@description('Fabric capacity SKU. F2 is the entry tier; step up to F4/F8 for concurrent users.')
@allowed([ 'F2', 'F4', 'F8', 'F16', 'F32', 'F64' ])
param fabricSkuName string = 'F2'

@description('Entra object IDs (users or groups) to set as Fabric capacity admins.')
param capacityAdminMembers array

var capacityName = toLower(replace('fab${namePrefix}${environmentName}${uniqueString(resourceGroup().id)}', '-', ''))

resource fabricCapacity 'Microsoft.Fabric/capacities@2023-11-01' = {
  name: substring(capacityName, 0, min(length(capacityName), 63))
  location: location
  tags: tags
  sku: {
    name: fabricSkuName
    tier: 'Fabric'
  }
  properties: {
    administration: {
      members: capacityAdminMembers
    }
  }
}

output capacityName string = fabricCapacity.name
output capacityId string = fabricCapacity.id
output sku string = fabricSkuName
