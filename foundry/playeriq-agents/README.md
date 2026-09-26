# PlayerIQ Foundry prompt agents

This folder contains reproducible creation and smoke-test scripts for the real prompt agents registered in:

`https://ai-playeriq-dev-eus2-vushfn4j.services.ai.azure.com/api/projects/ai-playeriq-dev-eus2-vus-project`

Agents:

- `playeriq-video-evidence`
- `playeriq-player-analysis`
- `playeriq-training-plan`
- `playeriq-coach-review`
- `playeriq-synthetic-data`

All agents currently use the `gpt-4-1-mini-playeriq-coach` model deployment. The video-evidence agent accepts structured frame/clip evidence but does not decode MP4 files itself; the future video worker must extract frames and timestamps before invoking it.

## Create or update

```powershell
python foundry\playeriq-agents\create_agents.py
```

The script is idempotent at the agent-name level: rerunning it creates a new immutable version for each agent.

## Smoke test

```powershell
python foundry\playeriq-agents\smoke_test_agents.py
```

Authentication uses the current Azure CLI identity through `AzureCliCredential`.
