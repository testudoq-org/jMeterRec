# 004 Improve UX/UI Implementation

## Executive summary

The `004-improve-ux-ui-implementation` branch has implemented the first UX/UI improvement pass for the Capultura MV3 Chrome extension. The branch preserves the existing recording/export behavior and stable IDs while moving popup/options styles into separate CSS files, adding a compact visual hierarchy, adding a transaction inspector panel, adding popup/options transaction settings, adding theme persistence, and adding a detached inspector window using `chrome.windows.create`.

Important closure status: P0, P1, P2, and P3 are implemented. P4 response body capture and the optional background port-forwarding bridge remain deferred follow-ups. The UI can show request body, response headers, status, timestamps, and duration. It cannot show response bodies unless a future capture mechanism is added, because Chrome `webRequest` does not reliably expose response bodies for all traffic.

MV3 caveat: the native action popup cannot be forced to stay always-on-top. A detached `type: 'popup'` window can be focused and positioned, but the operating system can still cover it.

## Review prompt

Use this prompt for a human reviewer or AI code-reviewer during branch closure:

> Review the MV3 Chrome extension branch `004-improve-ux-ui-implementation` for documentation and implementation closure. Focus on `popup.html`, `popup.css`, `popup.ts`, `options.html`, `options.css`, `options.ts`, and `src/manifest.json`. Do NOT change element IDs, event handler names, or existing public APIs.
>
> 1. Confirm no regressions or broken functionality in recording, pause/resume, stop, clear, JMX export, Playwright export, and options persistence.
> 2. Confirm existing element IDs, event names, and public APIs remain compatible.
> 3. Identify code smells, accessibility issues, security pitfalls, or MV3-specific incompatibilities.
> 4. Confirm the transaction panel renders with safe DOM APIs and does not inject request/response content as HTML.
> 5. Confirm response body limitations are documented in the UI/options and this spec.
> 6. Confirm the detached inspector window behavior and `windows` permission are acceptable.
> 7. Recommend whether the remaining response-body capture and port-forwarding work should be deferred or required before merge.
>
> Return results as: a short executive summary, a closure checklist, concrete patch suggestions if any, and a final risk/regression assessment.

## Current code observations

### Popup

`src/popup/popup.html` now has a compact recorder card, export controls, JMX domain selector, Playwright base URL input, clear action, error area, and transaction panel. Existing IDs are preserved:

- `planName`, `status`, `elapsedTime`, `start`, `pause`, `resume`, `stop`
- `exportMode`, `export`
- `jmxOptions`, `jmxDomains`, `jmxDomainStatus`, `jmxDomainError`, `exportJmxSelected`
- `playwrightOptions`, `baseUrl`
- `clear`, `error`

New popup IDs added by this branch:

- `themeMode`
- `capultura-transaction-panel`
- `transactionPanelTitle`, `transactionSummary`
- `openDetachedInspector`
- `transactionMethodFilter`, `transactionStatusFilter`, `transactionSearch`
- `transactionList`

### Options

`src/options/options.html` now has three option groups:

1. Appearance: shared `themeMode` setting.
2. JMX export defaults: `defaultPlanName`, `threads`, `rampUp`, `loops`, `save`, `saved`.
3. Transaction panel: `maxTransactions`, `openDetachedInspector`, `captureResponseBody`, `saveTransactionPanelOptions`, `transactionPanelSaved`.

The JMeter option behavior remains unchanged. The transaction panel option `captureResponseBody` is stored but does not enable real response-body capture by itself; it only controls the panel text until a future capture mechanism is implemented.

### Recording events

`src/messages.ts` still defines the existing broadcast contract:

```ts
export type BackgroundBroadcast =
  | { type: 'STATE_CHANGED'; snapshot: RecorderSnapshot }
  | { type: 'REQUEST_CAPTURED'; request: unknown }
```

`src/background/traffic-capture.ts` broadcasts `REQUEST_CAPTURED` after request completion or error. The popup subscribes to the existing `chrome.runtime.onMessage` broadcast and seeds the panel from the existing `GET_REQUESTS` API. Event names and payload names were not changed.

### CSS organization

The popup and options pages now use separate CSS files linked from the HTML `<head>`:

```html
<link rel="stylesheet" href="./popup.css" />
```

```html
<link rel="stylesheet" href="./options.css" />
```

This is implemented and reduces inline HTML style drift as the transaction panel grows.

## Prioritized checklist for safe changes

### P0 — No-regression UX cleanup — Done

Risk: Low

- [x] Move existing inline popup/options styles into separate `popup.css` and `options.css` files.
- [x] Add stylesheet links in the HTML `<head>` sections.
- [x] Keep existing IDs, event names, and public APIs unchanged.
- [x] Keep current recording/export behavior unchanged.
- [x] Add compact visual hierarchy: recorder controls, status, elapsed time, export controls, transaction panel.
- [x] Add `aria-live` to status/error/count updates.
- [x] Add visible `:focus-visible` styles.
- [x] Add reduced-motion behavior for ambient animation and hover transitions.
- [x] Add shared light/dark theme support.

### P1 — Transaction panel in popup — Done

Risk: Medium

- [x] Add new `#capultura-transaction-panel` section to `popup.html`.
- [x] Render recent transactions from `REQUEST_CAPTURED` and seed with `GET_REQUESTS`.
- [x] Keep a bounded in-memory queue using `maxTransactions` from storage.
- [x] Show method, short URL, status, timestamp, and duration.
- [x] Expand rows for headers and bodies.
- [x] Truncate large payloads and use `textContent`/`JSON.stringify`, not `innerHTML`.
- [x] Add method, status, and URL filters.
- [x] Add keyboard-friendly buttons for transaction rows.

### P2 — Options for inspection behavior — Done

Risk: Low

- [x] Add options for max popup transactions, detached inspector behavior, and a response body capture UI flag.
- [x] Store these separately from JMeter export settings.
- [x] Do not change existing JMeter option behavior.
- [x] Add theme as a shared appearance option.

Remaining caveat:

- [ ] The `captureResponseBody` option is persisted and honored by the display text, but no response-body capture mechanism is implemented yet.

### P3 — Detached inspector window — Done

Risk: Medium

- [x] Add a `Detach inspector` button.
- [x] Open the detached inspector manually.
- [x] Open the detached inspector automatically when recording starts if enabled in options.
- [x] Re-focus an existing detached inspector window when present.
- [x] Use `chrome.windows.create({ type: 'popup', focused: true })`.
- [x] Add `windows` permission to the manifest.
- [x] Document that this is not guaranteed always-on-top across OS window managers.

### P4 — Optional response body capture — Deferred

Risk: High

- [ ] Keep existing `webRequest` behavior unchanged.
- [ ] Prefer opt-in content-script `fetch`/`XMLHttpRequest` wrapping for page-origin requests if response bodies are required.
- [ ] Avoid `chrome.debugger` unless full response bodies are explicitly required and user opt-in is part of the UX.
- [ ] Add size limits and privacy warnings.
- [ ] Add tests for truncation, redaction/privacy wording, and disabled capture behavior.

## UX/UI recommendations

### Popup layout

Implemented compact layout:

1. Header: title and theme selector.
2. Recorder card: plan name, Start/Pause/Resume/Stop, status pill, elapsed time.
3. Export card: export mode, JMX domain selector, Playwright base URL, Export.
4. Clear action and error area.
5. Transaction panel: filters, scrollable list, expandable details, detach button.

### Visual guidance

Implemented design tokens in `popup.css` and `options.css`:

- Background: `#f8fafc`
- Surface: `#ffffff`
- Border: `#cbd5e1`
- Text: `#0f172a`
- Muted text: `#475569`
- Primary: `#2563eb`
- Success: `#15803d`
- Warning: `#b45309`
- Danger: `#dc2626`
- Monospace: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

Implemented dimensions:

- Popup body width: `420px`
- Popup max width: `100vw`
- Transaction list max height: `260px`
- Detached inspector window: `420px` by `720px`

### Accessibility

Implemented:

- Tab order follows visual order.
- Real `<button>` elements for actions and transaction rows.
- Labeled inputs and selects.
- `aria-live="polite"` on status, error, and transaction summary.
- `aria-expanded` and `aria-controls` for expandable transaction rows.
- `:focus-visible` outlines for keyboard navigation.
- `prefers-reduced-motion` disables ambient animation and hover transforms.

Closure review should still manually verify contrast and screen-reader behavior in a real Chrome extension popup.

## Lightweight MV3-compatible framework options

Current decision: Vanilla TypeScript ES modules.

Recommended order if complexity grows:

1. **Vanilla TypeScript ES modules** — current choice, no new runtime dependency, lowest risk.
2. **Lit 3** — small web components, good for the transaction panel.
3. **Preact** — React-like API with a smaller bundle.
4. **Svelte** — small bundles, requires build step, already available through Vite.

Avoid remote-loaded scripts, CDN dependencies, and large runtime frameworks unless the component complexity justifies them.

## Manifest and permission guidance

Current manifest permissions:

```json
"permissions": ["storage", "unlimitedStorage", "webRequest", "activeTab", "windows"],
"host_permissions": ["<all_urls>"]
```

Permission notes:

- `storage`: stores recording state, captured requests, JMX/Playwright settings, transaction panel options, and theme.
- `unlimitedStorage`: supports local captured request storage.
- `webRequest`: captures HTTP request headers and request bodies.
- `activeTab`: supports recording control for the active tab.
- `windows`: required for the detached inspector window.
- `host_permissions`: `<all_urls>` is required for browser traffic capture.
- `sidePanel`: not used.
- `debugger`: not used; only consider for devtools-style full response-body capture.
- `webRequestBlocking`: not declared and not needed by the current implementation.

## Concrete popup HTML example

The implemented popup adds new UI while preserving existing IDs/controls. The key transaction panel shape is:

```html
<section
  id="capultura-transaction-panel"
  class="transaction-panel"
  aria-labelledby="transactionPanelTitle"
>
  <div class="transaction-panel__header">
    <div>
      <h2 id="transactionPanelTitle">Live transactions</h2>
      <p id="transactionSummary" class="muted">No requests captured yet.</p>
    </div>
    <button id="openDetachedInspector" class="secondary" type="button">Detach</button>
  </div>

  <div class="transaction-filters" role="search" aria-label="Filter transactions">
    <label for="transactionMethodFilter">Method</label>
    <select id="transactionMethodFilter">
      <option value="all">All</option>
      <option value="GET">GET</option>
      <option value="POST">POST</option>
      <option value="PUT">PUT</option>
      <option value="PATCH">PATCH</option>
      <option value="DELETE">DELETE</option>
    </select>

    <label for="transactionStatusFilter">Status</label>
    <select id="transactionStatusFilter">
      <option value="all">All</option>
      <option value="2xx">2xx</option>
      <option value="3xx">3xx</option>
      <option value="4xx">4xx</option>
      <option value="5xx">5xx</option>
      <option value="error">Error</option>
    </select>

    <label for="transactionSearch">Search URL</label>
    <input
      id="transactionSearch"
      type="search"
      autocomplete="off"
      placeholder="example.com/api"
    />
  </div>

  <div
    id="transactionList"
    class="transaction-list"
    role="list"
    aria-label="Recent HTTP transactions"
  ></div>
</section>
```

## Concrete options HTML example

The implemented options page keeps JMeter options and adds appearance plus transaction panel options:

```html
<section class="options-section" aria-labelledby="appearanceOptionsTitle">
  <h2 id="appearanceOptionsTitle">Appearance</h2>

  <label for="themeMode">Theme</label>
  <select id="themeMode">
    <option value="light">Light</option>
    <option value="dark">Dark</option>
  </select>
</section>

<section class="options-section" aria-labelledby="transactionPanelOptionsTitle">
  <h2 id="transactionPanelOptionsTitle">Transaction panel</h2>
  <p>Controls how the popup displays recently captured HTTP requests.</p>

  <label for="maxTransactions">Maximum transactions shown in popup</label>
  <input id="maxTransactions" type="number" min="20" max="500" step="20" />

  <label class="checkbox-row">
    <input id="openDetachedInspector" type="checkbox" />
    <span>Open detached inspector window when recording starts</span>
  </label>

  <label class="checkbox-row">
    <input id="captureResponseBody" type="checkbox" />
    <span>Capture response bodies when available. This can expose sensitive data.</span>
  </label>

  <button id="saveTransactionPanelOptions" type="button">Save transaction panel options</button>
  <div id="transactionPanelSaved" aria-live="polite"></div>
</section>
```

## Popup TypeScript transaction panel behavior

Implemented behavior:

- Loads transaction options from `chrome.storage.local`.
- Applies the saved theme to `document.documentElement.dataset.theme`.
- Seeds transactions from `GET_REQUESTS` on popup open.
- Appends new transactions from `REQUEST_CAPTURED`.
- Trims the in-memory transaction array to `maxTransactions`.
- Filters by method, status bucket, and URL search text.
- Renders rows as buttons with `textContent`.
- Expands/collapses details with `replaceChildren`.
- Shows response body as disabled/unavailable until real capture is implemented.
- Opens and re-focuses a detached inspector window.

Key implementation files:

- `src/popup/popup.ts`
- `src/popup/popup.html`
- `src/popup/popup.css`
- `src/options/options.ts`
- `src/options/options.html`
- `src/options/options.css`
- `src/manifest.json`

Security notes:

- Use `textContent` and `JSON.stringify`, not `innerHTML`, for request/response content.
- Truncate bodies before display.
- Do not persist sensitive bodies unless explicitly enabled.
- Handle missing `responseBody` gracefully.
- The current `captureResponseBody` option must not be interpreted as a real response-body capture mechanism.

## Always-on-top alternative

Native Chrome action popups cannot be forced to stay always-on-top and close when focus leaves the extension popup. Use a detached inspector window instead.

Implemented popup behavior:

```ts
void chrome.windows
  .create({
    url: chrome.runtime.getURL('src/popup/popup.html?detached=1'),
    type: 'popup',
    width: 420,
    height: 720,
    focused: true,
  })
  .then((win) => {
    if (win?.id !== undefined) {
      detachedWindowId = win.id
    }
  })
```

Required manifest permission:

```json
{
  "permissions": ["storage", "unlimitedStorage", "webRequest", "activeTab", "windows"]
}
```

Caveat: `type: 'popup'` creates and focuses a smaller Chrome window, but it is not guaranteed to remain above all other OS windows.

## Background changes

Implemented background behavior:

1. Existing `chrome.runtime.sendMessage({ type: 'REQUEST_CAPTURED', request })` broadcast is still used.
2. Existing `STATE_CHANGED` broadcasts continue to update popup state.
3. Existing `GET_REQUESTS` API seeds the transaction panel on popup open.
4. No background event names or public message names were changed.

Deferred background behavior:

1. Add `chrome.runtime.onConnect` handling for a new port name such as `transaction-panel`.
2. Forward `STATE_CHANGED` and `REQUEST_CAPTURED` messages to connected ports.
3. On connect, optionally send latest state and recent requests so a newly opened popup can seed its panel.
4. Keep existing `sendMessage` broadcast for compatibility.

Current closure recommendation: port forwarding is optional for this branch. The popup receives `onMessage` broadcasts and seeds from persisted requests. Add port forwarding only if reviewers require more reliable live updates while detached or long-running popup instances remain open.

## Response body capture caveat

The user-facing requirement includes request/response body. The current background captures request body through `webRequest` `requestBody`, but it does not capture response body.

Safe interpretation implemented:

- Show request body when present.
- Show response headers and status.
- Show `Response body capture disabled` when the option is disabled.
- Show `Unavailable from webRequest` when the option is enabled but no response body is available.
- Add an opt-in content-script wrapper only if response bodies are required for page requests.

High-risk response body options:

1. **Content-script fetch/XHR wrapper**
   - Pros: Can capture response bodies for page JavaScript requests.
   - Cons: Does not cover all browser traffic, must run at `document_start`, can break apps if injected incorrectly, and raises privacy/security concerns.

2. **`chrome.debugger`**
   - Pros: Can inspect network response bodies in a devtools-like workflow.
   - Cons: Requires user opt-in, can interfere with debugging, may be revoked when DevTools is open, and is not appropriate for passive recording.

3. **Proxy or server-side capture**
   - Pros: Most complete and reliable.
   - Cons: Out of scope for a browser extension popup-only change.

Recommendation: close this branch as a read-only transaction inspector first. Add opt-in response body capture as a separate high-risk follow-up with explicit user consent, size limits, privacy warnings, and tests.

## Outstanding tasks and gaps

| Area | Status | Evidence | Closure decision |
|---|---|---|---|
| CSS separation | Done | `popup.html` links `./popup.css`; `options.html` links `./options.css`; new CSS files added. | No follow-up required. |
| Popup visual hierarchy | Done | Recorder controls are in a card with status and elapsed time; export controls remain intact. | No follow-up required. |
| Theme persistence | Done | Popup and options share `themeMode`; both pages read/write it to `chrome.storage.local`. | No follow-up required. |
| Transaction panel markup | Done | `#capultura-transaction-panel`, filters, summary, and list are present in `popup.html`. | No follow-up required. |
| Transaction event wiring | Done | `popup.ts` listens for existing `REQUEST_CAPTURED` and seeds from `GET_REQUESTS`. | No follow-up required unless reviewers require port forwarding. |
| Bounded queue and safe rendering | Done | Popup keeps a capped transaction array and renders with `textContent`/`JSON.stringify`. | No follow-up required. |
| Transaction options | Done | Options page stores `maxTransactions`, `openDetachedInspector`, and `captureResponseBody`. | Follow up only to implement real response-body capture. |
| Detached inspector | Done | Popup uses `chrome.windows.create`; manifest includes `windows`. | No follow-up required. Document OS limitation. |
| Background port forwarding | Deferred | Not implemented in this pass. Current popup receives `onMessage` broadcasts. | Optional follow-up. |
| Response body capture | Deferred | UI shows disabled/unavailable text until a separate opt-in capture mechanism is added. | Required only if response bodies are a release blocker. |
| Framework migration | Not done | Vanilla TypeScript remains in use. | No follow-up required. |
| Manual browser regression | Not run in this docs pass | Requires loading unpacked extension in Chrome. | Must be run before merge. |
| E2E extension export test | Not implemented | Existing tests do not load the extension and validate golden JMX/Playwright output. | Existing backlog item; not required for 004 closure unless release criteria demand it. |

## Implementation progress

| Area | Status | Evidence | Notes |
|---|---|---|---|
| CSS separation | Done | `popup.html` links `./popup.css`; `options.html` links `./options.css`; new CSS files added. | Existing inline styles removed from HTML. |
| Popup visual hierarchy | Done | Recorder controls are in a card with status and elapsed time; export controls remain intact. | Existing IDs preserved. |
| Theme support | Done | `themeMode` exists in popup/options and is persisted to `chrome.storage.local`. | Shared appearance option. |
| Transaction panel markup | Done | `#capultura-transaction-panel`, filters, summary, and list are present in `popup.html`. | New IDs only; existing IDs unchanged. |
| Transaction event wiring | Done | `popup.ts` listens for existing `REQUEST_CAPTURED` and seeds from `GET_REQUESTS`. | No background event names changed. |
| Bounded queue and safe rendering | Done | Popup keeps a capped transaction array and renders with `textContent`/`JSON.stringify`. | Response body capture is not implemented yet. |
| Transaction options | Done | Options page stores `maxTransactions`, `openDetachedInspector`, and `captureResponseBody`. | Existing JMeter options preserved. `captureResponseBody` is a UI flag only. |
| Detached inspector | Done | Popup uses `chrome.windows.create`; manifest includes `windows`. | Not guaranteed always-on-top across OS window managers. |
| Background port forwarding | Deferred | Not implemented in this pass. | Current popup receives `onMessage` broadcasts; port bridge can be added later for more reliable live updates. |
| Response body capture | Deferred | Not implemented in this pass. | UI shows disabled/unavailable text until a separate opt-in capture mechanism is added. |
| Framework migration | Deferred | Vanilla TypeScript remains in use. | No new framework dependency added. |

## Implementation plan

| Priority | Task | Status | Risk | Notes |
|---:|---|---|---:|---|
| 1 | Move existing inline styles into `popup.css` and `options.css` | Done | Low | Add stylesheet links in HTML; verify existing UI before adding new UI. |
| 2 | Add popup CSS layout tokens and compact card structure | Done | Low | No behavior change. |
| 3 | Add transaction panel markup to `popup.html` | Done | Low | New IDs only; existing IDs untouched. |
| 4 | Add bounded transaction queue renderer in `popup.ts` | Done | Medium | Uses existing `REQUEST_CAPTURED`; no payload changes. |
| 5 | Seed panel from `GET_REQUESTS` on popup open | Done | Low | Uses existing API. |
| 6 | Add transaction options to `options.html` | Done | Low | New IDs only; existing JMeter options untouched. |
| 7 | Add `windows` permission and detached inspector button | Done | Medium | Requires manifest change and popup window handling. |
| 8 | Add background port forwarding for transaction events | Deferred | Medium | Additive; keep existing `sendMessage` broadcast. |
| 9 | Add filters and expandable details | Done | Medium | UI-only after event wiring works. |
| 10 | Add optional response body capture | Deferred | High | Requires privacy review and likely content-script or debugger changes. |
| 11 | Evaluate Lit/Preact/Svelte only if component complexity grows | Deferred | Low | Not required for first pass. |

## Manual regression checklist

Before merging:

- [ ] Verified by build/typecheck/tests: `npm run typecheck`, `npm run build`, `npm test`, touched-file ESLint, and touched-file Prettier all passed.
- [ ] Verify popup/options still look and function correctly after moving styles into separate CSS files.
- [ ] Start recording from popup.
- [ ] Pause and resume recording.
- [ ] Stop recording.
- [ ] Clear captured requests.
- [ ] Export JMX with selected domains.
- [ ] Export Playwright script with base URL.
- [ ] Open popup after recording has existing saved requests.
- [ ] Confirm transaction panel updates as requests complete.
- [ ] Confirm popup closes/reopens without losing existing recording/export behavior.
- [ ] Confirm detached inspector opens manually.
- [ ] Confirm detached inspector opens automatically when enabled and recording starts.
- [ ] Confirm options save and reload.
- [ ] Test keyboard navigation through controls and transaction rows.
- [ ] Test long URLs and large request bodies.
- [ ] Confirm no request/response content is rendered as HTML.
- [ ] Confirm response body text clearly says capture is disabled/unavailable.
- [ ] Confirm `windows` permission is the only new permission added for this branch.

## Deliverables to request from reviewer

Ask the reviewer to provide:

1. Confirmation that no existing element IDs, event handler names, or public APIs changed.
2. Confirmation that response body limitations are documented in the UI/options and this spec.
3. Confirmation that the detached inspector behavior is acceptable without guaranteed always-on-top semantics.
4. Any small patch suggestions for accessibility, security, or MV3 compatibility.
5. A decision on whether response-body capture must be implemented before merge or can remain a separate follow-up.

## Branch name suggestion

Current review branch:

```text
004-improve-ux-ui-implementation
```

Recommended follow-up branch for response body capture:

```text
005-transaction-response-body-capture
```

Recommended follow-up branch for reliable live forwarding:

```text
006-transaction-panel-port-forwarding
```

## Final risk/regression assessment

Overall closure risk: Medium.

Low-risk completed changes:

- Visual cleanup.
- Compact card layout.
- Theme support.
- Accessibility improvements.
- Transaction panel using existing `REQUEST_CAPTURED` and `GET_REQUESTS`.
- Options for max transaction count, detached inspector, and capture-response-body UI flag.

Medium-risk completed changes:

- Detached inspector window using `chrome.windows.create`.
- Expandable transaction details with large payload handling.
- Popup transaction state seeded from persisted requests and updated by runtime broadcasts.

High-risk deferred changes:

- Guaranteed response body capture.
- `chrome.debugger`-based capture.
- Background port forwarding for more reliable live event delivery.
- Any framework migration that changes the popup DOM or event flow.

Closure recommendation: the branch is ready for closure review as a read-only transaction inspector and compact UX/UI improvement. Response body capture should be treated as a separate optional feature with explicit user consent, size limits, and privacy warnings. Manual browser regression remains required before merge.
