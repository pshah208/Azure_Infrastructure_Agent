import cors from "cors";
import express from "express";
import helmet from "helmet";
import { v4 as uuidv4 } from "uuid";
import { getConfig } from "./config.js";
import { createRuntimeServices } from "./azureClients.js";
import { getAgentDefinition, getPublicAgentDefinitions } from "./agentDefinitions.js";
import { loadSyntheticDataset } from "./syntheticData.js";
import { requireString, validateVideoFile } from "./validation.js";
import { registerHistoryRoutes } from "./historyRoutes.js";
import { authorizeScope, createAuthorization } from "./authorization.js";

export function createApp(options = {}) {
  const config = options.config || getConfig();
  const authorization = createAuthorization(config, options.authenticationKeys);
  const services = options.services || createRuntimeServices(config);
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.allowOrigin }));

  app.get("/", (_req, res) => {
    res.json({
      name: "PlayerIQ MVP API",
      status: "ok",
      mode: services.mode,
      endpoints: [
        "GET /health",
        "GET /api/foundry-agents",
        "POST /api/foundry-agents/:agentId/run",
        "POST /api/foundry-agents/synthetic-data",
        "POST /api/analysis/video-evidence",
        "POST /api/analysis/agent-pipeline",
        "GET /api/synthetic-test-data",
        "POST /api/analysis/synthetic",
        "POST /api/uploads/initiate",
        "POST /api/uploads/complete",
        "POST /api/uploads",
        "GET /api/uploads/:matchId?organizationId=...",
        "GET /api/players/:playerId/matches?organizationId=...",
        "POST /api/uploads/:matchId/reviews"
      ]
    });
  });

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      mode: services.mode,
      foundryEnabled: Boolean(services.foundryEnabled),
      agentServiceEnabled: Boolean(services.agentServiceEnabled),
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/auth/config", (_req, res) => {
    res.set("Cache-Control", "no-store").json(authorization.publicConfig);
  });
  app.use("/api", authorization.middleware);
  app.get("/api/auth/me", (req, res) => {
    res.json(req.principal || { enabled: false, localMock: true });
  });

  app.get("/api/foundry-agents", (_req, res) => {
    res.json({
      agents: getPublicAgentDefinitions(config),
      note:
        "These are PlayerIQ Foundry agent contracts. The current MVP binds them to Azure AI Services model deployments while hosted-agent azd tooling is unavailable."
    });
  });

  app.post("/api/foundry-agents/:agentId/run", express.json({ limit: "2mb" }), async (req, res, next) => {
    try {
      const agent = getAgentDefinition(req.params.agentId);
      if (!agent) {
        return res.status(404).json({ error: `Foundry agent '${req.params.agentId}' is not defined.` });
      }

      const result = await services.runFoundryAgent({ agent, input: req.body || {} });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/foundry-agents/synthetic-data", express.json({ limit: "2mb" }), async (req, res, next) => {
    try {
      const agent = getAgentDefinition("synthetic-data-agent");
      const result = await services.runFoundryAgent({
        agent,
        input: {
          scenario: req.body?.scenario || "U14 central midfielder MVP test run",
          requestedRecords: Number(req.body?.requestedRecords || 1),
          constraints: [
            "synthetic-only",
            "no real minors or real club names",
            "include observations, coach review, training plan, and Fabric-friendly facts"
          ]
        }
      });

      res.status(201).json({
        dataType: "playeriq-synthetic-development-record",
        ...result
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/analysis/video-evidence", express.json({ limit: "2mb" }), async (req, res, next) => {
    try {
      const dataset = await loadSyntheticDataset(config.syntheticDataPath);
      const playerId = String(req.body?.playerId || dataset.players[0]?.playerId || "");
      const matchId = String(req.body?.matchId || dataset.matches[0]?.matchId || "");
      const player = dataset.players.find((item) => item.playerId === playerId) || { playerId };
      const match = dataset.matches.find((item) => item.matchId === matchId) || {
        matchId,
        matchName: req.body?.matchName || "Uploaded video analysis"
      };
      const syntheticExamples = dataset.observations
        .filter((item) => item.playerId === playerId)
        .slice(0, 3);
      const agent = getAgentDefinition("video-evidence-agent");
      const result = await services.runFoundryAgent({
        agent,
        input: {
          player,
          match,
          upload: {
            matchId,
            videoAssetId: req.body?.videoAssetId || "",
            blobName: req.body?.blobName || "",
            fileName: req.body?.fileName || "",
            footageContext: req.body?.footageContext || "",
            evaluationFocus: req.body?.evaluationFocus || ""
          },
          sampledFrameNotes: req.body?.sampledFrameNotes || [],
          syntheticExamples
        }
      });

      res.status(200).json({
        analysisType: "video-evidence-observation-generation",
        evidenceSource: "demo-metadata-and-synthetic-examples",
        rawVideoProcessed: false,
        playerId,
        matchId,
        ...result
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/analysis/agent-pipeline", express.json({ limit: "2mb" }), async (req, res, next) => {
    try {
      const dataset = await loadSyntheticDataset(config.syntheticDataPath);
      const playerId = String(req.body?.playerId || dataset.players[0]?.playerId || "");
      const matchId = String(req.body?.matchId || dataset.matches[0]?.matchId || "");
      const player = dataset.players.find((item) => item.playerId === playerId) || { playerId };
      const match = dataset.matches.find((item) => item.matchId === matchId) || {
        matchId,
        matchName: req.body?.matchName || "Uploaded video agent pipeline"
      };
      const syntheticExamples = dataset.observations
        .filter((item) => item.playerId === playerId)
        .slice(0, 3);

      const videoEvidence = await services.runFoundryAgent({
        agent: getAgentDefinition("video-evidence-agent"),
        input: {
          player,
          match,
          upload: {
            matchId,
            videoAssetId: req.body?.videoAssetId || "",
            blobName: req.body?.blobName || "",
            fileName: req.body?.fileName || "",
            footageContext: req.body?.footageContext || "",
            evaluationFocus: req.body?.evaluationFocus || ""
          },
          sampledFrameNotes: req.body?.sampledFrameNotes || [],
          syntheticExamples
        }
      });

      const observations = Array.isArray(videoEvidence.data?.observations)
        ? videoEvidence.data.observations
        : syntheticExamples;

      const playerAnalysis = await services.runFoundryAgent({
        agent: getAgentDefinition("player-analysis-agent"),
        input: {
          player,
          match,
          observations,
          requiredEvidencePolicy: "Every claim must cite observation IDs and confidence."
        }
      });

      const trainingPlan = await services.runFoundryAgent({
        agent: getAgentDefinition("training-plan-agent"),
        input: {
          player,
          match,
          observations,
          playerAnalysis: playerAnalysis.data
        }
      });

      const coachReview = await services.runFoundryAgent({
        agent: getAgentDefinition("coach-review-agent"),
        input: {
          player,
          match,
          observations,
          playerAnalysis: playerAnalysis.data,
          trainingPlan: trainingPlan.data
        }
      });

      res.status(200).json({
        analysisType: "playeriq-agent-pipeline",
        evidenceSource: "demo-metadata-and-synthetic-examples",
        rawVideoProcessed: false,
        playerId,
        matchId,
        mode: [videoEvidence, playerAnalysis, trainingPlan, coachReview].every((item) => item.mode === "foundry-agent")
          ? "foundry-agent"
          : "mixed",
        generatedAt: new Date().toISOString(),
        agents: {
          videoEvidence,
          playerAnalysis,
          trainingPlan,
          coachReview
        },
        records: {
          observations,
          playerAnalysis: playerAnalysis.data,
          trainingPlan: trainingPlan.data,
          coachReview: coachReview.data
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/synthetic-test-data", async (_req, res, next) => {
    try {
      const dataset = await loadSyntheticDataset(config.syntheticDataPath);
      res.json(dataset);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/analysis/synthetic", express.json({ limit: "2mb" }), async (req, res, next) => {
    try {
      const dataset = await loadSyntheticDataset(config.syntheticDataPath);
      const playerId = String(req.body?.playerId || dataset.players[0]?.playerId || "");
      const matchId = String(req.body?.matchId || dataset.matches[0]?.matchId || "");
      const player = dataset.players.find((item) => item.playerId === playerId);
      const match = dataset.matches.find((item) => item.matchId === matchId);

      if (!player) {
        return res.status(404).json({ error: `Player '${playerId}' was not found in the synthetic dataset.` });
      }

      if (!match) {
        return res.status(404).json({ error: `Match '${matchId}' was not found in the synthetic dataset.` });
      }

      const observations = dataset.observations.filter((item) => item.playerId === playerId && item.matchId === matchId);
      const trainingPlan = dataset.trainingPlans.find((item) => item.playerId === playerId && item.matchId === matchId);
      const analysis = await services.generatePlayerFeedback({ player, match, observations, trainingPlan });

      res.status(200).json({
        analysisType: "synthetic-player-development",
        playerId,
        matchId,
        ...analysis
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/uploads/initiate", express.json({ limit: "2mb" }), async (req, res, next) => {
    try {
      const organizationId = requireString(req.body.organizationId, "organizationId");
      const playerId = requireString(req.body.playerId, "playerId");
      authorizeScope(req, organizationId, playerId);
      const fileName = requireString(req.body.fileName, "fileName");
      const contentType = String(req.body.contentType || "video/mp4");
      const sizeBytes = Number(req.body.sizeBytes || 0);
      const validation = validateVideoFile({ fileName, contentType, sizeBytes, maxUploadBytes: config.maxUploadBytes });

      if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
      }

      const matchId = String(req.body.matchId || `match-${uuidv4()}`);
      const videoAssetId = `video-${uuidv4()}`;
      const blobName = `${organizationId}/${matchId}/${videoAssetId}-${validation.fileName}`;
      const expiresOn = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const uploadUrl = await services.createUploadUrl({ blobName, contentType, expiresOn });

      const document = buildMatchDocument({
        id: matchId,
        organizationId,
        playerId,
        body: req.body,
        videoAssetId,
        blobName,
        uploadStatus: "uploadPending",
        processingStatus: "waitingForUpload"
      });

      await services.createMatchDocument(document);

      res.status(201).json({
        matchId,
        videoAssetId,
        blobName,
        uploadUrl,
        uploadMethod: "PUT",
        requiredHeaders: {
          "x-ms-blob-type": "BlockBlob",
          "Content-Type": contentType
        },
        expiresOn: expiresOn.toISOString(),
        completeUrl: "/api/uploads/complete"
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/uploads/complete", express.json({ limit: "2mb" }), async (req, res, next) => {
    try {
      const organizationId = requireString(req.body.organizationId, "organizationId");
      const playerId = requireString(req.body.playerId, "playerId");
      authorizeScope(req, organizationId, playerId);
      const matchId = requireString(req.body.matchId, "matchId");
      const videoAssetId = requireString(req.body.videoAssetId, "videoAssetId");
      const blobName = requireString(req.body.blobName, "blobName");
      const jobId = `job-${uuidv4()}`;

      const document = await services.getMatchDocument(matchId, organizationId);
      if (!document) return res.status(404).json({ error: "Upload initiation was not found." });
      if (document.playerId !== playerId || document.videoAsset.videoAssetId !== videoAssetId ||
          document.videoAsset.blobName !== blobName || document.processing.status !== "waitingForUpload") {
        return res.status(409).json({ error: "Upload details or state do not match the initiated upload." });
      }
      document.videoAsset.uploadStatus = "uploaded";
      document.processing = { ...document.processing, status: "queued", jobId };
      document.updatedAt = new Date().toISOString();

      await services.upsertMatchDocument(document);
      await services.sendProcessingMessage(buildProcessingMessage(document));

      res.status(202).json({
        jobId,
        matchId,
        videoAssetId,
        processingStatus: "queued",
        statusUrl: `/api/uploads/${encodeURIComponent(matchId)}?organizationId=${encodeURIComponent(organizationId)}`
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/uploads", express.raw({ type: ["video/mp4", "video/quicktime", "application/octet-stream"], limit: config.maxUploadBytes }), async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: "Raw MP4/MOV request body is required." });
      }

      const organizationId = requireString(req.headers["x-playeriq-organization-id"], "x-playeriq-organization-id");
      const playerId = requireString(req.headers["x-playeriq-player-id"], "x-playeriq-player-id");
      const fileName = requireString(req.headers["x-playeriq-file-name"], "x-playeriq-file-name");
      const contentType = String(req.headers["content-type"] || "video/mp4").split(";")[0];
      const validation = validateVideoFile({
        fileName,
        contentType,
        sizeBytes: req.body.length,
        maxUploadBytes: config.maxUploadBytes
      });

      if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
      }

      const matchId = String(req.headers["x-playeriq-match-id"] || `match-${uuidv4()}`);
      const videoAssetId = `video-${uuidv4()}`;
      const jobId = `job-${uuidv4()}`;
      const blobName = `${organizationId}/${matchId}/${videoAssetId}-${validation.fileName}`;

      const document = buildMatchDocument({
        id: matchId,
        organizationId,
        playerId,
        body: {
          teamId: req.headers["x-playeriq-team-id"],
          matchName: req.headers["x-playeriq-match-name"],
          matchType: req.headers["x-playeriq-match-type"],
          opponent: req.headers["x-playeriq-opponent"],
          footageContext: req.headers["x-playeriq-footage-context"],
          evaluationFocus: req.headers["x-playeriq-evaluation-focus"],
          consentAssumption: req.headers["x-playeriq-consent-assumption"]
        },
        videoAssetId,
        blobName,
        uploadStatus: "uploading",
        processingStatus: "uploading",
        jobId
      });

      await services.createMatchDocument(document);
      try {
        await services.uploadVideoBuffer({
          blobName, buffer: req.body, contentType,
          metadata: {
            organizationid: organizationId, playerid: playerId,
            matchid: matchId, videoassetid: videoAssetId
          }
        });
      } catch (error) {
        document.processing.status = "uploadFailed";
        document.videoAsset.uploadStatus = "failed";
        document.updatedAt = new Date().toISOString();
        await services.upsertMatchDocument(document);
        throw error;
      }
      document.videoAsset.uploadStatus = "uploaded";
      document.processing.status = "queued";
      await services.upsertMatchDocument(document);
      await services.sendProcessingMessage(buildProcessingMessage(document));

      res.status(202).json({
        jobId,
        matchId,
        videoAssetId,
        blobName,
        processingStatus: "queued",
        statusUrl: `/api/uploads/${encodeURIComponent(matchId)}?organizationId=${encodeURIComponent(organizationId)}`
      });
    } catch (error) {
      next(error);
    }
  });

  registerHistoryRoutes(app, services);

  app.use((error, _req, res, _next) => {
    const status = error.statusCode || (error.code === 409 ? 409 : 500);
    const message = status >= 500 ? "Unexpected API error." : error.message;
    if (status >= 500) {
      console.error(error);
    }
    res.status(status).json({ error: message });
  });

  return app;
}

function buildMatchDocument({ id, organizationId, playerId, body, videoAssetId, blobName, uploadStatus, processingStatus, jobId }) {
  return {
    id,
    documentType: "matchVideo",
    organizationId,
    teamId: body.teamId || "",
    playerId,
    matchName: body.matchName || "",
    matchType: body.matchType || "test",
    opponent: body.opponent || "",
    footageContext: body.footageContext || "",
    evaluationFocus: body.evaluationFocus || "",
    consentAssumption: body.consentAssumption || "test-data",
    videoAsset: {
      videoAssetId,
      blobContainer: "raw-videos",
      blobName,
      uploadStatus
    },
    processing: {
      jobId: jobId || "",
      status: processingStatus,
      stages: ["uploaded", "quality-check-pending", "cv-pending", "report-pending"]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function buildProcessingMessage(document) {
  return {
    jobId: document.processing.jobId,
    matchId: document.id,
    organizationId: document.organizationId,
    playerId: document.playerId,
    blobContainer: document.videoAsset.blobContainer,
    blobName: document.videoAsset.blobName,
    requestedAt: new Date().toISOString(),
    pipeline: "playeriq-mvp-video-processing"
  };
}
