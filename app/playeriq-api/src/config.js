export function getConfig(env = process.env) {
  return {
    port: Number(env.PORT || 3000),
    nodeEnv: env.NODE_ENV || "development",
    authEnabled: env.AUTH_ENABLED !== "false",
    authTenantId: env.AUTH_TENANT_ID || "",
    authApiClientId: env.AUTH_API_CLIENT_ID || "",
    authSpaClientId: env.AUTH_SPA_CLIENT_ID || "",
    authMemberships: JSON.parse(env.AUTH_MEMBERSHIPS_JSON || "[]"),
    allowOrigin: env.ALLOW_ORIGIN || "*",
    maxUploadBytes: Number(env.MAX_UPLOAD_BYTES || 500 * 1024 * 1024),
    storageAccountName: env.STORAGE_ACCOUNT_NAME || "",
    rawVideosContainerName: env.RAW_VIDEOS_CONTAINER_NAME || "raw-videos",
    cosmosEndpoint: env.COSMOS_ENDPOINT || "",
    cosmosDatabaseName: env.COSMOS_DATABASE_NAME || "",
    matchesContainerName: env.MATCHES_CONTAINER_NAME || "matches",
    observationsContainerName: env.OBSERVATIONS_CONTAINER_NAME || "observations",
    thumbnailsContainerName: env.THUMBNAILS_CONTAINER_NAME || "thumbnails",
    serviceBusFullyQualifiedNamespace: env.SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE || "",
    videoProcessingQueueName: env.VIDEO_PROCESSING_QUEUE_NAME || "video-processing",
    foundryEndpoint: env.FOUNDRY_ENDPOINT || "",
    foundryProjectEndpoint: env.FOUNDRY_PROJECT_ENDPOINT || "",
    foundryModelDeploymentName: env.FOUNDRY_MODEL_DEPLOYMENT_NAME || "",
    foundryVisionModelDeploymentName: env.FOUNDRY_VISION_MODEL_DEPLOYMENT_NAME || "",
    foundryApiVersion: env.FOUNDRY_API_VERSION || "2024-10-21",
    syntheticDataPath: env.SYNTHETIC_DATA_PATH || "./data/playeriq/synthetic",
    enableMockAzure: env.ENABLE_MOCK_AZURE === "true"
  };
}

export function hasAzureRuntimeConfig(config) {
  return Boolean(
    config.storageAccountName &&
      config.cosmosEndpoint &&
      config.cosmosDatabaseName &&
      config.serviceBusFullyQualifiedNamespace
  );
}
