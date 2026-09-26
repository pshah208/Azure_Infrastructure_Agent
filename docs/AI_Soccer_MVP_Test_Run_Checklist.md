# PlayerIQ MVP Test Run Checklist

Use this checklist to prepare the first MVP test run.

## Minimum information needed

| Information | Why it is needed | Example |
|---|---|---|
| Test mode | Determines whether the run validates data/agent flow only or real video processing too | Synthetic data only, real video upload, or both |
| Target player profile | Scopes the evaluation and coaching language | U14 central midfielder, #8, blue team, right-footed |
| Video or sample data | Provides evidence for observations or seed data for synthetic validation | 2-10 minute sideline clip |
| Footage context | Helps interpret events and choose valid assumptions | Training match, outdoor full-size pitch, stable sideline camera |
| Evaluation focus | Keeps the first test narrow and measurable | Receiving body shape, progressive passing, turnovers |
| Coaching rubric | Defines what good looks like for the selected position and age band | Scan before receiving, open body shape, first touch away from pressure |
| Output format | Determines what artifacts the test should produce | Player report, coach report, Q&A demo, dashboard, or all |
| Consent assumption | Confirms safe handling of youth or identifiable footage | Synthetic/adult/test footage, or youth footage with guardian/club permission |
| Success criteria | Defines whether the test passed | Observations include timestamps, confidence, and no unsupported claims |

## Recommended first test package

```text
Mode: synthetic data plus one short real clip if available
Player: U14 central midfielder, #8, blue team, right-footed
Clip: 5-minute stable sideline video
Focus: receiving body shape, progressive passing, turnovers
Output: evidence-linked player report and 3-priority training plan
Success: generate observations with timestamps/confidence and no unsupported claims
```

## If no video is available

Run a synthetic data test first. This validates:

- Cosmos DB containers and core data model.
- Event, observation, evidence, benchmark, and coach-review schemas.
- Report and training-plan output shape.
- Agent grounding contract.
- Dashboard and semantic-model assumptions.
- No-result and unsupported-claim behavior.

Synthetic data does not validate computer-vision accuracy.

## If real video is available

Use a short, stable clip before testing full matches:

- 2-10 minutes long.
- 720p or better.
- 25 fps or better.
- Stable sideline or elevated sideline angle.
- Target player visible often enough to track.
- Team color and jersey number known.
- Ball and nearby tactical context visible for at least some events.

Avoid the first real test on broadcast footage, heavy zoom, poor lighting, missing field markings, or a clip where the target player is frequently occluded.

