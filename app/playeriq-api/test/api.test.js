import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer } from "node:http";
import path from "node:path";
import { createApp } from "../src/app.js";

describe("PlayerIQ API", () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createApp({
      config: {
        port: 0,
        nodeEnv: "test",
        authEnabled: false,
        allowOrigin: "*",
        maxUploadBytes: 1024 * 1024,
        syntheticDataPath: path.resolve("../../data/playeriq/synthetic"),
        enableMockAzure: true
      }
    });
    server = createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("returns health", async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "ok");
    assert.equal(body.agentServiceEnabled, true);
  });

  it("returns synthetic data", async () => {
    const response = await fetch(`${baseUrl}/api/synthetic-test-data`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.players[0].playerId, "player-maya-shah-008");
    assert.equal(body.observations.length, 4);
  });

  it("lists PlayerIQ Foundry agent contracts and model bindings", async () => {
    const response = await fetch(`${baseUrl}/api/foundry-agents`);
    assert.equal(response.status, 200);
    const body = await response.json();
    const agentIds = body.agents.map((agent) => agent.agentId);
    assert.ok(agentIds.includes("video-evidence-agent"));
    assert.ok(agentIds.includes("player-analysis-agent"));
    assert.ok(agentIds.includes("synthetic-data-agent"));
    assert.equal(body.agents.some((agent) => agent.systemPrompt), false);
    assert.equal(
      body.agents.find((agent) => agent.agentId === "video-evidence-agent").foundryAgentName,
      "playeriq-video-evidence"
    );
  });

  it("generates candidate observations through the video evidence agent", async () => {
    const response = await fetch(`${baseUrl}/api/analysis/video-evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: "player-maya-shah-008",
        matchId: "match-2026-09-18-u14-blue-lakeside",
        fileName: "uploaded-test.mp4",
        sampledFrameNotes: ["00:42 player receives centrally with pressure arriving from right shoulder"]
      })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.analysisType, "video-evidence-observation-generation");
    assert.equal(body.rawVideoProcessed, false);
    assert.equal(body.evidenceSource, "demo-metadata-and-synthetic-examples");
    assert.equal(body.agentId, "video-evidence-agent");
    assert.ok(body.data.observations.length >= 1);
    assert.ok(body.data.guardrails[0].includes("MVP"));
  });

  it("generates new synthetic data through the synthetic data agent", async () => {
    const response = await fetch(`${baseUrl}/api/foundry-agents/synthetic-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: "U13 winger crossing and recovery run test" })
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.dataType, "playeriq-synthetic-development-record");
    assert.equal(body.agentId, "synthetic-data-agent");
    assert.ok(body.data.player.playerId.startsWith("player-synth-"));
    assert.ok(body.data.observations.length >= 1);
  });

  it("runs the multi-agent analysis pipeline", async () => {
    const response = await fetch(`${baseUrl}/api/analysis/agent-pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: "player-maya-shah-008",
        matchId: "match-2026-09-18-u14-blue-lakeside",
        fileName: "pipeline-test.mp4",
        sampledFrameNotes: ["00:42 player receives centrally after one scan"]
      })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.analysisType, "playeriq-agent-pipeline");
    assert.equal(body.rawVideoProcessed, false);
    assert.ok(body.records.observations.length >= 1);
    assert.equal(body.agents.videoEvidence.agentId, "video-evidence-agent");
    assert.equal(body.agents.playerAnalysis.agentId, "player-analysis-agent");
    assert.equal(body.agents.trainingPlan.agentId, "training-plan-agent");
    assert.equal(body.agents.coachReview.agentId, "coach-review-agent");
  });

  it("generates synthetic player feedback through the Foundry contract", async () => {
    const response = await fetch(`${baseUrl}/api/analysis/synthetic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: "player-maya-shah-008",
        matchId: "match-2026-09-18-u14-blue-lakeside"
      })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.analysisType, "synthetic-player-development");
    assert.equal(body.mode, "mock-foundry");
    assert.ok(body.feedback.summary.includes("Maya"));
    assert.ok(body.feedback.evidence.length >= 1);
  });

  it("creates an upload initiation response for MP4 files", async () => {
    const response = await fetch(`${baseUrl}/api/uploads/initiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "org-northshore-academy",
        playerId: "player-maya-shah-008",
        fileName: "test clip.mp4",
        contentType: "video/mp4",
        sizeBytes: 1234
      })
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.uploadMethod, "PUT");
    assert.ok(body.uploadUrl.includes("test-clip.mp4"));
  });

  it("rejects unsupported upload types", async () => {
    const response = await fetch(`${baseUrl}/api/uploads/initiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "org-northshore-academy",
        playerId: "player-maya-shah-008",
        fileName: "clip.avi",
        contentType: "video/x-msvideo"
      })
    });
    assert.equal(response.status, 400);
  });

  it("completes only a matching initiated direct upload without replacing prior records", async () => {
    const metadata = {
      organizationId: "org-direct-test", playerId: "player-direct",
      fileName: "direct.mp4", contentType: "video/mp4", sizeBytes: 100
    };
    const initiated = await (await fetch(`${baseUrl}/api/uploads/initiate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metadata)
    })).json();
    const complete = (extra = {}) => fetch(`${baseUrl}/api/uploads/complete`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...metadata, ...initiated, ...extra })
    });
    assert.equal((await complete({ playerId: "wrong-player" })).status, 409);
    assert.equal((await complete({ blobName: "someone-elses-video.mp4" })).status, 409);
    const response = await complete();
    assert.equal(response.status, 202);
    const body = await response.json();
    assert.match(body.statusUrl, /organizationId=org-direct-test/);
    assert.equal((await complete()).status, 409);
  });

  it("accepts a raw MP4 upload and queues processing", async () => {
    const response = await fetch(`${baseUrl}/api/uploads`, {
      method: "POST",
      headers: {
        "Content-Type": "video/mp4",
        "x-playeriq-organization-id": "org-northshore-academy",
        "x-playeriq-player-id": "player-maya-shah-008",
        "x-playeriq-file-name": "test-clip.mp4",
        "x-playeriq-match-name": "Synthetic upload test"
      },
      body: Buffer.from("fake mp4 payload for api contract test")
    });
    assert.equal(response.status, 202);
    const body = await response.json();
    assert.equal(body.processingStatus, "queued");
    assert.ok(body.blobName.endsWith("test-clip.mp4"));

    const statusResponse = await fetch(`${baseUrl}${body.statusUrl}`);
    assert.equal(statusResponse.status, 200);
    const statusBody = await statusResponse.json();
    assert.equal(statusBody.processing.status, "queued");
  });
});
