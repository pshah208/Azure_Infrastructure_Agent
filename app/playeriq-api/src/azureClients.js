import { DefaultAzureCredential } from "@azure/identity";
import { BlobSASPermissions, BlobServiceClient, SASProtocol, generateBlobSASQueryParameters } from "@azure/storage-blob";
import { CosmosClient } from "@azure/cosmos";
import { ServiceBusClient } from "@azure/service-bus";
import { hasAzureRuntimeConfig } from "./config.js";
import { resolveAgentModelDeployment } from "./agentDefinitions.js";
import { createHistoryStore, createMockHistoryStore } from "./historyStore.js";

export function createRuntimeServices(config) {
  if (config.enableMockAzure || !hasAzureRuntimeConfig(config)) {
    return createMockServices();
  }

  const credential = new DefaultAzureCredential();
  const blobServiceClient = new BlobServiceClient(
    `https://${config.storageAccountName}.blob.core.windows.net`,
    credential
  );
  const cosmosClient = new CosmosClient({
    endpoint: config.cosmosEndpoint,
    aadCredentials: credential
  });
  const serviceBusClient = new ServiceBusClient(config.serviceBusFullyQualifiedNamespace, credential);

  const database = cosmosClient.database(config.cosmosDatabaseName);
  const matches = database.container(config.matchesContainerName);
  const sender = serviceBusClient.createSender(config.videoProcessingQueueName);
  const foundryEnabled = Boolean(
    config.foundryModelDeploymentName &&
      (config.foundryProjectEndpoint || config.foundryEndpoint)
  );

  return {
    ...createHistoryStore({ database, blobServiceClient, config }),
    mode: "azure",
    foundryEnabled,
    agentServiceEnabled: Boolean(config.foundryProjectEndpoint),
    async createUploadUrl({ blobName, contentType, expiresOn }) {
      const startsOn = new Date(Date.now() - 5 * 60 * 1000);
      const delegationKey = await blobServiceClient.getUserDelegationKey(startsOn, expiresOn);
      const sas = generateBlobSASQueryParameters(
        {
          containerName: config.rawVideosContainerName,
          blobName,
          permissions: BlobSASPermissions.parse("cw"),
          startsOn,
          expiresOn,
          contentType,
          protocol: SASProtocol.Https
        },
        delegationKey,
        config.storageAccountName
      ).toString();

      return `https://${config.storageAccountName}.blob.core.windows.net/${config.rawVideosContainerName}/${encodeBlobPath(blobName)}?${sas}`;
    },
    async uploadVideoBuffer({ blobName, buffer, contentType, metadata }) {
      const container = blobServiceClient.getContainerClient(config.rawVideosContainerName);
      const blockBlob = container.getBlockBlobClient(blobName);
      await blockBlob.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: contentType || "video/mp4" },
        metadata
      });
      return blockBlob.url;
    },
    async upsertMatchDocument(document) {
      const result = await matches.items.upsert(document);
      return result.resource;
    },
    async sendProcessingMessage(message) {
      await sender.sendMessages({
        body: message,
        contentType: "application/json",
        subject: "video-upload-completed",
        messageId: message.jobId
      });
    },
    async runFoundryAgent({ agent, input }) {
      const modelDeployment = resolveAgentModelDeployment(agent, config);
      if (!foundryEnabled || !modelDeployment) {
        return createRuleBasedAgentOutput({ agent, input, mode: "foundry-disabled", modelDeployment });
      }

      if (!config.foundryProjectEndpoint || !agent.foundryAgentName) {
        return createRuleBasedAgentOutput({
          agent,
          input,
          mode: "foundry-agent-disabled",
          modelDeployment
        });
      }

      const response = await callFoundryAgentReference({
        credential,
        projectEndpoint: config.foundryProjectEndpoint,
        modelDeployment,
        agentName: agent.foundryAgentName,
        input: {
          task: `Run ${agent.name} for the PlayerIQ MVP.`,
          requiredJsonShape: agent.outputContract,
          input
        }
      });

      return {
        mode: "foundry-agent",
        agentId: agent.agentId,
        agentName: agent.name,
        foundryAgentName: agent.foundryAgentName,
        modelDeployment,
        generatedAt: new Date().toISOString(),
        data: response
      };
    },
    async generatePlayerFeedback({ player, match, observations, trainingPlan }) {
      if (!foundryEnabled || !config.foundryProjectEndpoint) {
        return createRuleBasedFeedback({ player, match, observations, trainingPlan, mode: "foundry-disabled" });
      }

      const feedback = await callFoundryAgentReference({
        credential,
        projectEndpoint: config.foundryProjectEndpoint,
        modelDeployment: config.foundryModelDeploymentName,
        agentName: "playeriq-player-analysis",
        input: {
          task: "Create MVP player-development feedback from the supplied structured evidence.",
          player,
          match,
          observations,
          trainingPlan
        }
      });

      return {
        mode: "foundry-agent",
        foundryAgentName: "playeriq-player-analysis",
        modelDeployment: config.foundryModelDeploymentName,
        generatedAt: new Date().toISOString(),
        feedback
      };
    }
  };
}

function createMockServices() {
  const documents = new Map();
  const messages = [];

  return {
    ...createMockHistoryStore(documents),
    mode: "mock",
    foundryEnabled: true,
    agentServiceEnabled: true,
    documents,
    messages,
    async createUploadUrl({ blobName }) {
      return `https://example.invalid/mock-upload/${encodeBlobPath(blobName)}`;
    },
    async uploadVideoBuffer({ blobName }) {
      return `https://example.invalid/mock-blob/${encodeBlobPath(blobName)}`;
    },
    async sendProcessingMessage(message) {
      messages.push(message);
    },
    async runFoundryAgent({ agent, input }) {
      return createRuleBasedAgentOutput({
        agent,
        input,
        mode: "mock-foundry",
        modelDeployment: agent.modelKey === "vision" ? "mock-vision-playeriq" : "mock-playeriq-coach"
      });
    },
    async generatePlayerFeedback({ player, match, observations, trainingPlan }) {
      return createRuleBasedFeedback({ player, match, observations, trainingPlan, mode: "mock-foundry" });
    }
  };
}

function encodeBlobPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function callFoundryAgentReference({ credential, projectEndpoint, modelDeployment, agentName, input }) {
  const accessToken = await credential.getToken("https://ai.azure.com/.default");
  const normalizedEndpoint = projectEndpoint.replace(/\/$/, "");
  const response = await fetch(
    `${normalizedEndpoint}/openai/v1/responses`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelDeployment,
        input: JSON.stringify(input),
        agent_reference: {
          name: agentName,
          type: "agent_reference"
        }
      })
    }
  );

  if (!response.ok) {
    const details = await response.text();
    const error = new Error(`Foundry agent '${agentName}' call failed with ${response.status}: ${details}`);
    error.statusCode = 502;
    throw error;
  }

  const result = await response.json();
  return parseJsonContent(extractResponseText(result));
}

function extractResponseText(result) {
  const textParts = [];
  for (const output of result.output || []) {
    for (const content of output.content || []) {
      if (content.type === "output_text" && content.text) {
        textParts.push(content.text);
      }
    }
  }
  return textParts.join("\n") || "{}";
}

function parseJsonContent(content) {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(normalized || "{}");
}

function createRuleBasedAgentOutput({ agent, input, mode, modelDeployment }) {
  const generatedAt = new Date().toISOString();

  if (agent.agentId === "video-evidence-agent") {
    const matchId = input.match?.matchId || input.matchId || "match-synthetic-agent-generated";
    const playerId = input.player?.playerId || input.playerId || "player-synthetic-agent-generated";
    return {
      mode,
      agentId: agent.agentId,
      agentName: agent.name,
      modelDeployment,
      generatedAt,
      data: {
        observations: [
          {
            observationId: `obs-${matchId}-scan-001`,
            matchId,
            playerId,
            timestampStart: "00:42",
            timestampEnd: "00:48",
            eventType: "Reception",
            claim: "Player received under light pressure with limited pre-scan before first touch.",
            coachingImplication: "Add shoulder check before receiving to improve forward passing options.",
            confidence: 0.74
          },
          {
            observationId: `obs-${matchId}-pass-002`,
            matchId,
            playerId,
            timestampStart: "03:15",
            timestampEnd: "03:20",
            eventType: "Progressive Pass",
            claim: "Player found a forward passing lane after opening body shape.",
            coachingImplication: "Reinforce positive body orientation and early decision-making.",
            confidence: 0.82
          }
        ],
        guardrails: [
          "Generated from MVP metadata and synthetic exemplars; no raw-video computer vision was run.",
          "Coach review is required before using this for real player assessment."
        ]
      }
    };
  }

  if (agent.agentId === "synthetic-data-agent") {
    const scenario = input.scenario || "U14 central midfielder development test";
    return {
      mode,
      agentId: agent.agentId,
      agentName: agent.name,
      modelDeployment,
      generatedAt,
      data: {
        player: {
          playerId: `player-synth-${Date.now()}`,
          displayName: "Synthetic Player 10",
          ageGroup: "U14",
          primaryPosition: "Central Midfielder",
          dominantFoot: "Right"
        },
        match: {
          matchId: `match-synth-${Date.now()}`,
          matchName: scenario,
          matchType: "synthetic-test",
          durationMinutes: 60
        },
        observations: [
          {
            timestampStart: "00:35",
            timestampEnd: "00:41",
            eventType: "Scanning",
            claim: "Synthetic player scanned once before receiving.",
            coachingImplication: "Increase scanning frequency before central receptions.",
            confidence: 0.77
          }
        ],
        coachReview: {
          reviewStatus: "needsCoachReview",
          notes: "Synthetic record for MVP workflow testing only."
        },
        trainingPlan: {
          weeklyFocus: "First touch under pressure",
          drills: ["shoulder-check rondo", "receive-turn-pass gates"]
        },
        fabricSemanticModelFacts: [
          { metric: "scanBeforeReceptionRate", value: 0.46 },
          { metric: "progressivePassCompletionRate", value: 0.68 }
        ]
      }
    };
  }

  return {
    mode,
    agentId: agent.agentId,
    agentName: agent.name,
    modelDeployment,
    generatedAt,
    data: {
      reviewStatus: "needsCoachReview",
      summary: "MVP rule-based fallback generated because Foundry was not available.",
      guardrails: ["Use this response for API contract testing only."]
    }
  };
}

function createRuleBasedFeedback({ player, match, observations, trainingPlan, mode }) {
  const evidence = observations.map((observation) => ({
    observationId: observation.observationId,
    timestampStart: observation.timestampStart,
    timestampEnd: observation.timestampEnd,
    confidence: observation.confidence
  }));

  return {
    mode,
    modelDeployment: mode === "mock-foundry" ? "mock-playeriq-coach" : "",
    generatedAt: new Date().toISOString(),
    feedback: {
      summary: `${player.displayName} should keep building on forward play while prioritizing scanning and first-touch body shape.`,
      strengths: observations
        .filter((observation) => observation.eventType === "Progressive Pass" || observation.eventType === "Defensive Recovery")
        .map((observation) => observation.claim),
      improvementAreas: observations
        .filter((observation) => observation.eventType === "Reception" || observation.eventType === "Turnover")
        .map((observation) => observation.coachingImplication),
      recommendedDrills: (trainingPlan?.priorities || []).map((priority) => priority.drill),
      evidence,
      guardrails: [
        `Feedback is limited to ${match.matchName || "the supplied match"} and the provided timestamped observations.`,
        "Synthetic evidence is suitable for MVP flow testing, not real player assessment."
      ]
    }
  };
}
