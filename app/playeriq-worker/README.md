# PlayerIQ video processing worker

The worker consumes the `video-processing` Service Bus queue and processes uploaded MP4/MOV files asynchronously.

Pipeline:

1. Download the private raw video with managed identity.
2. Validate the stream with FFprobe.
3. Extract evenly spaced JPEG frames with FFmpeg.
4. Upload thumbnails to private Blob Storage.
5. Invoke the registered `playeriq-video-evidence` Foundry prompt agent with the actual frames and timestamps.
6. Persist observations to Cosmos DB.
7. Invoke `playeriq-player-analysis`, `playeriq-training-plan`, and `playeriq-coach-review`.
8. Persist final processing status and generated records on the match document.

The initial CPU configuration is intentionally small and does not require GPU compute.

## Evidence and report provenance (local implementation; not yet deployed)

The upload worker has no synthetic-example fallback: `foundry.js` reads each
extracted JPEG and includes its exact bytes as a base64 `input_image`, labelled
with its timestamp and evidence asset. The default is at most eight frames,
maximum width 768 pixels, with low image detail. This is sparse-image analysis,
not continuous event detection, player tracking, or reliable speed/possession/
scanning measurement. `playerId` is a record label, not verified visual identity.

New reports embed observations and provenance (source video/job, model deployment,
agent name, frame count, limitations, and historical review IDs). Observation IDs
are job-scoped to avoid collisions. Frame citations only include valid IDs
explicitly returned by the agent; they are not filled with every sampled frame.

Empty, explicitly insufficient, wholly zero-confidence, or wholly uncited evidence produces a
completed **insufficient-evidence** report without running downstream coaching
agents or inventing drills. An explicit insufficient-evidence response from Player
Analysis also blocks training generation. Malformed agent output is a processing
failure, not synthetic success. These controls do not independently verify every
visual claim; human review and evaluation are still required.

## Feedback-informed coaching

Before analysis, the worker reads the most recent 100 feedback entries for this
organization/player, retains the latest review for each prior match, and selects
up to five accepted entries with `useForCoaching: true` and a server-verified
reviewer identity (`reviewerIdentityVerified: true`). Legacy unverified feedback
remains visible in history but needs a new authenticated coach review before
reuse. It checks that each review still refers to the current completed job.
Rejected, superseded, stale-job,
non-consenting, and current-match feedback is not reused.

This bounded history is passed to Player Analysis and Training Plan as untrusted,
user-reported context. Video Evidence does not receive it, avoiding contamination
of the first observation step. Prompts distinguish historical statements from
current visible evidence; provenance records exactly which reviews were supplied.
Saving a review does not modify weights, automatically retrain Foundry, or prove
improvement. A proper learning programme needs reviewed evaluation examples,
held-out tests, and versioned prompt/model changes.

The automated Coach Review agent's status is never human approval. Human reviews
are separate append-only API records; the generated report starts human review
in the pending state.
