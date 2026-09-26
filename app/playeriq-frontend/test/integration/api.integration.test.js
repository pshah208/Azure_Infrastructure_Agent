import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { createApp } from "../../../playeriq-api/src/app.js";
import { createRuntimeServices } from "../../../playeriq-api/src/azureClients.js";

// Resolve jose from the API's installed dependencies, not a frontend runtime dependency.
const apiRequire = createRequire(new URL("../../../playeriq-api/package.json", import.meta.url));
const { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } = await import(pathToFileURL(apiRequire.resolve("jose")).href);
const sources = {};
for (const file of ["players.html", "report.js", "auth.js", "players.js"]) {
  sources[file] = await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
}
const tenantId = "11111111-1111-4111-8111-111111111111";
const apiClientId = "22222222-2222-4222-8222-222222222222";
const spaClientId = "33333333-3333-4333-8333-333333333333";
const objectId = "44444444-4444-4444-8444-444444444444";
const strangerId = "55555555-5555-4555-8555-555555555555";
const frontendOrigin = "http://localhost:4187";
const organizationId = "org-integration";
const playerId = "player-integration";
const matchId = "match-integration";
const reviewBody = { organizationId, playerId, reviewer: "Spoofed reviewer", decision: "accepted",
  notes: "Verified the sampled moment.", correctedSummary: "", progress: "not_assessed", useForCoaching: true };

const waitFor = async (predicate, message) => {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe("Frontend + real API with local RS256 verification", () => {
  let server, baseUrl, privateKey;
  const sign = (roles = ["PlayerIQ.Viewer"], claims = {}) => new SignJWT({
    tid: tenantId, oid: objectId, azp: spaClientId, scp: "access_as_user", ver: "2.0",
    sub: "frontend-integration-user", name: "Verified integration coach", roles,
    iss: `https://login.microsoftonline.com/${tenantId}/v2.0`, aud: apiClientId,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300,
    ...claims
  }).setProtectedHeader({ alg: "RS256", kid: "frontend-integration-key" }).sign(privateKey);

  before(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;
    const authenticationKeys = createLocalJWKSet({
      keys: [{ ...await exportJWK(pair.publicKey), alg: "RS256", kid: "frontend-integration-key" }]
    });
    const config = {
      nodeEnv: "test", authEnabled: true, enableMockAzure: true,
      allowOrigin: frontendOrigin, maxUploadBytes: 1000,
      authTenantId: tenantId, authApiClientId: apiClientId, authSpaClientId: spaClientId,
      authMemberships: [{ objectId, organizationId, playerIds: [playerId] }]
    };
    const services = createRuntimeServices(config);
    assert.equal(services.mode, "mock");
    for (const [id, player] of [[matchId, playerId], ["match-forbidden-player", "ungranted-player"]]) {
      await services.createMatchDocument({
        id, documentType: "matchVideo", organizationId, playerId: player,
        matchName: "Real API integration fixture", createdAt: "2026-09-22T12:00:00Z", updatedAt: "2026-09-22T12:00:00Z",
        processing: { status: "completed", jobId: "job-integration" },
        videoAsset: { videoAssetId: "video-integration", sampledFrames: [{
          blobName: `${organizationId}/${id}/video-integration/frame-0.jpg`, timestamp: "00:05"
        }] },
        generatedRecords: {
          observationIds: ["observation-integration"],
          observations: [{ id: "observation-integration", timestampStart: "00:05", description: "Receives with an open body shape." }],
          playerAnalysis: { summary: "Authenticated integration report", strengths: [{ area: "Receiving", details: "Open body shape", evidenceReferences: ["observation-integration"] }] },
          coachReview: { reviewStatus: "approved" }
        }
      });
    }
    server = createServer(createApp({ config, services, authenticationKeys }));
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    if (server) await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  });

  const browser = (t, token, { selectedMatch = matchId, spoofReview = false } = {}) => {
    const query = new URLSearchParams({ apiUrl: baseUrl, organizationId, playerId, matchId: selectedMatch });
    const dom = new JSDOM(sources["players.html"], { url: `${frontendOrigin}/players.html?${query}`, runScripts: "outside-only" });
    const w = dom.window;
    const calls = [], blobs = [], revoked = [];
    w.Headers = Headers;
    w.AbortController = AbortController;
    w.matchMedia = () => ({ matches: false });
    w.URL.createObjectURL = (blob) => { const url = URL.createObjectURL(blob); blobs.push({ url, blob }); return url; };
    w.URL.revokeObjectURL = (url) => { revoked.push(url); URL.revokeObjectURL(url); };
    let closed = false;
    t.after(() => {
      closed = true;
      w.PlayerIQ.releaseAllMedia();
      w.close();
    });
    w.fetch = async (url, options = {}) => {
      assert.equal(new URL(url).origin, baseUrl, "integration must never call a cloud/third-party endpoint");
      const headers = new Headers(options.headers);
      headers.set("Origin", frontendOrigin);
      const call = { url, method: options.method || "GET", authorized: headers.has("Authorization"), originalBody: options.body };
      let body = options.body;
      if (spoofReview && options.method === "POST" && new URL(url).pathname.endsWith("/reviews")) {
        body = JSON.stringify({ ...JSON.parse(body), reviewer: "Injected spoofed reviewer", reviewerIdentityVerified: false, reviewerObjectId: strangerId });
      }
      call.sentBody = body;
      calls.push(call);
      const response = await fetch(url, { ...options, headers, body });
      call.status = response.status;
      call.contentType = response.headers.get("content-type");
      call.corsOrigin = response.headers.get("access-control-allow-origin");
      return response;
    };
    class MsalAcquisitionStub {
      constructor() { this.account = token ? { homeAccountId: `${objectId}.${tenantId}`, localAccountId: objectId, tenantId } : null; }
      async initialize() {}
      async handleRedirectPromise() { return null; }
      getAllAccounts() { return this.account ? [this.account] : []; }
      getActiveAccount() { return this.account; }
      setActiveAccount(account) { this.account = account; }
      addEventCallback() {}
      async acquireTokenSilent(request) {
        assert.deepEqual([...request.scopes], [`api://${apiClientId}/access_as_user`]);
        return { accessToken: token };
      }
      async loginRedirect() { throw new Error("Live sign-in is outside this local integration test."); }
      async logoutRedirect() { this.account = null; }
    }
    w.msal = { PublicClientApplication: MsalAcquisitionStub };
    w.eval(w.document.querySelector("script:not([src])").textContent);
    for (const file of ["report.js", "auth.js", "players.js"]) w.eval(sources[file]);
    return { w, calls, blobs, revoked,
      ready: async (expectImage = true) => {
        await w.PlayerIQAuth.ready;
        if (w.PlayerIQAuth.state.phase === "error") throw new Error(w.PlayerIQAuth.state.message);
        if (expectImage) await waitFor(() => closed || !!w.document.querySelector("#report-panel img")?.src.startsWith("blob:"), "Authenticated frame did not load.");
      } };
  };
  const http = (path, token, options = {}) => fetch(`${baseUrl}${path}`, {
    ...options, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
  });

  it("loads viewer history, report and actual JPEG bytes through bearer-authenticated HTTP", async (t) => {
    const token = await sign();
    const env = browser(t, token);
    await env.ready();
    const d = env.w.document;
    assert.equal(env.w.PlayerIQAuth.state.mode, "entra", "Azure services are mocked; authentication must stay enabled");
    assert.equal(d.querySelectorAll("#match-list button").length, 1);
    assert.match(d.getElementById("report-panel").textContent, /Authenticated integration report/);
    assert.equal(d.getElementById("review-form").hidden, true);
    assert.equal(d.querySelector(".observation .timestamp").textContent, "00:05");
    const image = env.calls.find((call) => call.url.includes("/frames/0"));
    assert.equal(image.status, 200);
    assert.equal(image.authorized, true);
    assert.match(image.contentType, /image\/jpeg/);
    assert.equal(image.corsOrigin, frontendOrigin);
    assert.deepEqual([...new Uint8Array(await env.blobs[0].blob.arrayBuffer())], [255, 216, 255, 217]);
    assert.equal(d.querySelector(".frame-grid a").href, env.blobs[0].url);
    assert.ok(env.calls.filter((call) => !call.url.endsWith("/api/auth/config")).every((call) => call.authorized));
    assert.ok(env.calls.every((call) => !new URL(call.url).searchParams.has("access_token")));
    const denied = await http(`/api/uploads/${matchId}/reviews`, token, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reviewBody)
    });
    assert.equal(denied.status, 403, "server must reject viewer writes even if UI is bypassed");
    await env.w.PlayerIQAuth.signOut();
    assert.ok(env.revoked.includes(env.blobs[0].url));
    assert.equal(d.querySelectorAll("#match-list button").length, 0);
  });

  it("persists coach reviews with server-verified identity despite a spoofed reviewer and survives refresh", async (t) => {
    const token = await sign(["PlayerIQ.Coach"]);
    const env = browser(t, token, { spoofReview: true });
    await env.ready();
    const d = env.w.document;
    assert.equal(d.getElementById("reviewer").readOnly, true);
    d.getElementById("reviewer").value = "Spoofed textbox name";
    d.getElementById("decision").value = "accepted";
    d.getElementById("decision").dispatchEvent(new env.w.Event("change"));
    d.getElementById("notes").value = "Coach verified this local fixture.";
    d.getElementById("progress").value = "improved";
    d.getElementById("use-for-coaching").checked = true;
    await env.w.PlayerIQLibrary.saveReview({ preventDefault() {} });
    const post = env.calls.find((call) => call.method === "POST");
    assert.equal(JSON.parse(post.originalBody).reviewer, "Verified integration coach", "UI uses /me, not editable text");
    assert.equal(JSON.parse(post.sentBody).reviewer, "Injected spoofed reviewer", "test must exercise backend spoof rejection");
    assert.equal(post.status, 201);
    assert.match(d.getElementById("report-panel").textContent, /Entra-verified reviewer identity/);
    const saved = await (await http(`/api/uploads/${matchId}?organizationId=${organizationId}`, token)).json();
    assert.equal(saved.reviews[0].reviewer, "Verified integration coach");
    assert.equal(saved.reviews[0].reviewerIdentityVerified, true);
    assert.equal(saved.reviews[0].reviewerObjectId, objectId);
    assert.equal(saved.reviews[0].reviewerTenantId, tenantId);
    assert.equal(saved.reviews[0].useForCoaching, true);
    const refreshed = browser(t, token);
    await refreshed.ready();
    assert.match(refreshed.w.document.getElementById("report-panel").textContent, /Coach verified this local fixture/);
    assert.match(refreshed.w.document.getElementById("report-panel").textContent, /Self-reported progress: Improved/);
    assert.doesNotMatch(refreshed.w.document.getElementById("report-panel").textContent, /Injected spoofed reviewer|Spoofed textbox name/);
    const preflight = await http(`/api/uploads/${matchId}/reviews`, null, {
      method: "OPTIONS", headers: { Origin: frontendOrigin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), frontendOrigin);
    assert.match(preflight.headers.get("access-control-allow-headers"), /authorization/);
  });

  it("blocks signed-out and expired sessions with real 401 responses", async (t) => {
    const anonymous = browser(t, null);
    await anonymous.ready(false);
    assert.equal(anonymous.w.PlayerIQAuth.state.phase, "signed-out");
    assert.equal(anonymous.calls.length, 1, "signed-out UI may fetch only public auth config");
    for (const path of [`/api/players/${playerId}/matches?organizationId=${organizationId}`, `/api/uploads/${matchId}/frames/0?organizationId=${organizationId}`]) {
      const response = await http(path);
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    const expired = browser(t, await sign(["PlayerIQ.Coach"], { exp: Math.floor(Date.now() / 1000) - 60 }));
    await expired.ready(false);
    assert.equal(expired.calls.find((call) => call.url.endsWith("/api/auth/me")).status, 401);
    assert.equal(expired.w.PlayerIQAuth.state.identity, null);
    assert.equal(expired.w.document.querySelectorAll("#match-list button").length, 0);
    assert.match(expired.w.document.getElementById("auth-status").textContent, /Sign in again/);
  });

  it("clears authorized history after a real forbidden-player response; Admin has no scope bypass", async (t) => {
    const token = await sign(["PlayerIQ.Admin"]);
    const env = browser(t, token, { selectedMatch: "match-forbidden-player" });
    await env.ready(false);
    assert.equal(env.calls.find((call) => call.url.includes("/api/uploads/match-forbidden-player?")).status, 403);
    assert.equal(env.w.PlayerIQAuth.state.phase, "forbidden");
    assert.equal(env.w.document.querySelectorAll("#match-list button").length, 0);
    assert.equal(env.w.document.getElementById("review-form").hidden, true);
    assert.equal(env.blobs.length, 0);
    assert.match(env.w.document.getElementById("auth-status").textContent, /administrator.*membership/);
    const outsider = await sign(["PlayerIQ.Admin"], { oid: strangerId });
    assert.equal((await http("/api/auth/me", outsider)).status, 403);
  });
});
