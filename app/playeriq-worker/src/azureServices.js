import { CosmosClient } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import { ServiceBusClient } from "@azure/service-bus";
import { BlobServiceClient } from "@azure/storage-blob";
import { invokeFoundryAgent } from "./foundry.js";
import { createFeedbackReader } from "./feedback.js";

export function createAzureServices(config) {
  const credential = new DefaultAzureCredential();
  const blobService = new BlobServiceClient(
    `https://${config.storageAccountName}.blob.core.windows.net`,
    credential
  );
  const cosmos = new CosmosClient({
    endpoint: config.cosmosEndpoint,
    aadCredentials: credential
  });
  const database = cosmos.database(config.cosmosDatabaseName);
  const matches = database.container(config.matchesContainerName);
  const observations = database.container(config.observationsContainerName);
  const serviceBus = new ServiceBusClient(config.serviceBusFullyQualifiedNamespace, credential);

  return {
    createReceiver() {
      return serviceBus.createReceiver(config.videoProcessingQueueName, {
        receiveMode: "peekLock"
      });
    },
    async close() {
      await serviceBus.close();
    },
    async getMatch(matchId, organizationId) {
      const result = await matches.item(matchId, organizationId).read();
      return result.resource;
    },
    async upsertMatch(document) {
      const result = await matches.items.upsert(document);
      return result.resource;
    },
    async upsertObservation(document) {
      const result = await observations.items.upsert(document);
      return result.resource;
    },
    getReviewedContext: createFeedbackReader(matches),
    async downloadRawVideo(blobName, destinationPath) {
      const blob = blobService
        .getContainerClient(config.rawVideosContainerName)
        .getBlockBlobClient(blobName);
      await blob.downloadToFile(destinationPath);
    },
    async uploadThumbnail(blobName, filePath, metadata) {
      const blob = blobService
        .getContainerClient(config.thumbnailsContainerName)
        .getBlockBlobClient(blobName);
      await blob.uploadFile(filePath, {
        blobHTTPHeaders: { blobContentType: "image/jpeg" },
        metadata
      });
      return blob.url;
    },
    async invokeAgent(agentName, input, imageFrames = []) {
      return invokeFoundryAgent({
        credential,
        projectEndpoint: config.foundryProjectEndpoint,
        modelDeployment: config.foundryModelDeploymentName,
        agentName,
        input,
        imageFrames
      });
    }
  };
}
