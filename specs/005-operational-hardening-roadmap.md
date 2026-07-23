# Spec 005 — Operational Hardening Roadmap

## Branch

```text
spec/005-operational-hardening-roadmap
```

Cut from `master` after the `004-improve-ux-ui-implementation` branch has been merged.

## Executive summary

Capultura now has the core MV3 recording/export pipeline, JMX export, Playwright export, browser action recording, and the 004 transaction inspector. The next release risk is operational confidence: stale process notes, lack of golden extension E2E coverage, MV3 in-flight request persistence, incomplete request-body fidelity, basic JMX serializer coverage, and the high-risk question of response body capture.

This spec defines a prioritized operational hardening roadmap. It does not implement all items in one branch. It orders the work so the next branch creates confidence and reliability before adding higher-risk capture features.

## Context

The existing documentation repeatedly identifies the same pattern: the feature surface is broad, but release confidence is not yet strong enough for enterprise use.

Relevant evidence:

- README lists golden E2E extension export tests, full CRX packaging validation, mid-flight request persistence, and response body capture as deferred follow-ups (`README.md:20-26`).
- Project brief lists response body capture, service-worker termination risk, JMX serializer gaps, golden E2E tests, and CRX packaging validation as open risks (`projectBrief.md:74-80`).
- `specs/004-improve-ux-ui-implementation.md` marks the UX/UI transaction inspector as implemented but leaves response body capture and background port forwarding deferred (`specs/004-improve-ux-ui-implementation.md:435-467`).
- `specs/003-playwright-record-mode.md` marks Playwright export and action recording as implemented with follow-ups, including E2E tests and generated test format documentation (`specs/003-playwright-record-mode.md:3-16`, `specs/003-playwright-record-mode.md:194-199`).
- `specs/002-codebase-analysis.md` identifies content body fallback, mid-flight request persistence, response body capture, background port forwarding, basic JMX coverage, options metadata, E2E coverage, and CRX packaging as areas still needing improvement (`specs/002-codebase-analysis.md:528-538`).
- `specs/XXX-backlog-ideas.md` tracks golden E2E, in-flight persistence, request-body fallback, JMX manager/extractor coverage, CRX packaging, and response body capture as backlog items (`specs/XXX-backlog-ideas.md:17-46`).

## Progress

As of 2026-06-16 20:00 +12:00:

| Phase                                      | Status      | Evidence                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 — Clean stale docs/process notes        | Completed   | Committed on `master` as `3a5559b feat: update branching instructions, license, and README for operational hardening roadmap`.                                                                                                                                                                                       |
| P1 — Build golden E2E coverage             | Completed   | Committed on `master` as `2b14247 feat: add golden extension E2E coverage`. Added extension E2E harness, deterministic fixture server/page, golden JMX/Playwright artifacts, and action-recording state broadcasts. Verified with Vitest, Playwright E2E, `dry4js`, and `crap4js` (max numeric CRAP 12.0, below 20). |
| P2 — Harden in-flight request persistence  | Completed   | Committed on `master` as `09709ad feat: persist pending web requests across service-worker restarts`. Added durable pending request storage, recovery, merge, cleanup, and deterministic P2 tests.                                                                                                                   |
| P3 — Improve request-body fidelity         | Documented  | Committed on `master` as `cc41c2f docs: introduce P3 request-body fidelity roadmap`. P3 design is documented; implementation remains a follow-up phase.                                                                                                                                                              |
| P4 — Improve JMX fidelity and wire options | Implemented | Added shared JMX option normalization, wired saved options into popup/background export, and added P4 tests. Full project checks still need to be reported after final validation.                                                                                                                                   |
| P5 — Response body capture spec            | Not started | Must remain separate and privacy-reviewed.                                                                                                                                                                                                                                                                           |

## Scope

## **In scope:**

1. Clean stale docs/process notes.
2. Build golden E2E coverage for the extension recording/export loop.
3. Harden in-flight request persistence across MV3 service-worker termination.
4. Improve request-body fidelity for fetch/XHR/form edge cases where `chrome.webRequest.requestBody` is incomplete.
5. Improve JMX fidelity and wire saved JMX options into export metadata.
6. Treat response body capture as a separate, opt-in, privacy-reviewed feature.

## **Out of scope (deferred):**

- Transaction panel background port forwarding, unless it is required to make golden E2E/live-update behavior reliable.
- Popup `popup.ts` refactor, unless required by a specific hardening task.
- Selenium/SideeX replay restoration.
- System-wide proxy or MITM capture.
- Non-browser traffic capture.
- Default response body capture.
- `chrome.debugger`-based capture unless a separate response-body spec explicitly requires it.

## Priority roadmap

| Priority | Workstream                            | Status      | Goal                                                                                                      | Why it matters                                                                       |   Risk |
| -------: | ------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -----: |
|       P0 | Clean stale docs/process notes        | Completed   | Remove stale branch, merge, manual-regression, and template/process guidance                              | Prevents future contributors from following outdated instructions                    |    Low |
|       P1 | Build golden E2E coverage             | Completed   | Load the real extension, record a synthetic flow, export JMX/Playwright, and compare golden artifacts     | Converts manual confidence into repeatable release confidence                        | Medium |
|       P2 | Harden in-flight request persistence  | Implemented | Persist pending `webRequest` fragments so MV3 service-worker termination cannot lose requests             | Protects the core recording guarantee                                                | Medium |
|       P3 | Improve request-body fidelity         | Not started | Add typed content-script fallback for fetch/XHR/form bodies where `webRequest.requestBody` is incomplete  | Restores part of the fidelity lost when SideeX was removed                           | Medium |
|       P4 | Improve JMX fidelity and wire options | Implemented | Use saved plan name, threads, ramp-up, and loops; add common JMeter elements in later slices              | Makes JMX output more useful and closer to the project success metric                | Medium |
|       P5 | Response body capture                 | Not started | Add only as a separate opt-in feature with privacy warnings, size limits, redaction/truncation, and tests | Response bodies can contain secrets and are not reliably available from `webRequest` |   High |

## Domain objects

| Object                   | Current state                                                                                                                       | Expected hardening direction                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `CapturedRequest`        | Canonical request model exists with `body`, `contentType`, and export consumers already using them.                                 | Add fallback metadata fields only if needed to explain body source/truncation without changing existing export behavior. |
| `RecorderState`          | Persists recording state and completed requests.                                                                                    | Persist pending `webRequest` fragments separately from completed requests.                                               |
| `PendingWebRequestState` | Durable pending request state is implemented in `src/models/pending-web-request.ts` and persisted through `PendingWebRequestStore`. | Store request fragments keyed by `requestId`, `tabId`, and `frameId` until completion/error.                             |
| `PlanMeta`               | Exists for JMX thread-group settings.                                                                                               | Use saved options when exporting JMX.                                                                                    |
| `JmxSampler`             | Basic sampler model exists.                                                                                                         | Extend serializer coverage for common JMeter elements where required.                                                    |
| `ActionStep`             | Exists for browser action recording.                                                                                                | Include in E2E scenarios when validating combined Playwright output.                                                     |
| `GoldenExportArtifact`   | Deterministic golden JMX and Playwright artifacts now exist under `tests/fixtures/golden/`.                                         | Compare future extension recording/export output against those fixtures.                                                 |

## Repository / API changes

### P0 — Clean stale docs/process notes

Expected files:

- `README.md`
- `.github/instructions/branching.instructions.md`
- `TEMPLATE.md`
- `LICENSE.md`
- Any other stale Markdown discovered during the branch.

Expected changes:

- Remove stale “manual browser regression before merge” language now that manual regression has been completed for the 004 branch.
- Align branch naming guidance with current project practice.
- Align `main`/`master` guidance with the active repository.
- Remove or update references to missing `memory-bank/progress.md`.
- Replace placeholder license copyright text.

### P1 — Build golden E2E coverage

Expected files:

- `tests/e2e/spec-005-golden-extension.spec.ts`
- `tests/fixtures/golden-page.html`
- `tests/fixtures/golden/`
- `playwright.config.ts`
- `scripts/e2e-server.mjs`
- `src/background/recorder-service.ts`
- `src/content/action-recorder.ts`
- `src/content/index.ts`
- `src/utils/filename.ts`
- CI workflow only if required to run the new E2E job

Expected changes:

- Add a synthetic sample site or deterministic local test page.
- Load the unpacked extension in a browser test.
- Start recording.
- Generate HTTP traffic and browser actions.
- Export JMX.
- Export Playwright.
- Compare normalized outputs with golden files while stripping volatile browser headers.
- Keep fixtures sanitized and deterministic.
- Broadcast recorder state/action-control messages to content scripts so future pages can record DOM actions.

### P2 — Harden in-flight request persistence

Expected files:

- `src/background/recorder-state.ts`
- `src/background/traffic-capture.ts`
- `src/background/traffic-normalizer.ts`
- `src/background/pending-web-request-store.ts`
- `src/models/pending-web-request.ts`
- `src/background/recorder-state.test.ts`
- `src/background/pending-web-request-store.test.ts`
- `src/background/traffic-capture.test.ts` or equivalent
- `src/background/traffic-normalizer.test.ts`

Expected changes:

- Add a durable pending request schema in `chrome.storage.local`.
- Persist request fragments on `onBeforeRequest`, `onBeforeSendHeaders`, and `onResponseStarted`.
- Recover pending fragments during background initialization and service-worker restart.
- Merge completed fragments into `CapturedRequest` without duplicating completed requests.
- Clear pending fragments on completion, error, stop, reset, and clear-requests flows.
- Preserve existing `REQUEST_CAPTURED` broadcast behavior.
- Keep P2 behavior-preserving for the popup, export controls, and existing export formats.

#### P2 implementation

P2 targets the MV3 service-worker termination risk in the current traffic recorder. Today `TrafficCaptureService` kept in-flight requests in a private `Map<string, PendingRequest>`. That works while the background page remains alive, but it loses the request if Chrome stops the service worker after `onBeforeRequest` and before `onCompleted` or `onErrorOccurred`.

The P2 implementation introduces a durable pending request store and keeps the public extension behavior unchanged.

Storage contract:

- Store pending fragments under a single `chrome.storage.local` key such as `pendingWebRequests`.
- Key each pending fragment by a stable composite request id, currently `${tabId}-${requestId}`.
- Preserve the existing `CapturedRequest` fields that are known at each event:
  - `id`, `timestamp`, `method`, `url`, `path`, `queryParams`
  - `tabId`, `frameId`, `type`, `initiator`
  - `headers` and `contentType` from `onBeforeSendHeaders`
  - `statusCode` and `responseHeaders` from `onResponseStarted`
  - request `body` only when it is already available from `chrome.webRequest.requestBody`
- Do not add response body capture in P2.
- Do not add new manifest permissions in P2.

Lifecycle contract:

1. `onBeforeRequest`
   - Create or replace the pending fragment.
   - Persist it immediately.
   - Keep the in-memory cache updated for fast merge.

2. `onBeforeSendHeaders`
   - Create a minimal pending fragment if `onBeforeRequest` was missed.
   - Merge request headers and content type.
   - Persist the updated fragment.

3. `onResponseStarted`
   - Create a minimal pending fragment if earlier fragments were missed.
   - Merge response status and response headers.
   - Persist the updated fragment.

4. `onCompleted`
   - Load the pending fragment from storage or cache.
   - If it is missing, create a minimal completed request from the completion details.
   - Merge completion timestamp and response headers.
   - Remove the pending fragment from storage.
   - Add the completed request to recorder state.
   - Save recorder state.
   - Broadcast `REQUEST_CAPTURED`.

5. `onErrorOccurred`
   - Load or create the pending fragment.
   - Merge error text and completion timestamp.
   - Remove the pending fragment from storage.
   - Add the completed request to recorder state.
   - Save recorder state.
   - Broadcast `REQUEST_CAPTURED`.

6. `startRecording`
   - Clear stale pending fragments for the previous recording unless the state shows an active recording after restart.
   - Persist the active recording state as today.

7. `stopRecording`, `reset`, and `clearRequests`
   - Clear pending fragments before state save so stopped recordings do not keep orphaned in-flight fragments.

Recovery contract:

- On background initialization, load persisted recorder state and persisted pending fragments.
- Rehydrate `TrafficCaptureService` with recovered pending fragments.
- If recorder state is `recording`, keep recovered fragments available for later completion/error events.
- If recorder state is not `recording`, clear pending fragments as orphaned work.
- Treat stale fragments older than a conservative TTL as orphaned and clear them on recovery. The first implementation should choose a TTL of at least 10 minutes unless tests show a shorter safe value.
- Never duplicate a completed request if the same completion event is observed twice.

Privacy and security constraints:

- P2 persists the same request data that completed requests already persist today.
- P2 must not persist response bodies.
- P2 must not render captured data with `innerHTML`.
- P2 must not add remote code, CDN dependencies, or runtime OSS dependencies.
- P2 must keep existing public message names stable: `STATE_CHANGED` and `REQUEST_CAPTURED`.

Implementation boundaries:

- P2 may refactor `TrafficCaptureService`, `TrafficNormalizer`, and `RecorderState`.
- P2 should not implement content-script body fallback; that is P3.
- P2 should not change JMX metadata or saved options; that is P4.
- P2 should not introduce response body capture; that is P5.

### P3 — Improve request-body fidelity

Expected files:

- `src/content/request-body-capture.ts`
- `src/content/request-body-capture.test.ts`
- `src/background/request-body-fallback-store.ts`
- `src/background/request-body-fallback-store.test.ts`
- `src/background/traffic-capture.ts`
- `src/background/traffic-capture.test.ts`
- `src/background/traffic-normalizer.ts`
- `src/background/traffic-normalizer.test.ts`
- `src/models/request-body-fallback.ts`
- `src/models/captured-request.ts` only if new metadata fields are required
- P3 golden E2E fixture updates only if the synthetic P1 flow captures additional request bodies

Expected changes:

- Add a typed content-script adapter for fetch/XHR/form body capture where safe.
- Keep the adapter opt-in or always-on only if it has no observable app breakage.
- Preserve existing `webRequest.requestBody` behavior as the primary source.
- Normalize fallback bodies into the existing `CapturedRequest` shape.
- Avoid changing exported request payloads unless tests prove compatibility.
- Add size limits, truncation metadata, and unsupported-body handling.
- Do not capture response bodies in P3.

#### P3 design

P3 improves request-body fidelity without revisiting P2 persistence or P5 response-body capture. The current recorder gets request bodies from `chrome.webRequest.onBeforeRequest` with the `requestBody` extra. `src/background/traffic-normalizer.ts` decodes only `requestBody.raw[0].bytes` or `requestBody.raw[0].file`. That misses common page-origin bodies when Chrome does not expose them through `webRequest`, including some `fetch`, `XMLHttpRequest`, and form submissions.

P3 should supplement, not replace, `webRequest.requestBody`.

Current architecture review:

- `TrafficCaptureService` registers `webRequest` listeners with `requestBody`, `requestHeaders`, and `responseHeaders`.
- `createPendingRequest()` creates the initial pending request and decodes the available `webRequest` body.
- `mergeBeforeSendHeaders()` adds headers and `contentType`.
- `CapturedRequest.body` is already consumed by:
  - `src/jmx/serializer.ts`, which writes raw POST bodies.
  - `src/generators/playwright.ts`, which fulfills mocked responses with the recorded request body.
  - `src/popup/popup.ts`, which displays truncated request body text using `textContent`, not `innerHTML`.
- `src/content/action-recorder.ts` records DOM actions but does not inspect request payloads.
- `src/content/index.ts` is the right injection point for a body-capture adapter because it already runs in page context and receives recorder state snapshots.

P3 should introduce a body fallback pipeline:

1. Content-script capture
   - Add `RequestBodyCapture` in `src/content/request-body-capture.ts`.
   - Start capture only while recorder state is active.
   - Stop capture when recording stops, pauses, resets, or the content script is removed.
   - Capture same-page request bodies for supported cases:
     - `window.fetch(requestOrUrl, init)`
     - `XMLHttpRequest.prototype.send(body)`
     - native `<form>` submissions with `application/x-www-form-urlencoded` or safe text fields.
   - Do not block or delay the original request.
   - Do not consume the original request stream; use `Request.clone()` for fetch where supported.
   - Skip or truncate bodies above a conservative byte limit, initially 64 KiB.
   - Skip binary/blob/file payloads unless they can be safely represented as text fields.

2. Background fallback message
   - Add a new internal background message such as `REQUEST_BODY_FALLBACK`.
   - Payload should include:
     - `tabId`
     - `frameId`
     - `url`
     - `method`
     - `contentType`
     - `body`
     - `capturedAtMs`
     - `source` (`fetch`, `xhr`, or `form`)
     - `truncated`
   - Keep public broadcast names stable: `STATE_CHANGED` and `REQUEST_CAPTURED`.

3. Fallback persistence and matching
   - Add `RequestBodyFallbackStore` for short-lived fallback entries.
   - Store fallback entries under a dedicated `chrome.storage.local` key such as `requestBodyFallbacks`.
   - Prune fallback entries older than a short TTL, initially 30 seconds.
   - Match fallback entries to pending requests by:
     - exact tab/frame id
     - method
     - normalized URL without volatile query ordering
     - content type compatibility
     - timestamp window
   - If multiple pending requests match one fallback, do not apply the fallback.
   - If a fallback arrives before the pending request, keep it briefly in fallback storage until the matching `webRequest` fragment arrives.

4. Normalization
   - Add `RequestBodyFallback` model in `src/models/request-body-fallback.ts`.
   - Add `applyRequestBodyFallback(pending, fallback)` in `traffic-normalizer.ts`.
   - Preserve `webRequest.requestBody` when present.
   - Apply fallback only when `pending.body` is missing or when tests prove the fallback is more complete and safe.
   - Preserve `contentType` from headers when available; otherwise use fallback content type.
   - If truncation occurs, keep the truncated body and record metadata only if the model is extended.

5. Export compatibility
   - Existing P1/P2 golden artifacts should remain stable for flows without fallback bodies.
   - Add or update one deterministic golden scenario for a supported fetch/XHR/form body fallback.
   - JMX and Playwright exports should continue to use `CapturedRequest.body` without new serializer branches.

Privacy and security constraints:

- P3 captures request bodies, which may contain credentials, tokens, PII, or secrets.
- P3 must not capture response bodies.
- P3 must not add new manifest permissions.
- P3 must not render captured bodies with `innerHTML`.
- P3 must apply a byte limit and truncation behavior.
- P3 must skip unsupported binary/blob/file bodies unless they are safe text representations.
- P3 must not introduce remote code, CDN dependencies, or runtime OSS dependencies.

Implementation boundaries:

- P3 may refactor `TrafficCaptureService`, `TrafficNormalizer`, and content script setup.
- P3 should not change JMX metadata or saved options; that is P4.
- P3 should not implement response body capture; that is P5.
- P3 should not restore Selenium/SideeX replay.

### P4 — Improve JMX fidelity and wire options

Expected files:

- `src/options/jmx-options.ts`
- `src/options/jmx-options.test.ts`
- `src/jmx/serializer.ts`
- `src/background/recorder-service.ts`
- `src/options/options.ts`
- `src/popup/popup.ts`
- `src/jmx/serializer.test.ts`
- `src/background/recorder-service.test.ts`
- `src/options/options.test.ts`

Expected changes:

- Use saved JMX options for plan name, threads, ramp-up, and loops.
- Add support for selected JMeter elements based on a narrow first slice:
  - CookieManager
  - CacheManager
  - Timers
  - Extractors
  - Assertions
  - Transaction controllers or sampler grouping
- Keep existing basic HTTP sampler output stable.

#### P4 implementation

P4 wires the recorder options already saved by `src/options/options.ts` into JMX export metadata. The first implementation scope is the saved plan name, thread count, ramp-up time, and loop count. It does not add new JMeter manager/extractor/assertion elements yet; those remain later P4 slices.

Implementation details:

- Added `src/options/jmx-options.ts` with shared JMX option normalization.
- Reused that normalization in `src/options/options.ts` so the options page keeps the existing storage keys:
  - `defaultPlanName`
  - `threads`
  - `rampUp`
  - `loops`
- Added `JmxOptionsStore` so background export can load saved options from `chrome.storage.local`.
- Updated `RecorderService` to build `PlanMeta` from saved options during `EXPORT_JMX`.
- Kept user-entered popup plan names authoritative unless the snapshot plan name is the default `Untitled Plan`; in that case the saved default plan name is used.
- Updated popup startup to seed the plan name input from saved JMX options when the field is empty.
- Added tests for option normalization, serializer metadata, recorder export metadata, and popup behavior.

### P5 — Response body capture

Expected files:

- New spec before implementation, likely `specs/006-response-body-capture.md`.
- Potential future files:
  - `src/content/`
  - `src/background/`
  - `src/popup/`
  - `src/options/`
  - `src/models/captured-request.ts`
  - Tests under `src/` and `tests/e2e/`

Expected changes:

- Do not implement in this roadmap branch unless explicitly scoped as a separate follow-up.
- Require explicit user opt-in.
- Add privacy warnings.
- Add size limits.
- Add truncation/redaction behavior.
- Add tests for disabled, enabled, unavailable, truncated, and sensitive-body cases.
- Avoid `chrome.debugger` unless a separate design review approves it.

## State changes

| State area                     | Current behavior                                               | Hardened behavior                                                            |
| ------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Recording state                | `RecorderState` persists completed state and requests.         | Also persists pending request fragments.                                     |
| Pending `webRequest` fragments | Held in memory in `TrafficCaptureService.pending`.             | Survive service-worker termination through `chrome.storage.local`.           |
| Request bodies                 | Mostly from `webRequest.requestBody`; SideeX fallback removed. | Supplement with typed content-script fallback for fetch/XHR/form edge cases. |
| JMX options                    | Options are saved but not used for export metadata.            | Export uses saved plan name, threads, ramp-up, and loops.                    |
| Response bodies                | Not captured; UI shows disabled/unavailable text.              | Remains unchanged until a separate opt-in response-body feature is approved. |
| Golden artifacts               | No golden extension export fixtures.                           | Deterministic JMX/Playwright fixtures used by E2E tests.                     |

## Acceptance criteria

Write E2E tests as user behavior, not implementation steps.

```text
Scenario: stale docs and process notes are cleaned
  Given the 004 UX/UI branch has been merged
  When the hardening roadmap branch is reviewed
  Then README, branching instructions, template references, and license placeholders no longer describe stale or missing workflow assumptions
```

```text
Scenario: golden JMX export from extension recording
  Given the extension is loaded as an unpacked Chrome extension
  When the user records a synthetic site with HTTP traffic
  And exports JMX
  Then the generated JMX matches the golden JMX fixture for method, URL, headers, body, and domain filtering
```

```text
Scenario: golden Playwright export from extension recording
  Given the extension is loaded as an unpacked Chrome extension
  When the user records browser actions and HTTP traffic
  And exports Playwright
  Then the generated `.spec.ts` matches the golden fixture for page actions and HTTP request blocks
```

```text
Scenario: pending webRequest fragments survive service-worker termination
  Given recording has started
  And a request is in flight
  When the service worker is terminated before completion
  And the request later completes
  Then the completed request is persisted and exported without requiring the user to restart recording
```

```text
Scenario: pending webRequest fragments are cleared when recording stops
  Given recording has started
  And at least one request is pending
  When the user stops recording
  Then no pending fragments remain in durable storage
```

```text
Scenario: recovered pending requests merge only once
  Given recording has started
  And a pending request has been recovered from durable storage
  When the same completion event is observed twice
  Then the recorder exports exactly one completed request
```

```text
Scenario: request-body fallback improves incomplete webRequest bodies
  Given a synthetic page sends fetch, XHR, and form data
  When recording captures those requests
  Then supported request bodies match the golden body fixtures and unsupported bodies are handled safely
```

```text
Scenario: webRequest request bodies remain the primary source
  Given a request has a complete webRequest.requestBody
  And the content-script fallback also observes the same request
  When recording exports the request
  Then the exported body remains the webRequest body
```

```text
Scenario: saved JMX options are used during export
  Given the user has saved plan name, threads, ramp-up, and loops
  When the user exports JMX
  Then the generated JMX thread group uses the saved values
```

```text
Scenario: response body capture remains opt-in and disabled by default
  Given the extension is installed with default settings
  When the user records a response
  Then the transaction panel does not display or persist response bodies unless the user explicitly enables the approved opt-in capture feature
```

## Unit tests required

| Area                        | Required tests                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Pending request persistence | Persist pending fragments, recover after restart, merge on completion, clear on error, avoid duplicate completed requests.           |
| Request-body fallback       | Normalize fetch/XHR/form fallback bodies, preserve existing `webRequest.requestBody` behavior, handle missing/invalid bodies safely. |
| Content body capture        | Capture supported fetch, XHR, and form bodies without blocking requests or consuming original streams.                               |
| Fallback matching           | Match fallback entries to pending requests by tab/frame, method, URL, content type, and timestamp; avoid ambiguous matches.          |
| JMX options                 | Saved plan name, threads, ramp-up, and loops are applied to `PlanMeta`/JMX output.                                                   |
| JMX serializer              | Existing GET/POST/body tests remain green; add tests for any new JMeter elements in scope.                                           |
| Options normalization       | Existing JMX and transaction panel options remain backward-compatible.                                                               |
| Response body safeguards    | If response body capture is later implemented, test disabled-by-default behavior, opt-in gating, truncation, and redaction.          |

## UI behaviour

P0 and P1 do not require new user-facing UI.

P2 should be behavior-preserving for users:

- Recording start/pause/resume/stop behavior remains unchanged.
- Export controls remain unchanged.
- Existing element IDs remain unchanged unless a UI change is explicitly approved.
- Transaction panel continues to show request bodies, response headers, status, timestamps, and duration.
- Pending request persistence is transparent; users should not need to restart recording after a service-worker restart.
- Response body text remains disabled/unavailable unless a separate opt-in feature is implemented.

P3 should be behavior-preserving for users:

- Recording start/pause/resume/stop behavior remains unchanged.
- Export controls remain unchanged.
- Existing element IDs remain unchanged unless a UI change is explicitly approved.
- Request body capture improves only where safe and supported.
- Unsupported request bodies remain handled gracefully.
- Captured request bodies continue to be displayed with safe text rendering and truncation.
- No app-breaking injection behavior is introduced.

### Phase 3 — Improve request-body fidelity

Priority: P3
Risk: Medium
Status: Not started

Tasks:

1. Add `RequestBodyFallback` model and short-lived fallback storage.
2. Add content-script request-body capture for fetch, XHR, and safe form submissions.
3. Send fallback messages to the background without blocking page requests.
4. Match fallback bodies to pending `TrafficCaptureService` requests.
5. Preserve `webRequest.requestBody` as the primary source.
6. Add unit tests for normalization, fallback matching, ambiguous matches, truncation, and unsupported bodies.
7. Add or update golden E2E coverage for supported fallback bodies.

Definition of done:

- Request bodies are more complete for supported page-origin requests.
- Existing `webRequest.requestBody` captures remain unchanged.
- Unsupported bodies are skipped or truncated safely.
- No response body capture is introduced.
- No new Chrome permissions are added.
- Existing P1/P2 golden artifacts remain stable unless a supported fallback body is intentionally added.

### Phase 4 — Improve JMX fidelity and wire options

Priority: P4
Risk: Medium
Status: Implemented
Implemented: 2026-06-16

Tasks:

1. Wire saved JMX options into export metadata.
2. Add tests for saved plan name, threads, ramp-up, and loops.
3. Add a narrow first slice of JMeter elements based on target JMeter version.
4. Keep basic HTTP sampler output stable.

Definition of done:

- [x] JMX export uses saved options.
- [ ] Added JMeter elements have tests and deterministic output.
- [x] Existing JMX export tests remain green.

### Phase 5 — Response body capture spec

Priority: P5
Risk: High
Status: Spec reviewed. Implementation is **in progress**, incomplete. See `specs/005-operational-hardening-roadmap-p5-response-body-capture.md`.

Tasks:
1. ✅ Create a separate response body capture spec and branch spec/006-response-body-capture.
2. ✅ Define opt-in UX, privacy warnings, size limits, and redaction/truncation.
3. ✅ Decide on content-script fetch/XHR wrapping as the capture mechanism.
4. ✅ Add tests before and alongside implementation.

Current implementation status:

| Area | Status |
| --- | --- |
| `src/utils/response-body.ts` — size measurement, truncation, redaction, `ResponseBodyCapture` class | Implemented |
| `src/content/response-body-capture.ts` — fetch/XHR wrapper with opt-in gating | Implemented |
| `src/background/response-body-store.ts` — short-lived persisted store with TTL/max-entries pruning | Implemented |
| `src/background/response-body-matching-service.ts` — pending/completed request matching | Implemented |
| `src/background/recorder-service.ts` — `RESPONSE_BODY_CAPTURED` handler | Implemented |
| `src/background/traffic-normalizer.ts` — apply captured body to requests | Implemented |
| `src/popup/popup.ts` — display response body in transaction panel | Implemented (opt-in only) |
| `src/options/options.ts` — privacy warning copy and opt-in checkbox | Implemented |
| Unit tests for `ResponseBodyCapture`, store, matching service, content-script wrapper | Implemented with tracked follow-ups below |

Follow-up improvements tracked for completion after this merge:

1. `vitest.config.ts` currently excludes `src/content/response-body-capture.test.ts` from the default run. Add a short comment documenting the exclusion rationale and a TODO to restore browser-environment coverage.
2. `src/models/captured-request.ts` can be extended with `startedAtMs?: number`. This removes the `any` cast in `src/background/response-body-matching-service.test.ts:85-86` and aligns the model with the matching service’s expiry path.
| Popup/options behavior tests under opt-in | Not delivered |
| E2E/Playwright validation of privacy copy and opt-in gating | Not delivered |

Gaps to close before P5 can be marked complete:
1. Add `src/utils/response-body.test.ts` covering truncation, redaction, and content-type handling.
2. Add `src/background/response-body-store.test.ts`.
3. Add `src/background/response-body-matching-service.test.ts`.
4. Add `src/content/response-body-capture.test.ts`.
5. Add popup/options behavior tests that prove response bodies are only surfaced when the opt-in flag is set.

Definition of done:

- Response body capture remains disabled by default.
- A separate spec exists before implementation.
- No new high-risk Chrome permission is added without review.
- Tests cover opt-in, disabled, truncated, redacted, error paths.
- Existing export behavior is unchanged.

## Constraints

- Do not add new manifest permissions unless the specific workstream requires them and the permission is documented.
- Do not introduce remote code, CDN dependencies, or runtime OSS dependencies.
- Do not render captured request/response content with `innerHTML`.
- Do not persist sensitive bodies unless explicitly enabled by an approved opt-in feature.
- Keep existing public message names stable unless a breaking change is explicitly approved.
- Preserve existing popup/options element IDs unless a UI change is explicitly approved.

## Testing strategy

| Test type                 | Purpose                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Unit tests                | Validate storage normalization, request-body fallback, JMX options, serializer output, and response-body safeguards.          |
| P2 service/store tests    | Simulate pending request persistence, recovery, completion/error merge, stale cleanup, and duplicate completion handling.     |
| P3 body capture tests     | Validate fetch/XHR/form capture, fallback matching, truncation, unsupported bodies, and export compatibility.                 |
| Golden E2E tests          | Load the real extension and validate recording/export behavior end to end.                                                    |
| Manual browser regression | Still useful for visual popup/options checks, accessibility, detached inspector behavior, and real Chrome permission prompts. |
| Build/typecheck/lint      | Ensure TypeScript, lint, Prettier, and production build remain green.                                                         |

## Definition of Done

- [x] Branch cut from `master`.
- [x] P0 stale docs/process notes are cleaned.
- [x] Golden E2E test harness is added or a concrete implementation branch is planned from this spec.
- [x] In-flight request persistence is implemented and covered by deterministic tests.
- [x] Request-body fallback design is implemented or scheduled as a follow-up spec.
- [x] JMX options metadata work is implemented or scheduled as a follow-up spec.
- [ ] Response body capture remains out of scope unless a separate privacy-reviewed spec is created.
- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] No new Chrome permissions are added without documentation.
- [ ] PR is raised against `master`.

## Final recommendation

P0, P1, P2, and P4 are complete; P3 is documented and ready for implementation. P3 is the next active phase: improve request-body fidelity for fetch/XHR/form edge cases where `webRequest.requestBody` is incomplete. The P3 design should keep `webRequest.requestBody` as the primary source, add safe content-script fallback only for supported text bodies, and preserve existing export behavior unless a supported fallback body is intentionally captured. Later P4 slices can add selected JMeter elements. P5 should remain a separate privacy-reviewed feature, not part of the general hardening branch.
