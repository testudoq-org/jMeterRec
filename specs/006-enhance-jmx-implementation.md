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

| ID  | Gap summary                                                | new-src mapping                             | Status            |
| --- | ---------------------------------------------------------- | ------------------------------------------- | ----------------- |
| G1  | Upload traffic to backend converter (`server_jmx`)         | none                                        | Missing           |
| G2  | `upload_jmx` DOM form workflow                             | none                                        | Missing           |
| G3  | `export_jmeter` / `export_jmeter_follow` message contracts | `EXPORT_JMX`                                | Replaced          |
| G4  | Overlay progress UX (iframe height postMessage)            | Popup/badge                                 | Replaced          |
| G5  | Domain download overlay                                    | Domain selector in popup                    | Replaced/improved |
| G6  | Server URL / ARD URL / theme options loading form          | none                                        | Missing           |
| G7  | JMX thread group options normalisation/validation          | `JmxOptionsStore`                           | Improved          |
| G8  | Plan-name collision between snapshot and saved default     | `planNameForExport`                         | Improved          |
| G9  | Response-body captured into JMX CDATA                      | `applyCapturedResponseBody` + `escapeCdata` | Improved          |
| G10 | Subdomain-aware domain filtering                           | `filterRequestsByDomains`                   | Improved          |
| G11 | Skip BlazeMeter own domains (`forbidden-domains`)          | none                                        | Missing           |
| G12 | Legacy jQuery `.domains-body` checkbox                     | Domain selector in popup                    | Replaced          |
| G13 | `contextMenus` permission                                  | none                                        | Missing           |
| G14 | `notifications` permission                                 | none                                        | Missing           |
| G15 | `browsingData` permission                                  | none                                        | Missing           |
| G16 | `scripting` permission                                     | none                                        | Missing           |
| G17 | Selenium tape `exportJSON()` flow                          | `buildPlaywrightResponse()` in `src/generators/playwright.ts` | Replaced (Playwright `.spec.ts` generator) |
| G18 | Selenium tape `getTransactions()` flow                     | `GET_REQUESTS` + `CapturedRequest[]` in popup | Replaced (different data model) |
| G19 | Selenium tape message commands (`check_status`, etc.)      | Typed `BackgroundRequest` union in `src/messages.ts` | Replaced (core lifecycle mapped; tape commands dropped) |

The following sections detail every gap as a standalone specification, then provide
a consolidated priority table and implementation guidance.

---

### G1 — Backend JMX converter URL (`server_jmx`)

**Intended behaviour (src-ori)**
The options page exposes a "Server Converter" text input bound to storage key
`server_jmx`. When the user triggers export, the captured requests are POSTed to
that URL and the server returns a JMX file or download link. No local JMX XML is
generated client-side.

**Affected src-ori modules/files**

- `src-ori/options/options.tsx`
- `src-ori/js/common.js`
- `src-ori/config.json`

**Public events / functions / methods / APIs**

- Storage key `server_jmx`
- Option input `#serverJMX`
- jQuery overlay functions in `common.js`
- Background message `export_jmeter` / `export_jmeter_follow`

**Input/Output**

- **Input:** User-entered HTTPS URL; selected domain list; captured traffic.
- **Output:** HTTP POST to backend converter; server returns a JMX file/link.

**Dependencies**

- Network access; jQuery/jQuery-UI; `host_permissions` for converter endpoint.

**Migration considerations**

- The new `src` is a client-side generator. If the converter path must remain,
  expose an "Upload to server" mode as an opt-in action. Otherwise document the
  architectural shift offline-only JMX export.

**Acceptance criteria**

- AC1: If the upload path is restored, the server URL is surfaced in the
  options page, validated (HTTPS), persisted, and callers handle
  network/HTTP errors visibly.
- AC2: If deprecated, product documentation confirms offline JMX generation is
  the only supported path.

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
selector (`blazemeter` vs `dynatrace`). The theme drives logo asset selection in
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
- AC2: Theme is persisted and applied as light/dark; the BlazeMeter/Dynatrace
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

**Affected src-ori modules/files**

- `src-ori/manifest.json:55`
- `src-ori/js/content-script.js`

**Affected new-src modules/files**

- `src/background/action-recorder.ts`
- `src/content/action-recorder.ts`
- `src/manifest.json` (no scripting permission today)

**Migration considerations**

- Verify the new action recorder uses CDP (`chrome.debugger`) rather than
  `chrome.scripting`. If a future feature needs injected helpers, prefer
  declarative `content_scripts` in the manifest.

**Acceptance criteria**

- AC1: Action recorder operates without `"scripting"` permission.
- AC2: No `chrome.scripting` usage exists under `src/`.

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

### G11 — Skip BlazeMeter own domains (MISSING)

**Intended behaviour (src-ori)**
`src-ori/forbidden-domains.json` lists hosts to skip (BlazeMeter and
extension-internal). Content scripts referenced exclusions at injection time.

**Affected new-src modules/files**

- `src/background/traffic-normalizer.ts` (no equivalent exclusion)
- `src/background/traffic-capture.ts` (ideal insertion point)

**Migration considerations**

- Add a static exclusion array checked inside `TrafficCaptureService` event
  handlers. For MV3, consider `declarativeNetRequest` rules.

**Acceptance criteria**

- AC1: Requests matching forbidden hosts are omitted before storage.
- AC2: Exclusion logic is unit-testable and does not require a browser restart.

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

**Current status in new `src`: Replaced.**  
The Playwright generator at `src/generators/playwright.ts` provides `buildPlaywrightResponse()`, which produces a `.spec.ts` file from `CapturedRequest[]` + `ActionStep[]`. This is the primary export path for test recordings; the SideEx JSON format is no longer required for normal operation.

**PSA:** If a SideEx-to-Playwright migration shim is needed (e.g., for customers with existing SideEx tapes), that is a separate compatibility project and is not required for the current Playwright implementation.

**Migration considerations**

- If SideEx compatibility is required, build a SideEx JSON → `ActionStep[]`
  translation layer. Otherwise mark deprecated.
- No Playwright-equivalent gaps exist; `buildPlaywrightResponse()` already
  handles HTTP request mocking and action serialization.

**Acceptance criteria**

- AC1: The Playwright generator produces valid `.spec.ts` files for HTTP
  recordings (confirmed by existing tests in
  `src/generators/playwright.test.ts`).
- AC2: Action steps (`ActionStep[]`) are included in the same output, giving
  feature parity with SideEx's tape + request recording concept.
- AC3: If a migration shim is built in future, it passes smoke tests for
  common SideEx commands (out of scope for current workstream).

---

### G18 — Selenium tape `getTransactions()` flow (OUT OF SCOPE / SUPERSEDED)

**Intended behaviour (src-ori)**  
Maps `TestSuite.test_cases` to `{ name, counter }`.

**Current status in new `src`: Replaced.**  
The new popup renders transactions from `CapturedRequest[]` (HTTP traffic) combined with `ActionStep[]` (CDP-recorded actions). This is surfaced via the `GET_REQUESTS` message and `REQUEST_CAPTURED` broadcasts. There is no direct equivalent to the SideEx `getTransactions` command because the data model differs entirely.

**PSA:** The SideEx `getTransactions` concept (list of test cases + command counts) has no Playwright counterpart. If a migration shim is needed to translate SideEx tapes into Playwright steps, that is a separate compatibility project.

**Migration considerations**

- No direct replacement needed; new model differs.
- The popup's transaction list (`renderTransactions`) provides the user-facing equivalent.

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
| **P0**           | G11 (forbidden-domains), G3 (`EXPORT_JMX` contract), G9 (response body CDATA)      | Correctness and security.`G11` prevents recursive self-recording; `G3` and `G9` ensure valid, safe JMX output.               |
| **P1**           | G7 (options validation), G8 (plan name), G10 (domain filter), G4/G5 (UI contracts) | Core export-pipeline correctness and UX. Low implementation risk.                                                            |
| **P2**           | G1/G2 (backend upload path), G13/G14/G15/G16 (permissions/options form)            | Important for enterprise users and feature parity, but not blocking core functionality. Requires product-strategy decisions. |
| **Out-of-Scope** | G17, G18, G19 (Selenium tape)                                                      | Superseded by Playwright recording. Only port if a SideEx compatibility shim is commercially required.                       |

---

## 4. Consolidated Recommendations

### 4.1 Immediate actions (P0)

1. **Add forbidden-domain exclusions early in the capture pipeline.**
   Place a static exclusion list check in `TrafficCaptureService` or as
   `declarativeNetRequest` rules. This prevents noise and recursive traffic.
2. **Audit `EXPORT_JMX` caller-visible error paths.**
   Ensure every failure (no domains, no matching requests, malformed options)
   returns a typed error string that the popup renders as a banner.
3. **Validate CDATA body encoding in tests.**
   Add a regression test that `escapeCdata` handles `]]>` in request bodies.

### 4.2 Short-term actions (P1)

4. **Document plan-name resolution in the popup UI.**
   Add a hint such as "Export uses session name (or default if untitled)" so
   users aren't surprised.
5. **Confirm domain-filter subdomain semantics.**
   If power users need exact-host matching, expose an option defaulting to the
   new subdomain-aware behaviour.
6. **Finish popup/Option parity for JMX settings.**
   `JmxOptionsStore` already validates; ensure the options page saves/loads
   cleanly and the popup reads from the same store.

### 4.3 Medium-term decisions (P2)

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

### 4.4 Cross-cutting non-functional improvements

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

_End of document._
