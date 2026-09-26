import json
import os

from azure.ai.projects import AIProjectClient
from azure.identity import AzureCliCredential


PROJECT_ENDPOINT = os.environ.get(
    "PROJECT_ENDPOINT",
    "https://ai-playeriq-dev-eus2-vushfn4j.services.ai.azure.com/api/projects/ai-playeriq-dev-eus2-vus-project",
)

TESTS = {
    "playeriq-video-evidence": {
        "matchId": "match-synthetic-smoke-001",
        "playerId": "player-synthetic-010",
        "frameNotes": [
            {
                "timestamp": "00:42",
                "note": "Synthetic player 10 receives centrally, checks left shoulder once, and takes first touch backward.",
            }
        ],
    },
    "playeriq-player-analysis": {
        "observations": [
            {
                "observationId": "obs-synthetic-001",
                "timestampStart": "00:42",
                "timestampEnd": "00:47",
                "eventType": "Reception",
                "claim": "Player scanned once and took first touch backward under light pressure.",
                "coachingImplication": "Scan both shoulders and open body shape before receiving.",
                "confidence": 0.82,
            }
        ]
    },
    "playeriq-training-plan": {
        "approvedAnalysis": {
            "improvementAreas": [
                {
                    "finding": "Increase pre-reception scanning frequency.",
                    "linkedObservationIds": ["obs-synthetic-001"],
                }
            ]
        }
    },
    "playeriq-coach-review": {
        "observations": [{"observationId": "obs-synthetic-001", "confidence": 0.82}],
        "analysis": {"summary": "Player should improve scanning before receiving."},
        "trainingPlan": {"weeklyFocus": "Pre-reception scanning"},
    },
    "playeriq-synthetic-data": {
        "scenario": "Synthetic U14 central midfielder scanning and first-touch test",
        "recordCount": 1,
    },
}


def main():
    client = AIProjectClient(
        endpoint=PROJECT_ENDPOINT,
        credential=AzureCliCredential(),
        allow_preview=True,
    )
    openai_client = client.get_openai_client()
    results = []

    for agent_name, payload in TESTS.items():
        response = openai_client.responses.create(
            model="gpt-4-1-mini-playeriq-coach",
            input=json.dumps(payload),
            extra_body={"agent_reference": {"name": agent_name, "type": "agent_reference"}},
        )
        results.append(
            {
                "agent": agent_name,
                "responseId": response.id,
                "outputText": response.output_text,
            }
        )

    print(json.dumps({"projectEndpoint": PROJECT_ENDPOINT, "results": results}, indent=2))


if __name__ == "__main__":
    main()
