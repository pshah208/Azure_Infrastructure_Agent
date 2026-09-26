export function getConfig(env = process.env) {
  return {
    storageAccountName: env.STORAGE_ACCOUNT_NAME || "",
    rawVideosContainerName: env.RAW_VIDEOS_CONTAINER_NAME || "raw-videos",
    thumbnailsContainerName: env.THUMBNAILS_CONTAINER_NAME || "thumbnails",
    cosmosEndpoint: env.COSMOS_ENDPOINT || "",
    cosmosDatabaseName: env.COSMOS_DATABASE_NAME || "",
    matchesContainerName: env.MATCHES_CONTAINER_NAME || "matches",
    observationsContainerName: env.OBSERVATIONS_CONTAINER_NAME || "observations",
    serviceBusFullyQualifiedNamespace: env.SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE || "",
    videoProcessingQueueName: env.VIDEO_PROCESSING_QUEUE_NAME || "video-processing",
    foundryProjectEndpoint: env.FOUNDRY_PROJECT_ENDPOINT || "",
    foundryModelDeploymentName: env.FOUNDRY_MODEL_DEPLOYMENT_NAME || "",
    videoEvidenceAgentName: env.VIDEO_EVIDENCE_AGENT_NAME || "playeriq-video-evidence",
    playerAnalysisAgentName: env.PLAYER_ANALYSIS_AGENT_NAME || "playeriq-player-analysis",
    trainingPlanAgentName: env.TRAINING_PLAN_AGENT_NAME || "playeriq-training-plan",
    coachReviewAgentName: env.COACH_REVIEW_AGENT_NAME || "playeriq-coach-review",
    maxSampleFrames: Number(env.MAX_SAMPLE_FRAMES || 8),
    maxVideoDurationSeconds: Number(env.MAX_VIDEO_DURATION_SECONDS || 7200),
    tempRoot: env.TEMP_ROOT || "/tmp/playeriq"
  };
}

export function validateConfig(config) {
  const required = [
    "storageAccountName",
    "cosmosEndpoint",
    "cosmosDatabaseName",
    "serviceBusFullyQualifiedNamespace",
    "foundryProjectEndpoint",
    "foundryModelDeploymentName"
  ];
  const missing = required.filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Missing worker configuration: ${missing.join(", ")}`);
  }
}
