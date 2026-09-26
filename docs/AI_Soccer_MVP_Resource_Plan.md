# AI Soccer Development Copilot MVP Resource Plan

## Recommended MVP resource stack

The MVP should stay lean: core application services, evidence data, asynchronous video processing, one Foundry-hosted agent, and enough analytics to validate player-development outcomes.

| Area | Azure resource | Purpose | MVP priority |
|---|---|---|---|
| App hosting | Azure Container Apps | Host APIs, backend services, and async workers | Must |
| Frontend | Azure Static Web Apps or Container Apps | Player, coach, guardian, and academy UI | Must |
| Identity | Microsoft Entra ID or Entra External ID | Authentication for players, guardians, coaches, and academies | Must |
| Media storage | Azure Blob Storage | Original videos, derived clips, thumbnails, frames, and exports | Must |
| Queueing | Azure Service Bus | Upload, processing, retry, and dead-letter workflows | Must |
| Operational database | Azure Cosmos DB for NoSQL | Players, teams, matches, consent, observations, evidence clips, reviews, and plans | Must |
| Agent reasoning | Microsoft Foundry Agent Service | Evidence-grounded coaching reports and conversational Q&A | Must |
| Reasoning model | Foundry-hosted model deployment | Tool orchestration, interpretation, summaries, and training-plan generation | Must |
| Evidence retrieval | Azure AI Search | Grounded retrieval over observations, clips, rubrics, drills, and benchmarks | Should; can be deferred if regional capacity is unavailable |
| Observability | Application Insights and Log Analytics | Traces, failures, latency, cost signals, and quality metrics | Must |
| Secrets and keys | Azure Key Vault | Central secret and configuration protection | Must |
| Workload identity | Managed identities | Least-privilege service-to-service access | Must |
| Video preprocessing | Container Apps Jobs | Transcoding, frame extraction, clip creation, and job orchestration | Must |
| Computer vision inference | Azure Machine Learning endpoint or GPU worker | Player/ball detection, tracking, pose/orientation, field calibration, and event inference | Should for real footage MVP |
| Analytics | Microsoft Fabric semantic model | Longitudinal player progress, academy reporting, coach-review analytics, and benchmark tracking | Should |
| Synthetic data | Fabric Lakehouse, SQL seed tables, or structured files | Demo data, evaluator data, dashboard development, load tests, and privacy-safe edge cases | Should |
| Governance | Azure Policy, RBAC, diagnostic settings, and private networking where feasible | Security, compliance, and operational guardrails | Must |

## Minimum practical deployment

For the first real MVP, start with:

1. Azure Container Apps for API, worker, and job orchestration.
2. Azure Blob Storage for raw videos, processed clips, thumbnails, model artifacts, and exports.
3. Azure Cosmos DB for NoSQL as the system of record for product and evidence data.
4. Azure Service Bus for asynchronous processing and dead-letter handling.
5. Microsoft Foundry Agent Service with one Soccer Development Agent.
6. One Foundry-managed reasoning model.
7. Azure AI Search for evidence-grounded retrieval.
8. Application Insights and Log Analytics from day one.
9. Azure Key Vault and managed identities for secure access.
10. A batch-oriented GPU inference path only for computer-vision workloads.

The application should be CPU-first. GPU should be isolated behind asynchronous jobs or Azure Machine Learning so it can scale independently and avoid coupling the whole product to expensive compute.

## GPU decision

The app itself does not need GPU. Frontend, API, authentication, storage, database, queueing, Foundry calls, search, dashboards, and reporting can run on CPU services.

GPU is likely needed for a real footage MVP because the computer-vision pipeline must perform player detection, ball detection, multi-object tracking, pose/orientation estimation, field calibration, and event inference. A prototype can use short controlled clips, precomputed synthetic events, CPU processing, or managed services, but a practical 90-minute match workflow will likely require GPU-backed batch workers or Azure Machine Learning.

Recommended compute pattern:

```text
CPU app + queue + storage
        |
        v
GPU video inference worker/job
        |
        v
structured evidence + clips
        |
        v
Foundry agent reasoning
```

## Synthetic data and Fabric IQ

Synthetic data helps the MVP if it is used to accelerate testing and product validation, not to replace real coach-annotated match footage.

Good uses:

- Demo data for early product walkthroughs.
- Dashboard and semantic-model development before real pilot volume exists.
- Load testing for processing, reporting, and agent retrieval flows.
- Privacy-safe edge cases for consent, authorization, missing evidence, poor footage, and no-result states.
- Agent contract validation, including timestamp, confidence, evidence clip, model version, prompt version, and coach-review status.

Limits:

- Synthetic data should not be used as proof of player-evaluation quality.
- It cannot capture the full messiness of real footage, occlusion, lighting, camera movement, referee interference, jersey ambiguity, and coach interpretation.
- Real pilot evaluation still needs representative videos and coach-labeled annotations.

Fabric should serve analytics and evaluation, while the operational database remains the product system of record.

Recommended Fabric semantic model:

| Table | Type | Purpose |
|---|---|---|
| FactPlayerMatchMetric | Fact | Match-level and player-level metric history |
| FactObservation | Fact | AI-generated and coach-reviewed observations |
| FactCoachReview | Fact | Acceptance, correction, rejection, reviewer, and review timing |
| FactTrainingPlan | Fact | Development priorities and prescribed plans |
| FactDrillCompletion | Fact | Drill adherence and player follow-through |
| FactProcessingCost | Fact | Cost per video, match, tenant, model, and pipeline stage |
| FactPlayerProgress | Fact | Longitudinal improvement against consistent metric definitions |
| DimPlayer | Dimension | Player attributes, age band, position, and permissions |
| DimTeam | Dimension | Team context |
| DimOrganization | Dimension | Academy or club tenant |
| DimMatch | Dimension | Match metadata and context |
| DimPosition | Dimension | Position-specific rubric context |
| DimAgeBand | Dimension | Cohort grouping |
| DimSkillLevel | Dimension | Competitive level grouping |
| DimMetric | Dimension | Metric definitions and versions |
| DimBenchmarkCohort | Dimension | Benchmark provenance and eligibility |
| DimModelVersion | Dimension | Model, prompt, and metric lineage |
| DimDate | Dimension | Time intelligence |

Key MVP measures:

- Coach acceptance rate.
- Coach correction rate.
- Rejected-observation rate.
- Unsupported-claim rate.
- Unsupported-footage rate.
- Recurring weakness frequency.
- Improvement by metric over time.
- Drill completion rate.
- Average confidence by event type.
- Processing cost per match.
- Time to first insight.
- Full-match processing duration.

## Resources to defer

Do not build these until the MVP proves value:

- Multi-agent production orchestration.
- Real-time match analysis.
- Advanced biomechanics.
- Fully automated talent ranking.
- Named professional player comparisons.
- Support for every camera angle and footage quality.
- Large-scale custom model training.
- Mobile-native app if a responsive web app is enough for pilot.
- Complex academy marketplace or recruiting features.

## Recommended MVP decision

Use Azure Container Apps, Blob Storage, Azure Cosmos DB for NoSQL, Service Bus, Azure AI Search, Microsoft Foundry Agent Service, Application Insights, Key Vault, and managed identities as the first MVP foundation.

Add GPU only as an isolated asynchronous computer-vision tier, and use Fabric semantic modeling once there is enough synthetic or pilot evidence data to validate player progress, coach review behavior, benchmark quality, and unit economics.
