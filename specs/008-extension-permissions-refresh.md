# Extension Permissions Refresh — `008-extension-permissions-refresh`

**Specification status:** Implemented.

## 1. Purpose

This specification covers two areas:

1. **Client-side HAR → JMX conversion pipeline.** Replace the 007 backend-upload
   feature (which shipped disabled) with a local, offline-capable pipeline: the
   extension builds a HAR 1.2 archive from captured traffic in memory, then
   converts it to JMeter JMX locally and downloads the result. No server-side
   endpoint, no Selenium/Playwright/PCAP upload paths, no bearer-token auth.

2. **Re-audit the Chrome extension's declared permissions.** Re-introduce
   `"scripting"` and `"browsingData"` for the lifecycle enhancements described
   in §5. The `"notifications"` permission is **dropped** from this spec to avoid
   permission bloat and test-maintenance overhead; completion feedback is surfaced
   via the popup badge and status text. The `"downloads"` permission already present
   from `007-jmx-backend-upload` remains; `"scripting"` is now also required.

This document describes the completed implementation, including the affected
modules, public APIs, inputs/outputs, dependencies, edge cases, migration
considerations, and acceptance criteria.

## 2. Scope

### 2.1 HAR → JMX local conversion

| In scope | Out of scope |
|----------|--------------|
| Build HAR 1.2 from `CapturedRequest[]` in memory | Uploading HAR to a remote converter service |
| Convert HAR → internal traffic model → JMX using existing `buildJmx` | Converting Selenium tapes, Playwright scripts, or PCAP files |
| Domain filtering and export-filename controls flow through unchanged | Server-side conversion microservice |
| Uses existing `"downloads"` permission to save JMX | Browser-level file-system streaming API |

### 2.2 Permission refresh

| In scope | Out of scope |
|----------|--------------|
| Re-introduce `"scripting"` for dynamic app-frame injection | Removing the existing `content_scripts` `"all_frames"` declaration |
| Re-introduce `"browsingData"` for extension-scoped cookie/cache wipe on reset | Wiping the user's full browser cookies or profile data |
| Document a single consolidated permission justification | `contextMenus` (remains deferred; no concrete UX) |
| **Dropped from this spec:** `"notifications"` for completion toasts — native toast notifications are not implemented; completion feedback is surfaced via the popup badge and status text. If toast notifications become a product priority, add the `notifications` permission and related code paths in a future spec. | |

## 3. Source of Truth

| Source | Relevance |
|--------|-----------|
| `specs/006-enhance-jmx-implementation.md` §G13, §G14, §G15, §A | Original deferred gaps and future-spec hand-off map |
| `specs/007-jmx-backend-upload.md` | Backend-upload feature is superseded by this spec's pipeline; 007's disabled UI is repurposed here |

## 4. High-Level Architecture

```
Captured traffic (RecorderState)
  │
  ▼
HAR Builder (new: src/har/har-builder.ts)
  │   Input:  CapturedRequest[]
  │   Output: HAR 1.2 JSON object
  │
  ▼
HAR → JMX Converter (new: src/jmx/har-to-jmx.ts)
  │   Input:  HAR JSON + PlanMeta (name, threads, rampUp, loops)
  │   Output: JMX XML string
  │
  ▼
Popup download() / chrome.downloads.download()
```

The existing domain-filtering step (`filterRequestsByDomains`) runs on
`CapturedRequest[]` **before** the HAR builder. Forbidden-domain filtering
(`forbidden-domains.ts`) runs at capture time and is unchanged. The
`planNameForExport()` logic and `JmxOptionsStore` defaults flow through
unchanged.

The HAR is **never written to disk** unless the user explicitly saves it via a
future "Export HAR" button (out of scope for this spec). The HAR exists only as
an in-memory JSON object passed between modules.

## 5. Intended Behaviour

### 5.1 — HAR builder module (`src/har/har-builder.ts`)

**Responsibility:** Serialise an array of `CapturedRequest` into a valid HAR 1.2
log object.

**Public API:**

```typescript
export interface HAR { log: HARLog }
export interface HARLog { version: string; creator: HARCreator; entries: HAREntry[] }
export interface HARCreator { name: string; version: string }
export interface HAREntry {
  startedDateTime: string
  time: number
  request: HARRequest
  response: HARResponse
  cache: {}
  timings: HARTimings
}
// ... plus HARRequest, HARResponse, HARHeader, HARQueryParam, HARPostData,
//     HARCookie, HARContent, HARTimings (full definitions in implementation file)
export function buildHar(requests: CapturedRequest[]): HAR
```

**Behaviour:**

- One HAR entry per `CapturedRequest`, preserving original request/response
  order.
- `request.headers` and `response.headers` are flat arrays of `{name, value}`.
- Query parameters are split into `queryString: HARQueryParam[]`.
- Request and response bodies (when present in `CapturedRequest`) populate
  `postData.text` and `response.content.text`.
- `timings` are populated with zero values when `CapturedRequest` does not carry
  timing information.
- `startedDateTime` falls back to `new Date().toISOString()` when the request
  timestamp is absent.

**Dependencies:** `src/models/captured-request.ts`. No new runtime dependencies.

### 5.2 — HAR → JMX converter module (`src/jmx/har-to-jmx.ts`)

**Responsibility:** Parse a HAR object, map it through an intermediate traffic
model, and emit JMX XML using the existing `buildJmx` serializer.

**Public API:**

```typescript
export interface TrafficModel {
  entries: TrafficEntry[]
  metadata: TrafficMetadata
}
export interface TrafficEntry {
  id: string
  sequence: number
  request: {
    method: string
    url: string
    domain: string
    path: string
    port: number
    protocol: string
    headers: Record<string, string>
    queryString: Record<string, string>
    body?: string
    bodyType?: 'json' | 'form' | 'text' | 'xml' | 'binary'
  }
  response: {
    status: number
    statusText: string
    headers: Record<string, string>
    body?: string
    size: number
  }
  timing: {
    startTime: string
    duration: number
    thinkTime: number
  }
  metadata: {
    isJsonRequest: boolean
    isFormRequest: boolean
    hasAuth: boolean
    authType?: 'basic' | 'bearer' | 'cookie'
  }
}
export interface TrafficMetadata {
  recordedAt: string
  recordedBy: string
  duration: number
  totalRequests: number
  uniqueDomains: string[]
}
```

**Behaviour:**

1. Validate HAR structure (top-level `log.version`, `log.entries`).
2. For each `HAREntry`, build a `TrafficEntry`:
   - URL split into `domain`, `path`, `port`, `protocol`.
   - Headers normalised to `Record<string, string>` (case-insensitive key lookup).
   - Query string merged into `queryParams`.
   - Request body type detected from `Content-Type` / mimeType (json, form, text,
     xml, binary).
   - `isJsonRequest`, `isFormRequest`, `hasAuth` flags set on metadata.
3. Pass `PlanMeta` + the resulting traffic entries into the existing
   `buildJmx(meta, requests)` serializer. The traffic entries are mapped back
   into `CapturedRequest` shape expected by `buildJmx`.
4. Return the resulting JMX string.

**Dependencies:** `src/har/har-builder.ts` (types only; converter does not call
`buildHar`), `src/jmx/serializer.ts`, `src/models/captured-request.ts`.

**Out of scope (deferred):**

- HAR download/serialisation as a standalone export.
- Think-time timers in JMX (G20 recommendation; deferred to `009-jmx-export-quality`).
- Response assertions, `CookieManager`, redirect deduplication.

### 5.3 — Popup UX: single-step "Export HAR → JMX"

Replace the disabled 007 backend-upload panel with a single **"Export HAR → JMX"**
button in the JMX options fieldset.

**States:**

| State | Button text | Disabled | Error surface |
|-------|-------------|----------|----------------|
| Idle, domains selected | Export HAR → JMX | `false` | — |
| No domains selected | Export HAR → JMX | `true` | jmxDomainError |
| Converting... | Converting… | `true` | — |
| Success | Export HAR → JMX | `false` | — |
| Failure | Export HAR → JMX | `false` | showError |

**Flow:**

1. User selects domains (same selector as current offline export).
2. User clicks **"Export HAR → JMX"**.
3. Popup sends `EXPORT_JMX` (reuses existing message) with the selected domains.
4. Background `handleExportJmxMessage` is extended:
   - Filter requests by domain.
   - Build HAR via `buildHar()`.
   - Convert HAR → JMX via `convertHarToJmx(har, meta)`.
   - Return `{ success: true, jmx, filename }` exactly as today.
5. Popup triggers `download(response.jmx, response.filename)` exactly as today.

No new message type is required. `EXPORT_JMX` is the carrier.

### 5.4 — G16: scripting permission for dynamic app-frame injection

*(Unchanged from previous draft; see §5.4 for the prototype plan, §5.4.1 for
lifecycle-hook and frame-scope branching, and §5.4.2 for the idempotency
contract.)*

### 5.5 — G14: notifications for long-running-operation completion

**Dropped from this spec.** Native toast notifications are not implemented.
Completion feedback is surfaced via the popup badge and status text. If toast
notifications become a product priority in a future spec, add the `"notifications"`
permission and the related code paths at that time.

### 5.6 — G15: browsingData for extension-scoped reset

*(Unchanged from previous draft.)*

## 6. Affected modules

| Module | Responsibility |
|--------|----------------|
| `src/har/har-builder.ts` | **New.** Build HAR 1.2 from `CapturedRequest[]`. |
| `src/jmx/har-to-jmx.ts` | **New.** Convert HAR → TrafficModel → `buildJmx(meta, requests)`. |
| `src/background/recorder-service.ts` | `handleExportJmxMessage` now routes HAR build + conversion before returning JMX. |
| `src/popup/popup.ts` | Replace disabled backend-upload panel with "Export HAR → JMX" button in the JMX fieldset. |
| `src/popup/popup.html` | New button markup; remove backend-upload panel. |
| `src/manifest.json` | Add `"scripting"` and `"browsingData"` for the new lifecycle surfaces; `"downloads"` remains from `007`. No other permission changes in this spec. (`"notifications"` omitted; browser toast notifications are dropped.) |
| `src/content/index.ts` | Idempotency guard at frame level if prototype shows duplicate `executeScript` calls. |

## 7. Security and privacy considerations

| Permission / behaviour | Risk | Mitigation |
|------------------------|------|------------|
| `"scripting"` | Dynamic injection into all frames the extension can access | Re-use the existing `content.js`; do not introduce new remote code paths. |
| `"browsingData"` | Accidental wipe of unrelated data | Restrict `chrome.browsingData.remove` to extension-scope data only. |
| HAR in-memory | HAR contains captured request/response bodies (may include secrets) | HAR is never persisted to disk by this spec. Existing `captureResponseBody` toggle controls what data is captured in the first place. |
| Permission set growth | Users/permission scanners treat bloat as risk | Consolidate all permission changes in one pass and justify each in manifest comments. |

## 8. Migration considerations

- The 007 backend-upload feature is **superseded**. Its disabled UI, message
  types (`UPLOAD_JMX`, `UploadJmxPayload`), and `BackendUploadStore` are
  **removed**.
- The `"downloads"` permission remains (now justified by JMX download).
- `serverJMX` migration logic in `007`'s store is **deleted**; no legacy key
  remains.
- The offline JMX export path is unchanged from the user's perspective: same
  button, same filename, same domain filtering.

## 9. Acceptance criteria

### AC1 — HAR builder produces valid HAR 1.2

Given captured traffic containing at least one request:

- `buildHar(requests)` returns a HAR object whose `log.version === "1.2"`.
- Each entry contains `request.method`, `request.url`, `request.headers`,
  `response.status`, `response.headers`, and `timings`.
- Query parameters appear in `request.queryString` as `{name, value}` pairs.

### AC2 — HAR → JMX produces valid JMeter 5.x JMX

Given a HAR with two requests (GET + POST):

- `convertHarToJmx(har, meta)` returns a string passing the existing
  `buildJmx` golden tests (or a new HAR-specific golden fixture).
- The JMX header uses `meta.name` as the test plan name.

### AC3 — Domain filtering applies before conversion

Given three captured requests for domains A, B, C; user selects only A:

- The HAR contains only A's entries.
- The resulting JMX contains only A's samplers.

### AC4 — Forbidden domains excluded

Given captured traffic includes an extension-internal domain in
`forbidden-domains.ts`:

- That domain is not present in the HAR.
- It is not present in the resulting JMX.

### AC5 — Export HAR → JMX button triggers download

Given recording has captured requests and domains are selected:

- User clicks the new **"Export HAR → JMX"** button in the popup.
- Popup shows "Converting…" state.
- JMX is downloaded via `chrome.downloads.download`.
- Filename honours `planNameForExport()`.

### AC6 — scripting permission and dynamic frame injection

*(Same as prior AC1 — unchanged.)*

### AC7 — notifications for export completion

**Dropped from this spec.** Browser toast notifications are out of scope.
Completion feedback is surfaced via the popup badge and status text. Track
toast/notification work as a future-spec consideration if it becomes a
product priority.

---

### AC8 — reset clears extension cookies/cache within 5 seconds

*(Same as prior AC3 — unchanged.)*

### AC9 — permission justification is documented

Given this spec is implemented:

- `manifest.json` contains inline comments (or adjacent `docs/permissions.md`)
  justifying `"scripting"`, `"downloads"`, and `"browsingData"`.
- `"downloads"` is justified by JMX export.
- `"scripting"` is justified by app-frame lifecycle injection.
- `"browsingData"` is justified by reset-scope cookie/cache wipe.

## 10. Open questions

1. **HAR download exposure.** Should a raw HAR export be offered in addition
   to the HAR→JMX flow, for debugging or third-party tooling?
2. **HAR schema completeness.** Does the target converter (local or future
   server) require HAR `pageref`, `timings` breakdown, or `cache` details that
   the current `buildHar` omits or zeroes out?

## 11. Sequencing notes

This spec should be implemented after `007-jmx-backend-upload` is merged to
`master`, because:

- `manifest.json` already contains `"downloads"` from that merge.
- The popup JMX fieldset and `EXPORT_JMX` message flow were stabilised in `006`
  and `007`.

If `009-jmx-export-quality` is also planned, coordinate `manifest.json`
permission review so that `"downloads"`, `"scripting"`, and `"browsingData"`
are reviewed in one pass. Notifications are explicitly dropped from this spec
and should not appear in the current permission coordination.

## 11. E2E test harness status and coverage gaps

This section documents the existing Playwright end-to-end test harness and the
frontend UI surfaces that remain uncovered, based on an audit performed after
the 008 implementation landed.

### 11.1 Existing E2E harness

| File | Purpose |
|------|---------|
| `tests/e2e/spec-005-golden-extension.spec.ts` | Full E2E: loads unpacked extension in Chromium, records synthetic traffic (search + login), exports JMX + Playwright, compares against golden fixtures |
| `tests/e2e/spec-003-playwright-export.spec.ts` | Validates Playwright generator output structure (imports generator directly, verifies route/fill/click steps) |
| `tests/e2e/spec-001-extension.spec.ts` | Placeholder stub (`expect(true).toBe(true)`) — no meaningful coverage |
| `playwright.config.ts` | Configures E2E suite: `testDir: 'tests/e2e'`, Chromium only, launches local fixture server via `scripts/e2e-server.mjs` |
| `tests/fixtures/golden/golden-extension.jmx` | Golden JMX fixture for spec-005 |
| `tests/fixtures/golden/golden-extension.spec.ts` | Golden Playwright fixture for spec-005 |
| `scripts/e2e-server.mjs` | Local HTTP server serving the golden test page |

Coverage provided by spec-005:
- Start/Stop recording lifecycle
- General JMX export (`#export` button, `jmx` mode)
- General Playwright export (`#export` button, `playwright` mode)
- Golden file comparison (JMX + Playwright outputs)
- Form interactions (click, fill, submit)
- Status text assertions
- Download trigger via `waitForEvent('download')`

### 11.2 Frontend UI features discovered

**Popup (`src/popup/popup.html` + `src/popup/popup.ts`)**

| # | Feature | Element IDs |
|---|---------|-------------|
| 1 | Plan name editing | `#planName` |
| 2 | Theme switcher (light/dark) | `#themeMode` |
| 3 | Start recording | `#start` |
| 4 | Pause recording | `#pause` |
| 5 | Resume recording | `#resume` |
| 6 | Stop recording | `#stop` |
| 7 | Export mode selector | `#exportMode` (jmx / playwright) |
| 8 | General Export button | `#export` |
| 9 | JMX domain selector fieldset | `#jmxDomains` (dynamic checkboxes) |
| 10 | Domain selection status | `#jmxDomainStatus` |
| 11 | Domain error display | `#jmxDomainError` |
| 12 | "Export HAR → JMX" button (008 deliverable) | `#exportJmxSelected` |
| 13 | Clear captured data | `#clear` |
| 14 | Detached inspector | `#openDetachedInspector` |
| 15 | Transaction method filter | `#transactionMethodFilter` |
| 16 | Transaction status filter | `#transactionStatusFilter` |
| 17 | Transaction URL search | `#transactionSearch` |
| 18 | Live transaction list | `#transactionList` (expandable rows) |
| 19 | Elapsed time display | `#elapsedTime` |
| 20 | Status display | `#status` |
| 21 | Error display | `#error` |
| 22 | Pause/resume elapsed continuity | Timer state across pause→resume |

**Options page (`src/options/options.html` + `src/options/options.ts`)**

| # | Feature | Element IDs |
|---|---------|-------------|
| 23 | Theme switcher | `#themeMode` |
| 24 | Default plan name | `#defaultPlanName` |
| 25 | JMX threads | `#threads` |
| 26 | JMX ramp-up | `#rampUp` |
| 27 | JMX loops | `#loops` |
| 28 | Save JMX defaults | `#save` |
| 29 | Max transactions | `#maxTransactions` |
| 30 | Open detached inspector toggle | `#openDetachedInspector` |
| 31 | Capture response body toggle | `#captureResponseBody` |
| 32 | Save transaction panel options | `#saveTransactionPanelOptions` |
| 33 | Capture body privacy warning | `#captureResponseBodyWarning` |

### 11.3 E2E coverage matrix

| Feature | Covered | Test / Mechanism |
|---------|---------|------------------|
| Start / Stop recording | ✅ | spec-005: `#start`, `#stop`, status assertion |
| General JMX export | ✅ | spec-005: `#export` with `jmx` mode, golden comparison |
| General Playwright export | ✅ | spec-005: `#export` with `playwright` mode, golden comparison |
| Playwright generator structure | ✅ | spec-003: direct generator import, output validation |
| Plan name editing | ❌ | Not tested in E2E |
| Theme switcher (popup + options) | ❌ | Not tested in E2E |
| Pause / Resume cycle | ❌ | Only start/stop tested |
| Pause/resume elapsed continuity | ❌ | Not validated |
| Clear button | ❌ | Not tested in E2E |
| JMX domain selector (checkboxes) | ❌ | spec-005 bypasses domain selector (uses `#export`) |
| **"Export HAR → JMX" button (`#exportJmxSelected`)** | ❌ | 008 UI deliverable, untested at E2E level |
| Domain selection state updates | ❌ | `#jmxDomainStatus` counter not tested |
| No domains selected → button disabled | ❌ | Edge case untested |
| Empty capture state | ❌ | Zero-request UI state not tested |
| Error display | ❌ | Negative-path `#error` surface untested |
| Transaction method/status filters | ❌ | Not tested in E2E |
| Transaction URL search | ❌ | Not tested in E2E |
| Transaction list expand/collapse | ❌ | Not tested in E2E |
| Detached inspector window | ❌ | Not tested in E2E |
| Options page | ❌ | Entire page untested |
| Options save feedback | ❌ | Not tested in E2E |

### 11.4 Missing or weak E2E tests

**Critical (008-specific):**
- `#exportJmxSelected` button — domain checkbox interaction, zero-domain disabled state, "Converting…" text, domain-filtered JMX output correctness, and `#jmxDomainStatus` counter are all unverified at E2E level. The golden test uses `#export` (export all) and never exercises the 008-specific UI path.

**High-impact:**
- Pause/Resume — recording lifecycle incomplete without elapsed time continuity verification
- Clear button — state reset untested
- Empty capture state — zero captures is a valid user state
- Error display — no negative-path E2E test

**Medium-impact:**
- Transaction filters and search — core review UI completely untested
- Theme switching — visual QA gap
- Options page — settings persistence has zero E2E coverage

### 11.5 HAR fixture assessment: `tests/fixtures/har/example-com.har`

**Current location (recommended):** `tests/fixtures/har/example-com.har`

**Assessment:** `src/har/` is reserved for source modules (`har-builder.ts`, `har-to-jmx.ts`). The file should be moved to `tests/fixtures/har/` to separate test fixtures from production code. The filename `example-com.har` is clearer than `example.com.har` (no dot ambiguity, consistent kebab-case with other fixtures).

**Volatility:** The HAR contains real captured data with volatile fields that change on every capture:
- Timestamps: `2026-06-20T08:51:20.866+12:00`
- Response headers: `date`, `age`, `cf-ray`, `server`, `last-modified`
- Browser-specific headers: `sec-ch-ua-*`, `X-Firefox-Spdy`, `Priority`
- Network details: `serverIPAddress`, `connection`

**Recommended location:** `tests/fixtures/har/example-com.har`

**Recommended usage:**
- Unit tests of `buildHar()` as a realistic input fixture
- Unit tests of `convertHarToJmx()` to verify HAR→TrafficEntry mapping with real-world complexity
- **NOT** recommended for golden file comparisons without a normalization step (strip volatile headers/timestamps before comparison)
- Consider creating a second deterministic fixture (`tests/fixtures/har/golden-standard.har`) with fixed timestamps and headers for future golden-file comparisons of the HAR→JMX pipeline

### 11.6 Suggested next steps

**Priority 1 — 008 spec deliverables:**
1. Add E2E test for `#exportJmxSelected` button: checkbox selection/deselection, zero-domain disabled state, "Converting…" text, domain-filtered JMX output, `#jmxDomainStatus` counter, `#jmxDomainError` validation
2. Add E2E test for Pause/Resume: start → traffic → pause (elapsed freeze) → resume (elapsed advance) → stop, with status text transitions
3. Add E2E test for Clear button: record → verify → clear → verify full reset

**Priority 2 — General UI coverage:**
4. Add E2E test for empty capture state (zero requests, button states, placeholders)
5. Add E2E test for error display (negative-path `#error` surface)
6. Add E2E test for transaction panel filters (method, status, URL search)
7. Add E2E test for theme switching (popup + options persistence)
8. Add E2E test for Options page (save defaults, toggle capture body, verify persistence)

**Priority 3 — Infrastructure:**
9. Replace `spec-001-extension.spec.ts` placeholder with a meaningful smoke test
10. Add E2E test for detached inspector window
11. Move `src/har/example.com.har` to `tests/fixtures/har/example-com.har` and document intended usage
12. Consider multi-browser E2E projects (Firefox, WebKit) in `playwright.config.ts`

## 12. Sequencing notes

This spec should be implemented after `007-jmx-backend-upload` is merged to
`master`, because:

- `manifest.json` already contains `"downloads"` from that merge.
- The popup JMX fieldset and `EXPORT_JMX` message flow were stabilised in `006`
  and `007`.

If `009-jmx-export-quality` is also planned, coordinate `manifest.json`
permission review so that `"downloads"`, `"scripting"`, and `"browsingData"`
are reviewed in one pass. Notifications are explicitly dropped from this spec
and should not appear in the current permission coordination.
