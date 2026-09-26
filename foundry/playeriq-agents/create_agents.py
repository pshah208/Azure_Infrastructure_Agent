import json
import os

from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import PromptAgentDefinition
from azure.identity import AzureCliCredential


PROJECT_ENDPOINT = os.environ.get(
    "PROJECT_ENDPOINT",
    "https://ai-playeriq-dev-eus2-vushfn4j.services.ai.azure.com/api/projects/ai-playeriq-dev-eus2-vus-project",
)
MODEL_DEPLOYMENT_NAME = os.environ.get(
    "MODEL_DEPLOYMENT_NAME",
    "gpt-4-1-mini-playeriq-coach",
)

AGENTS = [
    {
        "name": "playeriq-video-evidence",
        "description": "Creates timestamped candidate soccer observations from supplied frame notes, clip metadata, and visual evidence.",
        "instructions": """
You are the PlayerIQ Video Evidence Agent for youth soccer development.
Return JSON only. Convert only the supplied frame, clip, timestamp, and match evidence into observations.
Never claim that you watched or analyzed video unless image or clip evidence was included in the request.
Each observation must include observationId, timestampStart, timestampEnd, eventType, claim,
coachingImplication, confidence from 0 to 1, and evidenceSource.
If the player cannot be identified or evidence is weak, return insufficientEvidence instead of guessing.
Do not identify faces, infer sensitive traits, provide medical advice, or make selection/recruiting decisions.
""".strip(),
    },
    {
        "name": "playeriq-player-analysis",
        "description": "Converts timestamped observations into evidence-grounded player development feedback.",
        "instructions": """
You are the PlayerIQ Player Analysis Agent for youth soccer development.
Return JSON only. Use only the supplied timestamped observations.
Produce summary, strengths, improvementAreas, recommendedDrills, evidenceReferences, and guardrails.
Every strength and improvement area must reference observation IDs and confidence.
Use insufficientEvidence when the evidence does not support a conclusion.
Use constructive, age-appropriate language and never provide medical, psychological, recruiting, or disciplinary judgments.
""".strip(),
    },
    {
        "name": "playeriq-training-plan",
        "description": "Creates age-appropriate training plans from evidence-grounded player analysis.",
        "instructions": """
You are the PlayerIQ Training Plan Agent.
Return JSON only. Create a focused weekly soccer development plan from the supplied approved analysis.
Return weeklyFocus, drills, progression, successMetrics, workloadGuardrails, and evidenceReferences.
Each drill must include name, durationMinutes, setup, coachingCue, successMetric, and linkedObservationIds.
Keep workload age-appropriate, avoid medical advice and overtraining, and do not invent evidence.
""".strip(),
    },
    {
        "name": "playeriq-coach-review",
        "description": "Reviews generated evidence, analysis, and training plans for quality, safety, and coach readiness.",
        "instructions": """
You are the PlayerIQ Coach Review Agent.
Return JSON only. Review supplied observations, analysis, and training plans for evidence grounding,
timestamp traceability, youth safety, clarity, overclaiming, and contradictions.
Return approved, reviewStatus, edits, risks, evidenceGaps, and releaseRecommendation.
Valid reviewStatus values are approved, needsCoachReview, and insufficientEvidence.
When uncertain, require human coach review. Never silently approve unsupported claims.
""".strip(),
    },
    {
        "name": "playeriq-synthetic-data",
        "description": "Generates clearly synthetic PlayerIQ records for tests, demos, evaluations, and Fabric-ready analytics.",
        "instructions": """
You are the PlayerIQ Synthetic Data Agent.
Return JSON only. Generate realistic but clearly synthetic youth soccer records for software testing.
Return player, match, observations, coachReview, trainingPlan, and fabricSemanticModelFacts.
Never use real children, real clubs, real contact details, or personally identifying information.
Mark every generated entity as synthetic and maintain referential consistency across IDs and timestamps.
""".strip(),
    },
]


def serialize(value):
    if hasattr(value, "as_dict"):
        return value.as_dict()
    if hasattr(value, "__dict__"):
        return {key: item for key, item in value.__dict__.items() if not key.startswith("_")}
    return str(value)


def main():
    client = AIProjectClient(
        endpoint=PROJECT_ENDPOINT,
        credential=AzureCliCredential(),
        allow_preview=True,
    )
    existing = {agent.name for agent in client.agents.list()}
    results = []

    for agent in AGENTS:
        created = client.agents.create_version(
            agent["name"],
            definition=PromptAgentDefinition(
                model=MODEL_DEPLOYMENT_NAME,
                instructions=agent["instructions"],
                temperature=0.2,
            ),
            description=agent["description"],
            metadata={
                "application": "PlayerIQ",
                "environment": "dev",
                "managedBy": "repo",
                "agentRole": agent["name"].removeprefix("playeriq-"),
            },
        )
        results.append(
            {
                "name": agent["name"],
                "operation": "new-version" if agent["name"] in existing else "created",
                "result": serialize(created),
            }
        )

    print(json.dumps({"projectEndpoint": PROJECT_ENDPOINT, "agents": results}, indent=2, default=str))


if __name__ == "__main__":
    main()
