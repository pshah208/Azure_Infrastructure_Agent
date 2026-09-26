import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

const sources = {};
for (const file of ["index.html", "players.html", "report.js", "auth.js", "upload.js", "players.js", "Dockerfile", "nginx.conf", "build.mjs"]) {
  sources[file] = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
}
const tenantId = "11111111-1111-1111-1111-111111111111";
const objectId = "22222222-2222-2222-2222-222222222222";
const clientId = "33333333-3333-3333-3333-333333333333";
const apiClientId = "44444444-4444-4444-4444-444444444444";
const authConfig = { enabled: true, tenantId, clientId, scope: `api://${apiClientId}/access_as_user` };
const apiUrl = "https://ca-api-playeriq-dev-eus2-002.salmonpebble-a4005584.eastus2.azurecontainerapps.io";
const scope = { apiUrl, organizationId: "org-member", playerId: "player-member" };
const identity = (role = "PlayerIQ.Coach") => ({
  objectId, tenantId, name: "Verified Coach",
  roles: [role],
  permissions: { read: true, upload: role !== "PlayerIQ.Viewer", review: role !== "PlayerIQ.Viewer", admin: role === "PlayerIQ.Admin" },
  memberships: [{ organizationId: scope.organizationId, playerIds: [scope.playerId] }]
});
const detail = () => ({
  matchId: "match-one", organizationId: scope.organizationId, playerId: scope.playerId, matchName: "Private match",
  processing: { status: "completed" }, videoAsset: { sampledFrames: [{ timestamp: "00:05" }] },
  generatedRecords: { playerAnalysis: { summary: "Private coaching report" }, observations: [] }, reviews: []
});
const json = (body, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => body,
  blob: async () => new Blob(["jpeg"], { type: "image/jpeg" }) });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const create = (t, options = {}) => {
  const page = options.page || "index.html";
  const origin = options.origin || "https://frontend.example.test";
  const query = new URLSearchParams({ apiUrl: options.apiUrl || apiUrl, organizationId: scope.organizationId, ...options.query });
  const dom = new JSDOM(sources[page], { url: `${origin}/${page}?${query}`, runScripts: "outside-only" });
  const w = dom.window;
  t.after(() => { w.PlayerIQ?.releaseAllMedia(); w.close(); });
  w.matchMedia = () => ({ matches: false });
  w.Headers = Headers;
  const calls = [], acquired = [], created = [], revoked = [];
  w.URL.createObjectURL = (blob) => { const url = `blob:${origin}/frame-${created.length}`; created.push({ url, blob }); return url; };
  w.URL.revokeObjectURL = (url) => revoked.push(url);
  let app;
  class InteractionRequiredAuthError extends Error { constructor() { super("interaction_required"); this.errorCode = "interaction_required"; } }
  class FakeMsal {
    constructor(configuration) {
      app = this;
      this.configuration = configuration;
      this.active = options.signedOut ? null : { homeAccountId: `${objectId}.${tenantId}`, localAccountId: objectId, tenantId };
      this.callbacks = [];
      this.logins = [];
      this.logouts = [];
    }
    async initialize() { this.initialized = true; }
    async handleRedirectPromise() { assert.equal(this.initialized, true); return null; }
    getAllAccounts() { return this.active ? [this.active] : []; }
    getActiveAccount() { return this.active; }
    setActiveAccount(value) { this.active = value; this.callbacks.forEach((callback) => callback({})); }
    addEventCallback(callback) { this.callbacks.push(callback); }
    async acquireTokenSilent(request) {
      acquired.push(request);
      if (this.silentError) throw this.silentError;
      if (this.silentWait) return new Promise(() => {});
      return { accessToken: "test-access-token-not-for-urls" };
    }
    async loginRedirect(request) { this.logins.push(request); }
    async logoutRedirect(request) { this.logouts.push(request); }
  }
  if (!options.missingMsal) w.msal = { PublicClientApplication: FakeMsal, InteractionRequiredAuthError };
  w.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (options.fetch) {
      const result = await options.fetch(url, init);
      if (result !== undefined) return result;
    }
    const path = new URL(url).pathname;
    if (path === "/api/auth/config") return json(options.config || authConfig);
    if (path === "/api/auth/me") return json(options.identity || identity(), options.meStatus || 200);
    if (path === "/health") return json({ status: "ok" });
    if (path.endsWith("/matches")) return json({ matches: [detail()], nextContinuationToken: null });
    if (path.endsWith("/reviews")) return json({ ...JSON.parse(init.body), id: "review-one", reviewerIdentityVerified: true, reviewerObjectId: objectId, reviewerTenantId: tenantId }, 201);
    if (/\/frames\/\d+$/.test(path)) return json({});
    return json(detail());
  };
  w.eval(w.document.querySelector("script:not([src])").textContent);
  w.eval(sources["report.js"]);
  if (!options.missingAuth) w.eval(sources["auth.js"]);
  const start = () => w.eval(sources[page === "index.html" ? "upload.js" : "players.js"]);
  if (options.start !== false) start();
  return { w, calls, acquired, created, revoked, get app() { return app; }, start,
    settled: async () => { await w.PlayerIQAuth?.ready; await tick(); } };
};

describe("MSAL configuration and fail-closed startup", () => {
  it("rejects malicious hosted query and textbox origins before config fetch or token acquisition", async (t) => {
    for (const override of ["https://attacker.example", "http://localhost:8080", "https://127.0.0.1:8080",
      `${apiUrl}.attacker.example`, "https://user:secret@attacker.example"]) {
      const env = create(t, { apiUrl: override });
      await env.settled();
      assert.equal(env.calls.length, 0, override);
      assert.equal(env.acquired.length, 0, override);
      assert.equal(env.app, undefined, override);
      assert.equal(env.w.PlayerIQAuth.state.phase, "error");
      assert.equal(env.w.document.getElementById("api-url").value, override);
      assert.equal(env.w.document.getElementById("upload-analysis-button").disabled, true);
      assert.match(env.w.document.getElementById("auth-status").textContent, /Untrusted API origin|without credentials/);
    }
    const env = create(t);
    await env.settled();
    const calls = env.calls.length, tokens = env.acquired.length;
    env.w.document.getElementById("api-url").value = "https://attacker.example";
    env.w.document.getElementById("api-url").dispatchEvent(new env.w.Event("input"));
    await env.w.PlayerIQAuth.initialize("https://attacker.example");
    assert.equal(env.calls.length, calls);
    assert.equal(env.acquired.length, tokens);
    assert.equal(env.w.PlayerIQAuth.state.identity, null);
  });

  it("permits only local-to-local overrides or the packaged production origin", async (t) => {
    const local = create(t, { origin: "http://localhost:4187", apiUrl: "http://127.0.0.1:9090", config: { enabled: false } });
    await local.settled();
    assert.equal(local.w.PlayerIQAuth.state.phase, "ready");
    assert.equal(local.calls[0].url, "http://127.0.0.1:9090/api/auth/config");
    const attacker = create(t, { origin: "http://localhost:4187", apiUrl: "https://attacker.example" });
    await attacker.settled();
    assert.equal(attacker.calls.length, 0);
    assert.equal(attacker.w.PlayerIQAuth.state.phase, "error");
  });

  it("rejects redirected config and identity responses rather than trusting their data", async (t) => {
    for (const path of ["/api/auth/config", "/api/auth/me"]) {
      const env = create(t, { fetch: (url) => new URL(url).pathname === path
        ? { ...json(path.endsWith("config") ? authConfig : identity()), redirected: true, url: "https://attacker.example/response" } : undefined });
      await env.settled();
      assert.equal(env.w.PlayerIQAuth.state.phase, "error");
      assert.match(env.w.document.getElementById("auth-status").textContent, /redirected authentication response/);
      assert.ok(env.calls.every((call) => call.init.redirect === "error"));
      assert.equal(env.calls.some((call) => call.url.includes("attacker.example")), false);
    }
  });

  it("waits for config, token, identity and membership before automatically loading history", async (t) => {
    let release;
    const env = create(t, { page: "players.html", query: { playerId: scope.playerId, matchId: "match-one" },
      fetch: (url) => new URL(url).pathname === "/api/auth/config" ? new Promise((resolve) => { release = () => resolve(json(authConfig)); }) : undefined });
    assert.equal(env.w.document.getElementById("load-history").disabled, true);
    assert.equal(env.calls.length, 1);
    assert.equal(env.calls[0].url.endsWith("/api/auth/config"), true);
    release();
    await env.settled();
    assert.equal(env.w.PlayerIQAuth.state.phase, "ready");
    assert.ok(env.calls.find((call) => call.url.includes("/matches?")));
    const me = env.calls.find((call) => call.url.endsWith("/api/auth/me"));
    assert.equal(me.init.headers.Authorization, "Bearer test-access-token-not-for-urls");
    assert.equal(env.app.configuration.auth.authority, `https://login.microsoftonline.com/${tenantId}`);
    assert.equal(env.app.configuration.cache.cacheLocation, "sessionStorage");
    assert.equal(env.app.configuration.auth.redirectUri, "https://frontend.example.test/players.html");
    assert.match(env.w.document.getElementById("auth-identity").textContent, /Verified Coach.*PlayerIQ.Coach/);
  });

  it("shows explicit redirect sign-in when signed out and never starts protected reads", async (t) => {
    const env = create(t, { page: "players.html", signedOut: true, query: { playerId: scope.playerId } });
    await env.settled();
    assert.equal(env.w.PlayerIQAuth.state.phase, "signed-out");
    assert.equal(env.calls.some((call) => !call.url.endsWith("/api/auth/config")), false);
    assert.equal(env.w.document.getElementById("auth-signin").hidden, false);
    await env.w.PlayerIQAuth.signIn();
    assert.equal(env.app.logins.length, 1);
    assert.equal(env.app.logins[0].scopes[0], authConfig.scope);
    assert.equal(env.app.logins[0].prompt, "select_account");
    assert.doesNotMatch(env.w.sessionStorage.getItem("playeriq-auth-return"), /test-access-token/);
  });

  it("rejects invalid tenant/client/scope configuration and missing MSAL without protected requests", async (t) => {
    for (const invalid of [
      { ...authConfig, tenantId: "common" },
      { ...authConfig, clientId: "not-a-guid" },
      { ...authConfig, scope: "https://evil.example/scope" },
      { ...authConfig, scope: `api://${apiClientId}/.default` },
      { enabled: null }
    ]) {
      const env = create(t, { config: invalid });
      await env.settled();
      assert.equal(env.w.PlayerIQAuth.state.phase, "error");
      assert.equal(env.calls.length, 1);
      assert.equal(env.w.document.getElementById("upload-analysis-button").disabled, true);
    }
    const missing = create(t, { missingMsal: true });
    await missing.settled();
    assert.match(missing.w.document.getElementById("auth-status").textContent, /MSAL bundle is missing/);
  });

  it("does not grant access when auth.js is missing", async (t) => {
    const env = create(t, { missingAuth: true });
    await env.settled();
    assert.equal(env.calls.length, 0);
    assert.equal(env.w.document.getElementById("upload-analysis-button").disabled, true);
    await assert.rejects(env.w.PlayerIQ.request(`${apiUrl}/api/uploads/match-one?organizationId=org-member`), /Authentication support is unavailable/);
  });

  it("establishes visibly unverified local-mock permissions without /me only after loopback config opts in", async (t) => {
    const local = create(t, { origin: "http://localhost:4187", apiUrl: "http://127.0.0.1:8080", config: { enabled: false }, missingMsal: true });
    await local.settled();
    assert.equal(local.w.PlayerIQAuth.state.mode, "local-mock");
    assert.equal(local.w.PlayerIQAuth.state.phase, "ready");
    assert.match(local.w.document.getElementById("auth-identity").textContent, /identity is not verified/);
    assert.equal(local.calls.some((call) => call.url.endsWith("/api/auth/me")), false);
    assert.equal(local.w.PlayerIQAuth.can("admin"), true);
    assert.equal(local.w.PlayerIQAuth.can("upload"), true);
    assert.equal(local.w.PlayerIQAuth.can("review"), true);
    assert.equal(local.w.document.getElementById("organization-id").readOnly, false);
    assert.equal(local.w.document.getElementById("player-id").readOnly, false);
    local.w.document.getElementById("organization-id").value = "org-another-local-fixture";
    local.w.document.getElementById("organization-id").dispatchEvent(new local.w.Event("change"));
    assert.equal(local.w.PlayerIQAuth.can("read", { apiUrl: "http://127.0.0.1:8080", organizationId: "org-another-local-fixture", playerId: "any-local-player" }), true);
    assert.equal(local.w.PlayerIQAuth.can("read", { apiUrl: "http://127.0.0.1:8080", organizationId: "unselected-org", playerId: "any-local-player" }), false);
    assert.ok(local.calls.every((call) => !new Headers(call.init.headers).has("Authorization")));
    const hosted = create(t, { config: { enabled: false } });
    await hosted.settled();
    assert.equal(hosted.w.PlayerIQAuth.state.phase, "error");
    assert.match(hosted.w.document.getElementById("auth-status").textContent, /only allowed.*loopback/);
    const remoteApi = create(t, { origin: "http://localhost:4187", config: { enabled: false } });
    await remoteApi.settled();
    assert.equal(remoteApi.w.PlayerIQAuth.state.phase, "error");
    assert.equal(remoteApi.calls.some((call) => call.url.endsWith("/api/auth/me")), false);
  });

  it("fails closed for missing memberships, mismatched identity, and /me 403", async (t) => {
    for (const options of [
      { identity: { ...identity(), memberships: [] } },
      { identity: { ...identity(), objectId: clientId } },
      { meStatus: 403 }
    ]) {
      const env = create(t, options);
      await env.settled();
      assert.notEqual(env.w.PlayerIQAuth.state.phase, "ready");
      assert.equal(env.w.document.getElementById("upload-analysis-button").disabled, true);
      assert.equal(env.calls.some((call) => call.url.includes("/matches?")), false);
    }
  });
});

describe("Roles, membership and token transport", () => {
  it("treats an Entra wildcard membership as all players in only its granted organization", async (t) => {
    const env = create(t, { identity: {
      ...identity("PlayerIQ.Admin"), memberships: [{ organizationId: scope.organizationId, playerIds: ["*"] }]
    } });
    await env.settled();
    assert.equal(env.w.PlayerIQAuth.can("review", { ...scope, playerId: "another-player" }), true);
    assert.equal(env.w.PlayerIQAuth.can("admin", { ...scope, organizationId: "ungranted-org" }), false);
    assert.equal(env.w.document.getElementById("player-id").readOnly, false);
    assert.equal(env.w.document.getElementById("organization-id").readOnly, true);
  });

  it("gates Admin, Coach and Viewer affordances and never grants Admin a membership bypass", async (t) => {
    for (const role of ["PlayerIQ.Admin", "PlayerIQ.Coach", "PlayerIQ.Viewer"]) {
      const env = create(t, { identity: identity(role) });
      await env.settled();
      const d = env.w.document;
      assert.equal(d.getElementById("upload-analysis-button").disabled, role === "PlayerIQ.Viewer");
      assert.equal(d.getElementById("sample-button").hidden, role !== "PlayerIQ.Admin");
      assert.equal(d.getElementById("organization-id").value, scope.organizationId);
      assert.equal(d.getElementById("organization-id").readOnly, true);
      assert.equal(d.getElementById("player-id").value, scope.playerId);
      assert.equal(d.getElementById("player-id").readOnly, true);
      assert.equal(env.w.PlayerIQAuth.can("read", { ...scope, playerId: "someone-else" }), false);
      assert.equal(env.w.PlayerIQAuth.can("read", { ...scope, organizationId: "another-org" }), false);
      assert.equal(env.w.PlayerIQAuth.can("review", scope), role !== "PlayerIQ.Viewer");
    }
    const viewer = create(t, { page: "players.html", identity: identity("PlayerIQ.Viewer"), query: { playerId: scope.playerId, matchId: "match-one" } });
    await viewer.settled();
    assert.equal(viewer.w.document.getElementById("review-form").hidden, true);
    assert.match(viewer.w.document.getElementById("report-panel").textContent, /Private coaching report/);
  });

  it("restricts tokens to the configured origin, acquires silently, and forbids redirects/token URLs", async (t) => {
    const env = create(t);
    await env.settled();
    const before = env.acquired.length;
    await env.w.PlayerIQ.request(`${apiUrl}/api/uploads/match-one?organizationId=org-member`);
    assert.equal(env.acquired.length, before + 1);
    const request = env.calls.at(-1);
    assert.equal(new Headers(request.init.headers).get("Authorization"), "Bearer test-access-token-not-for-urls");
    assert.equal(request.init.redirect, "error");
    assert.equal(request.init.credentials, "omit");
    assert.equal(request.init.referrerPolicy, "no-referrer");
    const count = env.calls.length;
    await assert.rejects(env.w.PlayerIQ.request("https://evil.example/api/uploads/match-one?organizationId=org-member"), /Untrusted API origin/);
    await assert.rejects(env.w.PlayerIQ.request(`${apiUrl}/api/uploads/match-one?organizationId=another-org`), /membership/);
    assert.equal(env.calls.length, count);
    assert.ok(env.calls.every((call) => !call.url.includes("test-access-token")));
    assert.ok(env.acquired.every((request) => request.scopes[0] === authConfig.scope));
  });

  it("rejects resolved cross-origin or redirected data/media responses and never follows their URLs", async (t) => {
    const env = create(t, { fetch: (url) => url.includes("/frames/") || url.includes("/api/redirected")
      ? { ...json({}), redirected: false, url: "https://attacker.example/content" } : undefined });
    await env.settled();
    await assert.rejects(env.w.PlayerIQ.request(`${apiUrl}/api/redirected?organizationId=org-member`), /redirected API response/);
    const panel = env.w.document.getElementById("result-panel");
    env.w.PlayerIQ.renderReport(panel, detail(), scope);
    await tick();
    assert.equal(env.created.length, 0);
    assert.match(panel.textContent, /Frame unavailable: Blocked redirected API response/);
    assert.ok(env.calls.every((call) => new URL(call.url).origin === apiUrl));
  });

  it("fails closed on expired sessions without automatic interaction loops", async (t) => {
    const env = create(t);
    await env.settled();
    env.w.PlayerIQ.renderReport(env.w.document.getElementById("result-panel"), detail(), scope);
    await tick();
    env.app.silentError = new env.w.msal.InteractionRequiredAuthError();
    await assert.rejects(env.w.PlayerIQ.request(`${apiUrl}/api/uploads/match-one?organizationId=org-member`), /Sign in with Microsoft/);
    assert.equal(env.w.PlayerIQAuth.state.phase, "interaction-required");
    assert.doesNotMatch(env.w.document.getElementById("result-panel").textContent, /Private coaching report/);
    assert.equal(env.app.logins.length, 0);
    const attempts = env.acquired.length;
    await assert.rejects(env.w.PlayerIQ.request(`${apiUrl}/api/uploads/match-one?organizationId=org-member`), /Sign in/);
    assert.equal(env.acquired.length, attempts);
  });

  it("bounds silent token acquisition and reports a retryable error instead of hanging", async (t) => {
    const env = create(t);
    await env.settled();
    const setTimeout = env.w.setTimeout.bind(env.w);
    env.w.setTimeout = (callback) => setTimeout(callback, 5);
    env.app.silentWait = true;
    await assert.rejects(env.w.PlayerIQ.request(`${apiUrl}/api/uploads/match-one?organizationId=org-member`), /Token acquisition timed out/);
    assert.equal(env.w.PlayerIQAuth.state.phase, "interaction-required");
    assert.equal(env.app.logins.length, 0);
  });

  it("clears previous data on API and active-account changes", async (t) => {
    const env = create(t, { page: "players.html", query: { playerId: scope.playerId, matchId: "match-one" } });
    await env.settled();
    const d = env.w.document;
    assert.match(d.getElementById("report-panel").textContent, /Private coaching report/);
    env.app.setActiveAccount({ homeAccountId: "different-account", tenantId, localAccountId: clientId });
    assert.equal(env.w.PlayerIQAuth.state.phase, "signed-out");
    assert.equal(d.querySelectorAll("#match-list button").length, 0);
    assert.equal(d.getElementById("review-form").hidden, true);
    assert.doesNotMatch(d.getElementById("report-panel").textContent, /Private coaching report/);
    await env.w.PlayerIQAuth.initialize(apiUrl);
    await tick();
    d.getElementById("api-url").value = "https://other.example.test";
    d.getElementById("api-url").dispatchEvent(new env.w.Event("input"));
    assert.equal(env.w.PlayerIQAuth.state.identity, null);
    assert.equal(d.querySelectorAll("#match-list button").length, 0);
    assert.match(d.getElementById("auth-status").textContent, /API URL changed/);
  });

  it("renders actionable 401/403 errors and discards prior-access responses", async (t) => {
    let status = 200;
    const env = create(t, { fetch: (url) => new URL(url).pathname === "/api/guarded" ? json({ error: "Denied" }, status) : undefined });
    await env.settled();
    status = 401;
    await assert.rejects(env.w.PlayerIQ.request(`${apiUrl}/api/guarded?organizationId=org-member`), /Sign in again/);
    assert.equal(env.w.PlayerIQAuth.state.identity, null);
    await env.w.PlayerIQAuth.initialize(apiUrl);
    status = 403;
    await assert.rejects(env.w.PlayerIQ.request(`${apiUrl}/api/guarded?organizationId=org-member`), /administrator.*membership/);
    assert.equal(env.w.PlayerIQAuth.state.phase, "forbidden");
  });
});

describe("Authenticated media and verified reviews", () => {
  it("revokes the selected report's frame URLs when history is reloaded", async (t) => {
    const env = create(t, { page: "players.html", query: { playerId: scope.playerId, matchId: "match-one" } });
    await env.settled();
    assert.equal(env.created.length, 1);
    await env.w.PlayerIQLibrary.loadHistory();
    assert.ok(env.revoked.includes(env.created[0].url));
    assert.equal(env.w.document.querySelector("#report-panel img"), null);
  });

  it("loads protected media as token-free object URLs, revoking on rerender and signout", async (t) => {
    const env = create(t);
    await env.settled();
    const panel = env.w.document.getElementById("result-panel");
    env.w.PlayerIQ.renderReport(panel, detail(), scope);
    await tick();
    const imageRequest = env.calls.find((call) => call.url.includes("/frames/0"));
    assert.equal(new Headers(imageRequest.init.headers).get("Authorization"), "Bearer test-access-token-not-for-urls");
    assert.equal(new URL(imageRequest.url).searchParams.get("organizationId"), scope.organizationId);
    assert.match(panel.querySelector("img").src, /^blob:/);
    assert.equal(panel.querySelector(".frame-grid a").href, panel.querySelector("img").src);
    assert.doesNotMatch(panel.innerHTML, /test-access-token|href="https:\/\/api/);
    const first = env.created[0].url;
    env.w.PlayerIQ.renderReport(panel, { ...detail(), videoAsset: {} }, scope);
    assert.ok(env.revoked.includes(first));
    env.w.PlayerIQ.renderReport(panel, detail(), scope);
    await tick();
    await env.w.PlayerIQAuth.signOut();
    assert.equal(env.app.logouts.length, 1);
    assert.ok(env.created.every((item) => env.revoked.includes(item.url)));
    assert.doesNotMatch(panel.textContent, /Private coaching report/);
  });

  it("discards media finishing after signout without creating new object URLs", async (t) => {
    let release;
    const env = create(t, { fetch: (url) => url.includes("/frames/") ? new Promise((resolve) => { release = () => resolve(json({})); }) : undefined });
    await env.settled();
    env.w.PlayerIQ.renderReport(env.w.document.getElementById("result-panel"), detail(), scope);
    await tick();
    await env.w.PlayerIQAuth.signOut();
    release();
    await tick();
    assert.equal(env.created.length, 0);
  });

  it("uses the read-only verified identity for reviews, preserving legacy/unverified badges", async (t) => {
    const env = create(t, { page: "players.html", query: { playerId: scope.playerId, matchId: "match-one" } });
    await env.settled();
    const d = env.w.document;
    assert.equal(d.getElementById("reviewer").readOnly, true);
    assert.equal(d.getElementById("reviewer").value, "Verified Coach");
    d.getElementById("reviewer").value = "Forged name";
    d.getElementById("decision").value = "accepted";
    d.getElementById("notes").value = "Verified available evidence.";
    await env.w.PlayerIQLibrary.saveReview({ preventDefault() {} });
    const post = env.calls.find((call) => call.init.method === "POST");
    assert.equal(JSON.parse(post.init.body).reviewer, "Verified Coach");
    assert.match(d.getElementById("report-panel").textContent, /Entra-verified reviewer identity/);
    const payload = detail();
    payload.reviews = [{ reviewer: "Old self-entered name", decision: "accepted" }];
    env.w.PlayerIQ.renderReport(d.getElementById("report-panel"), payload, scope);
    assert.match(d.getElementById("report-panel").textContent, /Identity unverified \(legacy or local mock\)/);
  });

  it("does not label accepted opted-in legacy or local-mock reviews eligible for future reuse", async (t) => {
    const env = create(t);
    await env.settled();
    const panel = env.w.document.getElementById("result-panel");
    for (const verification of [undefined, false]) {
      const payload = detail();
      payload.videoAsset = {};
      payload.reviews = [{ reviewer: "Legacy name", decision: "accepted", useForCoaching: true,
        reviewerIdentityVerified: verification, reviewerObjectId: objectId, reviewerTenantId: tenantId }];
      env.w.PlayerIQ.renderReport(panel, payload, scope);
      assert.match(panel.textContent, /Not eligible for coaching reuse: requires a verified reviewer/);
      assert.doesNotMatch(panel.textContent, /Eligible for coaching reuse:/);
    }
  });

  it("packages local MSAL without a CDN and keeps missing assets as 404", async () => {
    const bundle = await readFile(new URL("../vendor/msal-browser.min.js", import.meta.url), "utf8");
    assert.ok(bundle.length > 100000);
    assert.match(sources.Dockerfile, /npm ci --omit=dev/);
    assert.match(sources.Dockerfile, /COPY --from=vendor/);
    assert.match(sources["nginx.conf"], /try_files \$uri =404/);
    for (const page of ["index.html", "players.html"]) {
      assert.match(sources[page], /src="vendor\/msal-browser.min.js"/);
      assert.match(sources[page], /src="auth.js"/);
      assert.doesNotMatch(sources[page], /<script[^>]+src="https?:/);
    }
  });
});
