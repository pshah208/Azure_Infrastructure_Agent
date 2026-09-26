# PlayerIQ frontend

Static, framework-free Clawpilot-themed upload/report UI and player library.

Both pages default to the dark Clawpilot theme, independent of the browser's
system theme. An explicit `scoutTheme=light` query parameter remains available.

**Local-only implementation: these changes have not been deployed. Azure/Entra preflight and registration/deployment prerequisites remain unresolved; no cloud changes are authorized or performed here. Do not expose local-mock authentication publicly. Organization ID scoping and frontend controls are not authorization boundaries: the API must enforce token validation, role checks and membership for every protected operation.**

## Local use and tests

```powershell
cd app\playeriq-frontend
npm ci
npm run build
npm test
npm start -- -l 4187
```

`npm run build` copies the installed `@azure/msal-browser` bundle into `vendor/msal-browser.min.js`; no CDN is used. `npm start` and `npm test` also build this asset automatically. Tests execute actual rendering/auth/application logic with jsdom, a controlled MSAL adapter, and mock HTTP responses. They preserve the original 23 report/history/dark-theme regressions and add auth/RBAC/media tests. They do not sign in against a live tenant or prove a cloud deployment is ready.

### Real API integration tests (local only)

Install the sibling API's dependencies before the separate integration runner. From the repository root:

```powershell
npm --prefix app\playeriq-api ci
npm --prefix app\playeriq-frontend ci
npm --prefix app\playeriq-frontend run test:integration
```

`test\integration\api.integration.test.js` imports the real API `createApp`, uses explicitly mock Azure services **with `authEnabled: true`**, generates ephemeral local RSA keys, and injects `jose.createLocalJWKSet` through the API's test-only `authenticationKeys` option. The browser-side MSAL adapter supplies actual locally signed RS256 access tokens. Requests travel over real HTTP to an ephemeral `127.0.0.1` port; no Azure, Graph, Entra discovery or tenant calls occur.

The runner verifies viewer history/report/JPEG reads, viewer write rejection, coach review creation and persistence after a fresh page load, server rejection of spoofed reviewer identity, CORS preflight headers, 401s for missing/expired tokens, and membership-enforced 403s including Admin. JPEG fixture bytes come from the API's mock storage adapter. jsdom uses native Node fetch/AbortController and Blob URLs; this does not test an interactive Microsoft login or browser-enforced CORS. The listener closes after the suite. `jose` resolves from the API's installed package; no backend dependencies are added to the frontend runtime.

- **`index.html`** uploads a new clip with a unique generated match ID, organization/player context, and a friendly match name. The separate synthetic sample action is explicitly labeled and uses the sample match fixture, not the selected video.
- **`players.html`** filters previous uploads by organization/player, loads paginated history, retrieves full reports, and records human feedback and self-reported progress. Upload links carry `apiUrl`, `organizationId`, `playerId`, and `matchId` query fields. `scoutTheme=light|dark` is preserved.
- **`report.js` / `report.css`** provide shared structured report rendering and styling. Strength/improvement/drill objects (including JSON-encoded strings) render as labeled details. Evidence links resolve to actual observations; missing legacy details are explained rather than invented.
- **`auth.js`** initializes MSAL, handles redirect responses, retrieves API-verified identity/memberships, gates controls, and clears data when access changes. A missing auth script, missing MSAL bundle, invalid config, or failed identity lookup does not grant access.

Reports show AI quality checks separately from human-submitted review history. They never calculate evidence/pipeline coverage or an improvement score. Frame counts and model confidence are not verified accuracy. Player identity remains unverified.

## API contract

Set **API URL** to your locally running API for integration testing. Both pages share environment-aware defaults: on `localhost`, `127.0.0.1`, or IPv6 loopback, the default is `http://localhost:8080` (change the port as needed). On a hosted hostname, the default and **only permitted API origin** is `https://ca-api-playeriq-dev-eus2-002.salmonpebble-a4005584.eastus2.azurecontainerapps.io`, pinned in the packaged `report.js`. A loopback frontend may also use a loopback `apiUrl` override, such as another local port. Hosted pages reject loopback and arbitrary API overrides; local pages also reject arbitrary remote origins. Rejected inputs remain visible with an error rather than silently falling back. Retaining hosted configuration does not mean this local-only release has been deployed or is suitable for public access.

Data GETs include `organizationId`, including health, status and JPEG requests; `/api/auth/config` and `/api/auth/me` are identity/configuration endpoints without organization filters. The upload page builds scoped status URLs using `URL.searchParams` rather than concatenating a query onto the returned `statusUrl`; already-scoped status URLs therefore cannot acquire a duplicate `?`.

To use a fixed preview port, run `npx serve app\playeriq-frontend -l 4187` from the repository root. Open `http://localhost:4187/index.html` or `http://localhost:4187/players.html`. Both accept `apiUrl`, `organizationId`, `playerId`, and optional `scoutTheme` query fields; the library also accepts `matchId` to open a selected report. URL-encode values, particularly the API URL. Example (replace port 8080 with your local API port):

```text
http://localhost:4187/players.html?apiUrl=http%3A%2F%2Flocalhost%3A8080&organizationId=org-northshore-academy&playerId=player-maya-shah-008
```

| Operation | Endpoint |
| --- | --- |
| Public auth configuration | `GET /api/auth/config` |
| Current authenticated identity | `GET /api/auth/me` |
| Health | `GET /health?organizationId=…` |
| Synthetic demo | `POST /api/analysis/synthetic` |
| Video upload | `POST /api/uploads` (raw video; `x-playeriq-*` metadata headers) |
| Upload status / full report | `GET /api/uploads/:matchId?organizationId=…` |
| Player history | `GET /api/players/:playerId/matches?organizationId=…&continuationToken=…` |
| Sampled frame | `GET /api/uploads/:matchId/frames/:index?organizationId=…` |
| Human feedback | `POST /api/uploads/:matchId/reviews` |

History returns `{ matches, nextContinuationToken }`. Detail returns match/player/organization IDs, processing state, videoAsset, generatedRecords (analysis, training plan, AI check, observations, provenance), and reviews. Optional legacy observations/provenance may be absent. Frame requests use zero-based manifest positions and only run after processing completes. JPEGs are fetched with the API bearer token, then displayed/opened using temporary browser object URLs, revoked on rerender/signout/account/API changes. **Neither direct private Blob URLs nor API image links requiring tokens are embedded. Tokens never appear in image URLs.**

Review payload: `{ organizationId, playerId, reviewer, decision, notes, correctedSummary, progress, useForCoaching }`. Reviewer and notes must both be nonempty. Only completed reports can be reviewed. Future coaching reuse requires a verified authenticated reviewer, `decision: "accepted"` **and** an explicitly checked opt-in. The worker refuses legacy/local-mock reviews with missing or false `reviewerIdentityVerified`, even if accepted and opted in, and retains the true verification flag in eligible prompt context. Saving or displaying legacy feedback does not make it reusable. Saved eligible feedback may inform future prompts; it **does not train the model**. Progress values are self-reported (`improved`, `unchanged`, `needs_work`, `not_assessed`).

## Authentication and role contract

Public `/api/auth/config` must return either:

```json
{
  "enabled": true,
  "tenantId": "<tenant GUID>",
  "clientId": "<SPA client GUID>",
  "scope": "api://<API client GUID>/access_as_user"
}
```

or explicitly `{ "enabled": false }` for local-mock mode. Mock mode is only accepted when **both the page hostname and API hostname are loopback**. Only after this explicit response, the frontend creates an unmistakably unverified local-mock identity with read/upload/review/admin permissions, without calling `/api/auth/me`. Organization/player inputs remain editable for local fixtures; the current selected organization gets a local-only `playerIds: ["*"]` scope. This is a development convenience, not a membership grant or authenticated identity. Missing/failed config never falls back to mock access. The backend separately requires `AUTH_ENABLED=false`, `ENABLE_MOCK_AZURE=true`, and `NODE_ENV=development|test`, and binds to loopback in this mode.

`/api/auth/me` returns `{ objectId, tenantId, name, roles, permissions: { read, upload, review, admin }, memberships: [{ organizationId, playerIds: ["*"] or exact player IDs }] }`. A missing membership, missing readable role, or mismatched Entra identity blocks access. The UI intersects server permission flags with recognized roles:

| Role | Read history/media | Upload | Human review | Synthetic/admin actions |
| --- | --- | --- | --- | --- |
| `PlayerIQ.Admin` | Yes | Yes | Yes | Yes |
| `PlayerIQ.Coach` | Yes | Yes | Yes | No |
| `PlayerIQ.Viewer` | Yes | No | No | No |

Every role, including Admin, needs organization/player membership. Organization/player suggestions derive from memberships; single granted choices become read-only. Backend enforcement remains mandatory even when the browser hides controls.

MSAL initialization precedes `handleRedirectPromise`. Sign-in and sign-out use redirects, not popups. An already signed-in account acquires the configured delegated scope silently. Interaction-required/expired sessions show a **Sign in with Microsoft** action rather than looping through automatic prompts. Authentication uses only `https://login.microsoftonline.com/<GUID tenant>`; configuration must contain GUID app IDs and an exact `api://GUID/access_as_user` scope.

The API textbox and query string are **untrusted inputs**, not token-delivery authorities. The packaged production-origin pin is checked **before fetching auth configuration or acquiring tokens**. Only a loopback frontend can opt into a loopback API. Valid-looking public auth configuration from an attacker cannot expand this allowlist. Changing production API origins requires an independently reviewed static application change, never configuration fetched from the candidate API.

Bearer headers are only sent to the selected, allowlisted origin. All config, identity, data and media fetches use `redirect: "error"`; resolved responses are also rejected when flagged as redirected or when their origin differs. Access tokens are handled by MSAL's session-storage cache and transient memory, never application query fields or raw image URLs. No client secret is used. Changing the API URL clears prior data and requires **Reload access**. Signout/account changes clear reports, history, review form state, pending-upload context and object URLs; late responses are discarded.

Entra reviewer names come from `/api/auth/me`, are read-only, and cannot be substituted by changing the input. Local-mock mode instead supplies the fixed read-only name `Local mock reviewer (unverified)`. The backend must stamp verified review identity independently of the client payload. Saved reviews display a verified badge only when `reviewerIdentityVerified: true`, `reviewerObjectId`, and `reviewerTenantId` are present; legacy and mock records remain unverified.

### External prerequisites (not provisioned here)

- A tenant-specific Entra SPA registration and API registration exposing the configured delegated scope, with appropriate consent, app roles and backend membership assignments.
- Registered SPA redirect URIs matching each actual page URL, **without query fields**: for example `http://localhost:4187/index.html` and `http://localhost:4187/players.html`. Production HTTPS equivalents require their own approved registration. Sign-in restores only non-token context for the same page.
- API CORS allowing the explicit frontend origin and `Authorization`/upload metadata headers; production API validation of RS256 Entra v2 issuer, audience, tenant, authorized client, delegated scope, roles and memberships.
- Production backend `ALLOW_ORIGIN` set to the exact approved HTTPS frontend origin (HTTP loopback is only allowed outside production).
- Completed organizational preflight and deployment review before any cloud changes. No app registration or actual tenant IDs have been configured by this implementation. Retaining the hosted API default does not assert these prerequisites are already met.

## Recovery and prototype limitations

- Token acquisition is bounded to 30 seconds. API requests time out after 30 seconds; video uploads allow 120 seconds. Polling runs up to 120 checks at five-second intervals. A timeout does not mean the server stopped processing.
- Pending upload context is retained in tab session storage and bound to the current identity and membership. **Resume / recheck last upload** retrieves status without sending the video again, including after a same-identity refresh. Signout/account/API changes clear it. The history link provides another recovery route.
- **Start a different upload** resets the pending pointer and clears the file selection; it does not cancel or delete the previous upload. Inspect history before choosing to upload the same clip again.
- Concurrent submissions are disabled. After an uncertain review save, recheck the report and inspect review history before saving again. Exactly-once review writes cannot be guaranteed without server idempotency support.
- Legacy and local-mock reviewer identities are **unverified**. Entra authentication does not verify which player appears in the video, or make self-reported progress an objective improvement score. Use consented test footage only. Browser CORS/API availability still apply.
- No backend, worker, infrastructure or live deployment changes are made by this frontend.

The Dockerfile builds the local MSAL vendor asset in a clean Node stage (`npm ci --omit=dev`) and copies it with both pages, four runtime scripts and the shared stylesheet into nginx. No host `node_modules` directory is needed in the image. nginx returns 404 for missing assets instead of serving HTML as JavaScript, avoids caching HTML, and suppresses referrer headers. Existing local `node_modules` is retained.
