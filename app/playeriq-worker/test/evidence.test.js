import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { invokeFoundryAgent } from "../src/foundry.js";
import { createProcessor } from "../src/processor.js";
import { selectLatestEligibleReviews, createFeedbackReader } from "../src/feedback.js";

it("sends the exact extracted image bytes and timestamps to Foundry, not synthetic examples", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "playeriq-evidence-"));
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 42, 0xff, 0xd9]);
  const framePath = path.join(directory, "actual-frame.jpg");
  await writeFile(framePath, bytes);
  try {
    const result = await invokeFoundryAgent({
      credential: { getToken: async (scope) => {
        assert.equal(scope, "https://ai.azure.com/.default");
        return { token: "test-token" };
      } },
      projectEndpoint: "https://example.invalid/projects/test",
      modelDeployment: "vision-model", agentName: "playeriq-video-evidence",
      input: { matchId: "actual-upload" },
      imageFrames: [{ index: 0, timestamp: "00:05", blobName: "actual-frame", filePath: framePath }],
      fetchImpl: async (url, options) => {
        assert.ok(url.endsWith("/openai/v1/responses"));
        const request = JSON.parse(options.body);
        assert.equal(request.agent_reference.name, "playeriq-video-evidence");
        const content = request.input[0].content;
        assert.equal(content[2].image_url, `data:image/jpeg;base64,${bytes.toString("base64")}`);
        assert.match(content[1].text, /00:05/);
        assert.ok(!options.body.includes("syntheticExamples"));
        return { ok: true, json: async () => ({ output: [{ content: [{ type: "output_text", text: '{"observations":[],"insufficientEvidence":true}' }] }] }) };
      }
    });
    assert.equal(result.insufficientEvidence, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("does not mask empty Foundry output as a successful empty object", async () => {
  await assert.rejects(invokeFoundryAgent({
    credential: { getToken: async () => ({ token: "test" }) },
    projectEndpoint: "https://example.invalid", modelDeployment: "test", agentName: "test", input: {},
    fetchImpl: async () => ({ ok: true, json: async () => ({ output: [] }) })
  }), /no output text/);
});

function fixture(evidenceResult, options = {}) {
  const match = {
    id: "m1", organizationId: "org", playerId: "p1",
    videoAsset: { videoAssetId: "v1", blobName: "clip.mp4" },
    processing: { status: "queued", jobId: "j1" }
  };
  const calls = [];
  const processor = createProcessor({
    config: {
      tempRoot: os.tmpdir(), maxVideoDurationSeconds: 120, maxSampleFrames: 8,
      videoEvidenceAgentName: "evidence", playerAnalysisAgentName: "analysis",
      trainingPlanAgentName: "plan", coachReviewAgentName: "review"
    },
    services: {
      getMatch: async () => match, upsertMatch: async () => {},
      downloadRawVideo: async () => {}, uploadThumbnail: async () => "https://example.invalid/frame",
      upsertObservation: async () => {},
      getReviewedContext: options.getReviewedContext || (async () => { throw new Error("No evidence must not load historical feedback."); }),
      invokeAgent: async (name, input) => {
        calls.push(name);
        return name === "evidence" ? evidenceResult : options.invokeAgent(name, input);
      }
    },
    videoTools: {
      probeVideo: async () => ({ durationSeconds: 20 }),
      extractFrames: async () => [{ index: 0, timestamp: "00:10", fileName: "frame.jpg", filePath: "unused" }]
    }
  });
  return { match, calls, run: () => processor({ jobId: "j1", matchId: "m1", organizationId: "org", playerId: "p1", blobName: "clip.mp4" }) };
}

it("completes empty/zero-confidence evidence without inventing drills or approval", async () => {
  for (const evidence of [
    { observations: [] },
    { insufficientEvidence: true },
    { observations: [{ claim: "No identifiable actions", confidence: 0 }] },
    { observations: [{ claim: "Uncited model claim", confidence: 0.9 }] },
    { observations: [{ claim: "Wrong frame cited", confidence: 0.9, evidenceFrameIds: ["another-upload/frame.jpg"] }] }
  ]) {
    const { match, calls, run } = fixture(evidence);
    await run();
    assert.deepEqual(calls, ["evidence"]);
    assert.equal(match.processing.status, "completed");
    assert.deepEqual(match.generatedRecords.trainingPlan.drills, []);
    assert.equal(match.generatedRecords.coachReview.approved, false);
    assert.equal(match.generatedRecords.humanReviewStatus, "pending");
    assert.equal(match.generatedRecords.provenance.insufficientEvidence, true);
    assert.equal(match.videoAsset.sampledFrames.length, 1);
  }
});

it("records malformed agent output as a failure rather than using synthetic fallback", async () => {
  const { match, run } = fixture({ text: "bad schema" });
  await assert.rejects(run(), /observations array/);
  assert.equal(match.processing.status, "failed");
  assert.equal(match.generatedRecords, undefined);
});

it("latest review supersedes earlier acceptance and reuse requires explicit consent", () => {
  const reviews = [
    { id: "old", matchId: "m1", createdAt: "2026-01-01", decision: "accepted", useForCoaching: true, reviewerIdentityVerified: true },
    { id: "revoked", matchId: "m1", createdAt: "2026-01-03", decision: "rejected", useForCoaching: false },
    { id: "private", matchId: "m2", createdAt: "2026-01-02", decision: "accepted", useForCoaching: false },
    { id: "eligible", matchId: "m3", createdAt: "2026-01-02", decision: "accepted", useForCoaching: true, reviewerIdentityVerified: true },
    { id: "legacy", matchId: "m4", createdAt: "2026-01-02", decision: "accepted", useForCoaching: true },
    { id: "unverified", matchId: "m5", createdAt: "2026-01-02", decision: "accepted", useForCoaching: true, reviewerIdentityVerified: false }
  ];
  assert.deepEqual(selectLatestEligibleReviews(reviews).map((r) => r.id), ["eligible"]);
});

it("passes scoped coach context to downstream agents without changing visual evidence", async () => {
  const context = [{ reviewId: "review-previous", notes: "Coach corrected prior positioning", progress: "improved" }];
  const inputs = [];
  const { match, run } = fixture({ observations: [{
    claim: "Player is near touchline", confidence: 0.6, evidenceFrameIds: ["org/m1/v1/frame.jpg"]
  }] }, {
    getReviewedContext: async (org, player, match) => {
      assert.deepEqual([org, player, match], ["org", "p1", "m1"]);
      return context;
    },
    invokeAgent: async (name, input) => {
      inputs.push({ name, input });
      return name === "review" ? { reviewStatus: "needsCoachReview" } : { summary: "Draft" };
    }
  });
  await run();
  assert.deepEqual(inputs[0].input.reviewedContext, context);
  assert.deepEqual(inputs[1].input.reviewedContext, context);
  assert.equal(inputs[1].input.humanApproval, false);
  assert.equal(inputs[1].input.approvedAnalysis, undefined);
  assert.match(inputs[0].input.task, /untrusted historical data/);
  assert.equal(match.generatedRecords.observations[0].claim, "Player is near touchline");
  assert.deepEqual(match.generatedRecords.provenance.feedbackReviewIds, ["review-previous"]);
});

it("blocks training if Player Analysis itself abstains", async () => {
  const { match, calls, run } = fixture({ observations: [{
    claim: "Player visible", confidence: 0.6, evidenceFrameIds: ["org/m1/v1/frame.jpg"]
  }] }, {
    getReviewedContext: async () => [],
    invokeAgent: async () => ({ insufficientEvidence: true, summary: "Cannot identify the target." })
  });
  await run();
  assert.deepEqual(calls, ["evidence", "analysis"]);
  assert.deepEqual(match.generatedRecords.trainingPlan.drills, []);
  assert.equal(match.generatedRecords.provenance.insufficientEvidence, true);
});

it("queries only prior scoped reviews and ignores stale-job feedback", async () => {
  const reader = createFeedbackReader({
    items: { query(query, options) {
      assert.equal(options.partitionKey, "org");
      assert.match(query.query, /c\.matchId != @match/);
      assert.deepEqual(query.parameters.map((p) => p.value), ["org", "p1", "current"]);
      return { fetchAll: async () => ({ resources: [
        { id: "valid-review", matchId: "m1", sourceJobId: "j1", createdAt: "2026-09-01", decision: "accepted", useForCoaching: true, reviewerIdentityVerified: true },
        { id: "stale-review", matchId: "m2", sourceJobId: "old-job", createdAt: "2026-09-02", decision: "accepted", useForCoaching: true, reviewerIdentityVerified: true }
      ] }) };
    } },
    item(id, org) {
      assert.equal(org, "org");
      return { read: async () => ({ resource: {
        documentType: "matchVideo", playerId: "p1", processing: { status: "completed", jobId: id === "m1" ? "j1" : "new-job" }
      } }) };
    }
  });
  const result = await reader("org", "p1", "current");
  assert.deepEqual(result.map((r) => r.reviewId), ["valid-review"]);
  assert.equal(result[0].reviewerIdentityVerified, true);
});
