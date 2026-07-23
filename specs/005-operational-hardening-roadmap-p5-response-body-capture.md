# Spec 005 - P5 — Response Body Capture

## Branch

```text
spec/006-response-body-capture
```

Cut from `master` after `specs/005-operational-hardening-roadmap.md` defines P5 as a separate privacy-reviewed feature.

## Purpose

This spec scopes an opt-in response body capture feature for Capultura. Response bodies may include credentials, tokens, PII, or secrets. The default must remain disabled, and any captured data must respect explicit user consent, size limits, truncation, and redaction rules.

## Design goals

1. Capture response bodies only when the user explicitly enables `captureResponseBody` in the options page.
2. Capture via a content script that wraps `fetch` and `XMLHttpRequest` in page context after responses are available.
3. Do not capture response bodies when the option is disabled or unknown.
4. Respect storage and memory constraints by applying a conservative size limit, truncation flag, and safe error handling.
5. Do not add new manifest permissions or the `chrome.debugger` API unless a follow-up design review explicitly approves it.

## Opt-in model

- `TransactionPanelOptions.captureResponseBody` (boolean) defaults to `false`.
- Options page checkbox saves to `chrome.storage.local` under `captureResponseBody`.
- Popup transaction UI surfaces disable capture display when the option is false.
- Content script evaluates opt-in state from recorder state snapshots:
  - Record a local `captureResponseBodyEnabled` flag from the latest `STATE_CHANGED` snapshot (exposed via a new internal field on state broadcasts or a dedicated read).
  - When recording is paused/stopped/idle, the flag becomes false.

## Capture mechanism

### Content script wrapper

File: `src/content/response-body-capture.ts`

- Inject a small script that overrides `window.fetch` and `XMLHttpRequest.prototype.send` after the page's own scripts have executed.
- Do not intercept Service Workers or requests that bypass page-level APIs.
- When a response is available:
  1. Clone the `Response` for fetch or read `responseText`/`responseBody` for XHR.
  2. Measure size in bytes (UTF-8 safe measurement).
  3. Truncate if size exceeds a maximum body size (default `MAX_RESPONSE_BODY_BYTES = 65536`).
  4. Redact sensitive headers and body fragments if content type or custom rules indicate they contain secrets.
  5. Send a `RESPONSE_BODY_CAPTURED` message to the background with matching metadata and captured body.

### Metadata for matching

Send the following on every captured response:

- `tabId`
- `frameId`
- `url` (final URL)
- `method`
- `status` (HTTP status code)
- `requestHeaders` (optional, for matching)
- `responseHeaders`
- `body` (string or undefined)
- `truncated` (boolean)
- `redacted` (boolean)
- `size` (number of captured bytes before truncation)
- `capturedAtMs` (timestamp)

### Matching in background

Background message handler receives the message:

```text
{ type: 'RESPONSE_BODY_CAPTURED', payload: { ... } }
```

Matching procedure:

1. Find a pending or completed request with:
   - matching `tabId`
   - matching `frameId`
   - matching `method` and `url`
   - matching `status` when both sides are available
   - matching request headers (content type, authorization, cookies) up to a prioritized subset
2. If multiple matches exist, do not apply the body to avoid incorrect association.
3. If pending request is found but not yet finished, store the body in a short-lived `ResponseBodyStore` and return it when the request completes.
4. If request already completed, attempt to attach body to the existing `CapturedRequest` in recorder state.
5. Broadcast updated requests with enriched response body fields.

## Data model changes

### CapturedRequest

Add optional fields to preserve existing behavior when undefined:

- `responseBody?: string`
- `responseBodyTruncated?: boolean`
- `responseBodyRedacted?: boolean`
- `responseBodySize?: number`
- `responseBodyCapturedAt?: string`
- `responseBodyContentType?: string`

Existing exports must not include empty response body text unless the field is present.

## Storage contract

- Store short-lived unsynchronized response bodies in a dedicated `ResponseBodyStore`.
- Store response bodies in `PendingRequest` so they survive service worker restarts until completion.
- Prune expired entries based on a TTL (default `15` minutes) and maximum store size (default `200` entries).
- Do not persist response bodies in `CapturedRequest` when the user resets or clears recordings unless explicitly retained.

## Redaction rules

Apply redaction when content or headers match the following patterns:

- Authorization headers (`authorization`, `proxy-authorization`) and cookies (`cookie`, `set-cookie`) → replace body with `"[REDACTED]"`.
- JSON-encoded tokens identifiable by regex patterns for JWTs or long alphanumerics > 32 chars → redact that value only if it resembles a secret.
- Text responses with Content-Type matching `text/html`, `application/xhtml+xml` → avoid capturing body entirely (return `undefined`).
- HTML responses that include scripts containing secrets → same as above.

Default redaction behavior: if content type is `text/*` and body size > threshold or contains secrets, set `redacted = true`, keep `body = undefined`.

## Truncation rules

- Maximum body size (`MAX_RESPONSE_BODY_BYTES`): `65536` bytes (64 KiB).
- If the response text length exceeds the limit:
  - Store a truncated string of exactly `MAX_RESPONSE_BODY_BYTES` characters (conservatively measure by string length if UTF-8 detection is unavailable).
  - Set `truncated = true`.
- Do not block or delay the original response.

## Error handling

- If the content script cannot read the body (CORS, tainted stream, invalid state), send a `RESPONSE_BODY_CAPTURED` message with `body: undefined`, `truncated = false`, `redacted = false`, `error: "<reason>"`.
- Content script must not throw exceptions that break page scripts.
- Background handler must continue recording even if matching fails.

## Permission and privacy constraints

- Do not request `debugger` permission.
- Do not read body data outside the active tab or outside recording.
- Do not send body data to remote endpoints.
- Do not persist response bodies beyond recording lifecycle unless user explicitly enables it.
- Do not render captured data with `innerHTML`; always use `textContent`.

## Expected changes

### New or updated files

- `src/models/captured-request.ts` — add optional response body fields.
- `src/messages.ts` — add `RESPONSE_BODY_CAPTURED` and related response types.
- `src/content/response-body-capture.ts` — new content script logic.
- `src/content/response-body-capture.test.ts` — unit and virtualization tests.
- `src/background/response-body-store.ts` — short-lived store.
- `src/background/response-body-store.test.ts` — unit tests.
- `src/background/traffic-normalizer.ts` — apply response body to pending requests.
- `src/background/traffic-normalizer.test.ts` — matching and normalization tests.
- `src/background/recorder-service.ts` — handle `RESPONSE_BODY_CAPTURED` and apply to state.
- `src/background/recorder-service.test.ts` — service-level message tests.
- `src/popup/popup.ts` — display/disable response body per opt-in.
- `src/popup/popup.test.ts` — UI rendering tests.
- `src/options/options.ts` — ensure privacy copy warns about capture risk.
- `src/options/options.test.ts` — preserved behavior tests.

### Manifest

No permission changes required for P5 content-script approach.

## Privacy notice

Options page must display a warning when `captureResponseBody` is enabled:

```text
Response body capture records data received by the browser. This may include
secrets or personal information. Only enable if you understand the risks.
Data stays local and is not sent to remote endpoints.
```

## Testing strategy

- **Unit tests**: validate `ResponseBodyStore` storage, pruning, truncation, redaction, error handling, and disjoint page origin boundaries.
- **Content-script unit tests**: run in JSDOM (or Node mocks), validate fetch/XHR wrappers do not alter original response streams, test truncation, redaction, and opt-off case.
- **Service tests**: mock background messages, ensure unmatched bodies are ignored safely.
- **Popup/options tests**: ensure display changes only when opt-in is enabled.
- **E2E tests**: optional Playwright test validating privacy copy and opt-in gating.

## Acceptance criteria

```text
Scenario: response body capture remains disabled by default
  Given the extension is installed with default settings
  When the user records a response
  Then no response body is captured, stored, or displayed
```

```text
Scenario: opt-in response body capture captures plain text responses
  Given the user enables response body capture in options
  When a page request returns a plain text response
  And recording is active
  Then the transaction panel displays the captured response body
```

```text
Scenario: response body capture truncates oversized responses
  Given response body capture is enabled
  When a response body exceeds the size limit
  Then the stored body is truncated and responseBodyTruncated is true
```

```text
Scenario: response body capture redacts secrets in text responses
  Given response body capture is enabled
  When a response contains an Authorization header or token-like value
  Then the stored body is redacted or omitted depending on content-type policies
```

```text
Scenario: disabled capture ignores captured bodies in content script
  Given response body capture is disabled
  When a fetch or XHR completes in page context
  Then no RESPONSE_BODY_CAPTURED message is sent
```

```text
Scenario: record reset clears response bodies
  Given a captured response body was stored
  When the user resets the recording
  Then pending response bodies and tabs do not retain captured data
```

## Definition of Done

- Spec implemented per above design.
- Opt-in UI updated with privacy warning.
- No manifest permission changes without explicit documentation.
- Tests cover opt-in, disabled, truncated, redacted, error paths.
- Existing export behavior unchanged.
