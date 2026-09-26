import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createProcessor } from "../src/processor.js";
import { calculateSampleTimestamps, formatTimestamp } from "../src/video.js";

describe("PlayerIQ video worker", () => {
  it("calculates bounded, evenly spaced sample timestamps", () => {
    assert.deepEqual(calculateSampleTimestamps(60, 3), [15, 30, 45]);
    assert.equal(calculateSampleTimestamps(5, 8).length, 1);
    assert.equal(formatTimestamp(75), "01:15");
  });

  it("processes a queued video through all four Foundry agents", async () => {
    const match = {
      id: "match-001",
      organizationId: "org-001",
      playerId: "player-001",
      matchName: "Synthetic worker test",
      teamId: "team-001",
      videoAsset: {
        videoAssetId: "video-001",
        blobName: "org-001/match-001/video.mp4"
      },
      processing: {
        jobId: "job-001",
        status: "queued",
        stages: ["uploaded"]
      }
    };
    const calls = [];
    const observations = [];
    const services = {
      async getMatch() {
        return match;
      },
      async upsertMatch(document) {
        return document;
      },
      async downloadRawVideo() {},
      async uploadThumbnail(blobName) {
        return `https://example.invalid/${blobName}`;
      },
      async upsertObservation(document) {
        observations.push(document);
      },
      async getReviewedContext() {
        return [{ reviewId: "review-001", notes: "Coach reports better positioning." }];
      },
      async invokeAgent(agentName) {
        calls.push(agentName);
        if (agentName === "playeriq-video-evidence") {
          return {
            observations: [
              {
                observationId: "obs-001",
                timestampStart: "00:15",
                timestampEnd: "00:17",
                eventType: "Reception",
                claim: "Player received centrally after scanning.",
                coachingImplication: "Continue scanning before receiving.",
                confidence: 0.82,
                evidenceFrameIds: ["org-001/match-001/video-001/frame-001.jpg"]
              }
            ]
          };
        }
        if (agentName === "playeriq-coach-review") {
          return { approved: true, reviewStatus: "approved" };
        }
        return { summary: `${agentName} output` };
      }
    };
    const videoTools = {
      async probeVideo() {
        return { durationSeconds: 30, width: 1280, height: 720, codec: "h264" };
      },
      async extractFrames({ outputDirectory }) {
        return [
          {
            index: 0,
            fileName: "frame-001.jpg",
            filePath: `${outputDirectory}\\frame-001.jpg`,
            timestampSeconds: 15,
            timestamp: "00:15"
          }
        ];
      }
    };
    const processor = createProcessor({
      config: {
        tempRoot: process.env.TEMP,
        maxVideoDurationSeconds: 600,
        maxSampleFrames: 4,
        foundryModelDeploymentName: "gpt-4-1-mini-playeriq-coach",
        videoEvidenceAgentName: "playeriq-video-evidence",
        playerAnalysisAgentName: "playeriq-player-analysis",
        trainingPlanAgentName: "playeriq-training-plan",
        coachReviewAgentName: "playeriq-coach-review"
      },
      services,
      videoTools
    });

    const result = await processor({
      jobId: "job-001",
      matchId: "match-001",
      organizationId: "org-001",
      playerId: "player-001",
      blobName: "org-001/match-001/video.mp4"
    });

    assert.equal(result.status, "completed");
    assert.deepEqual(calls, [
      "playeriq-video-evidence",
      "playeriq-player-analysis",
      "playeriq-training-plan",
      "playeriq-coach-review"
    ]);
    assert.equal(observations.length, 1);
    assert.equal(match.processing.status, "completed");
    assert.equal(match.generatedRecords.coachReview.reviewStatus, "approved");
    assert.equal(match.generatedRecords.humanReviewStatus, "pending");
    assert.equal(match.generatedRecords.provenance.source, "uploaded-video-sampled-frames");
    assert.equal(match.generatedRecords.provenance.playerIdentityVerified, false);
    assert.deepEqual(match.generatedRecords.provenance.feedbackReviewIds, ["review-001"]);
    assert.equal(match.generatedRecords.observations[0].observationId, "job-001-obs-1");
  });

  it("does not reprocess a completed job", async () => {
    const services = {
      async getMatch() {
        return {
          id: "match-001",
          playerId: "player-001",
          videoAsset: { blobName: "video.mp4" },
          processing: { jobId: "job-001", status: "completed" }
        };
      }
    };
    const processor = createProcessor({
      config: {},
      services,
      videoTools: {}
    });
    const result = await processor({
      jobId: "job-001",
      matchId: "match-001",
      organizationId: "org-001",
      playerId: "player-001",
      blobName: "video.mp4"
    });
    assert.equal(result.status, "already-completed");
  });
});
