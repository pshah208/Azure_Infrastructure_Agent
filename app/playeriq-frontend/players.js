(() => {
  const P = window.PlayerIQ;
  const Auth = window.PlayerIQAuth;
  const $ = (id) => document.getElementById(id);
  let active = null;
  let selected = null;
  let detail = null;
  let nextToken = null;
  let busy = false;
  let uncertainReview = false;
  let matches = [];
  const setBusy = (value) => {
    busy = value;
    ["load-history", "load-more", "refresh-detail", "api-url", "organization-id", "player-id"].forEach((id) => { $(id).disabled = value; });
    $("match-list").querySelectorAll("button").forEach((button) => { button.disabled = value; });
    $("review-fields").disabled = value || uncertainReview;
    Auth?.applyControls(value);
  };
  const message = (id, text, error = false) => {
    $(id).textContent = text;
    $(id).className = `form-status${error ? " error" : ""}`;
  };
  const readContext = () => {
    const value = { apiUrl: P.apiBase($("api-url").value), organizationId: $("organization-id").value.trim(), playerId: $("player-id").value.trim() };
    if (!value.organizationId || !value.playerId) throw new Error("Organization ID and player ID are required.");
    return value;
  };
  const syncUrl = () => {
    const url = new URL(P.historyUrl({ ...active, matchId: selected }));
    history.replaceState(null, "", url);
    const upload = new URL("index.html", location.href);
    ["apiUrl", "organizationId", "playerId", "scoutTheme"].forEach((key) => {
      if (url.searchParams.has(key)) upload.searchParams.set(key, url.searchParams.get(key));
    });
    $("new-analysis-link").href = upload.href;
  };
  const renderList = () => {
    $("match-list").replaceChildren();
    matches.forEach((match) => {
      const li = P.el("li");
      const button = P.el("button");
      button.type = "button";
      button.setAttribute("aria-current", String(match.matchId === selected));
      button.append(P.el("strong", match.matchName || match.matchId));
      button.append(P.el("small", match.matchId));
      button.append(P.el("small", `Created: ${P.date(match.createdAt)}`));
      button.append(P.el("small", `Updated: ${P.date(match.updatedAt)}`));
      button.append(P.el("small", `Processing: ${P.label(match.processing?.status || "unknown")}`));
      const count = match.reviewSummary?.count ?? match.reviewSummary?.reviewCount;
      button.append(P.el("small", count > 0
        ? `${count} human-submitted review(s) · identities unverified`
        : "Open report to inspect human review history"));
      button.addEventListener("click", () => loadDetail(match.matchId));
      button.disabled = busy;
      li.append(button);
      $("match-list").append(li);
    });
    $("load-more").hidden = !nextToken;
  };
  const showDetail = () => {
    if (!detail) return;
    P.renderReport($("report-panel"), detail, active);
    const complete = detail.processing?.status === "completed";
    $("review-form").hidden = !complete || !Auth?.can("review", active);
    $("review-target").textContent = `Feedback for ${detail.matchName || detail.matchId} · ${detail.matchId} · ${active.playerId} · ${active.organizationId}`;
    message("detail-status", complete
      ? "Completed report. AI checks and human-submitted reviews are shown separately."
      : `Processing: ${detail.processing?.status || "unknown"}. ${detail.processing?.lastError || "Use Recheck selected report for updates."} Reviews are available only after completion.`,
    detail.processing?.status === "failed");
  };
  const fetchDetail = async (matchId) => {
    Auth.assert("read", active);
    const payload = await P.request(P.endpoint(active, `/api/uploads/${encodeURIComponent(matchId)}`));
    if (payload.matchId !== matchId || payload.playerId !== active.playerId || payload.organizationId !== active.organizationId) {
      throw new Error("The report does not match the selected organization, player and match. It has not been displayed.");
    }
    detail = payload;
    uncertainReview = false;
    showDetail();
    return payload;
  };
  const loadDetail = async (matchId) => {
    if (busy || !active) return;
    if (!Auth?.can("read", active)) {
      message("detail-status", "Sign in with read permission and matching membership first.", true);
      return;
    }
    const changed = selected !== matchId;
    selected = matchId;
    detail = null;
    $("review-form").hidden = true;
    if (changed) {
      $("review-form").reset();
      $("use-for-coaching").disabled = true;
      message("review-status", "");
    }
    $("refresh-detail").hidden = false;
    P.releaseMedia($("report-panel"));
    $("report-panel").replaceChildren(P.el("p", "Retrieving full report…"));
    setBusy(true);
    renderList();
    syncUrl();
    message("detail-status", "Loading report…");
    try {
      const wasUncertain = uncertainReview;
      await fetchDetail(matchId);
      if (wasUncertain) message("review-status", "Review history refreshed. Check whether your previous feedback is present before saving again.");
    } catch (error) {
      message("detail-status", `${error.message} Use Recheck selected report to retry.`, true);
      $("report-panel").replaceChildren(P.el("p", "Report could not be retrieved. No review can be saved until it is loaded."));
    } finally { setBusy(false); }
  };
  const loadHistory = async (append = false, initialMatch = null) => {
    if (busy) return;
    let targetMatch = null;
    try {
      if (!append) {
        active = readContext();
        if (!Auth) throw new Error("Authentication support is unavailable.");
        Auth.assert("read", active);
        matches = [];
        nextToken = null;
        selected = null;
        detail = null;
        uncertainReview = false;
        $("review-form").hidden = true;
        $("refresh-detail").hidden = true;
        $("review-form").reset();
        $("use-for-coaching").disabled = true;
        message("review-status", "");
        message("detail-status", "");
        P.releaseMedia($("report-panel"));
        $("report-panel").replaceChildren(P.el("h2", "Select a match"));
        syncUrl();
        renderList();
      }
      if (!active || (append && !nextToken)) return;
      setBusy(true);
      message("history-status", append ? "Loading more uploads…" : "Loading player history…");
      const payload = await P.request(P.endpoint(active, `/api/players/${encodeURIComponent(active.playerId)}/matches`, { continuationToken: append ? nextToken : null }));
      if (!Array.isArray(payload.matches)) throw new Error("API returned an invalid match list.");
      const ids = new Set(matches.map((match) => match.matchId));
      payload.matches.forEach((match) => {
        if (match.matchId && match.playerId === active.playerId && !ids.has(match.matchId)) {
          matches.push(match);
          ids.add(match.matchId);
        }
      });
      const oldToken = nextToken;
      nextToken = typeof payload.nextContinuationToken === "string" && payload.nextContinuationToken ? payload.nextContinuationToken : null;
      if (append && nextToken === oldToken) throw new Error("The API repeated its pagination token. Reload history to continue.");
      renderList();
      message("history-status", matches.length ? `${matches.length} upload(s) loaded${nextToken ? " · more available" : " · end of history"}.` : "No uploads found for this organization and player.");
      targetMatch = initialMatch;
    } catch (error) { message("history-status", error.message, true); }
    finally { setBusy(false); }
    if (targetMatch) await loadDetail(targetMatch);
  };
  const saveReview = async (event) => {
    event.preventDefault();
    if (busy || uncertainReview || !detail || detail.processing?.status !== "completed") return;
    if (!Auth?.can("review", active)) {
      message("review-status", "Review permission and matching membership are required.", true);
      return;
    }
    const reviewer = Auth.state.identity?.name?.trim();
    const decision = $("decision").value;
    const notes = $("notes").value.trim();
    if (!reviewer || !notes || !["accepted", "needs_changes", "rejected"].includes(decision)) {
      message("review-status", "Enter a reviewer name, add nonempty review notes, and choose a decision.", true);
      return;
    }
    const body = {
      organizationId: active.organizationId,
      playerId: active.playerId,
      reviewer,
      decision,
      notes,
      correctedSummary: $("corrected-summary").value.trim(),
      progress: $("progress").value,
      useForCoaching: decision === "accepted" && $("use-for-coaching").checked
    };
    setBusy(true);
    message("review-status", "Saving human-submitted feedback…");
    try {
      const review = await P.request(`${active.apiUrl}/api/uploads/${encodeURIComponent(selected)}/reviews`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      if (!review.id) throw new Error("Save response did not include a review ID.");
      detail.reviews = [...(detail.reviews || []).filter((item) => item.id !== review.id), review];
      showDetail();
      $("review-form").reset();
      $("use-for-coaching").disabled = true;
      Auth.applyControls(true);
      const match = matches.find((item) => item.matchId === selected);
      if (match) match.reviewSummary = { count: detail.reviews.length };
      renderList();
      message("review-status", "Human feedback saved. Progress is self-reported. Future coaching reuse requires a verified Entra reviewer, an accepted decision and explicit opt-in; no model training occurs.");
    } catch (error) {
      uncertainReview = true;
      message("review-status", `${error.message} Save outcome may be uncertain. Recheck selected report and inspect review history before saving again to avoid duplicate feedback.`, true);
    } finally { setBusy(false); }
  };
  $("filter-form").addEventListener("submit", (event) => { event.preventDefault(); loadHistory(); });
  $("load-more").addEventListener("click", () => loadHistory(true));
  $("refresh-detail").addEventListener("click", () => loadDetail(selected));
  $("review-form").addEventListener("submit", saveReview);
  $("decision").addEventListener("change", () => {
    const accepted = $("decision").value === "accepted";
    $("use-for-coaching").disabled = !accepted;
    if (!accepted) $("use-for-coaching").checked = false;
  });
  const query = new URLSearchParams(location.search);
  $("api-url").value = P.defaultApiUrl();
  [["apiUrl", "api-url"], ["organizationId", "organization-id"], ["playerId", "player-id"]].forEach(([key, id]) => {
    if (query.get(key)) $(id).value = query.get(key);
  });
  const clear = () => {
    active = null;
    selected = null;
    detail = null;
    matches = [];
    nextToken = null;
    uncertainReview = false;
    $("match-list").replaceChildren();
    $("load-more").hidden = true;
    $("refresh-detail").hidden = true;
    $("review-form").hidden = true;
    $("review-form").reset();
    $("reviewer").value = "";
    $("use-for-coaching").disabled = true;
    $("report-panel").replaceChildren(P.el("h2", "Sign in to access player history"));
    ["history-status", "detail-status", "review-status"].forEach((id) => message(id, ""));
  };
  const ready = () => {
    if (query.get("playerId") && Auth.can("read", readContext())) return loadHistory(false, query.get("matchId"));
  };
  if (Auth) Auth.bind({ clear, ready, busy: () => busy });
  else {
    clear();
    ["load-history", "load-more", "refresh-detail", "save-review"].forEach((id) => { $(id).disabled = true; });
    message("history-status", "Authentication support is missing. Build the local auth assets and reload; access is disabled.", true);
  }
  window.PlayerIQLibrary = { loadHistory, loadDetail, saveReview };
})();
