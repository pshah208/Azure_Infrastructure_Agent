(() => {
  const P = window.PlayerIQ;
  const Auth = window.PlayerIQAuth;
  const $ = (id) => document.getElementById(id);
  const storageKey = "playeriq-pending-upload";
  let busy = false;
  let pending = null;
  let authHasLoaded = false;
  const identityKey = () => `${Auth?.state.mode}:${Auth?.state.identity?.tenantId || ""}:${Auth?.state.identity?.objectId || ""}`;
  const uniqueId = () => `match-${crypto.randomUUID ? crypto.randomUUID() : [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  const newId = () => { $("match-id").value = uniqueId(); };
  const context = () => {
    const value = {
      apiUrl: P.apiBase($("api-url").value),
      organizationId: $("organization-id").value.trim(),
      playerId: $("player-id").value.trim()
    };
    if (!value.organizationId || !value.playerId) throw new Error("Organization ID and player ID are required.");
    return value;
  };
  const savePending = () => {
    try {
      if (pending) sessionStorage.setItem(storageKey, JSON.stringify(pending));
      else sessionStorage.removeItem(storageKey);
    } catch { /* Rechecking remains available in this tab if storage is unavailable. */ }
    $("recheck-button").hidden = !pending;
    $("new-upload-button").hidden = !pending;
  };
  const updateLinks = () => {
    try { $("library-link").href = P.historyUrl(context()); }
    catch { $("library-link").href = "players.html"; }
  };
  const showUploadLink = (value) => {
    $("upload-history-link").href = P.historyUrl(value);
    $("upload-history-link").hidden = false;
  };
  const setBusy = (value) => {
    busy = value;
    ["upload-analysis-button", "sample-button", "recheck-button", "new-upload-button", "api-url", "organization-id", "player-id", "match-name", "video-file"].forEach((id) => { $(id).disabled = value; });
    Auth?.applyControls(value);
  };
  const status = (text, error = false) => {
    $("upload-status").textContent = text;
    $("upload-status").className = `form-status${error ? " error" : ""}`;
  };
  const processingLabels = {
    queued: "Waiting for a worker",
    downloading: "Downloading the video asset",
    "quality-check": "Checking video quality",
    "extracting-frames": "Extracting sampled evidence frames",
    "video-evidence": "Video Evidence Agent is inspecting sampled frames",
    "player-analysis": "Building player feedback",
    "training-plan": "Creating training drills",
    "coach-review": "Running an automated AI quality check (not human approval)"
  };
  const waitForProcessing = async (target, attempts = 120, delayMs = 5000) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (!Auth) throw new Error("Authentication support is unavailable.");
      Auth.assert("read", target);
      const payload = await P.request(P.endpoint(target, `/api/uploads/${encodeURIComponent(target.matchId)}`));
      const state = payload.processing?.status;
      if (state === "completed") {
        if (payload.matchId !== target.matchId || payload.organizationId !== target.organizationId || payload.playerId !== target.playerId) {
          throw new Error("The returned report does not match this upload's organization, player and match.");
        }
        P.renderReport($("result-panel"), payload, target);
        status("Report ready. Human review is captured separately in player history.");
        pending = null;
        savePending();
        newId();
        return payload;
      }
      if (state === "failed") throw new Error(`Processing failed: ${payload.processing.lastError || "No error details supplied."} Recheck for updates or start a new upload.`);
      status(`${processingLabels[state] || state || "Status not supplied"} · ${target.matchId}`);
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw new Error("Processing has not completed within this check window. Resume / recheck last upload to continue; do not upload it again.");
  };
  const resume = async () => {
    if (busy || !pending) return;
    setBusy(true);
    showUploadLink(pending);
    try { await waitForProcessing(pending); }
    catch (error) { status(`${error.message} Your last match ID is retained for rechecking.`, true); }
    finally { setBusy(false); }
  };
  const upload = async () => {
    if (busy) return;
    let target;
    try {
      target = context();
      if (!Auth) throw new Error("Authentication support is unavailable.");
      Auth.assert("upload", target);
      const file = $("video-file").files?.[0];
      if (!file) throw new Error("Choose an MP4 or MOV file first.");
      if (!/\.(mp4|mov)$/i.test(file.name)) throw new Error("Choose an MP4 or MOV file.");
      if (pending) throw new Error("A previous upload is still awaiting confirmation. Recheck it or inspect player history before starting another upload.");
      setBusy(true);
      // Generate at submission time, never from a sample or editable match field.
      target.matchId = uniqueId();
      target.identityKey = identityKey();
      $("match-id").value = target.matchId;
      target.matchName = $("match-name").value.trim() || file.name;
      pending = target;
      savePending();
      showUploadLink(target);
      P.releaseMedia($("result-panel"));
      $("result-panel").replaceChildren(P.el("h2", "Processing your clip"), P.el("p", "You can leave this tab open, or use the player library to check the saved upload later."));
      status("Uploading video and queuing analysis…");
      await P.request(`${target.apiUrl}/api/uploads`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "video/mp4",
          "x-playeriq-organization-id": target.organizationId,
          "x-playeriq-player-id": target.playerId,
          "x-playeriq-file-name": file.name,
          "x-playeriq-match-id": target.matchId,
          "x-playeriq-match-name": target.matchName,
          "x-playeriq-footage-context": "MVP frontend upload",
          "x-playeriq-evaluation-focus": "Scanning, first touch, progression, and recovery positioning",
          "x-playeriq-consent-assumption": "test-data"
        },
        body: file
      }, 120000);
      await waitForProcessing(target);
    } catch (error) {
      status(`${error.message}${pending ? " Use Resume / recheck last upload; a network timeout does not mean the upload failed." : ""}`, true);
    } finally { setBusy(false); }
  };
  const sample = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const target = context();
      if (!Auth) throw new Error("Authentication support is unavailable.");
      Auth.assert("admin", target);
      status("Generating a synthetic sample report — no uploaded video is used.");
      const payload = await P.request(`${target.apiUrl}/api/analysis/synthetic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: target.organizationId, playerId: target.playerId, matchId: "match-2026-09-18-u14-blue-lakeside" })
      });
      P.renderReport($("result-panel"), payload, { synthetic: true });
      status("Synthetic sample complete. This is not analysis of the selected video.");
    } catch (error) { status(error.message, true); }
    finally { setBusy(false); }
  };
  let healthSequence = 0;
  const checkHealth = async () => {
    const sequence = ++healthSequence;
    try {
      const payload = await P.request(P.endpoint(context(), "/health"));
      if (sequence === healthSequence) $("health-status").textContent = `API: ${payload.status || "reachable"} · Foundry: ${payload.foundryEnabled ? "enabled" : "not enabled"}`;
    } catch (error) {
      if (sequence === healthSequence) $("health-status").textContent = `API health unavailable: ${error.message}`;
    }
  };
  const query = new URLSearchParams(location.search);
  $("api-url").value = P.defaultApiUrl();
  [["apiUrl", "api-url"], ["organizationId", "organization-id"], ["playerId", "player-id"]].forEach(([key, id]) => {
    if (query.get(key)) $(id).value = query.get(key);
  });
  newId();
  $("demo-form").addEventListener("submit", sample);
  $("upload-analysis-button").addEventListener("click", upload);
  $("recheck-button").addEventListener("click", resume);
  $("new-upload-button").addEventListener("click", () => {
    if (busy) return;
    const previous = pending?.matchId;
    pending = null;
    savePending();
    newId();
    $("video-file").value = "";
    status(`Ready for a different clip. Previous upload ${previous} may still be processing; its history link remains available. This does not cancel it.`);
  });
  ["api-url", "organization-id", "player-id"].forEach((id) => $(id).addEventListener("input", updateLinks));
  updateLinks();
  const clear = () => {
    pending = null;
    if (authHasLoaded) savePending();
    $("recheck-button").hidden = true;
    $("new-upload-button").hidden = true;
    $("upload-history-link").hidden = true;
    $("upload-history-link").removeAttribute("href");
    $("result-panel").replaceChildren(P.el("h2", "Sign in to access match reports"));
    $("video-file").value = "";
    status("");
    $("health-status").textContent = "";
    newId();
  };
  const ready = () => {
    authHasLoaded = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey));
      if (saved?.matchId && saved.identityKey === identityKey() && Auth.can("read", saved)) {
        pending = saved;
        $("match-id").value = saved.matchId;
        showUploadLink(saved);
        status(`Previous upload ${saved.matchId} can be resumed for the current identity.`);
      }
    } catch { /* Invalid or other-identity pending context is never restored. */ }
    savePending();
    updateLinks();
    Auth.applyControls(busy);
    checkHealth();
  };
  if (Auth) Auth.bind({ clear, ready, busy: () => busy });
  else {
    clear();
    ["upload-analysis-button", "sample-button", "recheck-button", "new-upload-button"].forEach((id) => { $(id).disabled = true; });
    status("Authentication support is missing. Build the local auth assets and reload; access is disabled.", true);
  }
  window.PlayerIQUpload = { waitForProcessing, upload, resume };
})();
