import express from "express";
import { randomUUID } from "node:crypto";
import { authorizeScope } from "./authorization.js";

function text(value, name, { required = true, max = 200 } = {}) {
  if (value == null && !required) return "";
  if (typeof value !== "string" || (required && !value.trim()) || value.length > max) {
    throw Object.assign(new Error(`${name} must be ${required ? "a nonempty" : "a"} string of at most ${max} characters.`), { statusCode: 400 });
  }
  return value.trim();
}

function choice(value, name, choices) {
  if (!choices.includes(value)) {
    throw Object.assign(new Error(`Invalid ${name}. Expected one of: ${choices.join(", ")}.`), { statusCode: 400 });
  }
  return value;
}

export function registerHistoryRoutes(app, services) {
  async function loadMatch(req, organizationId) {
    authorizeScope(req, organizationId);
    const document = await services.getMatchDocument(req.params.matchId, organizationId);
    if (!document) throw Object.assign(new Error("Match not found in this organization."), { statusCode: 404 });
    authorizeScope(req, organizationId, document.playerId);
    return document;
  }

  app.get("/api/players/:playerId/matches", async (req, res, next) => {
    try {
      const org = text(req.query.organizationId, "organizationId");
      const player = text(req.params.playerId, "playerId");
      authorizeScope(req, org, player);
      const token = text(req.query.continuationToken, "continuationToken", { required: false, max: 16384 });
      const page = await services.listPlayerMatches(org, player, token || undefined);
      res.set("Cache-Control", "no-store").json({
        matches: page.matches.map((d) => ({
          matchId: d.id, playerId: d.playerId, matchName: d.matchName,
          createdAt: d.createdAt, updatedAt: d.updatedAt, processing: d.processing
        })),
        nextContinuationToken: page.nextContinuationToken
      });
    } catch (error) { next(error); }
  });

  app.get("/api/uploads/:matchId", async (req, res, next) => {
    try {
      const document = await loadMatch(req, text(req.query.organizationId, "organizationId"));
      const [observations, reviews] = await Promise.all([
        document.generatedRecords ? services.getObservations(document) : [],
        services.listReviews(document)
      ]);
      res.set("Cache-Control", "no-store").json({
        matchId: document.id, organizationId: document.organizationId,
        playerId: document.playerId, matchName: document.matchName,
        videoAsset: document.videoAsset, processing: document.processing,
        generatedRecords: document.generatedRecords ? { ...document.generatedRecords, observations } : null,
        reviews, reviewHistoryLimit: 100,
        createdAt: document.createdAt, updatedAt: document.updatedAt
      });
    } catch (error) { next(error); }
  });

  app.get("/api/uploads/:matchId/frames/:index", async (req, res, next) => {
    try {
      const document = await loadMatch(req, text(req.query.organizationId, "organizationId"));
      if (!/^(0|[1-9]\d*)$/.test(req.params.index)) {
        return res.status(400).json({ error: "Frame index must be a nonnegative integer." });
      }
      const frame = document.videoAsset?.sampledFrames?.[Number(req.params.index)];
      const prefix = `${document.organizationId}/${document.id}/${document.videoAsset?.videoAssetId}/`;
      if (!frame?.blobName?.startsWith(prefix)) {
        return res.status(404).json({ error: "Frame not found for this upload." });
      }
      const image = await services.downloadFrame(frame.blobName);
      res.set("Cache-Control", "no-store");
      res.set("Cross-Origin-Resource-Policy", "cross-origin");
      res.type("jpg").send(image);
    } catch (error) { next(error); }
  });

  app.post("/api/uploads/:matchId/reviews", express.json({ limit: "32kb" }), async (req, res, next) => {
    try {
      const body = req.body || {};
      const org = text(body.organizationId, "organizationId");
      const document = await loadMatch(req, org);
      if (text(body.playerId, "playerId") !== document.playerId) {
        return res.status(409).json({ error: "The review player does not match the upload." });
      }
      if (document.processing?.status !== "completed" || !document.generatedRecords) {
        return res.status(409).json({ error: "Only completed reports can be reviewed." });
      }
      const decision = choice(body.decision, "decision", ["accepted", "needs_changes", "rejected"]);
      if (typeof body.useForCoaching !== "boolean") {
        return res.status(400).json({ error: "useForCoaching must be an explicit boolean." });
      }
      if (body.useForCoaching && decision !== "accepted") {
        return res.status(400).json({ error: "Only accepted feedback may be reused for coaching." });
      }
      const review = {
        id: `review-${randomUUID()}`, documentType: "coachFeedback",
        organizationId: org, matchId: document.id, playerId: document.playerId,
        sourceJobId: document.processing.jobId, sourceVideoId: document.videoAsset.videoAssetId,
        reviewer: req.principal?.name || text(body.reviewer, "reviewer"),
        reviewerIdentityVerified: Boolean(req.principal),
        ...(req.principal ? { reviewerObjectId: req.principal.objectId, reviewerTenantId: req.principal.tenantId } : {}),
        decision, notes: text(body.notes, "notes", { max: 4000 }),
        correctedSummary: text(body.correctedSummary, "correctedSummary", { required: false, max: 4000 }),
        progress: choice(body.progress, "progress", ["improved", "unchanged", "needs_work", "not_assessed"]),
        useForCoaching: body.useForCoaching, createdAt: new Date().toISOString()
      };
      await services.createReview(review);
      res.status(201).json(review);
    } catch (error) { next(error); }
  });
}
