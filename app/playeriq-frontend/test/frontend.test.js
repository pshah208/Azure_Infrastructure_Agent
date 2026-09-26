import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

const files = {};
for (const file of ["index.html", "players.html", "report.js", "upload.js", "players.js", "report.css", "Dockerfile"]) {
  files[file] = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
}
const context = { apiUrl: "https://api.example.test", organizationId: "org-test", playerId: "player-test" };
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob(["frame"], { type: "image/jpeg" }) });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const fixture = (matchId = "match-one", state = "completed") => ({
  ...context, matchId, matchName: "Weekend match", createdAt: "2026-09-20T12:00:00Z",
  processing: { status: state },
  videoAsset: { sampledFrames: [{ timestampSeconds: 42, blobUrl: "https://private.blob.test/frame.jpg" }] },
  generatedRecords: {
    observationIds: ["obs-one"],
    observations: [{ id: "obs-one", timestampSeconds: 42, description: "Player receives with closed body shape", confidence: 0.72 }],
    playerAnalysis: {
      summary: "Scan before receiving.",
      strengths: [{ area: "Recovery", details: "Recovered a central position", confidence: 0.7, evidenceReferences: ["obs-one"] }],
      improvementAreas: ['{"area":"Scanning","details":"Check over the shoulder","confidence":0.72,"evidenceReferences":["obs-one"]}'],
      evidenceGaps: ["Identity and off-camera action are unverified."]
    },
    trainingPlan: { weeklyFocus: "Scanning", drills: [{ name: "Shoulder-check rondo", durationMinutes: 12, frequency: "3 sessions", steps: ["Look before receiving", "Open body shape"], successCriteria: "Name the free option", evidenceReferences: ["obs-one"] }] },
    coachReview: { reviewStatus: "approved", rationale: "AI consistency check passed" },
    provenance: { source: "uploaded-video-sampled-frames", sampledFrameCount: 1, modelDeployment: "test-model", videoEvidenceAgent: "vision-agent", playerIdentityVerified: false, limitations: ["Sparse frames"], feedbackReviewIds: ["prior-review"] }
  },
  reviews: []
});
const setup = (t, page = "index.html", query = "", fetch = async () => json({ status: "ok" }), origin = "https://frontend.example.test") => {
  const dom = new JSDOM(files[page], { url: `${origin}/${page}${query}`, runScripts: "outside-only" });
  t.after(() => dom.window.close());
  dom.window.matchMedia = () => ({ matches: false });
  dom.window.Headers = Headers;
  dom.window.fetch = (url, options = {}) => fetch(url, { ...options, headers: Object.fromEntries(new Headers(options.headers).entries()) });
  let mediaId = 0;
  dom.window.URL.createObjectURL = () => `blob:https://frontend.example.test/frame-${++mediaId}`;
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.eval(dom.window.document.querySelector("script:not([src])").textContent);
  dom.window.eval(files["report.js"]);
  // Existing report tests deliberately use a local-mock adapter. Production
  // pages load auth.js; missing auth.js never grants access.
  dom.window.PlayerIQAuth = {
    state: { phase: "ready", mode: "local-mock", identity: { name: "Coach Patel", objectId: "mock-object", tenantId: "mock-tenant" } },
    can: () => true, assert() {}, authorize: async () => ({}), getEpoch: () => 0, validateEpoch() {}, handleHttpError() {},
    applyControls() {
      const reviewer = dom.window.document.getElementById("reviewer");
      if (reviewer) { reviewer.readOnly = true; reviewer.value = this.state.identity.name; }
    },
    bind(callbacks) { callbacks.clear(); this.applyControls(); callbacks.ready(); }
  };
  return dom.window;
};
const loadPageScript = (window, file) => window.eval(files[file]);
const formValues = (window) => {
  const d = window.document;
  const url = new URL(window.location.href);
  url.searchParams.set("apiUrl", context.apiUrl);
  window.history.replaceState(null, "", url);
  d.getElementById("api-url").value = context.apiUrl;
  d.getElementById("organization-id").value = context.organizationId;
  d.getElementById("player-id").value = context.playerId;
};
const submitReview = (window, decision = "accepted", coaching = true) => {
  const d = window.document;
  d.getElementById("reviewer").value = "Coach Patel";
  d.getElementById("decision").value = decision;
  d.getElementById("decision").dispatchEvent(new window.Event("change"));
  d.getElementById("use-for-coaching").checked = coaching;
  d.getElementById("notes").value = "Verified the available frame.";
  d.getElementById("progress").value = "improved";
  return window.PlayerIQLibrary.saveReview({ preventDefault() {} });
};

describe("Shared report rendering", () => {
  it("renders screenshot-style objects and JSON strings as readable evidence-linked details", (t) => {
    const w = setup(t);
    const report = w.document.getElementById("result-panel");
    w.PlayerIQ.renderReport(report, fixture(), context);
    assert.match(report.textContent, /Scanning/);
    assert.match(report.textContent, /Check over the shoulder/);
    assert.match(report.textContent, /Confidence/);
    assert.match(report.textContent, /0.72/);
    assert.doesNotMatch(report.textContent, /\[object Object\]|"area":/);
    const link = report.querySelector(".evidence-link");
    assert.ok(w.document.querySelector(link.getAttribute("href")));
    assert.match(report.textContent, /00:42.0/);
    assert.match(report.textContent, /Player receives with closed body shape/);
    assert.match(report.textContent, /Look before receiving/);
    assert.match(report.textContent, /Name the free option/);
    assert.match(report.textContent, /Duration Minutes/);
  });

  it("does not invent coverage or mistake an AI approval for a human review", (t) => {
    const w = setup(t);
    const report = w.document.getElementById("result-panel");
    w.PlayerIQ.renderReport(report, fixture(), context);
    assert.match(report.textContent, /Automated AI quality check — not human approval/);
    assert.match(report.textContent, /approved/);
    assert.match(report.textContent, /Pending human review/);
    assert.doesNotMatch(report.textContent, /100%|Pipeline coverage|Evidence coverage/);
    assert.match(report.textContent, /Player identity is not verified/);
    assert.match(report.textContent, /test-model/);
    assert.match(report.textContent, /prior-review/);
  });

  it("uses a standalone timestampStart for moments and string timestamps for frames", (t) => {
    const w = setup(t);
    const payload = fixture();
    payload.generatedRecords.observations = [{ id: "obs-one", timestampStart: "00:05", description: "Receives the ball" }];
    payload.videoAsset.sampledFrames = [{ timestamp: "00:05" }];
    const report = w.document.getElementById("result-panel");
    w.PlayerIQ.renderReport(report, payload, context);
    assert.equal(report.querySelector(".observation .timestamp").textContent, "00:05");
    assert.equal(report.querySelector(".frame-grid figcaption").textContent, "00:05");
    assert.match(report.querySelector(".frame-grid img").alt, /at 00:05$/);
    assert.doesNotMatch(report.textContent, /Timestamp not supplied/);
    payload.generatedRecords.observations[0].timestampEnd = "00:08";
    w.PlayerIQ.renderReport(report, payload, context);
    assert.equal(report.querySelector(".observation .timestamp").textContent, "00:05 – 00:08");
  });

  it("links drill linkedObservationIds and labels scalar and array model confidence without bullets", (t) => {
    const w = setup(t);
    const payload = fixture();
    const drill = payload.generatedRecords.trainingPlan.drills[0];
    delete drill.evidenceReferences;
    drill.linkedObservationIds = ["obs-one"];
    drill.confidence = [0.6, 0.8];
    payload.generatedRecords.playerAnalysis.confidence = [0.65, 0.75];
    const report = w.document.getElementById("result-panel");
    w.PlayerIQ.renderReport(report, payload, context);
    const fields = [...report.querySelectorAll("dt")];
    const linked = fields.find((node) => node.textContent === "Linked Observation Ids").nextElementSibling.querySelector("a");
    assert.ok(linked);
    assert.equal(w.document.querySelector(linked.getAttribute("href")).classList.contains("observation"), true);
    const confidenceFields = fields.filter((node) => node.textContent === "Model confidence").map((node) => node.nextElementSibling);
    assert.ok(confidenceFields.some((node) => node.textContent === "0.7 (model-reported; not verified accuracy)"));
    assert.ok(confidenceFields.some((node) => node.textContent === "0.6 · 0.8 (model-reported; not verified accuracy)"));
    confidenceFields.forEach((node) => assert.equal(node.querySelector("ul"), null));
    const summaryHeading = [...report.querySelectorAll("h4")].find((node) => node.textContent === "Model confidence");
    assert.equal(summaryHeading.nextElementSibling.textContent, "0.65 · 0.75 (model-reported; not verified accuracy)");
    assert.equal(summaryHeading.nextElementSibling.tagName, "SPAN");
  });

  it("treats all report and review values as text, including nested and JSON-encoded XSS", (t) => {
    const w = setup(t);
    const payload = fixture();
    const attack = '<img src=x onerror="window.hacked=true"><script>window.hacked=true</script>';
    payload.matchName = attack;
    payload.generatedRecords.playerAnalysis.summary = attack;
    payload.generatedRecords.playerAnalysis.improvementAreas = [JSON.stringify({ area: attack, details: { nested: attack }, evidenceReferences: [attack] })];
    payload.reviews = [{ reviewer: attack, decision: "accepted", notes: attack, correctedSummary: attack, progress: "improved", useForCoaching: true }];
    const report = w.document.getElementById("result-panel");
    w.PlayerIQ.renderReport(report, payload, context);
    assert.ok(report.textContent.includes(attack));
    assert.equal(report.querySelector("script, [onerror]"), null);
    assert.equal(w.hacked, undefined);
    assert.equal(report.querySelectorAll("img").length, 1);
    assert.match(report.textContent, /Self-reported progress: Improved/);
    assert.match(report.textContent, /Identity unverified/);
  });

  it("only fetches organization-scoped API images and handles failed thumbnails", async (t) => {
    const imageRequests = [];
    const w = setup(t, "index.html", "", async (url) => { imageRequests.push(url); return json({}); });
    const report = w.document.getElementById("result-panel");
    w.PlayerIQ.renderReport(report, fixture("match / &?"), { ...context, organizationId: "org &?" });
    await tick();
    const image = report.querySelector("img");
    const src = new URL(imageRequests[0]);
    assert.equal(src.origin, context.apiUrl);
    assert.match(src.pathname, /match%20%2F%20%26%3F\/frames\/0$/);
    assert.equal(src.searchParams.get("organizationId"), "org &?");
    assert.equal(image.parentElement.href, image.src);
    assert.match(image.src, /^blob:/);
    assert.doesNotMatch(report.innerHTML, /private\.blob/);
    image.dispatchEvent(new w.Event("error"));
    assert.ok(image.hidden);
    assert.match(report.textContent, /Frame unavailable/);
    w.PlayerIQ.renderReport(report, fixture("queued", "queued"), context);
    assert.equal(report.querySelector("img"), null);
  });

  it("explains legacy missing observations, and labels sample evidence synthetic", (t) => {
    const w = setup(t);
    const payload = fixture();
    delete payload.generatedRecords.observations;
    const report = w.document.getElementById("result-panel");
    w.PlayerIQ.renderReport(report, payload, context);
    assert.match(report.textContent, /older uploads may store IDs only/);
    assert.equal(report.querySelector(".observation"), null);
    w.PlayerIQ.renderReport(report, { feedback: { summary: "Demo", evidence: ["Example moment"], recommendedDrills: ["Rondo"] } }, { synthetic: true });
    assert.match(report.textContent, /SYNTHETIC DEMO/);
    assert.match(report.textContent, /Example moment/);
    assert.match(report.textContent, /Rondo/);
    assert.equal(report.querySelector("img"), null);
  });

  it("orders human feedback by time and requires accepted plus explicit opt-in for reuse", (t) => {
    const w = setup(t);
    const payload = fixture();
    payload.reviews = [
      { id: "a", reviewer: "A", createdAt: "2026-01-01", decision: "accepted", progress: "unchanged", useForCoaching: true, reviewerIdentityVerified: true, reviewerObjectId: "verified-object", reviewerTenantId: "verified-tenant" },
      { id: "b", reviewer: "B", createdAt: "2026-09-01", decision: "needs_changes", progress: "needs_work", useForCoaching: true }
    ];
    const report = w.document.getElementById("result-panel");
    w.PlayerIQ.renderReport(report, payload, context);
    assert.match(report.textContent, /Latest human-submitted decision: Needs changes/);
    assert.match(report.textContent, /Not eligible for coaching reuse/);
    assert.match(report.textContent, /Eligible for coaching reuse/);
    assert.doesNotMatch(report.textContent, /Pending human review/);
    assert.ok(report.textContent.indexOf("Needs changes · B") < report.textContent.indexOf("Accepted · A"));
  });

  it("validates URL schemes and applies a real request deadline", async (t) => {
    const w = setup(t, "index.html", "", () => new Promise(() => {}));
    assert.throws(() => w.PlayerIQ.apiBase("javascript:alert(1)"), /HTTP/);
    assert.throws(() => w.PlayerIQ.apiBase("https://user:pass@example.test"), /HTTP/);
    assert.throws(() => w.PlayerIQ.endpoint({ ...context, organizationId: "" }, "/health"), /Organization/);
    await assert.rejects(w.PlayerIQ.request("https://api.example.test/health", {}, 5), /timed out/);
  });
});

describe("Player history interactions", () => {
  it("loads filtered history, paginates, selects full details and saves an opted-in human review", async (t) => {
    const calls = [];
    const w = setup(t, "players.html", "", async (url, options = {}) => {
      calls.push({ url, options });
      const parsed = new URL(url);
      if (options.method === "POST") return json({ ...JSON.parse(options.body), id: "review-new", createdAt: "2026-09-22T15:00:00Z" }, 201);
      if (parsed.pathname.endsWith("/matches")) {
        const second = parsed.searchParams.has("continuationToken");
        return json({ matches: [fixture(second ? "match-two" : "match-one")], nextContinuationToken: second ? null : "next+/=&" });
      }
      return json(fixture("match-two"));
    });
    formValues(w);
    loadPageScript(w, "players.js");
    await w.PlayerIQLibrary.loadHistory();
    assert.equal(w.document.querySelectorAll("#match-list button").length, 1);
    assert.equal(w.document.getElementById("load-more").hidden, false);
    w.document.getElementById("load-more").click();
    await tick();
    assert.equal(w.document.querySelectorAll("#match-list button").length, 2);
    assert.equal(w.document.getElementById("load-more").hidden, true);
    assert.equal(new URL(calls[1].url).searchParams.get("continuationToken"), "next+/=&");
    w.document.querySelectorAll("#match-list button")[1].click();
    await tick();
    assert.equal(w.document.getElementById("review-form").hidden, false);
    assert.match(w.document.getElementById("report-panel").textContent, /Scanning/);
    await submitReview(w);
    const post = calls.find((call) => call.options.method === "POST");
    const body = JSON.parse(post.options.body);
    assert.equal(body.organizationId, context.organizationId);
    assert.equal(body.playerId, context.playerId);
    assert.equal(body.useForCoaching, true);
    assert.equal(body.progress, "improved");
    assert.match(w.document.getElementById("report-panel").textContent, /Coach Patel/);
    assert.match(w.document.getElementById("report-panel").textContent, /Self-reported progress: Improved/);
    assert.match(w.document.getElementById("review-status").textContent, /saved/);
    calls.filter((call) => call.options.method !== "POST").forEach((call) => {
      assert.equal(new URL(call.url).searchParams.get("organizationId"), context.organizationId);
    });
    assert.equal(new URL(w.location.href).searchParams.get("matchId"), "match-two");
  });

  it("loads context and selected report from the upload handoff query", async (t) => {
    const query = new URLSearchParams({ ...context, matchId: "match-one" });
    const w = setup(t, "players.html", `?${query}`, async (url) => json(new URL(url).pathname.endsWith("/matches")
      ? { matches: [fixture()], nextContinuationToken: null } : fixture()));
    loadPageScript(w, "players.js");
    await tick();
    assert.equal(w.document.getElementById("organization-id").value, context.organizationId);
    assert.match(w.document.getElementById("report-panel").textContent, /Weekend match/);
    assert.equal(w.document.getElementById("review-form").hidden, false);
  });

  it("prevents duplicate saves and never sends reuse for a non-accepted decision", async (t) => {
    let release;
    let posts = 0;
    const w = setup(t, "players.html", "", async (url, options = {}) => {
      if (options.method === "POST") {
        posts++;
        const body = JSON.parse(options.body);
        assert.equal(body.useForCoaching, false);
        await new Promise((resolve) => { release = resolve; });
        return json({ ...body, id: "review-a", createdAt: "2026-09-22" }, 201);
      }
      return json(new URL(url).pathname.endsWith("/matches") ? { matches: [fixture()], nextContinuationToken: null } : fixture());
    });
    formValues(w);
    loadPageScript(w, "players.js");
    await w.PlayerIQLibrary.loadHistory();
    await w.PlayerIQLibrary.loadDetail("match-one");
    const saving = submitReview(w, "needs_changes", true);
    await submitReview(w, "needs_changes", true);
    assert.equal(posts, 1);
    assert.equal(w.document.getElementById("review-fields").disabled, true);
    release();
    await saving;
    assert.equal(w.document.getElementById("review-fields").disabled, false);
  });

  it("retains feedback on an uncertain save, blocks duplicates until a successful recheck", async (t) => {
    let posts = 0;
    const w = setup(t, "players.html", "", async (url, options = {}) => {
      if (options.method === "POST") { posts++; throw new Error("Network disconnected"); }
      return json(new URL(url).pathname.endsWith("/matches") ? { matches: [fixture()], nextContinuationToken: null } : fixture());
    });
    formValues(w);
    loadPageScript(w, "players.js");
    await w.PlayerIQLibrary.loadHistory();
    await w.PlayerIQLibrary.loadDetail("match-one");
    await submitReview(w);
    await submitReview(w);
    assert.equal(posts, 1);
    assert.match(w.document.getElementById("review-status").textContent, /Recheck selected report/);
    assert.equal(w.document.getElementById("reviewer").value, "Coach Patel");
    await w.PlayerIQLibrary.loadDetail("match-one");
    assert.equal(w.document.getElementById("review-fields").disabled, false);
    assert.match(w.document.getElementById("review-status").textContent, /history refreshed/);
  });

  it("blocks reviews for incomplete and mismatched records and reports API errors explicitly", async (t) => {
    let mode = "queued";
    let posts = 0;
    const w = setup(t, "players.html", "", async (url, options = {}) => {
      if (options.method === "POST") posts++;
      if (mode === "error") return json({ error: "History is unavailable" }, 503);
      if (new URL(url).pathname.endsWith("/matches")) return json({ matches: [fixture()], nextContinuationToken: null });
      const report = fixture("match-one", "queued");
      if (mode === "mismatch") report.organizationId = "another-org";
      return json(report);
    });
    formValues(w);
    loadPageScript(w, "players.js");
    await w.PlayerIQLibrary.loadHistory();
    await w.PlayerIQLibrary.loadDetail("match-one");
    assert.equal(w.document.getElementById("review-form").hidden, true);
    await submitReview(w);
    assert.equal(posts, 0);
    mode = "mismatch";
    await w.PlayerIQLibrary.loadDetail("match-one");
    assert.match(w.document.getElementById("detail-status").textContent, /does not match/);
    assert.doesNotMatch(w.document.getElementById("report-panel").textContent, /Scanning/);
    mode = "error";
    await w.PlayerIQLibrary.loadHistory();
    assert.match(w.document.getElementById("history-status").textContent, /History is unavailable/);
  });

  it("keeps selected review context stable even if filter fields are edited", async (t) => {
    let body;
    const w = setup(t, "players.html", "", async (url, options = {}) => {
      if (options.method === "POST") { body = JSON.parse(options.body); return json({ ...body, id: "r" }, 201); }
      return json(new URL(url).pathname.endsWith("/matches") ? { matches: [fixture()], nextContinuationToken: null } : fixture());
    });
    formValues(w);
    loadPageScript(w, "players.js");
    await w.PlayerIQLibrary.loadHistory();
    await w.PlayerIQLibrary.loadDetail("match-one");
    w.document.getElementById("organization-id").value = "edited-but-not-loaded";
    await submitReview(w);
    assert.equal(body.organizationId, context.organizationId);
  });

  it("requires nonempty reviewer and notes before submitting feedback", async (t) => {
    let posts = 0;
    const w = setup(t, "players.html", "", async (url, options = {}) => {
      if (options.method === "POST") posts++;
      return json(new URL(url).pathname.endsWith("/matches") ? { matches: [fixture()], nextContinuationToken: null } : fixture());
    });
    formValues(w);
    loadPageScript(w, "players.js");
    await w.PlayerIQLibrary.loadHistory();
    await w.PlayerIQLibrary.loadDetail("match-one");
    const d = w.document;
    d.getElementById("decision").value = "accepted";
    d.getElementById("reviewer").value = "Coach";
    d.getElementById("notes").value = "   ";
    await w.PlayerIQLibrary.saveReview({ preventDefault() {} });
    assert.equal(posts, 0);
    assert.match(d.getElementById("review-status").textContent, /nonempty review notes/);
    assert.equal(d.getElementById("notes").required, true);
    d.getElementById("notes").value = "Checked available evidence";
    d.getElementById("reviewer").value = "   ";
    w.PlayerIQAuth.state.identity.name = "   ";
    await w.PlayerIQLibrary.saveReview({ preventDefault() {} });
    assert.equal(posts, 0);
  });
});

describe("Upload flow", () => {
  it("uses unique IDs, organization headers and blocks concurrent upload submissions", async (t) => {
    let release;
    const uploads = [];
    const gets = [];
    const w = setup(t, "index.html", "", async (url, options = {}) => {
      if (options.method === "POST") {
        uploads.push(options.headers);
        await new Promise((resolve) => { release = resolve; });
        return json({ matchId: options.headers["x-playeriq-match-id"], statusUrl: `/api/uploads/${options.headers["x-playeriq-match-id"]}?organizationId=${encodeURIComponent(context.organizationId)}` }, 202);
      }
      gets.push(url);
      if (new URL(url).pathname === "/health") return json({ status: "ok" });
      return json(fixture(decodeURIComponent(new URL(url).pathname.split("/").pop())));
    });
    formValues(w);
    const input = w.document.getElementById("video-file");
    Object.defineProperty(input, "files", { value: [new w.File(["video"], "match.mp4", { type: "video/mp4" })], configurable: true });
    loadPageScript(w, "upload.js");
    const first = w.PlayerIQUpload.upload();
    await w.PlayerIQUpload.upload();
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0]["x-playeriq-organization-id"], context.organizationId);
    assert.match(uploads[0]["x-playeriq-match-id"], /^match-[a-f0-9-]{36}$/);
    release();
    await first;
    assert.match(w.document.getElementById("result-panel").textContent, /Match development report/);
    const link = new URL(w.document.getElementById("upload-history-link").href);
    assert.equal(link.pathname, "/players.html");
    assert.equal(link.searchParams.get("organizationId"), context.organizationId);
    const second = w.PlayerIQUpload.upload();
    await tick();
    release();
    await second;
    assert.notEqual(uploads[0]["x-playeriq-match-id"], uploads[1]["x-playeriq-match-id"]);
    gets.forEach((url) => {
      assert.equal(new URL(url).searchParams.get("organizationId"), context.organizationId);
      assert.equal(new URL(url).searchParams.getAll("organizationId").length, 1);
      assert.equal((url.match(/\?/g) || []).length, 1);
    });
  });

  it("retains an uncertain upload across reload and rechecks without re-uploading", async (t) => {
    let posts = 0;
    const w = setup(t, "index.html", "", async (url, options = {}) => {
      if (options.method === "POST") { posts++; throw new Error("Request timed out"); }
      return json({ status: "ok" });
    });
    formValues(w);
    Object.defineProperty(w.document.getElementById("video-file"), "files", { value: [new w.File(["v"], "match.mov")] });
    loadPageScript(w, "upload.js");
    await w.PlayerIQUpload.upload();
    const saved = w.sessionStorage.getItem("playeriq-pending-upload");
    assert.ok(saved);
    assert.equal(w.document.getElementById("recheck-button").hidden, false);
    await w.PlayerIQUpload.upload();
    assert.equal(posts, 1);
    const target = JSON.parse(saved);
    const next = setup(t, "index.html", "", async (url, options = {}) => {
      assert.notEqual(options.method, "POST");
      return json(new URL(url).pathname === "/health" ? { status: "ok" } : fixture(target.matchId));
    });
    next.sessionStorage.setItem("playeriq-pending-upload", saved);
    loadPageScript(next, "upload.js");
    await next.PlayerIQUpload.resume();
    assert.match(next.document.getElementById("result-panel").textContent, /Scan before receiving/);
    assert.equal(next.sessionStorage.getItem("playeriq-pending-upload"), null);
  });

  it("times out a polling window, then resumes queued processing to completion", async (t) => {
    let completed = false;
    const w = setup(t, "index.html", "", async (url) => json(new URL(url).pathname === "/health"
      ? { status: "ok" } : fixture("match-one", completed ? "completed" : "queued")));
    formValues(w);
    loadPageScript(w, "upload.js");
    const target = { ...context, matchId: "match-one" };
    await assert.rejects(w.PlayerIQUpload.waitForProcessing(target, 1, 0), /Resume \/ recheck/);
    completed = true;
    await w.PlayerIQUpload.waitForProcessing(target, 1, 0);
    assert.match(w.document.getElementById("upload-status").textContent, /Report ready/);
  });

  it("keeps the synthetic sample action distinct from the upload workflow", async (t) => {
    let body;
    const w = setup(t, "index.html", "", async (url, options = {}) => {
      if (options.method === "POST") {
        assert.equal(new URL(url).pathname, "/api/analysis/synthetic");
        body = JSON.parse(options.body);
        return json({ feedback: { summary: "Synthetic feedback" } });
      }
      return json({ status: "ok" });
    });
    formValues(w);
    loadPageScript(w, "upload.js");
    w.document.getElementById("demo-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
    await tick();
    assert.equal(body.organizationId, context.organizationId);
    assert.match(w.document.getElementById("result-panel").textContent, /SYNTHETIC DEMO/);
  });
});

describe("Static assets and theme", () => {
  it("defaults both pages to dark even when the browser prefers light", (t) => {
    for (const page of ["index.html", "players.html"]) {
      assert.equal(setup(t, page).document.documentElement.dataset.theme, "dark");
      assert.equal(setup(t, page, "?scoutTheme=light").document.documentElement.dataset.theme, "light");
    }
  });

  it("uses shared local/hosted API defaults on both pages with explicit query overrides", async (t) => {
    const hostedApi = "https://ca-api-playeriq-dev-eus2-002.salmonpebble-a4005584.eastus2.azurecontainerapps.io";
    const override = "http://127.0.0.1:9090";
    const cases = [
      { origin: "http://localhost:4187", expected: "http://localhost:8080" },
      { origin: "http://127.0.0.1:4187", expected: "http://localhost:8080" },
      { origin: "http://[::1]:4187", expected: "http://localhost:8080" },
      { origin: "https://frontend.example.test", expected: hostedApi },
      { origin: "http://localhost:4187", expected: override, query: `?apiUrl=${encodeURIComponent(override)}` },
      { origin: "http://127.0.0.1:4187", expected: override, query: `?apiUrl=${encodeURIComponent(override)}` }
    ];
    for (const page of ["index.html", "players.html"]) {
      for (const scenario of cases) {
        const w = setup(t, page, scenario.query || "", async () => json({ status: "ok" }), scenario.origin);
        loadPageScript(w, page === "index.html" ? "upload.js" : "players.js");
        assert.equal(w.document.getElementById("api-url").value, scenario.expected, `${page} at ${scenario.origin}${scenario.query || ""}`);
      }
    }
    await tick();
  });

  it("applies the Clawpilot theme and packages every external runtime asset", (t) => {
    for (const page of ["index.html", "players.html"]) {
      const w = setup(t, page, "?scoutTheme=dark");
      assert.equal(w.document.documentElement.dataset.theme, "dark");
      assert.match(files[page], /--cp-bg:/);
      for (const script of w.document.querySelectorAll("script[src]")) assert.ok(files.Dockerfile.includes(script.getAttribute("src")));
      for (const link of w.document.querySelectorAll("link[rel=stylesheet]")) assert.ok(files.Dockerfile.includes(link.getAttribute("href")));
      assert.ok(files.Dockerfile.includes(page));
    }
    assert.doesNotMatch(files["report.css"], /#[a-f0-9]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});
