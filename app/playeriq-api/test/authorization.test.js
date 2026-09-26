import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer } from "node:http";
import { createLocalJWKSet, errors, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createApp } from "../src/app.js";
import { createRuntimeServices } from "../src/azureClients.js";
import { getConfig } from "../src/config.js";

const tenant = "11111111-1111-4111-8111-111111111111";
const audience = "22222222-2222-4222-8222-222222222222";
const spa = "33333333-3333-4333-8333-333333333333";
const user = "44444444-4444-4444-8444-444444444444";
const stranger = "55555555-5555-4555-8555-555555555555";
const config = {
  nodeEnv: "test", enableMockAzure: true, authEnabled: true,
  allowOrigin: "https://frontend.example.test", maxUploadBytes: 1000,
  authTenantId: tenant, authApiClientId: audience, authSpaClientId: spa,
  authMemberships: [
    { objectId: user, organizationId: "org-a", playerIds: ["player-a"] },
    { objectId: user, organizationId: "org-c", playerIds: ["*"] }
  ]
};

describe("Microsoft Entra authentication and server-enforced app RBAC", () => {
  let server, baseUrl, privateKey, otherKey, keys, services;
  const issuer = `https://login.microsoftonline.com/${tenant}/v2.0`;
  const token = (roles = ["PlayerIQ.Viewer"], overrides = {}, key = privateKey) => new SignJWT({
    tid: tenant, oid: user, azp: spa, scp: "access_as_user", ver: "2.0",
    roles, name: "Verified coach", sub: "opaque-subject", iss: issuer, aud: audience,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides
  }).setProtectedHeader({ alg: "RS256", kid: "test-key" }).sign(key);
  const call = async (url, jwt, options = {}) => fetch(`${baseUrl}${url}`, {
    ...options,
    headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), ...options.headers }
  });
  const post = (url, jwt, body) => call(url, jwt, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const report = "/api/uploads/match-a?organizationId=org-a";
  const reviewBody = {
    organizationId: "org-a", playerId: "player-a", reviewer: "Spoofed admin",
    reviewerIdentityVerified: true, reviewerObjectId: stranger,
    decision: "accepted", notes: "Verified the sampled frame.", correctedSummary: "",
    progress: "not_assessed", useForCoaching: true
  };
  before(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;
    otherKey = (await generateKeyPair("RS256")).privateKey;
    keys = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), alg: "RS256", kid: "test-key" }] });
    services = createRuntimeServices(config);
    for (const [org, player, id] of [
      ["org-a", "player-a", "match-a"],
      ["org-a", "player-b", "match-b"],
      ["org-b", "player-a", "match-a"],
      ["org-c", "player-new", "match-c"]
    ]) {
      await services.createMatchDocument({
        id, documentType: "matchVideo", organizationId: org, playerId: player,
        matchName: "Authorized fixture", createdAt: "2026-09-22T12:00:00Z",
        processing: { status: "completed", jobId: "job-a" },
        videoAsset: { videoAssetId: "video-a", sampledFrames: [{ blobName: `${org}/${id}/video-a/frame.jpg` }] },
        generatedRecords: { observations: [], playerAnalysis: { summary: "AI draft" } }
      });
    }
    const app = createApp({ config, services, authenticationKeys: keys });
    app.get("/api/future-data", (_req, res) => res.json({ secret: "must-not-be-exposed" }));
    server = createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => { await new Promise((resolve) => server.close(resolve)); });

  it("exposes only health and public sign-in metadata without an access token", async () => {
    assert.equal((await call("/health")).status, 200);
    const response = await call("/api/auth/config");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      enabled: true, tenantId: tenant, clientId: spa, scope: `api://${audience}/access_as_user`
    });
    for (const url of ["/api/auth/me", report, "/api/players/player-a/matches?organizationId=org-a",
      "/api/uploads/match-a/frames/0?organizationId=org-a", "/api/foundry-agents", "/api/synthetic-test-data"]) {
      const denied = await call(url);
      assert.equal(denied.status, 401, url);
      assert.equal(denied.headers.get("cache-control"), "no-store");
      assert.equal(denied.headers.get("www-authenticate"), "Bearer");
    }
  });

  it("rejects expired, forged, wrong-tenant/audience/client/scope and ID tokens", async () => {
    const invalid = [
      "not.a.jwt",
      await token(undefined, { exp: Math.floor(Date.now() / 1000) - 60 }),
      await token(undefined, {}, otherKey),
      await token(undefined, { tid: stranger }),
      await token(undefined, { aud: stranger }),
      await token(undefined, { iss: "https://attacker.example.test" }),
      await token(undefined, { azp: stranger }),
      await token(undefined, { scp: "User.Read" }),
      await token(undefined, { scp: undefined }),
      await token(undefined, { ver: "1.0" }),
      await token(undefined, { oid: undefined }),
      await token(undefined, { exp: undefined }),
      await token(undefined, { nbf: Math.floor(Date.now() / 1000) + 300 })
    ];
    for (const jwt of invalid) assert.equal((await call(report, jwt)).status, 401);
    assert.equal((await call(report, null, { headers: { "x-ms-client-principal": "spoofed" } })).status, 401);
    assert.equal((await call(`${report}&access_token=${await token()}`)).status, 401);
  });

  it("requires both assigned app roles and explicit server-side memberships", async () => {
    assert.equal((await call(report, await token([]))).status, 403);
    assert.equal((await call(report, await token(["Owner", "Contributor", "PlayerIQ.SuperAdmin"]))).status, 403);
    assert.equal((await call(report, await token(["PlayerIQ.Admin"], { oid: stranger }))).status, 403);
    const response = await call("/api/auth/me", await token(["PlayerIQ.Coach"]));
    const me = await response.json();
    assert.equal(me.name, "Verified coach");
    assert.deepEqual(me.roles, ["PlayerIQ.Coach"]);
    assert.deepEqual(me.permissions, { read: true, upload: true, review: true, admin: false });
    assert.deepEqual(me.memberships, config.authMemberships.map(({ objectId, ...member }) => member));
  });

  it("allows viewers to read only authorized player history, reports and JPEGs", async () => {
    const jwt = await token();
    assert.equal((await call(report, jwt)).status, 200);
    assert.equal((await call("/api/players/player-a/matches?organizationId=org-a", jwt)).status, 200);
    const image = await call("/api/uploads/match-a/frames/0?organizationId=org-a", jwt);
    assert.equal(image.status, 200);
    assert.match(image.headers.get("content-type"), /image\/jpeg/);
    assert.equal(image.headers.get("cache-control"), "no-store");
    assert.equal((await call("/api/players/player-b/matches?organizationId=org-a", jwt)).status, 403);
    assert.equal((await call("/api/uploads/match-b?organizationId=org-a", jwt)).status, 403);
    assert.equal((await call("/api/uploads/match-b/frames/0?organizationId=org-a", jwt)).status, 403);
    assert.equal((await call("/api/uploads/match-a?organizationId=org-b", jwt)).status, 403);
    assert.equal((await call("/api/uploads/match-a/frames/0?organizationId=org-b", jwt)).status, 403);
    assert.equal((await call("/api/uploads/match-c?organizationId=org-c", jwt)).status, 200);
  });

  it("denies viewer writes and coach demo/agent invocation before route handlers", async () => {
    const viewer = await token();
    for (const path of ["/api/uploads", "/api/uploads/initiate", "/api/uploads/complete", "/api/uploads/match-a/reviews"]) {
      assert.equal((await post(path, viewer, {})).status, 403, path);
    }
    const coach = await token(["PlayerIQ.Coach"]);
    for (const path of ["/api/foundry-agents/video-evidence-agent/run", "/api/foundry-agents/synthetic-data",
      "/api/analysis/synthetic", "/api/analysis/video-evidence", "/api/analysis/agent-pipeline"]) {
      assert.equal((await post(path, coach, {})).status, 403, path);
    }
    assert.equal((await call("/api/foundry-agents", coach)).status, 403);
    assert.equal((await call("/api/synthetic-test-data", viewer)).status, 403);
    assert.equal((await call("/api/foundry-agents", await token(["PlayerIQ.Admin"]))).status, 200);
  });

  it("enforces membership on raw and direct upload routes, including admins", async () => {
    for (const role of ["PlayerIQ.Admin", "PlayerIQ.Coach"]) {
      const jwt = await token([role]);
      const raw = await call("/api/uploads", jwt, {
        method: "POST", headers: {
          "Content-Type": "video/mp4", "x-playeriq-organization-id": "org-b",
          "x-playeriq-player-id": "player-a", "x-playeriq-file-name": "video.mp4"
        },
        body: Buffer.alloc(2000)
      });
      assert.equal(raw.status, 403, "scope rejected before oversized upload body is parsed");
      for (const path of ["/api/uploads/initiate", "/api/uploads/complete"]) {
        assert.equal((await post(path, jwt, { organizationId: "org-b", playerId: "player-a" })).status, 403);
        assert.equal((await post(path, jwt, { organizationId: "org-a", playerId: "player-b" })).status, 403);
      }
      assert.equal((await post("/api/uploads/match-a/reviews", jwt, { ...reviewBody, organizationId: "org-b" })).status, 403);
    }
    const jwt = await token(["PlayerIQ.Coach"]);
    const response = await call("/api/uploads", jwt, {
      method: "POST", headers: {
        "Content-Type": "video/mp4", "x-playeriq-organization-id": "org-a",
        "x-playeriq-player-id": "player-a", "x-playeriq-file-name": "clip.mp4",
        "x-playeriq-match-id": "coach-upload"
      }, body: Buffer.from("fixture bytes")
    });
    assert.equal(response.status, 202);
    assert.equal((await services.getMatchDocument("coach-upload", "org-a")).playerId, "player-a");
    const initiated = await post("/api/uploads/initiate", jwt, {
      organizationId: "org-a", playerId: "player-a", fileName: "clip.mp4", contentType: "video/mp4", sizeBytes: 10
    });
    assert.equal(initiated.status, 201);
    const { matchId, videoAssetId, blobName } = await initiated.json();
    assert.equal((await post("/api/uploads/complete", jwt, {
      organizationId: "org-a", playerId: "player-a", matchId, videoAssetId, blobName
    })).status, 202);
  });

  it("derives reviewer identity from verified claims rather than submitted form values", async () => {
    const response = await post("/api/uploads/match-a/reviews", await token(["PlayerIQ.Coach"]), reviewBody);
    assert.equal(response.status, 201);
    const review = await response.json();
    assert.equal(review.reviewer, "Verified coach");
    assert.equal(review.reviewerIdentityVerified, true);
    assert.equal(review.reviewerObjectId, user);
    assert.equal(review.reviewerTenantId, tenant);
    const saved = await (await call(report, await token())).json();
    assert.equal(saved.reviews[0].id, review.id);
  });

  it("denies newly added routes unless an explicit permission policy exists", async () => {
    assert.equal((await call("/api/future-data", await token(["PlayerIQ.Admin"]))).status, 403);
    assert.equal((await call(report, await token(), { method: "DELETE" })).status, 403);
  });

  it("returns an unavailable error, never bypasses authorization, if signing keys cannot be retrieved", async () => {
    const app = createApp({
      config, services,
      authenticationKeys: async () => { throw new errors.JWKSTimeout(); }
    });
    const failed = createServer(app);
    await new Promise((resolve) => failed.listen(0, "127.0.0.1", resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${failed.address().port}${report}`, {
        headers: { Authorization: `Bearer ${await token()}` }
      });
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /temporarily unavailable/);
    } finally { await new Promise((resolve) => failed.close(resolve)); }
  });
});

describe("Fail-closed authentication configuration", () => {
  it("enables authentication by default and requires explicit Entra configuration", () => {
    assert.equal(getConfig({}).authEnabled, true);
    assert.throws(() => createApp({ config: getConfig({}) }), /authTenantId/);
    assert.throws(() => createApp({ config: { ...config, authApiClientId: "" } }), /authApiClientId/);
    assert.throws(() => createApp({ config: { ...config, authSpaClientId: "" } }), /authSpaClientId/);
  });
  it("rejects auth bypass outside explicitly enabled nonproduction mock mode", () => {
    for (const settings of [
      { authEnabled: false, enableMockAzure: false, nodeEnv: "test" },
      { authEnabled: false, enableMockAzure: true, nodeEnv: "production" },
      { authEnabled: false, enableMockAzure: true }
    ]) assert.throws(() => createApp({ config: settings }), /AUTH_ENABLED=false/);
  });
  it("rejects broad origins and malformed authorization configuration", () => {
    assert.throws(() => createApp({ config: { ...config, allowOrigin: "*" } }));
    assert.throws(() => createApp({ config: { ...config, allowOrigin: "https://frontend.example.test/path" } }), /ALLOW_ORIGIN/);
    assert.throws(() => createApp({ config: { ...config, nodeEnv: "production", allowOrigin: "http://localhost:4187" } }), /ALLOW_ORIGIN/);
    for (const authMemberships of [
      {}, [{ objectId: user, organizationId: "*", playerIds: ["*"] }],
      [{ objectId: user, organizationId: "org-a", playerIds: [] }],
      [{ objectId: "email@example.test", organizationId: "org-a", playerIds: ["player-a"] }]
    ]) assert.throws(() => createApp({ config: { ...config, authMemberships } }), /membership|MEMBERSHIPS/i);
    assert.throws(() => getConfig({ AUTH_MEMBERSHIPS_JSON: "{invalid" }), SyntaxError);
  });
});
