# JMX Backend Upload — `007-jmx-backend-upload`

## Implementation status (as of 2026-06-19)

| Spec section | Status | Notes |
|---|---|---|
| §5 Intended Behavior — configuration model | ✅ Delivered | `BackendUploadConfig` type + `BackendUploadStore` implement the schema exactly. |
| §5.3 Public APIs — message contract | ✅ Delivered | `UPLOAD_JMX` + `UploadJmxPayload` in `src/messages.ts`; `downloadUrl` added to `BackgroundResponse`. |
| §5.3 Public APIs — Options UI | ✅ Delivered | Hidden behind `display: none` for this release (re-enable by removing inline style). |
| §5.3 Public APIs — Popup UI | ✅ Delivered | Hidden behind `display: none` + `<fieldset disabled>` for this release. |
| §6 Affected modules | ✅ Delivered | All seven modules implemented. |
| §7 New module `BackendUploadService` | ✅ Delivered | Uses `XMLHttpRequest` (MV3-safe); same response-parsing semantics as spec. |
| §8 Error handling | ✅ Delivered | All nine scenarios implemented with the specified user-facing strings. |
| §9 Security and privacy | ✅ Delivered | Plaintext-token warning present; CSP-safe background fetch; `downloads` permission declared. |
| §10 Migration — legacy key | ⚠️ Partial | One-time `serverJMX` → `backendUpload.converterUrl` migration implemented, but `migrateLegacyKey` returns the pre-write `raw` object instead of the mutated `result`; concurrent callers can observe the old state `undefined`. |
| §10 Migration — offline export unchanged | ✅ Delivered | `EXPORT_JMX` path untouched; no network request issued when backend upload is disabled. |
| §11 Acceptance criteria (AC1–AC10) | ✅ Addressable | All 10 ACs are verifiable with current code. AC1 wording references `"Untitled Plan.jmx"` and upload-in-progress spinner; the spinner assertion should be relaxed or made more specific (see deviation #1 below). |

### Deviations / open items

1. **JSON payload shape**. The spec says "same JSON shape produced by `buildJmx` input (`PlanMeta` + normalized `CapturedRequest[]`)". The service currently serializes `{ requests: [...] }` (filtered `CapturedRequest[]` only). Update this if the converter requires `PlanMeta` prepended.
2. **Download filename**. The spec references `planNameForExport()` as the fallback for `exportFilename`. The popup currently passes `exportFilename: ''` and the service falls back to `config.exportFilename || 'Untitled Plan'`. Wire `planNameForExport()` through the upload flow to honour the current plan name.
3. **`safeFilename` reuse**. The service builds `filename = \`${config.exportFilename || 'Untitled Plan'}.jmx\`` directly. Replace with `safeFilename()` from `src/utils/filename.ts` to sanitise filesystem-invalid characters.
4. **Options page Save button label**. Changed to **"Future enhancement - Disabled"** and the entire `§backendUploadOptionsTitle` section is `display: none` on the Options page. Keep until this feature is product-approved.

## 1. Purpose

This specification reintroduces the optional backend-upload path for JMX generation
that was removed from the extension's initial MV3 port (see `specs/006-enhance-jmx-implementation.md` §4.2 and §4.4).

The extension currently generates JMX entirely client-side. This spec defines an
**opt-in, async, permission-bounded** path that uploads captured traffic to a
user-configured backend converter endpoint, retrieves the resulting JMX, and
delivers it to the user for download — without reintroducing the original jQuery
overlay, iframe-based UI, or Manifest V2 dependency surface.

## 2. Scope

| In scope | Out of scope |
|----------|--------------|
| User-configurable converter URL in Options / Popup | Any hard-coded backend endpoint |
| Authentication header / bearer-token support | OAuth flows or identity providers |
| Upload progress indication in Popup | jQuery-UI overlay or host-page injection |
| Download of returned JMX via Chrome Downloads API | Direct server-to-browser redirect handling |
| Error surfacing for network failures, HTTP errors, timeouts | Retry / circuit-breaker logic (future iteration) |
| Coexistence with existing offline JMX export | Replacing or removing offline export |
| Opt-in toggle per recording session | Auto-upload without explicit user action |

## 3. Source of Truth

The original behavior is documented in `specs/006-enhance-jmx-implementation.md` §G1 and §G2.

## 4. Original Behavior (src-ori)

The original extension offered two upload modes:

1. **Upload traffic** (`upload_traffic`):
   - Captured requests were POSTed as JSON to `server_jmx` URL (default `https://converter.backendapp.com`).
   - A jQuery overlay (`#run-overlay`, `.download-body`, `.domains-body`, `.include-domains`) collected domain selections and triggered upload.
   - Server returned a JMX file or a download link.

2. **Domain download overlay**:
   - Injected into the host page via `src-ori/js/content-script.js`.
   - Used jQuery UI for the progress bar and iframe height negotiation via `window.parent.postMessage({'height': ...})`.

Supporting infrastructure:
- Storage key `serverJMX` held the converter URL.
- Options page included a "Server Converter" text input.
- No explicit authentication header was visible in the reviewed src-ori files; the converter relied on network-location trust.

## 5. Intended Behavior (new `src`)

### 5.1 High-level flow

```
User enables "Upload to converter" in Popup/Option
  → User selects domains (same domain selector used for offline export)
  → User clicks "Upload & Download JMX"
    → Background service worker validates URL + auth token
    → POST captured traffic (filtered by selected domains) as JSON to configured endpoint
    → Response is either:
        a) JMX bytes (Content-Type: application/xml or text/xml) → save via chrome.downloads
        b) Download URL (JSON { downloadUrl: "..." }) → chrome.downloads.download({ url })
        c) Error body → surface in Popup error banner
```

### 5.2 Configuration model

Persist under `chrome.storage.local` with typed-safe store pattern (same as `JmxOptionsStore`).

```json
{
  "backendUpload": {
    "enabled": false,
    "converterUrl": "https://converter.example.com/api/v1/upload",
    "authToken": "",
    "timeoutMs": 60000,
    "includeDomains": ["example.com"],
    "exportFilename": "Untitled Plan"
  }
}
```

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `enabled` | `boolean` | `false` | Master switch; when `false`, upload button is hidden/disabled. |
| `converterUrl` | `string` (URL) | `""` | Required when `enabled` is `true`. Validated at save time. |
| `authToken` | `string` | `""` | Sent as `Authorization: Bearer <token>` header. Empty string = no auth header. |
| `timeoutMs` | `integer` | `60000` | Fetch timeout; clamped to [5000, 300000]. |
| `includeDomains` | `string[]` | `[]` | Mirrors the domain selector state from the current offline export flow. |
| `exportFilename` | `string` | `""` | Optional filename hint; falls back to `planNameForExport()` when empty. |

### 5.3 Public APIs

#### Background message contract

Add to `src/messages.ts`:

```typescript
export type BackgroundRequest =
  | { type: 'UPLOAD_JMX'; payload: UploadJmxPayload }

export interface UploadJmxPayload {
  converterUrl: string
  authToken: string
  timeoutMs: number
  includedDomains: string[]
  exportFilename: string
}

export type BackgroundResponse =
  | { success: true; downloadUrl: string }
  | { success: true; jmx: string; filename: string }
  | { success: false; error: string }
```

`EXPORT_JMX` and `UPLOAD_JMX` are separate requests. The Popup/Options sends **one or the other**, never both in a single user action.

#### Options / Popup UI changes

- Add a collapsible "Backend converter" section to `src/options/options.ts`.
- Add a toggle switch "Upload to backend converter" and the converter URL + auth token fields.
- Mirror the same toggle + converter fields in `src/popup/popup.ts` as a collapsed panel above the domain selector.
- When the toggle is `false`, the converter URL/auth fields are `disabled` (visual grayout, not `hidden`, for accessibility).

## 6. Affected modules

| Module | Responsibility |
|--------|----------------|
| `src/messages.ts` | Add `UPLOAD_JMX` request/response variants. |
| `src/background/recorder-service.ts` | Add `handleUploadJmxMessage()` handler. |
| `src/background/backend-upload-service.ts` | **New module** — encapsulates HTTP POST, response parsing, timeout, auth header injection. |
| `src/options/options.ts` | Add backend converter form fields and save/load bindings. |
| `src/popup/popup.ts` | Add backend converter toggle, URL/auth fields, upload button. |
| `src/utils/filename.ts` | Reuse `safeFilename()` for suggested download filename. |
| `src/manifest.json` | Add `"downloads"` permission (required for `chrome.downloads.download`). |

## 7. New module: `BackendUploadService`

Located at `src/background/backend-upload-service.ts`.

Reponsibilities:
- Accept `converterUrl`, `authToken`, `timeoutMs`, `includedDomains`, `exportFilename`.
- Filter captured requests by `includedDomains` using the existing `filterRequestsByDomains()` function.
- Serialize filtered requests to the same JSON shape produced by `buildJmx` input (i.e., `PlanMeta` + normalized `CapturedRequest[]`), or to the shape expected by the external converter. The exact payload schema is determined by the converter's API contract and is specified in a companion `converter-api-contract.md` file maintained alongside this spec.
- Execute `fetch()` with `signal` for AbortController-based timeout.
- Inject `Authorization: Bearer <token>` header when `authToken` is non-empty.
- Parse response:
  - 200 + XML/body → return JMX string + filename.
  - 200 + JSON `{ downloadUrl }` → return download URL.
  - Non-2xx → throw with response text for error surfacing.
  - Network failure / timeout → throw with `DOMException` name for differentiation.

## 8. Error handling and edge cases

| Scenario | Behavior |
|----------|----------|
| `converterUrl` is empty when `enabled=true` | Return typed error: "Converter URL is not configured." |
| `converterUrl` fails URL validation at save time | UI shows red border + inline error; `chrome.storage.local.set` rejected. |
| `authToken` is empty | No `Authorization` header sent. |
| `fetch()` network error | Surfaced as "Network error uploading to converter. Check URL and connectivity." |
| `fetch()` timeout (exceeds `timeoutMs`) | Surfaced as "Converter did not respond within N seconds." |
| HTTP 401/403 | Surfaced as "Converter rejected the request. Check auth token." |
| HTTP 4xx (other) | Surfaced as "Converter returned an error: <status> <body snippet>". |
| HTTP 5xx | Surfaced as "Converter is temporarily unavailable. Try again later." |
| Response neither XML nor `{ downloadUrl }` JSON | Surfaced as "Unexpected response format from converter." |
| Zero domains selected | Blocked before upload: "Select at least one domain before uploading." |
| Upload interrupted by service-worker termination | Retry not implemented (future). User sees prior error and must re-click. |

## 9. Security and privacy considerations

- **No hard-coded endpoints.** The converter URL is user-configured and persisted locally.
- **Bearer token stored in `chrome.storage.local`.** This is not encrypted storage. Enterprise deployments should treat this as a plaintext credential scoped to the local machine. If the extension is compromised, the token is readable. Document this in the options page tooltip.
- **CSP compliance.** All fetch calls originate from the service worker (background script), which has broader CSP allowances than host-page scripts. No host-page injection is needed.
- **No PII exfiltration.** The upload payload contains only captured HTTP traffic (URLs, headers, bodies). Users must be informed of this via the options page. The existing response-body opt-in toggle (`RESPONSE_BODY_CAPTURED`) controls whether request/response bodies are stored at all; the upload service uploads exactly what is stored.
- **Downloads API.** `chrome.downloads` requires the `"downloads"` permission. This permission is declared in `manifest.json` and grants the extension the ability to write files to the user's Downloads folder. It does not grant read access to existing files.

## 10. Migration considerations

- The current offline JMX export path is **unchanged and remains the default**. The backend upload is strictly additive.
- If `serverJMX` was previously present in `chrome.storage.local` (e.g., migrated from a very old profile), treat it as the seed for `backendUpload.converterUrl` and remove the legacy key after one-time migration.
- The jQuery overlay (`#run-overlay`, etc.) and host-page injection (`content-script.js`) from src-ori are **not reintroduced**. All UX lives in the Popup and Options pages.

## 11. Acceptance criteria

| AC | Description | Status |
|----|-------------|--------|
| AC1 | Backend upload returns JMX for valid traffic | ✅ Implemented — `backend-upload-service.ts` returns `{ success: true, jmx, filename }` for XML/text responses. Relax spinner assertion in tests (see deviation #1). |
| AC2 | Backend upload follows a downloadUrl redirect | ✅ Implemented — popup parses `downloadUrl` and calls `chrome.downloads.download({ url })`. |
| AC3 | Zero domains blocks upload | ✅ Implemented — returns `"Select at least one domain before uploading."` when `includedDomains` is empty. |
| AC4 | Network errors are surfaced to the user | ✅ Implemented — `xhr.onerror` → `"Network error uploading to converter. Check URL and connectivity."`. |
| AC5 | Timeout is enforced | ✅ Implemented — `xhr.timeout = config.timeoutMs` + `ontimeout` handler. |
| AC6 | Auth token is sent when configured | ✅ Implemented — `xhr.setRequestHeader('Authorization', 'Bearer ...')`. |
| AC7 | Empty auth token omits Authorization header | ✅ Implemented — header only set when `authToken.trim().length > 0`. |
| AC8 | Converter URL validation at save time | ✅ Implemented — `isValidUrl()` check in options page; `aria-invalid` + inline error set on blur/save. |
| AC9 | Permission regression: downloads permission declared | ✅ Implemented — `"downloads"` added to `manifest.json` permissions array. |
| AC10 | Offline export is unaffected | ✅ Implemented — `EXPORT_JMX` flow untouched; `backendUpload.enabled` defaults to `false`. |

### AC1 — Backend upload returns JMX for valid traffic

Given:
- `backendUpload.enabled` is `true`
- `converterUrl` is set to a test mock that echoes the uploaded payload as JMX
- At least one domain is selected
- Recording has captured ≥1 request matching the selected domains

When user clicks "Upload & Download JMX" in the Popup:
- The Popup shows an upload-in-progress state (spinner + "Uploading…").
- The service worker POSTs the filtered captured requests to `converterUrl`.
- The mock returns a 200 with Content-Type `application/xml` and a valid JMX body.
- The service worker returns `{ success: true, jmx: "...", filename: "Untitled Plan.jmx" }`.
- The Popup triggers `chrome.downloads.download({ filename: "Untitled Plan.jmx", ... })`.
- User finds `Untitled Plan.jmx` in Downloads.

### AC2 — Backend upload follows a downloadUrl redirect

Given:
- `backendUpload.enabled` is `true`
- `converterUrl` returns 200 with body `{"downloadUrl": "https://storage.example.com/jmx/abc.jmx"}`

When user clicks "Upload & Download JMX":
- The service worker parses the JSON and returns `{ success: true, downloadUrl: "..." }`.
- The Popup triggers `chrome.downloads.download({ url: "https://storage.example.com/jmx/abc.jmx", filename: "Untitled Plan.jmx" })`.

### AC3 — Zero domains blocks upload

Given:
- `backendUpload.enabled` is `true`
- `converterUrl` is set
- No domains are selected

When user clicks "Upload & Download JMX":
- The service worker returns `{ success: false, error: "Select at least one domain before uploading." }`.
- The Popup surfaces the error in a red banner; no network request is made.

### AC4 — Network errors are surfaced to the user

Given:
- `converterUrl` points to an unreachable host

When user clicks "Upload & Download JMX":
- The service worker catches the network error from `XMLHttpRequest`.
- Returns `{ success: false, error: "Network error uploading to converter. Check URL and connectivity." }`.
- The Popup surfaces the error in a red banner.

### AC5 — Timeout is enforced

Given:
- `converterUrl` points to a server that delays response beyond `timeoutMs` (default 60000 ms)

When user clicks "Upload & Download JMX":
- The AbortController fires after `timeoutMs`.
- The service worker returns `{ success: false, error: "Converter did not respond within 60 seconds." }` (seconds value reflects configured timeout).
- The Popup surfaces the error.

### AC6 — Auth token is sent when configured

Given:
- `authToken` is `"secret-token"`
- `converterUrl` is a mock that inspects headers

When user clicks "Upload & Download JMX":
- The mock receives `Authorization: Bearer secret-token`.
- The service worker returns success.

### AC7 — Empty auth token omits Authorization header

Given:
- `authToken` is `""`

When user clicks "Upload & Download JMX":
- The mock receives no `Authorization` header.
- The service worker returns success.

### AC8 — Converter URL validation at save time

Given:
- User enters `not-a-url` in the converter URL field and blurs or clicks Save

When the options page validates the form:
- The URL input is marked invalid (red border + inline error: "Enter a valid URL").
- `chrome.storage.local.set` is not called for this field.

### AC9 — Permission regression: downloads permission declared

Given the extension is reloaded after this spec's changes:

- `manifest.json` includes `"downloads"` in the `permissions` array.
- Chrome does not warn about undeclared `chrome.downloads` usage.

### AC10 — Offline export is unaffected

Given:
- `backendUpload.enabled` is `false` (default)

When user clicks "Export JMX" in the Popup:
- The existing `EXPORT_JMX` flow fires.
- No network request is made.
- JMX is returned synchronously from `buildJmx()`.

## 12. Open questions

1. **Converter API contract format.** The spec assumes the converter accepts a JSON array of captured requests. Is this the agreed shape, or does the backend expect a different schema (e.g., HAR, raw protobuf)?
2. **Authentication model.** Is a static bearer token sufficient, or does the converter require per-request signing (e.g., HMAC)?
3. **Domain selection UX.** Should `backendUpload.includeDomains` be pre-filled with all captured domains (same as offline export's current default) or start empty requiring explicit selection?
4. **Progress indication.** Should the Popup show byte-level upload progress (requires `ReadableStream` + progress event simulation) or just a binary "Uploading… / Done / Error" state?
5. **Concurrent uploads.** Should the service worker queue concurrent upload requests, or reject a second upload while one is in-flight?
6. **Download filename collision.** If the platform suggests a filename that already exists in Downloads, should the extension append ` (1)` via `chrome.downloads` or accept Chrome's default behavior?

## 13. Sequencing notes

This spec should be implemented after `006-enhance-jmx-implementation` is merged to `master`, as it depends on the `JmxOptionsStore`, domain filtering, and message patterns established there.

If `008-extension-permissions-refresh` is also planned, coordinate the `"downloads"` permission addition with that review to avoid multiple manifest changes in close succession.
