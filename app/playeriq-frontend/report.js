/* Shared, DOM-only report rendering. API text is never interpreted as HTML. */
(() => {
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  };
  const parse = (value) => {
    if (typeof value !== "string") return value;
    const text = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    if (/^[{[]/.test(text)) {
      try { return JSON.parse(text); } catch { /* Keep non-JSON prose intact. */ }
    }
    return value;
  };
  const list = (value) => {
    const parsed = parse(value);
    return parsed == null ? [] : Array.isArray(parsed) ? parsed : [parsed];
  };
  const label = (key) => String(key).replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ").replace(/^./, (letter) => letter.toUpperCase());
  const scalar = (value) => value === true ? "Yes" : value === false ? "No" : String(value ?? "Not provided");
  const productionApiOrigin = "https://ca-api-playeriq-dev-eus2-002.salmonpebble-a4005584.eastus2.azurecontainerapps.io";
  const isLoopback = (hostname) => ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  const defaultApiUrl = () => {
    const override = new URLSearchParams(location.search).get("apiUrl");
    if (override) return override;
    return isLoopback(location.hostname)
      ? "http://localhost:8080"
      : productionApiOrigin;
  };
  const apiBase = (value) => {
    const url = new URL(String(value).trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error("Enter an HTTP(S) API URL without credentials, query fields, or a fragment.");
    }
    return url.href.replace(/\/$/, "");
  };
  const trustedApiOrigin = (value) => {
    const url = new URL(apiBase(value));
    const localOverride = isLoopback(location.hostname) && isLoopback(url.hostname);
    if (url.pathname !== "/" || (url.origin !== productionApiOrigin && !localOverride)) {
      throw new Error("Untrusted API origin. Hosted pages only allow the packaged PlayerIQ API origin. Loopback API overrides are allowed only from a loopback frontend.");
    }
    return url.origin;
  };
  const endpoint = (context, path, query = {}) => {
    if (!context.organizationId?.trim()) throw new Error("Organization ID is required.");
    const url = new URL(`${apiBase(context.apiUrl)}${path}`);
    url.searchParams.set("organizationId", context.organizationId);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, value);
    });
    return url.href;
  };
  const request = async (url, options = {}, timeoutMs = 30000) => {
    const auth = window.PlayerIQAuth;
    if (!auth) throw new Error("Authentication support is unavailable. Reload after building the auth assets; access is disabled.");
    const epoch = auth.getEpoch();
    const authorization = await auth.authorize(url, options);
    auth.validateEpoch(epoch);
    const headers = new Headers(options.headers);
    headers.delete("Authorization");
    Object.entries(authorization).forEach(([key, value]) => headers.set(key, value));
    const { responseType, ...fetchOptions } = options;
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetch(url, { ...fetchOptions, headers, signal: controller.signal, redirect: "error", credentials: "omit", referrerPolicy: "no-referrer" });
          auth.validateEpoch(epoch);
          if (response.redirected || (response.url && new URL(response.url).origin !== new URL(url).origin)) {
            throw new Error("Blocked redirected API response. Reload using the trusted API origin.");
          }
          if (!response.ok && [401, 403].includes(response.status)) {
            auth.handleHttpError(response.status);
            throw new Error(response.status === 401
              ? "Session expired or signed out (401). Sign in again, then retry."
              : "Access denied (403). Ask an administrator for role and organization/player membership access.");
          }
          if (responseType === "blob" && response.ok) {
            const blob = await response.blob();
            auth.validateEpoch(epoch);
            return blob;
          }
          let body;
          try { body = await response.json(); }
          catch { throw new Error(`API returned an unreadable response (HTTP ${response.status}).`); }
          if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `API request failed (HTTP ${response.status}).`);
          auth.validateEpoch(epoch);
          return body;
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("Request timed out. The server may still be working; recheck status before retrying a write."));
          }, timeoutMs);
        })
      ]);
    } finally { clearTimeout(timer); }
  };
  const media = new Map();
  const releaseMedia = (container) => {
    const entry = media.get(container);
    if (entry) {
      entry.active = false;
      entry.urls.forEach((url) => URL.revokeObjectURL(url));
      media.delete(container);
    }
  };
  const releaseAllMedia = () => [...media.keys()].forEach(releaseMedia);
  const verifiedReview = (review) => review.reviewerIdentityVerified === true &&
    typeof review.reviewerObjectId === "string" && !!review.reviewerObjectId &&
    typeof review.reviewerTenantId === "string" && !!review.reviewerTenantId;
  const historyUrl = (context) => {
    const url = new URL("players.html", location.href);
    ["apiUrl", "organizationId", "playerId", "matchId"].forEach((key) => {
      if (context[key]) url.searchParams.set(key, context[key]);
    });
    const theme = new URLSearchParams(location.search).get("scoutTheme");
    if (theme) url.searchParams.set("scoutTheme", theme);
    return url.href;
  };
  const timestamp = (seconds) => {
    if (seconds === null || seconds === undefined || seconds === "") return "Timestamp not supplied";
    if (typeof seconds === "object") return "See supplied timestamp details below";
    const number = Number(seconds);
    if (!Number.isFinite(number) || number < 0) return scalar(seconds);
    const minutes = Math.floor(number / 60);
    return `${String(minutes).padStart(2, "0")}:${(number % 60).toFixed(1).padStart(4, "0")}`;
  };
  const date = (value) => {
    const parsed = new Date(value);
    return value && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString() : "Date not supplied";
  };
  const orderedReviews = (reviews) => list(reviews).filter((review) => review && typeof review === "object")
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));

  const renderConfidence = (parent, raw) => {
    const values = list(raw);
    if (values.every((value) => value === null || typeof value !== "object")) {
      parent.append(el("span", `${values.length ? values.map(scalar).join(" · ") : "Not supplied"} (model-reported; not verified accuracy)`));
    } else renderValue(parent, raw);
  };
  const renderValue = (parent, raw, refs = new Map(), depth = 0) => {
    const value = parse(raw);
    if (depth > 10) { parent.append(el("p", "Additional nested detail omitted.")); return; }
    if (Array.isArray(value)) {
      const ul = el("ul", undefined, "detail-list");
      value.forEach((item) => {
        const li = el("li");
        renderValue(li, item, refs, depth + 1);
        ul.append(li);
      });
      parent.append(ul);
    } else if (value && typeof value === "object") {
      const dl = el("dl", undefined, "report-fields");
      Object.entries(value).forEach(([key, item]) => {
        const confidence = /^confidence(?:Score|Level)?$/i.test(key);
        dl.append(el("dt", confidence ? "Model confidence" : label(key)));
        const dd = el("dd");
        if (confidence) {
          renderConfidence(dd, item);
        } else if (/^(evidenceReferences|evidenceIds|observationIds|supportingObservationIds|linkedObservationIds|evidenceRefs)$/i.test(key)) {
          list(item).forEach((reference) => {
            const parsed = parse(reference);
            const id = typeof parsed === "object" && parsed !== null ? parsed.observationId || parsed.evidenceId || parsed.id : parsed;
            if (refs.has(String(id))) {
              const anchor = el("a", `Observation ${id}`, "evidence-link");
              anchor.href = `#${refs.get(String(id))}`;
              dd.append(anchor);
              if (parsed && typeof parsed === "object") renderValue(dd, parsed, new Map(), depth + 1);
            } else {
              const note = el("div", undefined, "reference-note");
              renderValue(note, parsed, new Map(), depth + 1);
              note.append(el("small", " — referenced evidence detail unavailable"));
              dd.append(note);
            }
          });
        } else {
          renderValue(dd, item, refs, depth + 1);
        }
        dl.append(dd);
      });
      parent.append(dl);
    } else {
      parent.append(el("span", scalar(value)));
    }
  };
  const section = (parent, title, className = "") => {
    const node = el("section", undefined, `report-section ${className}`);
    node.append(el("h3", title));
    parent.append(node);
    return node;
  };
  const renderItems = (parent, values, empty, refs) => {
    const items = list(values);
    if (!items.length) { parent.append(el("p", empty, "muted")); return; }
    items.forEach((raw) => {
      const item = parse(raw);
      const card = el("article", undefined, "insight-card");
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const titleKey = ["area", "name", "title", "skill", "claim", "drillName"].find((key) => typeof item[key] === "string");
        if (titleKey) card.append(el("h4", item[titleKey]));
        const rest = Object.fromEntries(Object.entries(item).filter(([key]) => key !== titleKey));
        renderValue(card, rest, refs);
      } else renderValue(card, item, refs);
      parent.append(card);
    });
  };
  const renderReviews = (parent, reviews) => {
    const items = orderedReviews(reviews);
    const area = section(parent, "Human review history & self-reported progress");
    area.append(el("p", "Verified badges require server-recorded Entra identity metadata. Older and local-mock reviews remain unverified. Progress is self-reported, not a measured improvement score.", "notice"));
    if (!items.length) area.append(el("p", "Pending human review. No saved human-submitted feedback."));
    items.forEach((review) => {
      const card = el("article", undefined, "insight-card");
      card.append(el("h4", `${label(review.decision || "not supplied")} · ${review.reviewer || "Unnamed reviewer"}`));
      card.append(el("p", `${date(review.createdAt)} · ${verifiedReview(review) ? "Entra-verified reviewer identity" : "Identity unverified (legacy or local mock)"}`, "muted"));
      card.append(el("p", `Self-reported progress: ${label(review.progress || "not_assessed")}`));
      if (review.notes) { card.append(el("strong", "Notes")); renderValue(card, review.notes); }
      if (review.correctedSummary) { card.append(el("h4", "Corrected summary")); renderValue(card, review.correctedSummary); }
      card.append(el("p", review.decision === "accepted" && review.useForCoaching === true && verifiedReview(review)
        ? "Eligible for coaching reuse: verified reviewer, accepted decision and explicit opt-in."
        : "Not eligible for coaching reuse: requires a verified reviewer, accepted decision and explicit opt-in."));
      area.append(card);
    });
  };
  let reportSequence = 0;
  const renderReport = (container, payload, context = {}) => {
    releaseMedia(container);
    container.replaceChildren();
    const records = payload.generatedRecords || {};
    const analysis = parse(records.playerAnalysis || payload.feedback || {}) || {};
    const plan = parse(records.trainingPlan || {}) || {};
    const aiReview = parse(records.coachReview || {}) || {};
    const provenance = records.provenance;
    const observations = list(records.observations);
    const refs = new Map();
    const prefix = `report-${++reportSequence}`;
    observations.forEach((raw, index) => {
      const observation = parse(raw);
      const id = observation?.id || observation?.observationId || records.observationIds?.[index];
      if (id) refs.set(String(id), `${prefix}-observation-${index}`);
    });
    container.append(el("h2", context.synthetic ? "Synthetic sample report" : "Match development report"));
    container.append(el("p", [payload.matchName, payload.playerId, payload.matchId].filter(Boolean).join(" · "), "muted"));
    container.append(el("p", context.synthetic
      ? "SYNTHETIC DEMO — sample evidence, not observations of your uploaded video or this player."
      : "AI-generated draft from sampled evidence, not a full-match assessment. Player identity is not verified. Validate observations against the video before coaching.", "notice"));
    const summary = section(container, "Summary & caveats");
    renderValue(summary, analysis.summary || "No summary returned.");
    ["limitations", "caveats", "evidenceGaps", "confidence"].forEach((key) => {
      if (analysis[key] !== undefined) {
        summary.append(el("h4", key === "confidence" ? "Model confidence" : label(key)));
        if (key === "confidence") renderConfidence(summary, analysis[key]);
        else renderValue(summary, analysis[key], refs);
      }
    });
    summary.append(el("p", "Confidence values are model-reported, not verified accuracy. Evidence count is not match coverage.", "muted"));
    const reviews = orderedReviews(payload.reviews);
    summary.append(el("p", reviews.length
      ? `Latest human-submitted decision: ${label(reviews[0].decision || "not supplied")} (${verifiedReview(reviews[0]) ? "Entra-verified reviewer" : "identity unverified"}).`
      : "Pending human review — an AI check does not constitute human approval.", "review-state"));
    if (context.apiUrl && context.organizationId && payload.playerId) {
      const link = el("a", "Open player history & record a human review", "button secondary");
      link.href = historyUrl({ ...context, playerId: payload.playerId, matchId: payload.matchId });
      summary.append(link);
    }
    const insights = el("div", undefined, "report-columns");
    container.append(insights);
    renderItems(section(insights, "Strengths"), analysis.strengths, "No strengths supplied.", refs);
    renderItems(section(insights, "Improve next"), analysis.improvementAreas || analysis.improvements, "No improvement areas supplied.", refs);
    const training = section(container, "Training plan");
    const planMetadata = Object.fromEntries(Object.entries(plan).filter(([key]) => !["drills", "recommendedDrills"].includes(key)));
    renderValue(training, planMetadata, refs);
    renderItems(training, plan.drills || plan.recommendedDrills || analysis.recommendedDrills, "No drills supplied.", refs);

    const evidence = section(container, context.synthetic ? "Synthetic evidence" : "Observed moments");
    if (!observations.length) {
      evidence.append(el("p", context.synthetic
        ? "This demo uses synthetic evidence; it is not extracted from the selected video."
        : "Observation details are unavailable for this report (older uploads may store IDs only). No moments or timestamps have been inferred.", "notice"));
      if (context.synthetic && analysis.evidence) renderItems(evidence, analysis.evidence, "", refs);
      if (records.observationIds?.length) {
        const details = el("details");
        details.append(el("summary", "Stored evidence IDs (details unavailable)"));
        renderValue(details, records.observationIds);
        evidence.append(details);
      }
    }
    observations.forEach((raw, index) => {
      const observation = parse(raw);
      const card = el("article", undefined, "insight-card observation");
      card.id = `${prefix}-observation-${index}`;
      card.append(el("h4", `Moment ${index + 1}`));
      if (observation && typeof observation === "object") {
        const range = observation.timeRange || observation.timestampRange || {};
        const start = observation.timestampSeconds ?? observation.startSeconds ?? observation.startTimeSeconds ?? observation.timestampStartSeconds ?? observation.timestampStart ?? range.startSeconds ?? range.start ?? observation.timestamp;
        const end = observation.endSeconds ?? observation.endTimeSeconds ?? observation.timestampEndSeconds ?? observation.timestampEnd ?? range.endSeconds ?? range.end;
        card.append(el("p", `${timestamp(start)}${end !== undefined ? ` – ${timestamp(end)}` : ""}`, "timestamp"));
      }
      renderValue(card, observation, refs);
      evidence.append(card);
    });
    const frames = list(payload.videoAsset?.sampledFrames);
    if (!context.synthetic && payload.processing?.status === "completed" && frames.length && context.apiUrl && context.organizationId) {
      const gallery = section(container, "Sampled frames — open to inspect");
      gallery.append(el("p", "Still frames provide limited context; they do not establish full-match coverage or player identity.", "muted"));
      const grid = el("div", undefined, "frame-grid");
      const mediaEntry = { active: true, urls: new Set() };
      media.set(container, mediaEntry);
      frames.forEach((rawFrame, index) => {
        const frame = rawFrame || {};
        const figure = el("figure");
        const url = endpoint(context, `/api/uploads/${encodeURIComponent(payload.matchId)}/frames/${index}`);
        const anchor = el("a");
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        const image = el("img");
        image.loading = "lazy";
        const frameTime = timestamp(frame.timestampSeconds ?? frame.timeSeconds ?? frame.timestamp);
        image.alt = `Sampled frame ${index + 1} at ${frameTime}`;
        image.addEventListener("error", () => {
          image.hidden = true;
          if (!figure.querySelector(".frame-error")) figure.append(el("p", "Frame unavailable. Open the link to retry.", "frame-error"));
        });
        const caption = el("span", `Loading protected frame ${index + 1}…`);
        anchor.append(image, caption);
        anchor.setAttribute("aria-disabled", "true");
        request(url, { responseType: "blob" }).then((blob) => {
          if (!mediaEntry.active) return;
          const objectUrl = URL.createObjectURL(blob);
          mediaEntry.urls.add(objectUrl);
          image.src = objectUrl;
          anchor.href = objectUrl;
          anchor.removeAttribute("aria-disabled");
          caption.textContent = `Open frame ${index + 1}`;
        }).catch((error) => {
          if (!mediaEntry.active) return;
          image.hidden = true;
          caption.textContent = `Frame unavailable: ${error.message} Recheck the report after resolving access.`;
        });
        figure.append(anchor, el("figcaption", frameTime));
        grid.append(figure);
      });
      gallery.append(grid);
    }
    const ai = section(container, "Automated AI quality check — not human approval");
    if (Object.keys(aiReview).length) renderValue(ai, aiReview, refs);
    else ai.append(el("p", "No automated check details supplied."));
    if (provenance) {
      const source = section(container, "Evidence provenance");
      renderValue(source, provenance, refs);
      source.append(el("p", "Player identity is not verified. Feedback review IDs indicate prior feedback used as prompt context, not model training.", "muted"));
    }
    renderReviews(container, reviews);
    return container;
  };
  window.PlayerIQ = { el, parse, list, label, defaultApiUrl, apiBase, trustedApiOrigin, endpoint, request, historyUrl, timestamp, date, renderValue, renderReport, renderReviews, releaseMedia, releaseAllMedia };
})();
