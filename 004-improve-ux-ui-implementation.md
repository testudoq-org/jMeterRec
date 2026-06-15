# 004 Improve UX/UI Implementation

## Executive summary

The current popup works, but it is visually crowded for a 320px Chrome extension popup. The safest path is to preserve the existing recording/export behavior and IDs, then add a compact transaction inspector that reads the existing `REQUEST_CAPTURED` event stream and `GET_REQUESTS` API. Heavy configuration should move into `options.html`, and a detached inspector window can be added with `chrome.windows.create` plus the `windows` permission.

Important MV3 caveat: the native action popup cannot be forced to stay always-on-top. A detached `type: 'popup'` window can be focused and positioned, but the operating system can still cover it. Also, Chrome `webRequest` can capture request bodies, response headers, status, and timing metadata, but it cannot reliably capture response bodies for all traffic. Response body capture should be opt-in and treated as a separate high-risk feature.

## Review prompt

Use this prompt for a human reviewer or AI code-reviewer:

> Review the MV3 Chrome extension branch `004-improve-ux-ui-implementation` focusing only on `popup.html` and `options.html`. Do NOT change element IDs, event handler names, or existing public APIs. Goals:
>
> 1. Ensure no regressions or broken functionality.
> 2. Identify code smells, accessibility issues, security pitfalls, or MV3-specific incompatibilities.
> 3. Recommend a safe refactor path to separate UI, state, and background logic.
> 4. Propose how to embed a `capultura-transaction-panel` inside `popup.html` that shows live HTTP requests: method, URL, headers, request/response body, timestamp, and status, without changing existing recordings' behavior.
> 5. List required manifest or background changes to support the new UI and any additional permissions, explaining minimal permissions.
> 6. Provide an implementation plan with prioritized tasks and estimated risk for each change.
> 7. Provide UI/UX suggestions: visual mock guidance, accessibility, and responsive sizing.
> 8. Recommend lightweight framework/stack options compatible with MV3.
> 9. Provide concrete code snippets or pseudo-code for wiring the transaction panel to existing recording events and opening an always-on-top popup window alternative if the native popup cannot be kept on top by default.
>
> Return results as: a short executive summary, a prioritized checklist for safe changes, concrete code examples limited to `popup.html`, `options.html`, and manifest edits, and a final risk/regression assessment.

## Current code observations

### Popup

`src/popup/popup.html` currently combines plan naming, recorder controls, export settings, JMX domain selection, Playwright settings, and errors in a fixed 320px layout. Existing IDs to preserve:

- `planName`, `status`, `start`, `pause`, `resume`, `stop`
- `exportMode`, `export`
- `jmxOptions`, `jmxDomains`, `jmxDomainStatus`, `jmxDomainError`, `exportJmxSelected`
- `playwrightOptions`, `baseUrl`
- `clear`, `error`

### Options

`src/options/options.html` currently stores only JMeter export defaults:

- `defaultPlanName`, `threads`, `rampUp`, `loops`, `save`, `saved`

### Recording events

`src/messages.ts` already defines `REQUEST_CAPTURED`:

```ts
export type BackgroundBroadcast =
  | { type: 'STATE_CHANGED'; snapshot: RecorderSnapshot }
  | { type: 'REQUEST_CAPTURED'; request: unknown }
```

`src/background/traffic-capture.ts` broadcasts `REQUEST_CAPTURED` after completion or error. The popup can subscribe without changing event names. The request type should be tightened from `unknown` to `CapturedRequest` in a safe follow-up if needed, but the event name should remain unchanged.

### CSS organization

Before this implementation, the popup and options pages kept CSS inside their HTML files. This improvement moves those styles into separate CSS files before adding the transaction panel.

Recommended structure:

```text
src/
  popup/
    popup.html
    popup.css
    popup.ts
  options/
    options.html
    options.css
    options.ts
```

Why this is cleaner:

- Keeps HTML focused on structure.
- Keeps TypeScript focused on behavior.
- Makes UI changes easier to review.
- Avoids large inline `<style>` blocks as the transaction panel grows.
- Works cleanly with the existing Vite/Rollup build.
- Makes future design tokens or shared styles easier to add.

Implemented links in the HTML `<head>` sections:

```html
<link rel="stylesheet" href="./popup.css" />
```

```html
<link rel="stylesheet" href="./options.css" />
```

This is a low-risk refactor if done before adding new UI. Move existing styles first, verify the popup/options visually, then add transaction-panel styles in `popup.css`.

## Prioritized checklist for safe changes

### P0 — No-regression UX cleanup

Risk: Low

- Move existing inline popup/options styles into separate `popup.css` and `options.css` files.
- Add stylesheet links in the HTML `<head>` sections.
- Keep existing IDs, event names, and public APIs unchanged.
- Keep current recording/export behavior unchanged.
- Add compact visual hierarchy: primary record/stop action, status, elapsed time, export controls, then transaction panel.
- Add `aria-live` to status/error/count updates.
- Add visible `:focus-visible` styles.

### P1 — Transaction panel in popup

Risk: Medium

- Add new `#capultura-transaction-panel` section to `popup.html`.
- Render recent transactions from `REQUEST_CAPTURED` and seed with `GET_REQUESTS`.
- Keep a bounded in-memory queue, for example 100-200 items.
- Show method, short URL, status, timestamp, and duration.
- Expand rows for headers and bodies.
- Truncate large payloads and use `textContent`/`JSON.stringify`, not `innerHTML`.

### P2 — Options for inspection behavior

Risk: Low

- Add options for max popup transactions, detached inspector behavior, and optional response body capture.
- Store these separately from JMeter export settings.
- Do not change existing JMeter option behavior.

### P3 — Detached inspector window

Risk: Medium

- Add a `Detach inspector` button.
- Use `chrome.windows.create({ type: 'popup', focused: true })`.
- Add `windows` permission only if this feature is implemented.
- Document that this is not guaranteed always-on-top across OS window managers.

### P4 — Optional response body capture

Risk: High

- Keep existing `webRequest` behavior unchanged.
- Prefer opt-in content-script `fetch`/`XMLHttpRequest` wrapping for page-origin requests.
- Avoid `chrome.debugger` unless full response bodies are explicitly required and user opt-in is part of the UX.
- Add size limits and privacy warnings.

## UX/UI recommendations

### Popup layout

Recommended compact layout:

1. Header: title and current plan name.
2. Recorder card: primary Start/Stop button, Pause/Resume, status pill, captured count, elapsed time.
3. Export card: export mode, JMX/Playwright settings, Export.
4. Transaction panel: filters, scrollable list, expandable details.

### Visual guidance

Use compact design tokens:

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

Suggested dimensions:

- Minimum width: `320px`
- Recommended width: `420px`
- Recommended height: `620px`
- Transaction list: `min-height: 160px`, `max-height: 260px`, `overflow-y: auto`

### Accessibility

- Keep tab order aligned with visual order.
- Use real `<button>` elements for actions and transaction rows.
- Label all inputs.
- Do not rely on color alone for status.
- Use `aria-expanded` and `aria-controls` for expandable rows.
- Use `aria-live="polite"` for status and transaction count updates.
- Keep contrast at or above WCAG AA.

## Lightweight MV3-compatible framework options

Recommended order:

1. **Vanilla TypeScript ES modules** — best fit, no new runtime dependency, lowest risk.
2. **Lit 3** — small web components, good for the transaction panel.
3. **Preact** — React-like API with a smaller bundle.
4. **Svelte** — small bundles, requires build step, already available through Vite.

Avoid remote-loaded scripts, CDN dependencies, and large runtime frameworks unless the component complexity justifies them.

## Manifest and permission guidance

Current manifest permissions:

```json
"permissions": ["storage", "unlimitedStorage", "webRequest", "activeTab"],
"host_permissions": ["<all_urls>"]
```

Minimal edit for detached inspector:

```json
"permissions": ["storage", "unlimitedStorage", "webRequest", "activeTab", "windows"]
```

Permission notes:

- `windows`: required for `chrome.windows.create`.
- `sidePanel`: only if using a Chrome side panel.
- `debugger`: only for devtools-style full response-body capture; high risk.
- `webRequestBlocking`: not needed and should be avoided.
- No extra `host_permissions` are needed because `"<all_urls>"` already exists.

## Concrete popup HTML example

This adds new UI only and preserves existing IDs/controls.

```html
<section class="recorder-card" aria-labelledby="recorderTitle">
  <div class="card-header">
    <div>
      <h2 id="recorderTitle" class="sr-only">Recorder controls</h2>
      <div id="status" class="status" aria-live="polite">Loading recorder state…</div>
      <div id="elapsedTime" class="elapsed" aria-live="polite">Elapsed: 00:00</div>
    </div>
    <button id="start" class="button button-primary" type="button">Start</button>
  </div>

  <div class="button-row">
    <button id="pause" class="button button-secondary" type="button">Pause</button>
    <button id="resume" class="button button-secondary" type="button">Resume</button>
    <button id="stop" class="button button-danger" type="button">Stop</button>
  </div>
</section>

<section id="capultura-transaction-panel" class="transaction-panel" aria-labelledby="transactionPanelTitle">
  <div class="transaction-panel__header">
    <div>
      <h2 id="transactionPanelTitle">Live transactions</h2>
      <p id="transactionSummary" class="muted">No requests captured yet.</p>
    </div>
    <button id="openDetachedInspector" class="button button-secondary" type="button">Detach</button>
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
    <input id="transactionSearch" type="search" autocomplete="off" placeholder="example.com/api" />
  </div>

  <div id="transactionList" class="transaction-list" role="list" tabindex="0" aria-label="Recent HTTP transactions"></div>
</section>
```

## Concrete options HTML example

This adds new options only. Existing JMeter options and IDs remain unchanged.

```html
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

## Popup TypeScript transaction panel sketch

This sketch keeps existing IDs and behavior intact while adding a bounded transaction queue.

```ts
import type { BackgroundResponse } from '../messages'
import type { CapturedRequest } from '../models/captured-request'

type RequestCapturedMessage = {
  type: 'REQUEST_CAPTURED'
  request: CapturedRequest
}

const transactionList = requireElement<HTMLDivElement>('transactionList')
const transactionSummary = requireElement<HTMLDivElement>('transactionSummary')

const maxTransactions = 200
let transactions: CapturedRequest[] = []

async function seedTransactions(): Promise<void> {
  const response = await send({ type: 'GET_REQUESTS' })

  if (isRequestsResponse(response)) {
    transactions = response.requests.filter(isCapturedRequest).slice(-maxTransactions)
    renderTransactions()
  }
}

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isRequestCapturedMessage(message)) {
    appendTransaction(message.request)
  }
})

function appendTransaction(request: CapturedRequest): void {
  transactions = [...transactions, request].slice(-maxTransactions)
  renderTransactions()
}

function renderTransactions(): void {
  transactionList.replaceChildren()

  if (transactions.length === 0) {
    transactionSummary.textContent = 'No requests captured yet.'
    return
  }

  transactionSummary.textContent = `${transactions.length} recent request${transactions.length === 1 ? '' : 's'}`

  for (const request of [...transactions].reverse()) {
    transactionList.append(createTransactionRow(request))
  }
}

function createTransactionRow(request: CapturedRequest): HTMLButtonElement {
  const row = document.createElement('button')
  const method = document.createElement('span')
  const url = document.createElement('span')
  const status = document.createElement('span')
  const time = document.createElement('span')

  row.type = 'button'
  row.className = 'transaction-row'
  row.setAttribute('role', 'listitem')
  row.setAttribute('aria-expanded', 'false')
  row.title = request.url

  method.textContent = request.method
  method.className = `method method-${request.method.toLowerCase()}`

  url.textContent = shortenUrl(request.url)
  url.className = 'transaction-url'

  status.textContent = request.error ? 'Error' : statusLabel(request.statusCode)
  status.className = `status-badge ${statusClass(request.statusCode, request.error)}`

  time.textContent = formatTime(request.timestamp)

  row.append(method, url, status, time)
  row.addEventListener('click', () => {
    const expanded = row.getAttribute('aria-expanded') === 'true'
    row.setAttribute('aria-expanded', String(!expanded))
    row.replaceChildren(method, url, status, time, createDetails(request))
  })

  return row
}
```

```ts
function createDetails(request: CapturedRequest): HTMLPreElement {
  const details = document.createElement('pre')
  details.className = 'transaction-details'
  details.textContent = JSON.stringify(
    {
      url: request.url,
      method: request.method,
      timestamp: request.timestamp,
      statusCode: request.statusCode,
      headers: request.headers,
      responseHeaders: request.responseHeaders,
      body: truncate(request.body, 4000),
      responseBody: requestResponseBody(request),
    },
    null,
    2
  )

  return details
}

function isRequestCapturedMessage(message: unknown): message is RequestCapturedMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as Record<string, unknown>).type === 'REQUEST_CAPTURED' &&
    isCapturedRequest((message as Record<string, unknown>).request)
  )
}

function isRequestsResponse(response: BackgroundResponse): response is { success: true; requests: unknown[] } {
  return response.success && Array.isArray((response as { requests?: unknown }).requests)
}

function isCapturedRequest(value: unknown): value is CapturedRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).url === 'string' &&
    typeof (value as Record<string, unknown>).method === 'string'
  )
}

function requestResponseBody(request: CapturedRequest & { responseBody?: string }): string {
  return request.responseBody ?? 'Unavailable from webRequest'
}

function statusLabel(statusCode?: number): string {
  return statusCode === undefined ? 'Pending' : `${statusCode}`
}

function statusClass(statusCode?: number, error?: string): string {
  if (error) return 'status-error'
  if (statusCode === undefined) return 'status-pending'
  if (statusCode >= 200 && statusCode < 300) return 'status-success'
  if (statusCode >= 400 && statusCode < 500) return 'status-warning'
  if (statusCode >= 500) return 'status-error'
  return 'status-neutral'
}

function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

function truncate(value: string | undefined, maxLength: number): string | undefined {
  return value !== undefined && value.length > maxLength ? `${value.slice(0, maxLength)}…` : value
}

function formatTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString()
}
```

Security notes:

- Use `textContent` and `JSON.stringify`, not `innerHTML`, for request/response content.
- Truncate bodies before display.
- Do not persist sensitive bodies unless explicitly enabled.
- Handle missing `responseBody` gracefully.

## Always-on-top alternative

Native Chrome action popups cannot be forced to stay always-on-top and close when focus leaves the extension popup. Use a detached inspector window instead.

```ts
const openDetachedInspector = requireElement<HTMLButtonElement>('openDetachedInspector')

openDetachedInspector.addEventListener('click', () => {
  void chrome.windows.create({
    url: chrome.runtime.getURL('src/popup/popup.html?detached=1'),
    type: 'popup',
    width: 420,
    height: 720,
    left: window.screenX + 80,
    top: window.screenY + 80,
    focused: true,
  })
})
```

Required manifest edit:

```json
{
  "permissions": ["storage", "unlimitedStorage", "webRequest", "activeTab", "windows"]
}
```

Caveat: `type: 'popup'` creates and focuses a smaller Chrome window, but it is not guaranteed to remain above all other OS windows.

## Required background changes

The initial safe implementation can keep the existing `REQUEST_CAPTURED` broadcast and add a port-based bridge so popup instances receive events reliably while open.

Required background behavior:

1. Keep existing `chrome.runtime.sendMessage({ type: 'REQUEST_CAPTURED', request })` broadcast.
2. Add `chrome.runtime.onConnect` handling for a new port name such as `transaction-panel`.
3. Forward `STATE_CHANGED` and `REQUEST_CAPTURED` messages to connected ports.
4. On connect, optionally send the latest state and recent requests so a newly opened popup can seed its panel.
5. Do not change existing request payload names.
6. If adding optional response body capture, keep it behind a setting and append optional fields only when available.

Pseudo-code:

```ts
const transactionPorts = new Set<chrome.runtime.Port>()

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'transaction-panel') {
    return
  }

  transactionPorts.add(port)
  port.postMessage({ type: 'STATE_CHANGED', snapshot: service.getSnapshot() })
  port.postMessage({ type: 'RECENT_REQUESTS', requests: service.getRequests() })

  port.onDisconnect.addListener(() => {
    transactionPorts.delete(port)
  })
})

function broadcast(message: BackgroundBroadcast): void {
  void chrome.runtime.sendMessage(message).catch(() => undefined)

  for (const port of transactionPorts) {
    try {
      port.postMessage(message)
    } catch {
      transactionPorts.delete(port)
    }
  }
}
```

## Response body capture caveat

The user-facing requirement includes request/response body. The current background captures request body through `webRequest` `requestBody`, but it does not capture response body.

Safe interpretation:

- Show request body when present.
- Show response headers and status.
- Show `responseBody: "Unavailable from webRequest"` when no response body is available.
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

Recommendation: implement the transaction panel first without guaranteed response body capture, then add opt-in response body capture as a separate high-risk follow-up.

## Implementation progress

| Area | Status | Evidence | Notes |
|---|---|---|---|
| CSS separation | Done | `popup.html` links `./popup.css`; `options.html` links `./options.css`; new CSS files added. | Existing inline styles removed from HTML. |
| Popup visual hierarchy | Done | Recorder controls are in a card with status and elapsed time; export controls remain intact. | Existing IDs preserved. |
| Transaction panel markup | Done | `#capultura-transaction-panel`, filters, summary, and list are present in `popup.html`. | New IDs only; existing IDs unchanged. |
| Transaction event wiring | Done | `popup.ts` listens for existing `REQUEST_CAPTURED` and seeds from `GET_REQUESTS`. | No background event names changed. |
| Bounded queue and safe rendering | Done | Popup keeps a capped transaction array and renders with `textContent`/`JSON.stringify`. | Response body capture is not implemented yet. |
| Transaction options | Done | Options page stores `maxTransactions`, `openDetachedInspector`, and `captureResponseBody`. | Existing JMeter options preserved. |
| Detached inspector | Done | Popup uses `chrome.windows.create`; manifest includes `windows`. | Not guaranteed always-on-top across OS window managers. |
| Background port forwarding | Deferred | Not implemented in this pass. | Current popup receives `onMessage` broadcasts; port bridge can be added later for more reliable live updates. |
| Response body capture | Deferred | Not implemented in this pass. | UI shows disabled/unavailable text until a separate opt-in capture mechanism is added. |
| Framework migration | Deferred | Vanilla TypeScript remains in use. | No new framework dependency added. |

## Implementation plan

| Priority | Task | Risk | Notes |
|---|---|---:|---|
| 1 | Move existing inline styles into `popup.css` and `options.css` | Low | Add stylesheet links in HTML; verify existing UI before adding new UI. |
| 2 | Add popup CSS layout tokens and compact card structure | Low | No behavior change. |
| 3 | Add transaction panel markup to `popup.html` | Low | New IDs only; existing IDs untouched. |
| 4 | Add bounded transaction queue renderer in `popup.ts` | Medium | Uses existing `REQUEST_CAPTURED`; no payload changes. |
| 5 | Seed panel from `GET_REQUESTS` on popup open | Low | Uses existing API. |
| 6 | Add transaction options to `options.html` | Low | New IDs only; existing JMeter options untouched. |
| 7 | Add `windows` permission and detached inspector button | Medium | Requires manifest change and popup window handling. |
| 8 | Add background port forwarding for transaction events | Medium | Additive; keep existing `sendMessage` broadcast. |
| 9 | Add filters and expandable details | Medium | UI-only after event wiring works. |
| 10 | Add optional response body capture | High | Requires privacy review and likely content-script or debugger changes. |
| 11 | Evaluate Lit/Preact/Svelte only if component complexity grows | Low | Not required for first pass. |

## Manual regression checklist

Before merging:

- Verified by build/typecheck/tests: `npm run typecheck`, `npm run build`, `npm test`, touched-file ESLint, and touched-file Prettier all passed.
- Verify popup/options still look and function correctly after moving styles into separate CSS files.
- Start recording from popup.
- Pause and resume recording.
- Stop recording.
- Clear captured requests.
- Export JMX with selected domains.
- Export Playwright script with base URL.
- Open popup after recording has existing saved requests.
- Confirm transaction panel updates as requests complete.
- Confirm popup closes/reopens without losing existing recording/export behavior.
- Confirm detached inspector opens if enabled.
- Confirm options save and reload.
- Test keyboard navigation through controls and transaction rows.
- Test long URLs and large request bodies.
- Confirm no request/response content is rendered as HTML.

## Deliverables to request from reviewer

Ask the reviewer to provide:

1. Specific lines/IDs that are risky to change.
2. Small patch suggestions or diffs for each recommended change.
3. A minimal reproducible example wiring `REQUEST_CAPTURED` to the transaction panel.
4. A simple HTML/CSS mock or screenshot of the compact popup layout.
5. Confirmation that no existing element IDs, event handler names, or public APIs changed.
6. Confirmation that response body limitations are documented in the UI or options.

## Branch name suggestion

For a follow-up implementation branch:

```text
feature/003-ui-refactor-transaction-panel
```

Current review branch:

```text
004-improve-ux-ui-implementation
```

## Final risk/regression assessment

Overall risk: Medium.

Low-risk changes:

- Visual cleanup.
- Compact card layout.
- Accessibility improvements.
- Transaction panel using existing `REQUEST_CAPTURED` and `GET_REQUESTS`.
- Options for max transaction count and detached inspector.

Medium-risk changes:

- Detached inspector window using `chrome.windows.create`.
- Background port forwarding for live events.
- Expandable transaction details with large payload handling.

High-risk changes:

- Guaranteed response body capture.
- `chrome.debugger`-based capture.
- Any framework migration that changes the popup DOM or event flow.

The safest path is to ship the transaction panel as a read-only inspector first, using existing recording events and existing persisted requests. Response body capture should be treated as a separate optional feature with explicit user consent, size limits, and privacy warnings.

Current implementation status: P0, P1, P2, and P3 are implemented. P4 response body capture and background port forwarding remain deferred follow-ups.





