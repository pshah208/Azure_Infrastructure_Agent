import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer } from "node:http";
import { createApp } from "../src/app.js";
import { createRuntimeServices } from "../src/azureClients.js";
import { createHistoryStore } from "../src/historyStore.js";

describe("Player history and coach feedback", () => {
  let server, baseUrl, services;
  const config = { enableMockAzure: true, nodeEnv: "test", authEnabled: false, allowOrigin: "*", maxUploadBytes: 1000 };
  before(async () => {
    services = createRuntimeServices(config);
    for (const org of ["org-a", "org-b"]) {
      for (let i = 0; i < 23; i++) {
        await services.createMatchDocument({
          id: `match-${i}`, organizationId: org, playerId: "player-a",
          documentType: "matchVideo", matchName: `${org} clip ${i}`,
          createdAt: new Date(Date.UTC(2026, 8, i + 1)).toISOString(),
          processing: { status: i ? "completed" : "queued", jobId: `job-${i}` },
          videoAsset: {
            videoAssetId: `video-${i}`, blobName: `${org}/match-${i}/source.mp4`,
            sampledFrames: [{ index: 0, blobName: `${org}/match-${i}/video-${i}/frame.jpg`, timestamp: "00:05" }]
          },
          generatedRecords: i ? {
            observationIds: ["obs1"],
            observations: [{ observationId: "obs1", claim: `${org} actual stored evidence` }],
            playerAnalysis: { summary: "Original AI draft" },
            coachReview: { approved: true, reviewStatus: "approved" }
          } : null
        });
      }
    }
    server = createServer(createApp({ config, services }));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => { await new Promise((resolve) => server.close(resolve)); });

  it("requires organization scope and never falls back to cross-partition lookup", async () => {
    assert.equal((await fetch(`${baseUrl}/api/uploads/match-1`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/uploads/match-1?organizationId=unknown`)).status, 404);
    const a = await (await fetch(`${baseUrl}/api/uploads/match-1?organizationId=org-a`)).json();
    const b = await (await fetch(`${baseUrl}/api/uploads/match-1?organizationId=org-b`)).json();
    assert.equal(a.generatedRecords.observations[0].claim, "org-a actual stored evidence");
    assert.equal(b.generatedRecords.observations[0].claim, "org-b actual stored evidence");
  });

  it("paginates one player's uploads, preserving organization and order", async () => {
    const url = `${baseUrl}/api/players/player-a/matches?organizationId=org-a`;
    const first = await (await fetch(url)).json();
    assert.equal(first.matches.length, 20);
    assert.equal(first.matches[0].matchId, "match-22");
    assert.ok(first.matches.every((item) => item.matchName.startsWith("org-a")));
    const second = await (await fetch(`${url}&continuationToken=${first.nextContinuationToken}`)).json();
    assert.equal(second.matches.length, 3);
    assert.equal(second.nextContinuationToken, null);
    assert.equal((await fetch(`${url}&continuationToken=bad`)).status, 400);
    const other = await (await fetch(`${baseUrl}/api/players/unknown/matches?organizationId=org-a`)).json();
    assert.equal(other.matches.length, 0);
  });

  const body = {
    organizationId: "org-a", playerId: "player-a", reviewer: "Trial coach",
    decision: "accepted", notes: "Observed a more open body position.",
    correctedSummary: "Visible positioning only; scanning is not established.",
    progress: "improved", useForCoaching: true
  };
  const review = (base, match = "match-1") => fetch(`${baseUrl}/api/uploads/${match}/reviews`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(base)
  });

  it("persists append-only reviews separately from immutable AI results", async () => {
    const response = await review(body);
    assert.equal(response.status, 201);
    const saved = await response.json();
    assert.equal(saved.reviewerIdentityVerified, false);
    assert.equal(saved.sourceJobId, "job-1");
    const after = await (await fetch(`${baseUrl}/api/uploads/match-1?organizationId=org-a`)).json();
    assert.equal(after.reviews[0].id, saved.id);
    assert.equal(after.generatedRecords.playerAnalysis.summary, "Original AI draft");
    assert.equal(after.reviews[0].progress, "improved");
    assert.equal((await review({ ...body, decision: "rejected", useForCoaching: false })).status, 201);
    const history = await (await fetch(`${baseUrl}/api/uploads/match-1?organizationId=org-a`)).json();
    assert.equal(history.reviews.length, 2);
    const otherOrg = await (await fetch(`${baseUrl}/api/uploads/match-1?organizationId=org-b`)).json();
    assert.equal(otherOrg.reviews.length, 0);
  });

  it("rejects mismatched, unfinished, unconsented, and invalid reviews", async () => {
    assert.equal((await review({ ...body, playerId: "other" })).status, 409);
    assert.equal((await review(body, "match-0")).status, 409);
    assert.equal((await review({ ...body, decision: "rejected" })).status, 400);
    assert.equal((await review({ ...body, useForCoaching: "true" })).status, 400);
    assert.equal((await review({ ...body, notes: "" })).status, 400);
    assert.equal((await review({ ...body, progress: "superstar" })).status, 400);
    assert.equal((await review({ ...body, reviewer: "x".repeat(201) })).status, 400);
  });

  it("serves only frame blobs present in the scoped upload manifest", async () => {
    const url = `${baseUrl}/api/uploads/match-1/frames/0?organizationId=org-a`;
    const image = await fetch(url);
    assert.equal(image.status, 200);
    assert.match(image.headers.get("content-type"), /image\/jpeg/);
    assert.equal(image.headers.get("cache-control"), "no-store");
    assert.equal((await fetch(url.replace("/frames/0", "/frames/99"))).status, 404);
    assert.equal((await fetch(url.replace("/frames/0", "/frames/-1"))).status, 400);
    assert.equal((await fetch(url.replace("org-a", "unknown"))).status, 404);
  });

  it("rejects replacing an existing clip's history with another upload", async () => {
    const response = await fetch(`${baseUrl}/api/uploads`, {
      method: "POST",
      headers: {
        "Content-Type": "video/mp4", "x-playeriq-organization-id": "org-a",
        "x-playeriq-player-id": "player-a", "x-playeriq-match-id": "match-1",
        "x-playeriq-file-name": "other.mp4"
      },
      body: Buffer.from("test")
    });
    assert.equal(response.status, 409);
    assert.equal((await services.getMatchDocument("match-1", "org-a")).generatedRecords.playerAnalysis.summary, "Original AI draft");
  });
});

it("Cosmos history queries use explicit partitions and legacy evidence is filtered by source", async () => {
  const calls = [];
  const store = createHistoryStore({
    config: { matchesContainerName: "matches" },
    database: {
      container(name) {
        return {
          item(id, partition) {
            calls.push({ name, id, partition });
            return { read: async () => ({ resource: { id, documentType: "matchVideo" } }) };
          },
          items: {
            query(query, options) {
              calls.push({ name, query, options });
              return {
                fetchNext: async () => ({ resources: [], continuationToken: "next" }),
                fetchAll: async () => ({ resources: [{ observationId: "keep" }, { observationId: "orphan" }] })
              };
            }
          }
        };
      }
    }
  });
  await store.getMatchDocument("m1", "org");
  const page = await store.listPlayerMatches("org", "p", "prior");
  const observations = await store.getObservations({
    id: "m1", organizationId: "org", videoAsset: { videoAssetId: "v1" },
    generatedRecords: { observationIds: ["keep"] }
  });
  assert.equal(calls[0].partition, "org");
  assert.equal(calls[1].options.partitionKey, "org");
  assert.equal(calls[1].options.continuationToken, "prior");
  assert.equal(page.nextContinuationToken, "next");
  assert.equal(calls[2].options.partitionKey, "m1");
  assert.ok(calls[2].query.parameters.some((p) => p.name === "@video" && p.value === "v1"));
  assert.deepEqual(observations, [{ observationId: "keep" }]);
});
