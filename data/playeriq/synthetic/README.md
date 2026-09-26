# PlayerIQ synthetic test dataset

This folder contains privacy-safe synthetic data for the first PlayerIQ MVP test run.

Use it to validate:

- Cosmos DB data shape.
- Evidence-grounded observation schema.
- Coach review workflow.
- Training-plan generation.
- Fabric semantic model assumptions.
- Agent grounding behavior.

It does **not** validate computer-vision accuracy because no real video frames are included.

## Scenario

| Field | Value |
|---|---|
| Organization | Northshore Youth Academy |
| Team | U14 Blue |
| Player | Maya Shah |
| Position | Central midfielder |
| Jersey | 8 |
| Dominant foot | Right |
| Match | U14 Blue vs Lakeside FC |
| Footage | Synthetic 5-minute sideline clip metadata |
| Focus | Receiving body shape, progressive passing, turnovers |

## Files

| File | Purpose |
|---|---|
| `players.json` | Player, guardian-consent, and team profile |
| `matches.json` | Match and video asset metadata |
| `observations.json` | Evidence-linked synthetic observations |
| `coach-reviews.json` | Synthetic coach approval/correction records |
| `training-plans.json` | Generated development plan example |
| `fabric-semantic-model-seed.json` | Flattened facts/dimensions starter data |

## First test expectation

The agent/report layer should produce a player-facing summary with no more than three priorities:

1. Scan before receiving.
2. Open body shape under pressure.
3. Reduce central-third turnovers after first touch.

Every claim should cite an observation ID, timestamp range, confidence, and evidence clip ID.

