### Backlog — newest first

- [ ] **009-post-impl-review** — Post-implementation review findings from `009-jmx-export-quality` delivery. High-priority items: gate the dead `redirectDedupEnabled` option, fix `as never` casts in `createRedirectFollowUp` tests, and add bounded eviction to the redirect map. Medium-priority items: revert formatting-only changes to committed files, and add edge-case tests for cross-tab isolation and disallowed-scheme `Location` headers. See dedicated section below for full action items and file references.

### Spec 009-Post-Impl — 009 Post-Implementation Review Action Items

#### 1. Goal

Address findings from the 009 P3 code review before the next cycle. The P0-P2 items are committed and working. The P3 implementation is functionally correct but has hygiene, typing, and coverage gaps that should be resolved while the diff is still fresh.

#### 2. High-priority action items

##### 2.1 Gate `redirectDedupEnabled` or remove the option wiring

**Files**: `src/options/jmx-options.ts`, `src/options/options.ts`, `src/options/options.html`, `src/options/jmx-options.test.ts`, `src/background/traffic-capture.ts`

`redirectDedupEnabled` is persisted in `DEFAULT_JMX_OPTIONS`, `JmxOptionsStore`, and the options page UI, but `traffic-capture.ts` never reads it. Every redirect link runs unconditionally.

**Recommended fix**:

- Option A (preferred): Pass `redirectDedupEnabled` into `TrafficCaptureService` (constructor or setter) and guard `registerRedirectChainHead` / `createPendingRequestForBeforeRequest` with `if (!this.redirectDedupEnabled) return`.
- Option B: Remove `redirectDedupEnabled` from `JmxOptionsStore`, the UI, and the options tests. Reintroduce it when the gating logic is ready. This avoids shipping a dead checkbox.

If Option A is chosen, `jmx-options.test.ts` should assert that the gating behavior is wired, not just that persistence works.

##### 2.2 Remove `as never` casts by fixing `createRedirectFollowUp` parameter typing

**Files**: `src/background/traffic-normalizer.ts`, `src/background/traffic-normalizer.test.ts`

```ts
const followUp = createRedirectFollowUp(source as never, details as never)
```

The `as never` casts exist because the test fabricates objects that don't satisfy the declared parameter types. The `_source` parameter is intentionally unused, which means its type should not force callers to provide a fully-typed `PendingRequest`.

**Recommended fix**:

- Change the signature to:
  ```ts
  export function createRedirectFollowUp(
    _source: PendingRequest | undefined,
    details: chrome.webRequest.OnBeforeRequestDetails
  ): PendingRequest
  ```
  or simply drop the first parameter if no future use is planned:
  ```ts
  export function createRedirectFollowUp(
    details: chrome.webRequest.OnBeforeRequestDetails
  ): PendingRequest
  ```
- Update the test to call the function without `as never` casts.

##### 2.3 Add bounded size/eviction policy to `redirectChainHeads`

**File**: `src/background/traffic-capture.ts`

`redirectChainHeads` is an unbounded `Map`. Long sessions with abandoned redirect chains can grow it until the service worker restarts.

**Recommended fix**:

- Add a max-size guard (e.g., 256 entries) with FIFO eviction, or a TTL.
- Minimal implementation: wrap the map with a small helper that evicts the oldest entry when `size > MAX`.
- Document the chosen limit in a code comment next to the field declaration.

#### 3. Medium-priority action items

##### 3.1 Revert formatting-only changes to committed files

**Files**: All files touched by Prettier that were already committed in `4205afb`

The working diff contains pure-formatting changes in committed files:
- Multi-line function signatures in `traffic-normalizer.test.ts` (e.g., `completed(...)`, `errorOccurred(...)`).
- Collapsed `buildJmx(...)` call args in `serializer.test.ts`.
- Timestamp string normalization (`'2024-01-01T00:00:00.000Z'` → `'2024-01-01T00:00:00Z'`).

These changes:
- Reduce `git blame` readability.
- Increase merge-conflict surface.
- Violate the plan's "limit edits" guidance.

**Recommended fix**:

- Run `git diff` against `4205afb` for each committed file.
- Revert formatting-only hunks, keeping only functional changes.
- Run Prettier only on the four intended P3 files: `traffic-capture.ts`, `traffic-normalizer.test.ts`, `serializer.test.ts`, `traffic-capture.test.ts`.

##### 3.2 Add edge-case tests for redirect linking

**Files**: `src/background/traffic-capture.test.ts`

The integration test covers one happy path. Missing coverage:

1. **Relative `Location` without leading slash**: `Location: new?token=abc`
2. **Disallowed scheme**: `Location: javascript:alert(1)` and `Location: file:///etc/passwd` — map must remain empty.
3. **Cross-tab isolation**: Tab 10 redirects to `/new`; Tab 20 requests `/new` — must not match.
4. **Follow-up before redirect completion**: `onBeforeRequest` for `/new` arrives before `onCompleted` for the 302 — map must survive past completion.
5. **Follow-up after recording stops**: Map entry should be dropped silently when `isCapturing()` is false.

**Recommended fix**:

- Add a `describe('redirect chain edge cases', ...)` block with the five scenarios above.
- Use the existing `MemoryStorage`, `stubChrome`, and `createService` harness.

#### 4. Low-priority action items

##### 4.1 Consider inheriting cookies/headers from the redirect source

**File**: `src/background/traffic-normalizer.ts`

`createRedirectFollowUp` ignores `_source` entirely. The follow-up starts with empty `headers` and no knowledge of the redirect response's `Set-Cookie` headers.

**Recommendation**:

- Document the explicit choice: "Follow-up requests start clean; any cookies set by the 302 are handled by the browser and will appear in `onBeforeSendHeaders` for the follow-up."
- If this is undesirable, copy `responseHeaders` (or at least cookies) from `source` to the follow-up.

##### 4.2 Update spec acceptance criteria

**File**: `specs/009-jmx-export-quality.md`

§4.4 lists `DurationAssertion` as optional, but §6 acceptance criteria says:

> Think times and assertions (when enabled) are present and functional.

`DurationAssertion` was not implemented. Update §6 to explicitly limit assertions to `ResponseAssertion`, or move `DurationAssertion` to the backlog with a clear "deferred" note.

#### 5. Suggested command sequence

```bash
# 1. Review and revert formatting-only changes in committed files
git diff 4205afb -- src/background/traffic-normalizer.test.ts src/jmx/serializer.test.ts src/background/traffic-capture.ts

# 2. After fixes, run focused P3 tests
npx vitest run src/background/traffic-capture.test.ts src/background/traffic-normalizer.test.ts src/jmx/serializer.test.ts

# 3. Run full regression
npm test && npm run typecheck && npm run lint
```

#### 6. Definition of done for review items

- [ ] `redirectDedupEnabled` is either gated in capture logic or removed from all four persistence/UI files.
- [ ] `createRedirectFollowUp` signature accepts test values without `as never`.
- [ ] `redirectChainHeads` has a documented size or TTL cap.
- [ ] Formatting-only hunks in committed files are reverted; Prettier has only run on P3-intended files.
- [ ] New edge-case tests cover cross-tab, disallowed scheme, pre-completion follow-up, and relative Location.
- [ ] `specs/009-jmx-export-quality.md` acceptance criteria reflects actual delivered assertion behavior.

- [~] **012-external-har-import-and-convert-to-jmx** — Add a separate external HAR import path that reads a user-selected `.har` file, validates it, optionally filters by domain, and converts it to JMX using the existing `convertHarToJmx()` pipeline.
  - Status: proposed
  - Depends on: stable popup JMX export UI, `convertHarToJmx()`, `downloads` permission, HAR validation helpers
  - Related spec: `specs/008-extension-permissions-refresh.md` open question on HAR schema completeness
  - Key design: keep existing captured-traffic export unchanged and add a parallel `File → HAR object → convertHarToJmx() → JMX download` path.

### Spec 012 — External HAR Import and Convert to JMX

External HAR import can be achieved by keeping the existing captured-traffic export path unchanged and adding a parallel “import file → validate HAR → convert HAR → download JMX” path.

#### 1. Keep the current pipeline intact

Current flow is:

```text
Recorded browser traffic
  → CapturedRequest[]
  → buildHar()
  → convertHarToJmx()
  → JMX download
```

That path is already implemented through:

- `src/har/har-builder.ts`
- `src/jmx/har-to-jmx.ts`
- `src/background/recorder-service.ts`
- `src/popup/popup.ts`

The new 012 feature should not replace that. It should add a second entry point into the same conversion core:

```text
User-selected .har file
  → parsed HAR object
  → convertHarToJmx()
  → JMX download
```

So `convertHarToJmx(har, meta)` remains the central conversion primitive.

#### 2. Add a separate UI surface

Do not overload the existing `Export JMX` button. That button currently means:

```text
Export captured traffic as in-memory HAR, then convert to JMX
```

For external HAR import, add a separate section, probably in the popup under the JMX export area.

Example UI structure:

```text
Export mode: JMX

Captured traffic export
- Domains to include
- Export captured traffic to JMX

Import HAR file
- File input: Choose HAR file
- Optional domain filter after parsing
- Convert HAR to JMX
```

Suggested labels:

- Button label is now `Export JMX` to avoid confusing HAR export with HAR import.
- New button: `Convert HAR to JMX`.
- File input label: `Import HAR file`.

This avoids confusing “HAR export” with “HAR import”.

#### 3. New message contract

Add a new background message, for example:

```ts
{
  type: 'IMPORT_HAR',
  har: HAR,
  includedDomains: string[]
}
```

or:

```ts
{
  type: 'CONVERT_HAR_TO_JMX',
  har: HAR,
  includedDomains: string[]
}
```

I would prefer `IMPORT_HAR` if the background is responsible for parsing/validation/conversion. I would prefer `CONVERT_HAR_TO_JMX` if the popup parses the file and only asks the background to convert.

Recommended shape:

```ts
type BackgroundRequest =
  | ...
  | {
      type: 'IMPORT_HAR'
      har: HAR
      includedDomains: string[]
    }
```

Response:

```ts
type BackgroundResponse =
  | ...
  | {
      success: true
      jmx: string
      filename: string
    }
  | {
      success: false
      error: string
    }
```

This mirrors the existing `EXPORT_JMX` response shape.

#### 4. Where parsing should happen

There are two reasonable designs.

##### Option A — Popup reads and parses the file

Flow:

```text
Popup file input
  → FileReader / File.text()
  → JSON.parse
  → basic HAR validation
  → send IMPORT_HAR with HAR object
  → background converts to JMX
```

Pros:

- Keeps file handling in the UI layer.
- Background does not need file APIs.
- Easier to show immediate parse errors.

Cons:

- Large HAR files are cloned through `chrome.runtime.sendMessage`.
- Popup must duplicate at least some validation logic.

##### Option B — Popup sends file text to background

Flow:

```text
Popup file input
  → read file as text
  → send IMPORT_HAR_FILE with text
  → background parses, validates, converts
```

Pros:

- Single validation/conversion authority in background.
- Cleaner message contract if background owns conversion.

Cons:

- Service worker may receive large text payloads.
- More work in background.
- Less immediate UI feedback.

Recommended approach:

Use Option A, but still validate again in the background before conversion. That gives good UX and keeps the background as the trusted conversion boundary.

#### 5. Background conversion flow

In `RecorderService`, add a handler similar to `handleExportJmxMessage`.

Conceptual flow:

```text
IMPORT_HAR
  → validate HAR
  → filter HAR entries by includedDomains
  → convert filtered HAR to JMX using convertHarToJmx()
  → return { success: true, jmx, filename }
```

The important point is that external HAR import should reuse:

```ts
convertHarToJmx(har, meta)
```

The only new part is getting from:

```text
File → HAR object
```

to:

```text
HAR object
```

#### 6. Plan metadata

The existing JMX export uses `PlanMeta`:

```ts
{
  name: string
  threadGroup: {
    threads: number
    rampUp: number
    loops: number
  }
}
```

External HAR import should use the same metadata rules as captured-traffic export:

- Plan name from popup `planNameInput`, falling back to saved JMX option name.
- Threads/rampUp/loops from `JmxOptionsStore`.
- Filename from safe plan name, same as existing export.

So the conversion path should remain:

```text
HAR + PlanMeta
  → convertHarToJmx()
  → JMX
```

#### 7. Domain filtering

The existing captured-traffic export filters `CapturedRequest[]` before building HAR.

For external HAR import, filtering can happen either:

```text
HAR entries → filter by domain → convertHarToJmx()
```

or:

```text
HAR entries → convertHarToJmx() → JMX
```

Better design:

Filter before conversion.

Flow:

```text
Import HAR
  → extract unique domains from HAR entries
  → render domain selector
  → user selects domains
  → filter HAR entries by selected domains
  → convertHarToJmx()
```

This mirrors the existing UX and avoids generating JMX for unwanted domains.

#### 8. HAR validation requirements

Add validation before conversion.

Minimum checks:

- Top-level `log` exists.
- `log.version === "1.2"`.
- `log.entries` exists and is an array.
- Each entry has:
  - `startedDateTime`
  - `request.method`
  - `request.url`
  - `request.headers`
  - `request.queryString`
  - `response.status`
  - `response.headers`
  - `response.content`
  - `timings`

Useful user-facing errors:

- `Invalid HAR file: file is not valid JSON.`
- `Invalid HAR file: missing log object.`
- `Unsupported HAR version: expected 1.2.`
- `Invalid HAR file: no entries found.`
- `No requests match the selected domains.`

The background should validate even if the popup already did, because messages can be spoofed.

#### 9. Privacy and security considerations

External HAR files can contain sensitive data:

- Cookies
- Authorization headers
- Query-string tokens
- Request bodies
- Response bodies

The 012 spec should explicitly say:

- Imported HAR is not persisted.
- Imported HAR is only kept in memory during conversion.
- Users should be warned before importing.
- Optional future feature: redact headers/bodies before conversion.

This is especially important because JMX output may include request/response bodies if the HAR contains them.

#### 10. Suggested 012 acceptance criteria

##### AC1 — User can select a HAR file

Given the popup is open and JMX export mode is selected:

- User sees an “Import HAR file” section.
- User can choose a `.har` file.
- The extension accepts `.har` and JSON MIME types.

##### AC2 — Imported HAR is validated

Given a selected file:

- Valid HAR 1.2 files proceed.
- Invalid JSON is rejected.
- Missing `log` is rejected.
- Unsupported HAR versions are rejected.
- Files with no entries are rejected or handled with a clear error.

##### AC3 — Imported domains are shown

Given a valid HAR with multiple domains:

- The popup extracts unique domains.
- The popup renders a domain selector.
- All domains are selected by default.
- The convert button is disabled when no domains are selected.

##### AC4 — HAR converts to JMX

Given a valid HAR and selected domains:

- User clicks “Convert HAR to JMX”.
- Popup sends `IMPORT_HAR`.
- Background filters HAR entries by selected domains.
- Background calls `convertHarToJmx()`.
- JMX file is downloaded.

##### AC5 — Existing captured-traffic export is unchanged

Given recorded traffic:

- Existing `EXPORT_JMX` flow still works.
- Existing `Export captured traffic to JMX` behavior is unchanged.
- External HAR import uses a separate message and UI path.

##### AC6 — No HAR persistence

Given an imported HAR:

- The extension does not save the HAR to storage.
- The HAR is not sent to a remote server.
- The HAR is only used to generate JMX.

#### 11. Suggested implementation modules

Likely files touched:

- `src/messages.ts`
  - Add `IMPORT_HAR` request type.
- `src/popup/popup.ts`
  - Add file input handling.
  - Add import HAR state.
  - Add domain extraction/rendering for imported HAR.
  - Add convert button handler.
- `src/popup/popup.html`
  - Add import HAR UI section.
- `src/background/recorder-service.ts`
  - Add `IMPORT_HAR` handler.
  - Reuse `convertHarToJmx()`.
- `src/jmx/har-to-jmx.ts`
  - Possibly strengthen HAR validation helpers.
- `src/har/har-builder.ts`
  - Probably unchanged.

Tests:

- Add popup unit tests for file import state.
- Add background service tests for `IMPORT_HAR`.
- Add HAR validation tests.
- Add E2E test for importing a fixture HAR.

#### 12. Recommended design summary

The cleanest design is:

```text
Popup:
  - File input selects .har
  - Popup reads file as text
  - Popup parses JSON
  - Popup validates HAR 1.2
  - Popup extracts domains
  - Popup renders domain selector
  - User clicks Convert HAR to JMX
  - Popup sends IMPORT_HAR with HAR + selected domains

Background:
  - Validates HAR again
  - Filters HAR entries by selected domains
  - Builds PlanMeta from JMX options
  - Calls convertHarToJmx()
  - Returns JMX + filename

Popup:
  - Downloads JMX
```

This keeps the existing captured-traffic export intact, reuses the existing HAR→JMX converter, and adds external HAR import as a clearly separate feature.

- [~] **011-quality-uplift** — Full hardening, performance, and security review before the next enterprise-facing release.
  - Status: proposed
  - Depends on: core recording/export flows being stable
  - Related specs: `specs/005-operational-hardening-roadmap.md`, `specs/006-enhance-jmx-implementation.md`, `specs/008-extension-permissions-refresh.md`
  - Goal: identify and fix reliability, performance, privacy, and security gaps without changing the product contract.

### Spec 011 — Quality Uplift: Hardening, Performance, and Security Review

#### 1. Goal

Run a focused quality uplift across the extension codebase to harden recording/export behavior, improve performance under realistic traffic volumes, and review security-sensitive handling of recorded data.

The goal is not to add a new user-facing feature. The goal is to make existing behavior safer, faster, more reliable, and easier to maintain before the next enterprise-facing release.

#### 2. Current risk areas

The uplift should review these areas:

- MV3 service-worker lifecycle and in-flight request persistence.
- Popup performance when many requests are captured.
- Storage size and cleanup behavior.
- Large JMX, Playwright, and HAR export behavior.
- Sensitive data exposure in JMX, Playwright scripts, HAR data, logs, and UI.
- Manifest permissions and least-privilege access.
- Message validation between popup, background, content scripts, and storage.
- DOM rendering safety in popup/options/content UI.
- Test coverage for edge cases, failures, and privacy-sensitive paths.

#### 3. Scope

##### In scope

- Hardening existing recording, pause/resume, stop, reset, and export flows.
- Performance profiling and optimization of popup rendering, storage access, and export generation.
- Security review of permissions, message handling, DOM rendering, sensitive data handling, and download behavior.
- Reliability review of MV3 lifecycle boundaries, service-worker restarts, and persisted state.
- Test additions for failure modes, large payloads, invalid inputs, and privacy-sensitive behavior.
- Documentation updates for known limits, privacy behavior, and operational guidance.

##### Out of scope

- New recorder features not required for hardening.
- New backend upload flow.
- New enterprise configuration flow.
- New external HAR import feature.
- New response-body capture feature unless the review finds an immediate security gap.
- Framework migration.

#### 4. Hardening review

The hardening review should verify that existing behavior remains correct under realistic and adverse conditions.

##### Areas to audit

- Recorder state transitions:
  - start → pause → resume → stop
  - start → reset
  - stop → reset
  - background restart during active recording
  - service-worker termination during in-flight requests
- Popup/background message handling:
  - stale `GET_STATE` responses
  - duplicate action responses
  - missing response handlers
  - invalid message payloads
  - background restart during a popup action
- Export flows:
  - JMX export with no requests
  - JMX export with many requests
  - JMX export with unsupported methods or malformed URLs
  - Playwright export with missing base URL
  - Playwright export with special characters in URLs or selectors
  - export while recording is paused
  - export after service-worker restart
- Storage behavior:
  - recorder state persistence
  - pending request persistence
  - options persistence
  - cleanup after stop/reset
  - storage quota pressure

##### Hardening acceptance criteria

- Recorder state cannot become permanently inconsistent after service-worker restart.
- Stale popup state responses cannot overwrite successful action results.
- Reset, stop, and clear-requests flows clean completed and pending request data consistently.
- Export flows return clear user-facing errors instead of silent failure.
- Invalid or missing payloads are rejected at message boundaries.
- Existing public message names remain stable unless a breaking change is explicitly approved.

#### 5. Performance review

The performance review should identify and fix avoidable work in recording, UI rendering, storage, and export generation.

##### Areas to audit

- Popup rendering:
  - number of DOM nodes created during live updates.
  - frequency of full-list rerenders.
  - filtering and sorting cost as request count grows.
  - transaction details expansion behavior.
  - memory retained by detached inspector windows.
- Storage:
  - number of `chrome.storage.local` reads/writes.
  - debounce/batch opportunities.
  - cleanup of stale state.
  - storage size growth during long recordings.
- Background:
  - request normalization cost.
  - storage merge cost for pending web requests.
  - response-body matching cost if response-body capture is enabled.
  - JMX/Playwright export generation cost.
- Export size:
  - JMX size for large recordings.
  - Playwright script size for large action sets.
  - HAR object size if external HAR import is later added.

##### Suggested performance targets

Targets should be confirmed with local profiling, but useful initial goals are:

- Popup remains responsive with at least 500 captured requests.
- Popup remains usable with at least 1,000 captured requests.
- Live request rendering does not block the popup for more than one animation frame.
- Storage writes are batched or debounced where safe.
- Export generation provides clear progress or error feedback for large recordings.
- Completed recordings do not retain avoidable in-memory copies of large payloads.

##### Performance acceptance criteria

- Popup rendering scales acceptably with realistic traffic volume.
- Long recordings do not grow storage without bound beyond configured limits.
- Export generation handles large but reasonable recordings without crashing the extension.
- Any new batching, caching, or rendering optimization preserves existing export output.
- Performance-sensitive changes include tests or profiling notes.

#### 6. Security review

The security review should focus on data exposure, permission minimization, and safe handling of untrusted content.

##### Areas to audit

- Manifest permissions:
  - each permission has a documented justification.
  - no unused permissions remain.
  - host permissions are as narrow as practical.
  - optional permissions are documented.
- Message validation:
  - background validates all incoming message payloads.
  - popup validates exported data before rendering.
  - content scripts validate incoming control messages where applicable.
- DOM safety:
  - user-controlled request/response content is rendered with `textContent`, not `innerHTML`.
  - generated Playwright/JMX content is not rendered as HTML.
  - detached inspector uses the same safe rendering rules.
- Sensitive data:
  - cookies, authorization headers, query tokens, request bodies, and response bodies are not unnecessarily persisted.
  - JMX/Playwright export clearly exposes any sensitive captured data it may include.
  - logs do not include secrets or full request/response payloads.
- Downloads:
  - generated filenames are sanitized.
  - downloads are local and not uploaded.
  - download permission is justified and scoped.
- External input:
  - options values are validated.
  - plan names and user-provided labels are sanitized for filenames.
  - future HAR import validation is designed before implementation.

##### Security acceptance criteria

- Every manifest permission has a documented purpose.
- All user-controlled or network-controlled content is rendered safely.
- Background message handlers reject malformed payloads.
- Exported JMX/Playwright behavior is explicit about sensitive data exposure.
- No secrets are written to logs.
- Sensitive captured data is not persisted unless the feature explicitly requires it and documents the trade-off.

#### 7. Test strategy

The uplift should add or improve tests in these areas:

- Recorder state tests for restart and stale-message scenarios.
- Pending request persistence tests for completion, error, stop, reset, and duplicate completion.
- Popup rendering tests for large request lists and filtering.
- Export tests for invalid, empty, and large input sets.
- Message boundary tests for malformed payloads.
- Security tests for safe DOM rendering and filename sanitization.
- Permission/documentation tests where practical.

Suggested test commands to keep green:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npx playwright test --workers=1`

#### 8. Suggested implementation modules

Likely files touched, depending on findings:

- `src/background/recorder-service.ts`
- `src/background/recorder-state.ts`
- `src/background/traffic-capture.ts`
- `src/background/traffic-normalizer.ts`
- `src/background/pending-web-request-store.ts`
- `src/popup/popup.ts`
- `src/popup/popup.html`
- `src/options/options.ts`
- `src/content/index.ts`
- `src/jmx/serializer.ts`
- `src/playwright/playwright-generator.ts`
- `src/utils/filename.ts`
- `src/messages.ts`
- `manifest.json`
- `README.md` or operational docs if permission/privacy guidance changes.

#### 9. Definition of done

- Quality review checklist is completed.
- High-risk findings are either fixed or explicitly deferred with rationale.
- Existing recording/export behavior remains compatible.
- Performance-sensitive changes are measured or explained.
- Security-sensitive changes are documented.
- Tests cover the most important hardening findings.
- Build, typecheck, lint, unit tests, and Playwright E2E tests pass.

- [x] **004 UX/UI transaction inspector and detached window** — Add compact popup/options styling, transaction panel, filters, bounded live queue, theme persistence, and detached inspector window.
  - Status: implemented in `004-improve-ux-ui-implementation`
  - Depends on: stable popup/options IDs and existing `REQUEST_CAPTURED` / `GET_REQUESTS` APIs
  - Related spec: `specs/004-improve-ux-ui-implementation.md`
  - Remaining follow-ups: response body capture and optional background port forwarding

- [~] **Typed response body capture for transaction inspector** — Add explicit opt-in capture for page-origin response bodies with privacy warnings, size limits, and tests.
  - Status: proposed
  - Depends on: 004 UX/UI transaction inspector landing
  - Related spec: `specs/004-improve-ux-ui-implementation.md`
- [~] **Background port forwarding for transaction panel** — Add a `transaction-panel` runtime port so popup and detached inspector instances receive live `STATE_CHANGED` and `REQUEST_CAPTURED` events more reliably.
  - Status: proposed
  - Depends on: stable broadcast message contract
  - Related spec: `specs/004-improve-ux-ui-implementation.md`
- [~] **Typed content body fallback after SideeX removal** — Add a small proprietary content-script adapter for fetch/XHR/form bodies where `chrome.webRequest.requestBody` is incomplete.
  - Status: proposed
  - Depends on: HTTP/JMX + Playwright port landing
  - Related spec: SideeX dependency investigation
- [~] **Persist in-flight webRequest state** — Store pending request fragments so service-worker termination cannot lose requests between `onBeforeRequest` and `onCompleted`.
  - Status: proposed
  - Depends on: canonical `CapturedRequest` model
- [~] **Wire options into JMX export metadata** — Use saved threads, ramp-up, loops, and default plan name when exporting JMX.
  - Status: proposed
  - Depends on: options page and `RecorderService`
- [~] **Golden E2E extension test** — Load the unpacked extension, record a synthetic site, export JMX, and compare against a golden file.
  - Status: proposed
  - Depends on: stable popup/export flow
- [~] **Cleaner Vite dist layout** — Emit `popup/popup.html` and `options/options.html` at manifest paths instead of `dist/src/...`.
  - Status: proposed
  - Depends on: Vite build configuration review
- [~] **JMX manager/extractor coverage** — Add CookieManager, CacheManager, timers, extractors, assertions, and transaction grouping to the serializer.
  - Status: proposed
  - Depends on: target JMeter version confirmation
- [~] **CRX packaging validation** — Run `npm run pack-crx` in the intended packaging environment and fix placeholder/path handling.
  - Status: proposed
  - Depends on: Chrome/openssl availability

- [x] **HTTP/JMX + Playwright MV3 SideeX-free port** — Remove SideeX manifest entries, replace capture with `webRequest`, add typed background state, popup/options pages, local JMX export, Playwright export, and transaction inspector UI.
  - Status: implemented in working tree
  - Depends on: SideeX analysis
  - Related spec: `specs/004-improve-ux-ui-implementation.md`

### Quick comparison (decision table)

| **Attribute**                         | **Go CLI (local proxy)** | **TypeScript MV3 extension**                                      | **Notes**                                             |
| ------------------------------------- | -----------------------: | ----------------------------------------------------------------- | ----------------------------------------------------- |
| **Feasibility for browser recording** |                     High | High                                                              | Both capture browser HTTP traffic                     |
| **User friction (certs / proxy)**     |                     High | Low                                                               | Go requires CA install and proxy config               |
| **Enterprise open-source risk**       |                Ambiguous | Low                                                               | Extension compiled JS is easiest to approve           |
| **Non-browser traffic capture**       |                  **Yes** | No                                                                | Go can capture system-wide traffic                    |
| **Request body fidelity**             |                     Full | Good via `webRequest.requestBody`; fallback needed for edge cases | SideeX content interceptors removed from initial port |
| **Deployment & scaling**              |       Installer required | Enterprise policy (.crx)                                          | Extension can be force-installed silently             |

**Verdict:** **TypeScript MV3 extension** is the recommended primary approach for browser-based recording in enterprise environments. Use a Go CLI only if you must capture non-browser traffic.

---

### Refactor plan — high level (6 steps)

1. **Separate concerns and modularize**

   - [x] Move JMX serialization into a single module `jmx/serializer.ts`.
   - [x] Keep capture logic split between `background/traffic-capture.ts` and `background/traffic-normalizer.ts`.
   - [x] Keep UI and orchestration in popup/options pages and `background/recorder-service.ts`.

2. **Stabilize request capture**

   - [x] Use `chrome.webRequest.onBeforeRequest` with `requestBody` where available.

   - [~] Add typed content-script fallback for fetch/XHR/form bodies where `webRequest.requestBody` is incomplete.

   - [x] Normalize captured requests into a single canonical `CapturedRequest` interface.

3. **Implement robust JMX serializer**

   - [x] Build a deterministic XML template generator that maps `CapturedRequest` → JMeter HTTPSamplerProxy nodes.

   - [~] Add support for common JMeter elements: CookieManager, CacheManager, Timers, CSV Data Set Config, JSON/Regex extractors. _(basic HTTPSamplerProxy done)_
   - [~] Provide a compact mapping config to control sampler naming and grouping. _(basic naming done)_

4. **Refactor background service worker**

   - [x] Convert large monolithic `dist/background/index.js` into typed modules with clear lifecycle hooks: `startRecording`, `stopRecording`, `pauseRecording`, `resumeRecording`, and `EXPORT_JMX`.
   - [x] Implement `pauseRecording`/`resumeRecording` methods through `RecorderState`.
   - [x] Replace global state with a `RecorderState` class instance persisted to `chrome.storage.local`.

5. **Testing and QA**

   - [x] Unit tests for serializer and canonicalization logic using Vitest in CI.

   - [~] End-to-end tests using a headless Chrome runner that loads the extension and performs scripted navigation to validate JMX output. _(placeholder exists)_
   - [~] Add a small sample site and golden JMX files for regression tests. _(stub exists)_

6. **Enterprise packaging & policy**

   - [x] Build a reproducible release pipeline that outputs a signed `.crx` and the compiled JS bundle. _(script created, needs Chrome on CI for actual signing)_
   - [x] Provide an enterprise install manifest and a one-click GPO/GPO-like instruction set for ExtensionInstallForcelist deployment.

---

### Concrete code-level refactors

#### 1. Canonical request model

- [x] `src/models/captured-request.ts` - CapturedRequest and PlanMeta interfaces created
- [x] `traffic-normalizer.ts` - implemented in `src/background/traffic-normalizer.ts`

- [~] `normalizeContentScriptMessage(msg)` - SideeX-free content panel exists; body fallback still pending

#### 2. JMX serializer API

- [x] `buildJmx(planMeta, requests)` - implemented in `src/jmx/serializer.ts`
- [x] Unit tests passing for GET, POST body, CDATA body, and missing optional fields

#### 3. Background worker lifecycle

- [x] `RecorderService` class with `startRecording`/`stopRecording`/`pauseRecording`/`resumeRecording` methods
- [x] `RecorderState` class with persistence to `chrome.storage.local`
- [x] `pauseRecording`/`resumeRecording` implemented; traffic capture checks active recording status

#### 4. Content script lifecycle UI

- [x] SideeX-free status panel implemented in `src/content/index.ts`

- [~] Content body fallback for fetch/XHR/form capture - not yet implemented

#### 5. Performance and memory

- [~] Batch streaming to `chrome.storage.local` - not yet implemented

- [x] Ring buffer for live UI preview - bounded transaction queue implemented in popup; background in-flight persistence remains pending.

---

### Acceptance criteria (minimal)

- [x] **Recording**: Start/stop/pause/resume works and captures HTTP traffic through `webRequest` for the initial SideeX-free phase.

- [~] **JMX output**: Generated JMX opens in JMeter and reproduces recorded HTTP requests with methods, headers, paths, and bodies. _(basic sampler generation works; managers/extractors pending)_

- [x] **No external calls**: Recording and JMX generation are fully local.
- [x] **Enterprise deployable**: Compiled artifact can be force-installed via ExtensionInstallForcelist and requires no CA or proxy changes.

- [~] **Tests**: Unit tests pass; E2E golden extension export test still pending.

---

### Spec-format prompts for implementation tasks

Current implementation notes:

```yaml
- title: "Canonical request model and normalizers"
  status: [x] COMPLETE
  outputs:
    - src/models/captured-request.ts (DONE)
    - src/background/traffic-normalizer.ts (DONE)
    - src/background/traffic-capture.ts (DONE)
```

```yaml
- title: "JMX serializer module"
  status: [~] PARTIAL
  outputs:
    - src/jmx/serializer.ts (DONE - HTTPSamplerProxy/HeaderManager/basic CDATA body)
    - src/jmx/serializer.test.ts (DONE - 4 tests passing)
  remaining:
    - CookieManager, CacheManager support
    - Timers, extractors, assertions, transaction grouping
    - Template-based naming
```

```yaml
- title: "Background service worker refactor"
  status: [x] COMPLETE
  outputs:
    - src/background/recorder-service.ts (DONE - lifecycle/export implemented)
    - src/background/recorder-state.ts (DONE - persisted state)
    - src/background/index.ts (DONE - typed message bootstrap)
  remaining:
    - Persist in-flight webRequest fragments
    - Batch/debounce storage writes
```

```yaml
- title: "SideeX-free content lifecycle UI"
  status: [x] COMPLETE
  outputs:
    - src/content/index.ts (DONE - status panel, no SideeX)
    - src/popup/popup.ts (DONE - start/stop/pause/resume/export)
    - src/options/options.ts (DONE - local options)
  remaining:
    - content body capture fallback for fetch/XHR/form edge cases
```

```yaml
- title: "Enterprise packaging and CI"
  status: [~] PARTIAL
  outputs:
    - .github/workflows/ci.yml (DONE)
    - scripts/pack-crx.mjs (DONE - needs Chrome/openssl validation)
  remaining:
    - run pack-crx in packaging environment
    - fix placeholder CRX/path handling if needed
```

---

### Testing, rollout, and monitoring

- [x] **Unit tests**: serializer, recorder state, and traffic normalizer tests pass in Vitest.

- [~] **Golden tests**: keep a small set of sample sites and expected JMX outputs. _(E2E still placeholder)_
- [~] **Beta rollout**: publish to a small enterprise OU first via ExtensionInstallForcelist. _(enterprise-install.json script ready)_
- [~] **Telemetry**: optional anonymized metrics for errors and export success rates. _(not implemented - opt-in only)_
- [~] **Rollback**: provide a simple uninstall script and a version pinning mechanism for enterprise admins. _(not implemented)_
