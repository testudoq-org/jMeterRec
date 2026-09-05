# Capture Limits

This document describes the capture boundaries for Capultura's response-body capture
pipeline. It is intended for developers and advanced users who need to understand
why a response body may be missing, truncated, or redacted.

## 1. Two capture layers

Capultura records HTTP traffic through two complementary layers:

| Layer | Mechanism | What it captures | Limitations |
|-------|-----------|-----------------|-------------|
| **webRequest** | `chrome.webRequest` API | Request line, request/response headers, status code, timing | Never sees the response body. Runs in the extension service worker. |
| **Content script** | Fetch/XHR interception in page context | Response body for requests the page makes via `fetch()` or `XMLHttpRequest` | Only sees subresource requests the page itself issues. Does not see the main document body for navigations. |

Both layers run independently. `webRequest` always tags every completed exchange with
`captureSources: ['webRequest']`. When the content script successfully captures a body,
the source is merged to `['webRequest', 'content-fetch']` or `['webRequest', 'content-xhr']`.

## 2. Response body size cap

The maximum number of **original bytes** retained for a response body is **65 536 bytes**
(`MAX_RESPONSE_BODY_BYTES = 64 * 1024`).

- **Text responses** (`text/*`, `application/json`, `application/javascript`, `application/xml`,
  `application/xhtml+xml`) are UTF-8 decoded, truncated at the cap, and emitted as `utf8`.
  The `truncated` flag is set when the original byte length exceeds the cap.
- **Binary responses** (everything else) are encoded as base64 **only when the original byte
  length is within the cap**. When the original byte length exceeds the cap, the body is
  marked `available: 'unavailable'` with reason `binary payload exceeds 65536 byte cap`.
  The cap applies to the **original bytes**, not to the base64 character count.

## 3. Content-type policy

| Content type | Behaviour |
|-------------|-----------|
| `text/html` | Body is **blocked** (`available: 'blocked'`, `redacted: true`). The sampler emits `[REDACTED]`. |
| `application/xhtml+xml` | Same as `text/html`. |
| Everything else | Body is captured according to the size rules above. |

This policy prevents the recorder from embedding large HTML documents into JMX samplers
and Playwright route handlers. It is applied by the content-script provider before the
size check.

## 4. Diagnostics bounds

Every recording keeps two diagnostic stores:

1. **Exchange-level diagnostics** — `diagnostics[]` on `CapturedRequest`. Each entry is
   truncated to **240 characters**. Appending beyond **20 entries** drops the oldest entry.
2. **Recording-level diagnostics** — `diagnostics[]` on `RecorderState`. Same 20-entry /
   240-character cap. Recording-level diagnostics are used for schema-version warnings and
   global matching failures.

Diagnostics are developer-facing strings. Secret header values (`Authorization`,
`Set-Cookie`, `Cookie`, `Proxy-Authorization`) are masked to `***` when displayed.

## 5. Schema-version policy

New recordings always persist `schemaVersion: 1`. On load, `migrateRecording()` upgrades
older recordings:

- Missing `schemaVersion` → treated as version `1`.
- `schemaVersion > 1` → loaded with defaults and a single recording-level warning.
  The extension does **not** block playback of newer recordings; it surfaces the warning
  in the diagnostics panel so developers know the data may contain unrecognised fields.

## 6. When to expect `not-requested`

A request shows `available: 'not-requested'` in two cases:

1. **Bodies disabled in options** — the `UnsupportedResponseBodyProvider` is selected and
   returns `not-requested` immediately.
2. **Content script never saw the request** — the main document navigation or a
   non-fetch/XHR subresource was not intercepted. `webRequest` still captures the headers.

In both cases the `error` field is intentionally absent; the absence of a body is the
expected state, not a failure.

## 7. Match outcomes

When the content script sends a captured body, the background tries to match it to a
pending or completed request. Three outcomes are possible:

| Outcome | Meaning | Diagnostic |
|---------|---------|------------|
| `matched` | Exactly one candidate found and not expired. | None. |
| `zero` | No candidate matches (wrong tab, URL, method, or status). | `no matching candidate` |
| `ambiguous` | More than one candidate matches. | `ambiguous match (N candidates)` |
| `expired` | Single candidate but older than `maxAgeMs` (default 15 min). | `match expired` |

Matching failures never attach a body to the wrong request.
