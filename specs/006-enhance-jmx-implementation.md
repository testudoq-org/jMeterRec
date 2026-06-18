# Enhance JMX Implementation — Gap Analysis & Prioritised Specifications

## 1. Purpose

This document compares the behaviour surface of `src-ori` against the new `src`,
identifies every gap relevant to JMX-related functionality, and provides a
specification for each gap. Each specification describes the intended behaviour,
affected modules, public APIs, inputs and outputs, dependencies, edge cases,
expected interactions, migration considerations, and acceptance criteria. Every
gap is subsequently prioritised for investigation and implementation; **no code is
changed by this document**.

The comparison is limited to JMX-adjacent functionality: JMX generation and export,
options persistence, traffic capture, response-body handling, domain filtering, and
consumer-facing messaging/permissions.

---

## 2. Summary of Gaps

| G20 | Enhanced JMX export functionality (comparative analysis) | Multiple new-src modules | **New** |
| G1  | Upload traffic to backend converter (`server_jmx`)         | none                                        | **Deferred**      |
| G2  | `upload_jmx` DOM form workflow                             | none                                        | **Deferred**      |
| G3  | `export_jmeter` / `export_jmeter_follow` message contracts | `EXPORT_JMX`                                | **Implemented**   |
| G4  | Overlay progress UX (iframe height postMessage)            | Popup/badge                                 | **Implemented**   |
| G5  | Domain download overlay                                    | Domain selector in popup                    | **Implemented**   |
| G6  | Server URL / ARD URL / theme options loading form          | none                                        | **Deferred**      |
| G7  | JMX thread group options normalisation/validation          | `JmxOptionsStore`                           | **Implemented**   |
| G8  | Plan-name collision between snapshot and saved default     | `planNameForExport`                         | **Implemented**   |
| G9  | Response-body captured into JMX CDATA                      | `applyCapturedResponseBody` + `escapeCdata` | **Implemented**   |
| G10 | Subdomain-aware domain filtering                           | `filterRequestsByDomains`                   | **Implemented**   |
| G11 | Skip extension-internal / policy domains                   | `forbidden-domains.ts`                      | **Implemented**   |
| G12 | Legacy jQuery `.domains-body` checkbox                     | Domain selector in popup                    | **Implemented**   |
| G13 | `contextMenus` permission                                  | none                                        | **Deferred**      |
| G14 | `notifications` permission                                 | none                                        | **Deferred**      |
| G15 | `browsingData` permission                                  | none                                        | **Deferred**      |
| G16 | `scripting` permission                                     | none                                        | **Not Required**  |

The following sections detail every gap as a standalone specification, then provide
a consolidated priority table and implementation guidance.

---

### G1 — Backend JMX converter URL (`server_jmx`)

**Intended behaviour (src-ori)**
The options page exposes a "Server Converter" text input bound to storage key
`server_jmx`. When the user triggers export, the captured requests are POSTed to
that URL and the server returns a JMX file or download link. No local JMX XML is
generated client-side.

**Current status in new `src`: Deferred.**
Product decision: standalone client-side tooling only. Backend upload is not
implemented; offline JMX generation is the only supported path.

**Migration considerations**

- No code changes required for offline-only mode.
- If re-introduced later, implement as an async background `fetch()` rather than
  jQuery overlay, gated behind an explicit user action.

**Acceptance criteria**

- AC1: Not applicable (upload path not restored).
- AC2: **Resolved.** Product documentation (this spec / README) confirms offline JMX generation is the only supported path.

---

### G2 — `upload_jmx` DOM form workflow

**Intended behaviour (src-ori)**
A jQuery-based in-page overlay (`#run-overlay`, `.download-body`, `.domains-body`,
`.include-domains`) collects domains and triggers the server upload/convert flow.
It is injected into the host page by `src-ori/js/content-script.js`.

**Affected src-ori modules/files**

- `src-ori/js/content-script.js`
- `src-ori/js/common.js`
- `src-ori/dist/recorder-ui.html`

**Public events / functions / methods / APIs**

- `$.domainDownloadOverlay`, `$.exportSelectedDomains`, `$.uploadSelectedDomains`
- Storage keys `selected_domains`, `mode`
- DOM references `#button-upload-jmeter`, `#upload-jmx`, `#run-overlay`

**Input/Output**

- **Input:** Server URL, domain checkboxes, captured traffic.
- **Output:** POST to converter; progress overlay updates.

**Migration considerations**

- Re-implement as a popup or side-panel panel. Avoid Manifest V3 CSP issues
  from host-page injection.

**Acceptance criteria**

- AC1: The UI for backend upload is either present in the popup/options or
  documented as unsupported.
- AC2: Backend export failures (network, HTTP errors) surface in the popup.

---

### G6 — Server URL / ARD URL / theme options loading form

**Intended behaviour (src-ori)**
Options page includes custom server URL, ARD URL, converter URL, and a theme
selector (`backendapp` vs `dynatrace`). The theme drives logo asset selection in
the injected popup.

**Affected src-ori modules/files**

- `src-ori/options/options.tsx`
- `src-ori/options/helpers.tsx`
- `src-ori/js/content-script.js:37-44`

**Public events / functions / methods / APIs**

- Storage keys `custom_server`, `server`, `custom_ard`, `ard_url`, `serverJMX`,
  `theme`
- Helper functions `loadSettings`, `saveSettings`, `resetSettings`

**Input/Output**

- **Input:** User-entered URLs + theme toggle.
- **Output:** Saved settings; theme applied to injected UI.

**Migration considerations**

- The new `src` drops these enterprise/ branding options. If custom-branded
  instances are required, add a server URL field (optional) and a theme selector
  (light/dark or brand).

**Acceptance criteria**

- AC1: Options page no longer carries `server`, `ard_url`, or `serverJMX`
  fields unless a product requirement is confirmed.
- AC2: Theme is persisted and applied as light/dark; the `backendapp`/Dynatrace
  brand logo flow is documented as removed.

---

### G13 — `contextMenus` permission

**Intended behaviour (src-ori)**
`chrome.contextMenus.onClicked.addListener` in the SideEx background creates
right-click menu items that dispatch commands to the recorder.

**Affected src-ori modules/files**

- `src-ori/background/sideex/background-ui.ts:40-44`
- `src-ori/manifest.json:55`

**Input/Output**

- **Input:** User right-click on a context menu item.
- **Output:** message to recorder via Port or SideEx bridge.

**Migration considerations**

- Right-click shortcuts are a UX nicety, not core functionality. Re-add only if
  user research shows demand.

**Acceptance criteria**

- AC1: If restored, `"contextMenus"` appears in manifest permissions and the
  listener is wired in `src/background/index.ts`.
- AC2: If dropped, changelog notes the removal.

---

### G14 — `notifications` permission

**Intended behaviour (src-ori)**
`showNotification` command is handled in the SideEx background and triggers
Chrome desktop toasts via `chrome.notifications`.

**Affected src-ori modules/files**

- `src-ori/background/sideex/background-ui.ts:248-254`
- `src-ori/manifest.json:55`

**Input/Output**

- **Input:** `{ title, message }` payload.
- **Output:** OS-level notification toast.

**Migration considerations**

- The new popup already surfaces status via badge + status text. Desktop
  notifications are optional. Re-add only for enterprise alerting or audit
  requirements.

**Acceptance criteria**

- AC1: Core recording status is visible in the popup without notifications.
- AC2: If restored, the permission and listener are documented and tested.

---

### G15 — `browsingData` permission

**Intended behaviour (src-ori)**
Declared in manifest; potentially used to clear cookies/cache for clean recording
sessions. No direct call site is visible in the reviewed core files.

**Affected src-ori modules/files**

- `src-ori/manifest.json:55`

**Input/Output**

- **Input:** optional data types to remove.
- **Output:** browser storage cleared.

**Migration considerations**

- Do not re-add unless a concrete GDPR/cleanup requirement is identified. If
  needed, gate it behind an explicit user action in the popup.

**Acceptance criteria**

- AC1: Reset operation continues to clear in-memory traffic without requiring
  the permission.
- AC2: Any reinstatement includes documented call sites and tests.

---

### G16 — `scripting` permission

**Intended behaviour (src-ori)**
Legacy code relied on dynamic content script injection (e.g., `dist/record-replay/index.js`)
for SideEx UI. Manifest V3 requires `"scripting"` for `chrome.scripting.executeScript`.

**Current status in new `src`: Not Required.**
The action recorder uses declarative `content_scripts` in the manifest. A code audit
confirms zero `chrome.scripting` usage under `src/`. No code changes are needed and
the permission is not declared in `manifest.json`.

**Acceptance criteria**

- AC1: Action recorder operates without `"scripting"` permission. ✅
- AC2: No `chrome.scripting` usage exists under `src/`. ✅

---

### G3 — `export_jmeter` / `export_jmeter_follow` message contracts (REPLACED)

**Intended behaviour (src-ori)**
jQuery overlay sends `export_jmeter` or `export_jmeter_follow` messages.
Background answers with local generation (or converter interaction).

**Affected new-src modules/files**

- `src/background/recorder-service.ts`
- `src/messages.ts`
- `src/jmx/serializer.ts`

**Migration considerations**

- Legacy string commands should be aliased to `EXPORT_JMX` if multiple internal
  callers exist. Otherwise migrate senders to the typed union.

**Acceptance criteria**

- AC1: `EXPORT_JMX` returns valid JMX for a non-empty domain list.
- AC2: JMX is schema-valid for JMeter 5.6 (`jmeterTestPlan`, `hashTree`,
  `ThreadGroup`, `HTTPSamplerProxy`, `HeaderManager`).
- AC3: CDATA encoding handles `]]>` without corruption.
- AC4: Defaults are applied when storage is empty or malformed.
- AC5: `filename` is `<safePlanName>.jmx`.

---

### G4 — Overlay progress UX (REPLACED)

**Intended behaviour (src-ori)**
jQuery-ui overlay resizes via `postMessage({'height': ...})` to the parent iframe.

**Affected new-src modules/files**

- `src/popup/popup.ts`
- `src/options/options.ts`

**Migration considerations**

- Detached inspector replaces the iframe overlay. `STATE_CHANGED` broadcasts
  maintain status.

**Acceptance criteria**

- AC1: Popup renders without iframe height negotiation.
- AC2: Status continues to flow via `STATE_CHANGED`.

---

### G5 — Domain download overlay (REPLACED/IMPROVED)

**Intended behaviour (src-ori)**
Two jQuery overlays (`download-body` and `domains-body`) render domain
checkboxes, with races noted in comments.

**Affected new-src modules/files**

- `src/popup/popup.ts`
- `src/jmx/domains.ts`

**Migration considerations**

- Single native domain selector replaces the dual overlay, with subdomain-aware
  matching.

**Acceptance criteria**

- AC1: Zero domains blocks export with a user-visible error.
- AC2: Domain list is sorted and subdomain-aware.

---

### G7 — JMX options normalisation/validation (IMPROVED)

**Intended behaviour (src-ori)**
Options saved loosely; backend enforced range. No client validation.

**Affected new-src modules/files**

- `src/options/jmx-options.ts`
- `src/options/options.ts`
- `src/jmx/serializer.ts`
- `src/background/recorder-service.ts`

**Migration considerations**

- Existing storage values are normalised transparently.

**Acceptance criteria**

- AC1: Empty storage returns defaults.
- AC2: Invalid values fall back to defaults.
- AC3: Saved options are type-safe end-to-end.

---

### G8 — Plan-name collision (IMPROVED)

**Intended behaviour (src-ori)**
Implicit precedence between session name and saved default.

**Affected new-src modules/files**

- `src/background/recorder-service.ts:170-174`
- `src/jmx/serializer.ts`

**Migration considerations**

- Document the resolution rule in the UI.

**Acceptance criteria**

- AC1: Custom session name wins over default when set.
- AC2: Default is used when session name is still `Untitled Plan`.

---

### G9 — Response-body into JMX CDATA (IMPROVED)

**Intended behaviour (src-ori)**
No explicit client-side response body capture into JMX.

**Affected new-src modules/files**

- `src/background/response-body-matching-service.ts`
- `src/background/traffic-normalizer.ts`
- `src/jmx/serializer.ts`

**Migration considerations**

- Ensure opt-in toggle with privacy notice is exposed in options.

**Acceptance criteria**

- AC1: Captured body appears inside `<![CDATA[...]]>`.
- AC2: `escapeCdata` preserves `]]>` sequences.
- AC3: Redacted bodies become `[REDACTED]`.
- AC4: Missing bodies default to empty string.

---

### G10 — Subdomain-aware domain filtering (IMPROVED)

**Intended behaviour (src-ori)**
Flat domain list; matching semantics unclear.

**Affected new-src modules/files**

- `src/jmx/domains.ts`
- `src/popup/popup.ts`

**Migration considerations**

- Document subdomain semantics for power users; consider a legacy exact-match
  toggle if needed.

**Acceptance criteria**

- AC1: `example.com` matches `api.example.com`.
- AC2: `example.com.br` does not match `example.com`.
- AC3: Domains are alphabetically sorted.

---

### G11 — Skip extension-internal / policy domains (IMPLEMENTED)

**Intended behaviour (src-ori)**
`src-ori/forbidden-domains.json` lists hosts to skip. Content scripts referenced exclusions at injection time.

**Current status in new `src`: Implemented.**
A vendor-agnostic blocklist (`src/background/forbidden-domains.ts`) excludes:
- Extension-internal schemes: `chrome-extension:`, `chrome:`, `about:`, `edge:`, `brave:`, `safari-web-extension:`
- Policy domains: `.testudo.co.nz`, `testudo.co.nz`, `.attestify-us.com`, `attestify-us.com`

The exclusion is enforced as an early-return guard inside every `webRequest` event handler in `TrafficCaptureService` (`onBeforeRequest`, `onBeforeSendHeaders`, `onResponseStarted`, `onCompleted`, `onErrorOccurred`), plus a final guard in `addCompletedRequest()` as defense-in-depth.

**Migration considerations**

- Blocklist is vendor-agnostic; customer application domains are never blocked.
- Customer blocklists can be added/removed by editing `FORBIDDEN_HOST_SUBSTRS` in `src/background/forbidden-domains.ts`.
- For MV3, `declarativeNetRequest` rules are an alternative for high-volume exclusions but are not required for the current list size.

**Acceptance criteria**

- AC1: Requests matching forbidden hosts or extension-internal schemes are omitted before storage. ✅
- AC2: Exclusion logic is unit-testable and does not require a browser restart. ✅ (covered by `forbidden-domains.test.ts` and `forbidden-domains.test.ts` in `src/test/`)

---

### G12 — Legacy jQuery `.domains-body` checkbox UI (REPLACED)

**Intended behaviour (src-ori)**
jQuery DOM building in two competing overlays.

**Affected new-src modules/files**

- `src/popup/popup.ts`

**Migration considerations**

- Native DOM checkbox list replaces jQuery; behaviour is simpler.

**Acceptance criteria**

- AC1: Domain selector renders without jQuery.
- AC2: Zero selection disables export.

---

### G17 — Selenium tape `exportJSON()` flow (OUT OF SCOPE / SUPERSEDED)

**Intended behaviour (src-ori)**
`BackgroundRecorderUI.exportJson()` returns a SideEx tape JSON structure.

**Affected src-ori modules/files**

- `src-ori/background/sideex/bg-recorder-ui.ts:274-289`
- `src-ori/background/sideex/bg-testsuite.ts:128-133`

**Migration considerations**

- If SideEx compatibility is required, build a SideEx JSON → `ActionStep[]`
  translation layer. Otherwise mark deprecated.

**Acceptance criteria**

- AC1: If a migration shim is built, it passes smoke tests for common SideEx
  commands.
- AC2: Primary export path is Playwright `.spec.ts`.

---

### G18 — Selenium tape `getTransactions()` flow (OUT OF SCOPE / SUPERSEDED)

**Intended behaviour (src-ori)**
Maps `TestSuite.test_cases` to `{ name, counter }`.

**Affected new-src modules/files**

- `src/popup/popup.ts` renders from `CapturedRequest[]`.

**Migration considerations**

- No direct replacement needed; new model differs.

---

### G19 — Selenium tape message commands (OUT OF SCOPE / SUPERSEDED)

**Intended behaviour (src-ori)**
Large set of SideEx commands for lifecycle, tape manipulation, inspection,
observers, and UI.

**Affected new-src modules/files**

- `src/background/recorder-service.ts`
- `src/messages.ts`

**Migration considerations**

- Core lifecycle commands are mapped to typed unions. Tape-specific commands
  (`recordCommand`, `recordDom`, `add_step_atindex`, etc.) are dropped.

**Acceptance criteria**

- AC1: Recording lifecycle works end-to-end via the new typed API.
- AC2: Any remaining internal dependency on legacy commands is documented and
  assigned an owner.

---

## 3. Priority Table

| Priority         | IDs                                                                                | Rationale                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **P0**           | G11 (forbidden-domains), G3 (`EXPORT_JMX` contract), G9 (response body CDATA)      | Correctness and security. `G11` prevents recursive self-recording; `G3` and `G9` ensure valid, safe JMX output.               |
| **P1**           | G7 (options validation), G8 (plan name), G10 (domain filter), G4/G5 (UI contracts) | Core export-pipeline correctness and UX. Low implementation risk.                                                            |
| **P2**           | G1/G2 (backend upload path), G13/G14/G15/G16 (permissions/options form)            | Important for enterprise users and feature parity, but not blocking core functionality. Requires product-strategy decisions. |
| **Analysis**     | G20 (JMX export comparison)                                                        | Identifies gaps between `src-ori` and current `src` exports; informs future iteration.                                       |
| **Out-of-Scope** | G17, G18, G19 (Selenium tape)                                                      | Superseded by Playwright recording. Only port if a SideEx compatibility shim is commercially required.                       |

---

## 4. Implementation Progress

This section records what was implemented and what remains pending as of the
most recent commit on `006-enhance-jmx-implementation`.

### 4.1 Implemented (P0 + P1)

| Gap | Changes |
|-----|---------|
| **G11** | `src/background/forbidden-domains.ts` — vendor-agnostic blocklist (extension-internal schemes + `.testudo.co.nz` / `.attestify-us.com`); wired into `TrafficCaptureService` event handlers as early-return guard; unit tests in `src/background/forbidden-domains.test.ts` and `src/test/forbidden-domains.test.ts`. |
| **G9** | `src/jmx/serializer.ts` — `buildSampler()` now uses `req.responseBody ?? req.body ?? ''` so captured response bodies appear in JMX CDATA; `escapeCdata()` already handles `]]>`; regression tests added for `]]>` splitting and response-body preference. |
| **G3** | `EXPORT_JMX` typed union (`src/messages.ts`) wired end-to-end; all error paths return typed errors; zero-domain and zero-match-after-filter cases validated. |
| **G7** | `JmxOptionsStore.normalizeJmxOptions()` applies defaults and clamps invalid values; type-safe end-to-end. |
| **G8** | `planNameForExport()` in `RecorderService` prefers snapshot name unless `Untitled Plan`; uses immutable options read. |
| **G10** | `filterRequestsByDomains()` subdomain-aware matching confirmed and covered by tests. |
| **G4/G5** | Native domain selector replaces jQuery dual-overlay; zero-selection blocks export with user-visible error. |

### 4.2 Deferred (P2 — by product decision)

| Gap | Decision | Rationale |
|-----|----------|-----------|
| **G1/G2** | **Offline-only JMX.** Backend converter upload not implemented. | Standalone client-side tool; no server endpoint identified. |
| **G6** | **No enterprise form.** ARD URL and `backendapp`/Dynatrace brand theme removed; only light/dark theme persisted. | Moving to Capultura branding; no branded deployments required. |
| **G13** | `contextMenus` — not restored. | No concrete UX requirement identified. |
| **G14** | `notifications` — not restored. | Popup badge + status text sufficient. |
| **G15** | `browsingData` — not restored. | Reset clears in-memory traffic without this permission. |
| **G16** | `scripting` — confirmed **not needed**. | Action recorder uses declarative content scripts; zero `chrome.scripting` usage found. |

### 4.3 Cross-cutting non-functional improvements

- **Error handling:** All background message handlers return typed errors that UI can render consistently.
- **Performance:** `buildJmx` is a pure synchronous function; safe for large captures in the service worker.
- **Type safety:** `BackgroundRequest` / `BackgroundResponse` discriminated unions are exhaustive; unknown message shapes produce a typed error.
- **Accessibility:** Popup uses semantic HTML and ARIA attributes; domain selector and export buttons are keyboard-navigable.

---

### 4.4 Implementation Closure

Implementation obligations under `006-enhance-jmx-implementation` are **complete**.
All gaps prioritised as P0 and P1 have been delivered (see §4.1). The remaining
gaps and forward-looking content are deferred as follows:

| Section | Disposition | Rationale |
|---------|-------------|-----------|
| G1 / G2 | **Deferred** — Backend upload path | Offline-only JMX is the confirmed product direction. Re-introducing requires a committed infrastructure decision. |
| G6 | **Removed** — Enterprise form | ARD URL and `backendapp`/Dynatrace branding dropped; light/dark theme is the replacement. |
| G13 | **Deferred** — `contextMenus` | No concrete UX requirement identified. Re-add only with user-research evidence. |
| G14 | **Deferred** — `notifications` | Popup badge + status text is sufficient. Re-add only for enterprise alerting. |
| G15 | **Deferred** — `browsingData` | No GDPR/cleanup requirement identified. Re-add only with explicit user action. |
| G17 / G18 / G19 | **Removed** — Selenium/SideeX tape | Superseded by Playwright recording. Only revive with explicit commercial shim requirement. |
| G20 | **Deferred** — JMX export enhancements | Analysis and recommendations documented below; no items committed to sprint work. Transfer to backlog or a future `007-*` spec. |
| G21 | **Deferred** — Advanced Options | Design reference only. Requires a subsequent spec iteration to authorize implementation. |
| §6 recommendations | **Carried as guidance** | Non-binding forward-looking guidance. Items will surface in backlog grooming or future specs. |

**No further code changes are associated with this spec.** Any future work derived
from the above deferred items should be scoped into new specifications (e.g.,
`007-*`, `008-*`) with explicit acceptance criteria and product sign-off.

---

### G20 — Enhanced JMX export functionality (NEW ANALYSIS)

**Source of truth**
Original export implementation: `src-ori/js/common.js`, `src-ori/options/options.tsx`, `src-ori/config.json`, `src-ori/forbidden-domains.json`.
Current implementation: `src/jmx/serializer.ts`, `src/background/recorder-service.ts`, `src/popup/popup.ts`, `src/background/forbidden-domains.ts`, `src/options/options.ts`.

---

#### What the original export functionality did

The original `src-ori` export path had two modes:

1. **Client-side JMX generation** (`export_jmeter` / `export_jmeter_follow`)
   - Domain checkboxes rendered in a jQuery overlay (`#run-overlay`).
   - Selected domains persisted to `chrome.storage.local` key `selected_domains`.
   - A `mode` storage key (`mode-follow` vs `mode-download`) determined which message was sent.
   - The overlay showed a jQuery-ui progress bar with the string "Exporting to JMX...".
   - IFrame height was negotiated via `window.parent.postMessage({'height': ...})`.
   - The generated JMX used `jmeterTestPlan`, `hashTree`, `ThreadGroup`, `HTTPSamplerProxy`, and `HeaderManager`.

2. **Backend converter upload** (`upload_traffic`)
   - POSTed captured traffic to `server_jmx` URL (default: `https://converter.backendapp.com`).
   - A separate jQuery overlay collected domains and triggered upload.
   - The server returned a JMX file or download link.

Supporting features in `src-ori`:
- **Forbidden domains** (`forbidden-domains.json`): blocked `a.backendapp.com`, `www.a.backendapp.com` and specific extension IDs.
- **Options page** (`options.tsx`): fields for `debug`, `custom_server` (checkbox + URL), `custom_ard` (checkbox + URL), `serverJMX` (URL with validation), plus Save/Reset with notification toasts.
- **Theme** (`config.json`): `backendapp` or `dynatrace` brand, driving logo asset selection.
- **Notifications** (`chrome.notifications`): desktop toasts for settings save/reset and recording status.
- **Context menus** (`chrome.contextMenus`): right-click shortcuts dispatching recorder commands.
- **Auto-check single domain**: if only one domain was captured, its checkbox was pre-checked.

#### What the current `src` implementation provides

| Area | Current `src` |
|------|---------------|
| JMX schema | `jmeterTestPlan`, `hashTree`, `ThreadGroup`, `HTTPSamplerProxy`, `HeaderManager` — same core structure |
| Domain selection | Native popup domain selector, sorted, subdomain-aware matching (`example.com` matches `api.example.com`) |
| Options | `JmxOptionsStore` with typed defaults, validation, and transparent normalization |
| Plan name | `planNameForExport()` prefers custom session name, falls back to saved default |
| Response body | `req.responseBody ?? req.body` embedded in CDATA; `escapeCdata` handles `]]>` |
| Forbidden domains | Vendor-agnostic blocklist (extension-internal schemes + policy domains) wired into all `webRequest` handlers |
| Export path | Offline-only client-side generation; no backend converter |
| Permissions | Minimal (`storage`, `unlimitedStorage`, `webRequest`, `activeTab`, `windows`) |
| Export modes | JMX + Playwright `.spec.ts` in the same popup |

#### Gaps and opportunities for improvement

| # | Gap / Opportunity | Severity | Details |
|---|-------------------|----------|---------|
| 1 | **Plan-name hint in popup UI** | Low | Spec §5.2 item 4 recommends a hint like "Export uses session name (or default if untitled)". The popup currently shows the plan name input but does not explain the resolution rule. |
| 2 | **Cookie manager instead of raw Cookie headers** | Low | `Cookie` headers are emitted as `HeaderManager` entries. JMeter has a dedicated `CookieManager` element. Using `CookieManager` would produce cleaner, more idiomatic JMX. |
| 3 | **`postBodyRaw` set for GET/DELETE** | Low | `HTTPSamplerProxy.postBodyRaw` is always `true` even for methods with no body. Semantically incorrect but functionally harmless in JMeter. |
| 4 | **No think-time / pacing timers** | Medium | Neither `src-ori` nor current `src` inserts `ConstantTimer`, `RandomTimer`, or `UniformRandomTimer` between samplers. For performance tests, think-time is often critical. |
| 5 | **No assertions in JMX** | Medium | No `ResponseAssertion`, `DurationAssertion`, or `Assertion.responsetime` elements are generated. Users must add them manually after export. |
| 6 | **Redirect noise** | Low | HTTP redirects (301, 302, 307) are captured as individual samplers. JMeter already follows redirects (`follow_redirects=true`), so recording every redirect step creates noisy plans. No deduplication or "follow redirect transparently" option. |
| 7 | **Error-request method defaults to GET** | Low | In `createCompletedRequest` and `createErrorRequest`, `method` is hardcoded to `'GET'`. If a POST/PUT fails before `onBeforeSendHeaders`, the JMX sampler will claim GET. |
| 8 | **No "select all / select none" in domain selector** | Low | `src-ori` auto-checked a single domain. Current `src` checks all by default. A select-all / select-none toggle would improve UX for large domain sets. |
| 9 | **Filename sanitization edge cases** | Low | `safeFilename()` strips non-ASCII and collapses runs of separators. Very long or Unicode-heavy plan names could still produce suboptimal filenames. |
| 10 | **No export progress for large captures** | Low | `buildJmx` is synchronous. For >5k requests, the service worker may hit execution time limits. No chunked/streamed export or progress callback exists. |
| 11 | **No response-time or response-code assertions** | Medium | Even basic response-time bounds or HTTP-status assertions would make exported JMX immediately runnable for SLA validation. |
| 12 | **Query params not explicitly modeled** | Low | `queryParams` on `CapturedRequest` is populated from URL parsing but never used in the sampler (path includes the query string). Explicit `HTTPArgument` parameters would make JMX more editable. |

#### Recommended enhancements (concrete, actionable)

**Quick wins (low effort, low risk)**

1. **Add plan-name hint** — In `src/popup/popup.ts`, after `planNameInput` is defined, add a `<small>` element or aria-describedby text: *"Export uses this name; falls back to the saved default if left as 'Untitled Plan'"*.

2. **Fix `postBodyRaw` by method** — In `src/jmx/serializer.ts`, set `<boolProp name="HTTPSampler.postBodyRaw">` to `true` only for `POST`, `PUT`, `PATCH`; `false` for `GET`, `HEAD`, `DELETE`, `OPTIONS`.

3. **Fix error-request method** — In `src/background/traffic-normalizer.ts`, `createErrorRequest` should accept `method` from the pending fragment (if available) rather than defaulting to `'GET'`.

4. **Add select-all / select-none buttons** to the domain selector UI in `src/popup/popup.ts`. Buttons should toggle `selectedDomains` between `new Set(availableDomains)` and `new Set<string>()`.

**Medium effort (worth doing before next major release)**

5. **Insert `ConstantTimer` between samplers** — Add an optional "Think time (ms)" field to `JmxOptionsStore`. When set, each sampler pair gets a `ConstantTimer` child in the hashTree:
   ```xml
   <hashTree>
     <HTTPSamplerProxy .../>
     <hashTree>
       <ConstantTimer guiclass="ConstantTimerGui" testclass="ConstantTimer" testname="Think Time" enabled="true">
         <stringProp name="ConstantTimer.delay">500</stringProp>
       </ConstantTimer>
       <hashTree/>
     </hashTree>
   </hashTree>
   ```

6. **Add basic response assertions** — Generate a `ResponseAssertion` child for each sampler when a minimum status code or max response time is configured:
   ```xml
   <hashTree>
     <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Status 2xx/3xx" enabled="true">
       <collectionProp name="AssertsToTest">
         <stringProp name="49508">2</stringProp> <!-- response code pattern -->
       </collectionProp>
       <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
       <boolProp name="Assertion.assume_success">false</boolProp>
     </ResponseAssertion>
     <hashTree/>
   </hashTree>
   ```

7. **Use `CookieManager` instead of raw `Cookie` headers** — In `buildHeaders()`, extract `Cookie` and `Cookie2` headers and emit them in a `CookieManager` element rather than `HeaderManager`. Keep all other headers in `HeaderManager`.

**Higher effort (consider for future iteration)**

8. **Redirect deduplication** — Add an option "Follow redirects transparently" that collapses 3xx + subsequent same-URL request into a single sampler with `follow_redirects=true` (already set) and optionally records only the final response.

9. **Chunked/streamed JMX export** — For >5k samplers, yield to the service worker event loop periodically using `setTimeout` chunks, or write to a file via `chrome.fileSystem` / download API in segments.

10. **Explicit query parameter serialization** — Model `queryParams` as `HTTPArgument` entries inside the sampler's `Arguments` collection, making the JMX directly editable in JMeter's GUI.

---

#### Recommended priority for G20 enhancements

| Priority | Item | Rationale |
|----------|------|-----------|
| **P0** | Fix error-request method (item 3) | Incorrect method in JMX is a data-integrity bug. |
| **P1** | Plan-name hint (item 1) | Already recommended in spec §5.2; trivial to implement. |
| **P1** | `postBodyRaw` by method (item 2) | Semantic correctness; one-line change. |
| **P1** | Select-all / select-none (item 4) | UX improvement for large captures; low effort. |
| **P2** | Think-time timer (item 5) | Requires new option field and serializer support; useful for performance testing. |
| **P2** | Response assertions (item 6, 11) | Makes exported JMX immediately runnable for basic SLA checks. |
| **P2** | `CookieManager` (item 7) | Cleaner JMX; minor refactor in `buildHeaders()`. |
| **P3** | Redirect deduplication (item 8) | Complex; requires URL-matching logic and history tracking. |
| **P3** | Chunked export (item 9) | Engineering effort; only matters for very large captures. |
| **P3** | Query params as HTTPArguments (item 10, 12) | Nice-to-have for JMX editability; current path-based approach works. |

---

#### Open questions for G20

1. Should think-time be derived from inter-arrival timings in the captured traffic, or only from a user-configured constant?
2. Should response assertions be opt-in (checkbox in options) or always generated?
3. Is redirect deduplication desirable, or do users prefer seeing every redirect step for debugging?
4. Should `Cookie` header extraction be a breaking change (drop from `HeaderManager`) or additive (both `CookieManager` and `HeaderManager`)?

---

## 6. Consolidated Recommendations

### 6.1 Immediate actions (P0)

1. **Add forbidden-domain exclusions early in the capture pipeline.**
   Place a static exclusion list check in `TrafficCaptureService` or as
   `declarativeNetRequest` rules. This prevents noise and recursive traffic.
2. **Audit `EXPORT_JMX` caller-visible error paths.**
   Ensure every failure (no domains, no matching requests, malformed options)
   returns a typed error string that the popup renders as a banner.
3. **Validate CDATA body encoding in tests.**
   Add a regression test that `escapeCdata` handles `]]>` in request bodies.

### 6.2 Short-term actions (P1)

4. **Document plan-name resolution in the popup UI.**
   Add a hint such as "Export uses session name (or default if untitled)" so
   users aren't surprised.
5. **Confirm domain-filter subdomain semantics.**
   If power users need exact-host matching, expose an option defaulting to the
   new subdomain-aware behaviour.
6. **Finish popup/Option parity for JMX settings.**
   `JmxOptionsStore` already validates; ensure the options page saves/loads
   cleanly and the popup reads from the same store.

### 6.3 Medium-term decisions (P2)

7. **Decide backend upload strategy (G1/G2).**

   - Option A: Remove entirely and document offline-only JMX export.
   - Option B: Reintroduce as a separate "Upload to server" action with a
     configurable URL + optional token. Implement as an async background
     `fetch()` rather than jQuery overlay.

8. **Audit permission list (`G13`–`G16`).**

   - `contextMenus`: restore only with a concrete shortcut need.
   - `notifications`: restore only if audit/alerting requires OS-level toasts.
   - `browsingData`: restore only if a documented cleanup flow needs it.
   - `scripting`: keep out; confirm no `chrome.scripting` usage exists.

9. **Expose the enterprise form (G6) if required.**
   If branded deployments or custom ARD endpoints are still needed, add
   optional fields to `src/options/options.ts`. Keep them separate from Core
   JMX flow to avoid permission footprint growth.

### 6.4 Cross-cutting non-functional improvements

- **Error handling:** All background message handlers should return typed errors
  that UI can render consistently. Avoid silent failures.
- **Telemetry/audit (optional):** Log export successes and failures (with user
  consent) to help prioritise future fixes.
- **Performance:** Ensure `buildJmx` is pure and fast for large captures; avoid
  blocking the service worker. Consider streaming or chunked exports for >10k
  requests.
- **Type safety:** Use the existing `BackgroundRequest` / `BackgroundResponse`
  discriminated unions exhaustively; add tests for unknown message shapes.
- **Accessibility:** The new popup uses semantic HTML and ARIA attributes;
  continue to validate domain selector and export buttons.

---

### G21 — Advanced Options area (NEW)

**Source of truth**
Extracted from `src-ori/recorder-ui/recorder-ui.html` (old jQuery/iframe
recorder UI). Controls were rendered as form inputs in the original page; they
are documented here as a structured schema for future porting. **No
implementation is implied by this section.** This section is a design reference
only.

---

#### Intended behaviour (src-ori)

The original recorder UI exposed an "Advanced Options" collapsible panel that
controlled recording depth, concurrency, download parallelism, caching, user
agent, cookie handling, and think-time randomization. The panel was rendered as
a set of HTML inputs inside an iframe and persisted state to
`chrome.storage.local`.

The ported Playwright extension should represent the same controls natively in
the popup/options — without iframes, without jQuery, and without backend
dependencies.

#### Recommended UI structure

Group controls into a vertical list of `<fieldset>` elements. Each fieldset has
a `<legend>` and contains one or more controls with labels. Use `<select>`,
`<input type="range">`, `<input type="checkbox">`, `<textarea>`, and radio
groups where appropriate. Group dependency rules:

- "Requests to Record" radio group enables/disables subsequent sub-options.
- "User Agent" dropdown defaults to "Current Browser"; changing selection may
  unlock custom UA string input.
- "Parallel Number of Downloads" dropdown defaults per browser; "Custom" option
  unlocks a bounded number input (2–17).
- Hidden/interdependent controls should use `aria-controls` and `hidden`
  attributes rather than removing them from the DOM.

#### Recommended configuration schema

```json
{
  "advancedOptions": {
    "concurrency": {
      "description": "Number of virtual users to simulate.",
      "type": "integer",
      "minimum": 100,
      "maximum": 100000,
      "step": 100,
      "default": 100
    },
    "timeDistribution": {
      "description": "Time interval during which virtual users start following.",
      "type": "string",
      "default": "10s Auto"
    },
    "userAgent": {
      "description": "User-Agent string for recorded requests.",
      "type": "string",
      "default": "Current Browser",
      "options": [
        "Current Browser",
        "Chrome on Windows",
        "Chrome on Mac",
        "Chrome on Linux",
        "Firefox on Windows",
        "Firefox on Mac",
        "Firefox on Linux",
        "Edge on Windows",
        "Safari on Mac",
        "Safari on iOS",
        "Chrome on Android",
        "Custom…"
      ]
    },
    "filterPattern": {
      "description": "Comma-separated list of URL patterns to record.",
      "type": "string",
      "format": "textarea",
      "default": "http://*/*, https://*/*"
    },
    "disableBrowserCache": {
      "description": "Disable the browser cache during recording.",
      "type": "boolean",
      "default": false
    },
    "wipeServiceWorkers": {
      "description": "Wipe existing service workers before recording.",
      "type": "boolean",
      "default": false
    },
    "recordCookies": {
      "description": "Capture Set-Cookie responses as cookie entries.",
      "type": "boolean",
      "default": true
    },
    "recordAjaxRequests": {
      "description": "Include XHR/fetch requests in the capture.",
      "type": "boolean",
      "default": true
    },
    "updateSettingsBeforeRunningTest": {
      "description": "Apply options immediately when recording starts.",
      "type": "boolean",
      "default": true
    },
    "randomizeThinkTimes": {
      "description": "Randomize think times to 50%–150% of original.",
      "type": "boolean",
      "default": false
    },
    "requestsToRecord": {
      "description": "Granularity of captured requests.",
      "type": "string",
      "enum": ["topLevelOnly", "topLevelAndFollowing"],
      "default": "topLevelOnly",
      "subOptions": {
        "followingTypes": {
          "description": "Resource types to include when following top-level requests.",
          "type": "string[]",
          "default": ["javascript", "css", "image", "font", "redirect"],
          "options": [
            "cookies",
            "css",
            "fonts",
            "javascript",
            "images",
            "redirects",
            "other"
          ]
        }
      }
    },
    "parallelDownloads": {
      "description": "Maximum simultaneous downloads per browser.",
      "type": "string",
      "default": "browser-default",
      "browserDefaults": {
        "chrome": 6,
        "firefox": 6,
        "ie6": 2,
        "ie7": 2,
        "ie8": 6,
        "ie9": 6,
        "ie10": 8,
        "ie11": 13,
        "edge14": 13,
        "edge15": 13,
        "edge16": 13,
        "safari": 6,
        "opera": 6,
        "android": 4
      },
      "customRange": {
        "minimum": 2,
        "maximum": 17
      }
    },
    "exportIdLocators": {
      "description": "Export element ID locators alongside CSS/XPath (Playwright only; irrelevant for JMX).",
      "type": "boolean",
      "default": true
    },
    "allowContextClicks": {
      "description": "Record right-click / context-menu interactions.",
      "type": "boolean",
      "default": false
    },
    "includeMetadataInSeleniumYaml": {
      "description": "Include metadata when exporting Selenium (.side) YAML.",
      "type": "boolean",
      "default": true
    }
  }
}
```

#### Documentation table

| Control | Type | Default | Dependencies | Notes |
|---------|------|---------|--------------|-------|
| Concurrency | slider + number | 100 | none | Steps: 100, 1,000, 10k, 50k, 100k |
| Time Distribution | `<select>` | `10s Auto` | none | Label: "Virtual users start" |
| User Agent | `<select>` + optional text | `Current Browser` | Custom unlocks text input | Grouped by OS + browser family |
| Filter Pattern | `<textarea>` | `http://*/*, https://*/*` | none | Required |
| Disable Browser Cache | `<input type="checkbox">` | unchecked | none | MV3: no direct browser-cache API; may use `chrome.declarativeNetRequest` rules in a later iteration |
| Wipe Service Workers | `<input type="checkbox">` | unchecked | none | Requires `chrome.debugger` or `chrome.scripting` removal; defer if G16 remains "out" |
| Record Cookies | `<input type="checkbox">` | checked | follows Requests to Record selection | Emit `CookieManager` (see G20 item 7) |
| Record Ajax Requests | `<input type="checkbox">` | checked | none | Core to capture depth |
| Update Settings Before Running Test | `<input type="checkbox">` | checked | none | Immediate vs lazy apply |
| Randomize Think Times | `<input type="checkbox">` | unchecked | none | Randomize 50%–150% of captured think times |
| Requests to Record | radio | `topLevelOnly` | toggles sub-options | Values: `topLevelOnly`, `topLevelAndFollowing` |
| — Cookies | checkbox | unchecked | only when `topLevelAndFollowing` | |
| — CSS & Fonts | checkbox | checked | only when `topLevelAndFollowing` | |
| — JavaScript | checkbox | checked | only when `topLevelAndFollowing` | |
| — Images | checkbox | checked | only when `topLevelAndFollowing` | |
| — Redirects | checkbox | unchecked | only when `topLevelAndFollowing` | |
| — Other | checkbox | unchecked | only when `topLevelAndFollowing` | |
| Parallel Number of Downloads | `<select>` + optional number | browser default | Custom unlocks number input (2–17) | See `browserDefaults` map |
| Export ID Locators | `<input type="checkbox">` | checked | Playwright `.spec.ts` only | No JMX effect; harmless for JMX path |
| Allow Context Clicks to be recorded | `<input type="checkbox">` | unchecked | none | Capture right-click / long-press |
| Include metadata in Selenium-only YAML | `<input type="checkbox">` | checked | Selenium export only | No JMX effect |

#### Recommended alignment with G1/G2/G6/G13/G14/G15 decisions

| Decision | G21 impact |
|----------|-----------|
| **G1/G2 deferred** (offline-only JMX) | Options above marked "Playwright only" (e.g., `includeMetadataInSeleniumYaml`, `exportIdLocators` affecting .spec.ts) remain valid and should be persisted, but the upload/convert workflow stays out of scope. |
| **G6 deferred** (no enterprise form) | Browser selection, UA string, theme, ARD URL, and `serverJMX` are **not** part of G21. If custom-branded deployments are ever required, the schema above provides clean extension points without retooling the core. |
| **G13 deferred** (`contextMenus` not restored) | `allowContextClicks` should **remain in schema** even if the permission is dropped. When not recorded, the flag is ignored; no permission is needed to store the preference. |
| **G14 deferred** (`notifications` not restored) | No G21 control triggers notifications. State changes are surfaced via popup + badge. |
| **G15 deferred / under review** (`browsingData`) | `disableBrowserCache` and `wipeServiceWorkers` are controls in the schema; actual cache-clearing calls are **not** implemented while G15 is deferred. The controls are saved but no-op until G15 is resolved or an MV3-compatible alternative is chosen. |

#### Permissions and storage

- Persist under a single `chrome.storage.local` key: `advancedOptions`.
- Use the same typed-safe store pattern as `JmxOptionsStore` when implemented.
- Do **not** require new permissions for the schema above. All controls are
  application-level preferences; no API calls are implied.

#### Deferred / simplified controls

| Control | Deferral/simplification rationale |
|---------|-----------------------------------|
| `disableBrowserCache` | MV3 has no direct cache-clear API; would require `declarativeNetRequest` workaround. Schema keeps the flag; implementation defers to a future iteration. |
| `wipeServiceWorkers` | Clearing service workers requires `chrome.scripting` or `chrome.debugger`. Since G16 is "out" and G15 is under review, leave the flag schema-only. |
| `exportIdLocators` | Flag is Playwright-relevant; JMX path ignores it. Implement the toggle when Playwright export ships it; otherwise no-op for JMX. |
| `includeMetadataInSeleniumYaml` | Selenium-only YAML export; defer to a future Selenium-compat shim if required. Flag schema is harmless. |

#### Open questions for G21

1. Should "Time Distribution" accept free-form text (e.g., `10s`, `1m`, `Auto`) or be bound to a discrete enum?
2. Should `concurrency` be exposed only when recording mode is "Performance" versus "Functional"?
3. Should `userAgent` custom string be persisted as a separate field or inline?
4. Should `filterPattern` validation reject malformed globs at save time or just escape them?
5. Should `randomizeThinkTimes` derive its range from a fixed 50%–150% or from user-defined bounds?

---

_G21 is a design reference only. No code, UI, or configuration changes are
authorized by this section until a subsequent spec iteration explicitly
authorizes implementation._

---

## A. Future Spec Hand-off

All remaining gaps and recommendations from §4.4 and §6 are candidates for
future specifications. The following table maps each deferred item to a proposed
future spec target and scope so the product team can sequence work without
re-opening this spec.

| Proposed future spec | Scope | Source sections |
|----------------------|-------|-----------------|
| `007-jmx-backend-upload` | Re-introduce backend converter upload (`G1`, `G2`). Requires: server endpoint, auth model, enterprise branding. | G1, G2, §6.3 item 7 |
| `008-extension-permissions-refresh` | Re-audit permissions (`G13`, `G14`, `G15`). Requires UX/enterprise sign-off before any manifest change. | G13, G14, G15, §6.3 item 8 |
| `009-jmx-export-quality` | G20 enhancements: `postBodyRaw` fix, error-request method fix, think-time timers, response assertions, `CookieManager`, redirect deduplication, query-param serialization. | G20, §4.4 |
| `010-advanced-recorder-options` | G21 Advanced Options UI and persistence: recording depth, UA override, filter pattern, parallel downloads, think-time randomization. | G21 |
| *(backlog only)* | Domain-filter exact-match toggle, select-all/select-none, plan-name hint, filename sanitization, content-script body fallback, in-flight state persistence, chunked export. | §6.1–6.3, `specs/XXX-backlog-ideas.md` |

**Integration notes for new specs:**
- Each future spec should include its own acceptance criteria, affected modules,
  and public API contracts before implementation begins.
- The `007-*`, `008-*`, and `009-*` specs may touch `src/jmx/`, `src/popup/`,
  `src/options/`, and `src/background/`. They should be reviewed for conflict
  with any concurrent `010-*` work.
- `010-advanced-recorder-options` should be sequenced after permission decisions
  from `008-*` if any controls require new manifest permissions.

---

_End of document._

---

_End of document._
