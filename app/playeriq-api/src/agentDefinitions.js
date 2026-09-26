export const playerIqAgents = [
  {
    agentId: "video-evidence-agent",
    foundryAgentName: "playeriq-video-evidence",
    name: "PlayerIQ Video Evidence Agent",
    role: "Extract timestamped soccer observations from uploaded video evidence.",
    modelKey: "vision",
    defaultModelDeploymentEnv: "FOUNDRY_VISION_MODEL_DEPLOYMENT_NAME",
    outputContract: {
      observations: [
        {
          observationId: "string",
          timestampStart: "string",
          timestampEnd: "string",
          eventType: "string",
          claim: "string",
          coachingImplication: "string",
          confidence: "number"
        }
      ],
      guardrails: ["string"]
    },
    systemPrompt:
      "You are PlayerIQ's Video Evidence Agent. Return JSON only. Convert supplied video metadata, sampled-frame notes, or synthetic fixtures into timestamped soccer observations. Never claim that raw video was visually analyzed unless frame or clip evidence is supplied. Include confidence and guardrails."
  },
  {
    agentId: "player-analysis-agent",
    foundryAgentName: "playeriq-player-analysis",
    name: "PlayerIQ Player Analysis Agent",
    role: "Convert timestamped observations into player-development feedback.",
    modelKey: "reasoning",
    defaultModelDeploymentEnv: "FOUNDRY_MODEL_DEPLOYMENT_NAME",
    outputContract: {
      summary: "string",
      strengths: ["string"],
      improvementAreas: ["string"],
      recommendedDrills: ["string"],
      evidence: [{ observationId: "string", timestampStart: "string", timestampEnd: "string", confidence: "number" }],
      guardrails: ["string"]
    },
    systemPrompt:
      "You are PlayerIQ's Player Analysis Agent. Return concise JSON only. Create youth soccer development feedback grounded in timestamped observations. Every recommendation must trace to evidence and include no-result states when evidence is thin."
  },
  {
    agentId: "training-plan-agent",
    foundryAgentName: "playeriq-training-plan",
    name: "PlayerIQ Training Plan Agent",
    role: "Create a focused weekly training plan from analysis findings.",
    modelKey: "reasoning",
    defaultModelDeploymentEnv: "FOUNDRY_MODEL_DEPLOYMENT_NAME",
    outputContract: {
      weeklyFocus: "string",
      drills: [{ name: "string", durationMinutes: "number", coachingCue: "string", successMetric: "string" }],
      progression: ["string"],
      guardrails: ["string"]
    },
    systemPrompt:
      "You are PlayerIQ's Training Plan Agent. Return JSON only. Convert evidence-grounded development feedback into age-appropriate soccer drills with measurable success criteria. Avoid medical, punitive, or overtraining advice."
  },
  {
    agentId: "coach-review-agent",
    foundryAgentName: "playeriq-coach-review",
    name: "PlayerIQ Coach Review Agent",
    role: "Review AI feedback for evidence quality, safety, and coach-readiness.",
    modelKey: "reasoning",
    defaultModelDeploymentEnv: "FOUNDRY_MODEL_DEPLOYMENT_NAME",
    outputContract: {
      approved: "boolean",
      reviewStatus: "approved | needsCoachReview | insufficientEvidence",
      edits: ["string"],
      risks: ["string"],
      evidenceGaps: ["string"]
    },
    systemPrompt:
      "You are PlayerIQ's Coach Review Agent. Return JSON only. Review proposed player feedback for youth safety, evidence grounding, overclaiming, and clarity. Prefer needsCoachReview when evidence is insufficient."
  },
  {
    agentId: "synthetic-data-agent",
    foundryAgentName: "playeriq-synthetic-data",
    name: "PlayerIQ Synthetic Data Agent",
    role: "Generate realistic synthetic soccer player, match, observation, review, and training-plan records for MVP testing.",
    modelKey: "reasoning",
    defaultModelDeploymentEnv: "FOUNDRY_MODEL_DEPLOYMENT_NAME",
    outputContract: {
      player: "object",
      match: "object",
      observations: ["object"],
      coachReview: "object",
      trainingPlan: "object",
      fabricSemanticModelFacts: ["object"]
    },
    systemPrompt:
      "You are PlayerIQ's Synthetic Data Agent. Return JSON only. Generate realistic but clearly synthetic youth soccer development records for product testing. Do not use real children, real teams, or personally identifying information."
  }
];

export function getAgentDefinition(agentId) {
  return playerIqAgents.find((agent) => agent.agentId === agentId);
}

export function getPublicAgentDefinitions(config) {
  return playerIqAgents.map(({ systemPrompt: _systemPrompt, ...agent }) => ({
    ...agent,
    modelDeployment: resolveAgentModelDeployment(agent, config)
  }));
}

export function resolveAgentModelDeployment(agent, config) {
  if (agent.modelKey === "vision") {
    return config.foundryVisionModelDeploymentName || config.foundryModelDeploymentName || "";
  }

  return config.foundryModelDeploymentName || "";
}
