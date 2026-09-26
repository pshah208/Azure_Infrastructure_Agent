export function selectLatestEligibleReviews(reviews) {
  const latest = new Map();
  for (const review of [...reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (!latest.has(review.matchId)) latest.set(review.matchId, review);
  }
  return [...latest.values()]
    .filter((review) => review.decision === "accepted" && review.useForCoaching === true &&
      review.reviewerIdentityVerified === true)
    .slice(0, 5);
}

export function createFeedbackReader(matches) {
  return async function getReviewedContext(organizationId, playerId, currentMatchId) {
    const { resources } = await matches.items.query({
      query: "SELECT TOP 100 * FROM c WHERE c.organizationId = @org AND c.playerId = @player AND c.documentType = 'coachFeedback' AND c.matchId != @match ORDER BY c.createdAt DESC",
      parameters: [
        { name: "@org", value: organizationId },
        { name: "@player", value: playerId },
        { name: "@match", value: currentMatchId }
      ]
    }, { partitionKey: organizationId }).fetchAll();
    const candidates = selectLatestEligibleReviews(resources);
    const context = [];
    for (const review of candidates) {
      let resource;
      try {
        ({ resource } = await matches.item(review.matchId, organizationId).read());
      } catch (error) {
        if (error.code === 404 || error.statusCode === 404) continue;
        throw error;
      }
      if (resource?.documentType === "matchVideo" && resource.playerId === playerId &&
          resource.processing?.status === "completed" && resource.processing.jobId === review.sourceJobId) {
        context.push({
          reviewId: review.id, matchId: review.matchId, createdAt: review.createdAt,
          notes: review.notes, correctedSummary: review.correctedSummary,
          progress: review.progress, reviewerIdentityVerified: true
        });
      }
    }
    return context;
  };
}
