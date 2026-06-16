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

As of 2026-06-16 15:30 +12:00:

| Phase | Status | Evidence |
|---|---|---|
| P0 — Clean stale docs/process notes | Completed | Committed on `master` as `3a5559b feat: update branching instructions, license, and README for operational hardening roadmap`. |
| P1 — Build golden E2E coverage | Completed | Added extension E2E harness, deterministic fixture server/page, golden JMX/Playwright artifacts, and action-recording state broadcasts. Verified with Vitest, Playwright E2E, `dry4js`, and `crap4js` (max numeric CRAP 12.0, below 20). |
| P2 — Harden in-flight request persistence | Not started | Backlog item remains. |
| P3 — Improve request-body fidelity | Not started | Backlog item remains. |
| P4 — Improve JMX fidelity and wire options | Not started | Backlog item remains. |
| P5 — Response body capture spec | Not started | Must remain separate and privacy-reviewed. |

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
|       P2 | Harden in-flight request persistence  | Not started | Persist pending `webRequest` fragments so MV3 service-worker termination cannot lose requests             | Protects the core recording guarantee                                                | Medium |
|       P3 | Improve request-body fidelity         | Not started | Add typed content-script fallback for fetch/XHR/form bodies where `webRequest.requestBody` is incomplete  | Restores part of the fidelity lost when SideeX was removed                           | Medium |
|       P4 | Improve JMX fidelity and wire options | Not started | Use saved plan name, threads, ramp-up, and loops; add common JMeter elements                              | Makes JMX output more useful and closer to the project success metric                | Medium |
|       P5 | Response body capture                 | Not started | Add only as a separate opt-in feature with privacy warnings, size limits, redaction/truncation, and tests | Response bodies can contain secrets and are not reliably available from `webRequest` |   High |

## Domain objects

| Object                   | Current state                                                       | Expected hardening direction                                                                                                         |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `CapturedRequest`        | Canonical request model exists in `src/models/captured-request.ts`. | Add or normalize fields needed for pending request persistence and body-fidelity fallback without changing existing export behavior. |
| `RecorderState`          | Persists recording state and completed requests.                    | Persist pending `webRequest` fragments separately from completed requests.                                                           |
| `PendingWebRequestState` | Not yet implemented.                                                | Store request fragments keyed by `requestId`, `tabId`, and `frameId` until completion/error.                                         |
| `PlanMeta`               | Exists for JMX thread-group settings.                               | Use saved options when exporting JMX.                                                                                                |
| `JmxSampler`             | Basic sampler model exists.                                         | Extend serializer coverage for common JMeter elements where required.                                                                |
| `ActionStep`             | Exists for browser action recording.                                | Include in E2E scenarios when validating combined Playwright output.                                                                 |
| `GoldenExportArtifact`   | Deterministic golden JMX and Playwright artifacts now exist under `tests/fixtures/golden/`. | Compare future extension recording/export output against those fixtures.                                      |

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
- `src/background/recorder-state.test.ts`
- `src/background/traffic-capture.test.ts` or equivalent

Expected changes:

- Persist pending request fragments to `chrome.storage.local`.
- Recover pending fragments after service-worker restart.
- Merge completed fragments into completed requests.
- Remove pending fragments on completion/error.
- Preserve existing `REQUEST_CAPTURED` broadcast behavior.

### P3 — Improve request-body fidelity

Expected files:

- `src/content/`
- `src/background/traffic-normalizer.ts`
- `src/models/captured-request.ts`
- Relevant unit tests

Expected changes:

- Add a typed content-script adapter for fetch/XHR/form body capture where appropriate.
- Keep the adapter opt-in or always-on only if it has no observable app breakage.
- Normalize fallback bodies into the existing `CapturedRequest` shape.
- Preserve existing `webRequest.requestBody` behavior.
- Avoid changing exported request payloads unless tests prove compatibility.

### P4 — Improve JMX fidelity and wire options

Expected files:

- `src/jmx/serializer.ts`
- `src/background/recorder-service.ts`
- `src/options/options.ts`
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
Scenario: request-body fallback improves incomplete webRequest bodies
  Given a synthetic page sends fetch/XHR/form data
  When recording captures that request
  Then the exported request body matches the golden body fixture
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
| JMX options                 | Saved plan name, threads, ramp-up, and loops are applied to `PlanMeta`/JMX output.                                                   |
| JMX serializer              | Existing GET/POST/body tests remain green; add tests for any new JMeter elements in scope.                                           |
| Options normalization       | Existing JMX and transaction panel options remain backward-compatible.                                                               |
| Response body safeguards    | If response body capture is later implemented, test disabled-by-default behavior, opt-in gating, truncation, and redaction.          |

## UI behaviour

P0 and P1 do not require new user-facing UI.

P2 and P3 should be behavior-preserving for users:

- Recording start/pause/resume/stop behavior remains unchanged.
- Export controls remain unchanged.
- Existing element IDs remain unchanged unless a UI change is explicitly approved.
- Transaction panel continues to show request bodies, response headers, status, timestamps, and duration.
- Response body text remains disabled/unavailable unless a separate opt-in feature is implemented.

P4 may expose existing saved options more clearly through export output:

- Saved plan name, threads, ramp-up, and loops affect generated JMX.
- No new UI is required unless the existing options page needs clearer labels.

P5 requires new UI only in a separate response-body capture spec:

- Explicit opt-in checkbox.
- Privacy warning.
- Size limit explanation.
- Clear disabled/unavailable state when capture is off.

## Dependencies

| Dependency                                     | Reason                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `specs/002-codebase-analysis.md`               | Defines the original MV3/SideeX removal rationale, state risks, and Chrome API constraints.              |
| `specs/003-playwright-record-mode.md`          | Defines Playwright export and action-recording behavior that E2E tests should validate.                  |
| `specs/004-improve-ux-ui-implementation.md`    | Defines current popup/options state, transaction inspector behavior, and deferred response body capture. |
| `specs/XXX-backlog-ideas.md`                   | Tracks the backlog items this roadmap orders and prioritizes.                                            |
| `.github/instructions/security.md`             | Defines permission, privacy, and safe-rendering constraints.                                             |
| `.github/instructions/testing.instructions.md` | Defines the expected Playwright E2E approach.                                                            |

## Implementation plan

### Phase 0 — Clean stale docs/process notes — Completed

Priority: P0
Risk: Low
Committed: `3a5559b feat: update branching instructions, license, and README for operational hardening roadmap`

Tasks:

1. Update README to remove stale pre-merge manual regression language.
2. Update branching instructions to match current branch naming and `master` usage.
3. Update `TEMPLATE.md` references to missing `memory-bank/progress.md`.
4. Replace placeholder license copyright text.
5. Review other Markdown files for stale branch or status references.

Definition of done:

- [x] No Markdown references imply the 004 branch is still open.
- [x] Branching guidance matches actual project practice.
- [x] Template guidance does not reference missing workflow files.

### Phase 1 — Build golden E2E coverage — Completed

Priority: P1
Risk: Medium
Implemented: 2026-06-16

Tasks:

1. Add a deterministic synthetic site or fixture page.
2. Add Playwright extension test harness.
3. Record HTTP traffic and browser actions.
4. Export JMX and Playwright.
5. Add golden fixtures.
6. Add CI command or document local E2E command if CI execution is not feasible yet.

Definition of done:

- [x] `npm run test:e2e` or the documented E2E command loads the extension and validates generated artifacts.
- [x] Golden JMX and Playwright fixtures are deterministic and sanitized.
- [x] Unit tests still pass.

### Phase 2 — Harden in-flight request persistence

Priority: P2
Risk: Medium

Tasks:

1. Add pending request storage schema.
2. Persist fragments on `onBeforeRequest`, `onBeforeSendHeaders`, and `onResponseStarted`.
3. Recover pending fragments after service-worker restart.
4. Merge completed fragments into completed requests.
5. Clear pending fragments on completion/error.
6. Add unit tests or deterministic tests for restart behavior.

Definition of done:

- Pending requests are not lost when the service worker stops.
- Existing recording/export behavior remains unchanged.
- Existing tests pass.

### Phase 3 — Improve request-body fidelity

Priority: P3
Risk: Medium

Tasks:

1. Define typed content-script body fallback contract.
2. Capture fetch/XHR/form bodies where safe.
3. Normalize fallback bodies into `CapturedRequest`.
4. Preserve existing `webRequest.requestBody` behavior.
5. Add unit tests for fallback normalization.

Definition of done:

- Request bodies are more complete for supported page-origin requests.
- Unsupported bodies remain handled gracefully.
- No app-breaking injection behavior is introduced.

### Phase 4 — Improve JMX fidelity and wire options

Priority: P4
Risk: Medium

Tasks:

1. Wire saved JMX options into export metadata.
2. Add tests for saved plan name, threads, ramp-up, and loops.
3. Add a narrow first slice of JMeter elements based on target JMeter version.
4. Keep basic HTTP sampler output stable.

Definition of done:

- JMX export uses saved options.
- Added JMeter elements have tests and deterministic output.
- Existing JMX export tests remain green.

### Phase 5 — Response body capture spec

Priority: P5
Risk: High

Tasks:

1. Do not implement in this roadmap branch unless explicitly approved.
2. Create a separate response body capture spec.
3. Define opt-in UX, privacy warnings, size limits, and redaction/truncation.
4. Decide whether content-script fetch/XHR wrapping is sufficient or whether another mechanism is required.
5. Add tests before implementation.

Definition of done:

- Response body capture remains disabled by default.
- A separate spec exists before implementation.
- No new high-risk Chrome permission is added without review.

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
| Golden E2E tests          | Load the real extension and validate recording/export behavior end to end.                                                    |
| Manual browser regression | Still useful for visual popup/options checks, accessibility, detached inspector behavior, and real Chrome permission prompts. |
| Build/typecheck/lint      | Ensure TypeScript, lint, Prettier, and production build remain green.                                                         |

## Definition of Done

- [x] Branch cut from `master`.
- [x] P0 stale docs/process notes are cleaned.
- [x] Golden E2E test harness is added or a concrete implementation branch is planned from this spec.
- [ ] In-flight request persistence design is implemented or scheduled as a follow-up spec.
- [ ] Request-body fallback design is implemented or scheduled as a follow-up spec.
- [ ] JMX options metadata work is implemented or scheduled as a follow-up spec.
- [ ] Response body capture remains out of scope unless a separate privacy-reviewed spec is created.
- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] No new Chrome permissions are added without documentation.
- [ ] PR is raised against `master`.

## Final recommendation

P0 and P1 are complete. The next logical phase is P2: harden in-flight request persistence across MV3 service-worker termination. Golden E2E coverage now creates a safety net for every later hardening item. After P2, tackle P3 because request-body fallback protects the core recording guarantee. P4 improves JMX usefulness. P5 should remain a separate privacy-reviewed feature, not part of the general hardening branch.
