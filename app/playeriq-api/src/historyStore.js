export function createHistoryStore({ database, blobServiceClient, config }) {
  const matches = database.container(config.matchesContainerName);
  const observations = database.container(config.observationsContainerName || "observations");
  return {
    async createMatchDocument(document) {
      try {
        return (await matches.items.create(document)).resource;
      } catch (error) {
        if (error.code === 409 || error.statusCode === 409) {
          throw Object.assign(new Error("Match ID already exists. Use a new Match ID for each clip."), { statusCode: 409 });
        }
        throw error;
      }
    },
    async getMatchDocument(matchId, organizationId) {
      try {
        const { resource } = await matches.item(matchId, organizationId).read();
        return resource?.documentType === "matchVideo" ? resource : null;
      } catch (error) {
        if (error.code === 404 || error.statusCode === 404) return null;
        throw error;
      }
    },
    async listPlayerMatches(organizationId, playerId, continuationToken) {
      const page = await matches.items.query({
        query: "SELECT * FROM c WHERE c.organizationId = @org AND c.playerId = @player AND c.documentType = 'matchVideo' ORDER BY c.createdAt DESC",
        parameters: [{ name: "@org", value: organizationId }, { name: "@player", value: playerId }]
      }, { partitionKey: organizationId, maxItemCount: 20, continuationToken }).fetchNext();
      return { matches: page.resources, nextContinuationToken: page.continuationToken || null };
    },
    async getObservations(document) {
      if (Array.isArray(document.generatedRecords?.observations)) {
        return document.generatedRecords.observations;
      }
      const result = await observations.items.query({
        query: "SELECT * FROM c WHERE c.matchId = @match AND c.organizationId = @org AND c.sourceVideoId = @video",
        parameters: [
          { name: "@match", value: document.id },
          { name: "@org", value: document.organizationId },
          { name: "@video", value: document.videoAsset.videoAssetId }
        ]
      }, { partitionKey: document.id }).fetchAll();
      const ids = new Set(document.generatedRecords?.observationIds || []);
      return result.resources.filter((item) => ids.has(item.observationId));
    },
    async listReviews(document) {
      return (await matches.items.query({
        query: "SELECT TOP 100 * FROM c WHERE c.organizationId = @org AND c.matchId = @match AND c.documentType = 'coachFeedback' AND c.sourceJobId = @job ORDER BY c.createdAt DESC",
        parameters: [
          { name: "@org", value: document.organizationId },
          { name: "@match", value: document.id },
          { name: "@job", value: document.processing.jobId }
        ]
      }, { partitionKey: document.organizationId }).fetchAll()).resources;
    },
    async createReview(document) {
      return (await matches.items.create(document)).resource;
    },
    async downloadFrame(blobName) {
      return blobServiceClient.getContainerClient(config.thumbnailsContainerName || "thumbnails")
        .getBlobClient(blobName).downloadToBuffer();
    }
  };
}

export function createMockHistoryStore(documents) {
  const key = (id, org) => `${org}:${id}`;
  return {
    async createMatchDocument(document) {
      if (documents.has(key(document.id, document.organizationId))) {
        throw Object.assign(new Error("Match ID already exists. Use a new Match ID for each clip."), { statusCode: 409 });
      }
      documents.set(key(document.id, document.organizationId), structuredClone(document));
      return document;
    },
    async upsertMatchDocument(document) {
      documents.set(key(document.id, document.organizationId), structuredClone(document));
      return document;
    },
    async getMatchDocument(id, org) {
      const document = documents.get(key(id, org));
      return document?.documentType === "matchVideo" ? structuredClone(document) : null;
    },
    async listPlayerMatches(org, player, token) {
      if (token && !/^\d+$/.test(token)) {
        throw Object.assign(new Error("Invalid continuation token."), { statusCode: 400 });
      }
      const all = [...documents.values()].filter((d) =>
        d.organizationId === org && d.playerId === player && d.documentType === "matchVideo")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const start = Number(token || 0);
      return {
        matches: all.slice(start, start + 20),
        nextContinuationToken: start + 20 < all.length ? String(start + 20) : null
      };
    },
    async getObservations(document) {
      return document.generatedRecords?.observations || [];
    },
    async listReviews(document) {
      return [...documents.values()].filter((d) => d.documentType === "coachFeedback" &&
        d.organizationId === document.organizationId && d.matchId === document.id &&
        d.sourceJobId === document.processing.jobId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
    },
    async createReview(document) {
      documents.set(key(document.id, document.organizationId), structuredClone(document));
      return document;
    },
    async downloadFrame() {
      return Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    }
  };
}
