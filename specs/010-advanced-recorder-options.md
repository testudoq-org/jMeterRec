# 010 - Advanced Recorder Options

## 1. Purpose

This specification defines advanced recording options for the Capultura MV3 Chrome Extension. These options control what HTTP traffic is recorded during a capture session and how recorded requests are represented in exported JMX files.

The options replace the legacy MV2 "Advanced Options" collapsible section from `src-ori/popup/popup.html` with a modern implementation that respects Manifest V3 constraints and the extension's local-only export model.

## 2. Scope

### In Scope

| Option | Description |
|--------|-------------|
| URL filter pattern | Comma-separated patterns to include/exclude requests from capture |
| Resource type filtering | Select which resource types (CSS, JS, images, redirects) to record |
| Cookie recording | Emit cookies via CookieManager in JMX output |
| User Agent override | Apply custom User-Agent header to generated JMX samplers |

### Out of Scope

| Option | Reason |
|--------|--------|
| Concurrency / Time Distribution | Backend-upload settings; not applicable to local JMX export |
| Disable Browser Cache | MV3 has no direct cache-clearing API; deferred to future spec |
| Wipe Service Workers | Requires `chrome.scripting` or `chrome.debugger`; deferred per 006 |
| Parallel Downloads | Browser-emulation setting for backend converter; not applicable locally |

## 3. User Requirements

### UR1 — Filter Recording by URL Pattern

Given the extension records all browser HTTP traffic, the user needs to limit recordings to specific domains or paths. The filter pattern controls which requests are captured and stored.

### UR2 — Control Resource Type Captures

Users recording functional tests often want only XHR/fetch requests, not static assets. Resource type checkboxes enable selective capture.

### UR3 — Customize User Agent in JMX

Users testing server-side browser detection need recorded JMX samplers to use a specific User-Agent string.

### UR4 — Separate Cookies into CookieManager

Recorded cookies should appear under JMeter's dedicated CookieManager element for cleaner editing.

## 4. Proposed Options

### 4.1 URL Filter Pattern

A textarea field containing comma-separated URL patterns. Requests not matching any pattern are excluded at capture time.

**Default:** `http://*/*, https://*/*`

**Pattern Syntax:**
- Valid webRequest URL filter / Chrome match-pattern syntax.
- `*` is accepted as "record everything".
- Examples: `https://api.example.com/*`, `*://*.cdn.example.com/*`, `http://*/*, https://*/*`.
- Patterns are split on commas, trimmed, and evaluated as an OR list.
- Invalid or empty patterns block save and show the inline error: "Enter a valid URL pattern or *".

**MV2 Comparison:** Same textarea behavior; retains `http://*/*, https://*/*` as implicit default.

### 4.2 Resource Types

Checkboxes controlling which resource types are captured. All non-redirect resource types are checked by default for backward compatibility.

| Checkbox ID | Default | Description |
|-------------|---------|-------------|
| `recordCss` | checked | Stylesheets and font files |
| `recordJs` | checked | JavaScript files, XHR/fetch requests, and main-frame/sub-frame navigation |
| `recordImages` | checked | Image resources and favicons |
| `recordRedirects` | unchecked | 3xx redirect responses |

**Resource-Type Mapping:**
- `recordCss=false` excludes `stylesheet` requests and font-like URLs (`.woff`, `.woff2`, `.ttf`, `.eot`, `.otf`).
- `recordJs=false` excludes `script`, `xmlhttprequest`, `fetch`, `main_frame`, and `sub_frame` requests.
- `recordImages=false` excludes `image` requests and image-like URLs (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.ico`).
- `recordRedirects=false` omits completed 3xx responses. Follow-up requests remain eligible for capture, and JMX samplers use `follow_redirects=true`.

**Validation:**
- At least one of `recordCss`, `recordJs`, or `recordImages` must be checked.
- If all three are unchecked, save is blocked and the warning "At least one resource type must be selected" is shown.

**MV2 Comparison:** Replaces "Requests to Record" radio + sub-options. Simplified to resource-type checkboxes only.

### 4.3 Cookie Recording

Checkbox to control how cookies are emitted in JMX output.

| State | Behavior |
|-------|----------|
| Checked (default) | Cookies extracted into `CookieManager` under ThreadGroup; Cookie headers are removed from sampler HeaderManager entries |
| Unchecked | Cookies remain only in `HeaderManager` entries; no `CookieManager` is emitted |

**MV2 Comparison:** Replaced "Record Cookies" checkbox; behavior differs (now controls JMX output, not capture).

### 4.4 User Agent Override

A select field offering predefined options or a custom string input.

**Options:**
| Value | Label |
|-------|-------|
| `current` | Current Browser (default) |
| `chrome-win` | Chrome on Windows |
| `chrome-mac` | Chrome on macOS |
| `chrome-linux` | Chrome on Linux |
| `firefox-win` | Firefox on Windows |
| `firefox-mac` | Firefox on macOS |
| `firefox-linux` | Firefox on Linux |
| `edge-win` | Edge on Windows |
| `custom` | Custom... |

When "Custom" is selected, a text input appears for the User-Agent string.

**Behavior:**
- `current` removes any captured `User-Agent` header from exported JMX HeaderManager entries.
- Predefined values add the matching User-Agent header to every exported sampler.
- Custom values are stored as `custom:${userAgentString}` after trimming.
- Custom User-Agent strings must be non-empty, contain no line breaks, and be shorter than 512 characters.

**MV2 Comparison:** Replaces 500+ entry dropdown with curated 9-entry dropdown + custom option.

## 5. Configuration Storage

Advanced options are stored under `chrome.storage.local` with the following schema:

```typescript
interface AdvancedOptions {
  filterPattern: string
  recordCss: boolean
  recordJs: boolean
  recordImages: boolean
  recordRedirects: boolean
  recordCookies: boolean
  userAgent: 'current' | 'chrome-win' | 'chrome-mac' | 'chrome-linux' | 'firefox-win' | 'firefox-mac' | 'firefox-linux' | 'edge-win' | `custom:${string}`
}
```

**Storage Keys:**
- `filterPattern` — string, defaults to `http://*/*, https://*/*`
- `recordCss`, `recordJs`, `recordImages`, `recordRedirects`, `recordCookies` — boolean
- `userAgent` — string enum value

**Implementation Modules:**
- `src/options/advanced-options.ts` — schema, defaults, normalization, validation helpers, and storage store
- `src/options/user-agents.json` — predefined User-Agent strings
- `src/options/options.html`, `src/options/options.ts`, `src/options/options.css` — options UI and handlers
- `src/background/traffic-capture.ts` — URL and resource-type filtering during capture
- `src/background/recorder-service.ts` — loads advanced options for capture and export
- `src/jmx/har-to-jmx.ts` — forwards export options to serializer
- `src/jmx/serializer.ts` — applies CookieManager and User-Agent header behavior

**Migration:** Legacy values under `regex_include` or `serverJMX` are not migrated; users reconfigure for local export.

## 6. Implementation Details

### 6.1 Capture-Time Filtering

The background recorder applies URL and resource-type filters when requests are observed by `chrome.webRequest`.

- URL filters are evaluated against the request URL before a pending request is created.
- Resource-type filters are evaluated from `details.type` and, where useful, the URL extension.
- Redirect filtering is evaluated at completion time because the status code is not available in `onBeforeRequest`.
- Forbidden extension/internal domains remain excluded before advanced filters are applied.
- If the service worker restarts, persisted advanced options are reloaded before a new recording session starts.

### 6.2 Export-Time JMX Options

Advanced options that affect JMX output are loaded during export.

- `recordCookies=true` causes cookie headers to be removed from sampler HeaderManager entries and emitted once as Cookie entries in a ThreadGroup-level CookieManager.
- `recordCookies=false` leaves cookie headers in HeaderManager and emits no CookieManager.
- `userAgent=current` removes captured User-Agent headers from HeaderManager entries.
- A predefined or custom `userAgent` value adds or replaces the `User-Agent` header for every sampler.

### 6.3 Message Contract Changes

No new message types required. Existing `EXPORT_JMX` and `GET_STATE` flows use stored options.

### 6.4 User Agent String Values

Predefined User-Agent strings are defined in `src/options/user-agents.json` with curated modern entries.

```json
{
  "chrome-win": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "chrome-mac": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "firefox-win": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0"
}
```

## 7. Validation Rules

### VR1 — URL Filter Pattern

- Field required and cannot be empty.
- Valid patterns are comma-separated `chrome.webRequest` URL filters or match patterns.
- `*` is valid and means record every HTTP/HTTPS request.
- Invalid pattern syntax shows inline error: "Enter a valid URL pattern or *".
- Empty/invalid patterns block save and show warning text.
- `chrome.storage.local.set` is not called when validation fails.

### VR2 — At Least One Resource Type

- Validation: At least one of `recordCss`, `recordJs`, `recordImages` must be checked.
- Warning shown: "At least one resource type must be selected".
- Save is blocked until the warning is resolved.

### VR3 — Custom User Agent

- When "Custom" is selected, the text field is required.
- Stored value is trimmed before validation and storage.
- Must be non-empty string with length < 512 characters.
- Must not contain line breaks.
- Stored as `custom:${userAgentString}`.
- Invalid custom values show inline error text and block save.

### VR4 — Default Restoration

- "Reset to defaults" button restores all checkboxes and selects to default states.
- `filterPattern` resets to `http://*/*, https://*/*`.
- `recordCss`, `recordJs`, `recordImages`, and `recordCookies` reset to checked.
- `recordRedirects` resets to unchecked.
- `userAgent` resets to `current`.

## 8. Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| All resource types unchecked | Save blocked with warning |
| Malformed URL pattern | Inline red border, save blocked |
| Filter pattern in effect, user navigates to excluded domain | No requests captured; user sees empty recording |
| Redirect captured when `recordRedirects` false | Redirect response omitted; follow-up request remains eligible; sampler uses `follow_redirects=true` |
| `recordCookies` false but Cookie headers present | Cookies appear in HeaderManager, not CookieManager |
| `recordCookies` true and Cookie headers present | Cookies appear in CookieManager, not HeaderManager |
| `userAgent=current` | Captured User-Agent headers are omitted from exported JMX HeaderManager entries |
| `userAgent=firefox-win` | Every sampler gets a User-Agent header with the Firefox Windows string |
| Service worker terminated after saving options | Options persisted via `chrome.storage.local` and reloaded for new recording/export sessions |
| Custom UA string with line breaks | Save blocked; warning shown |

## 9. Compatibility & Migration

### 9.1 MV2 to MV3

The legacy options page (`src-ori/popup/popup.html` lines 277-442) exposed:

- Concurrency — backend-only; dropped
- Time Distribution — backend-only; dropped
- User Agents — 500+ entries; replaced with 9 curated entries
- Filter Pattern — retained with same syntax
- Disable Browser Cache — deferred (no MV3 equivalent)
- Wipe Service Workers — deferred (needs `chrome.scripting`)
- Record Cookies — inverted meaning (now JMX output control)
- Record Ajax Requests — redundant (all XHR captured via webRequest)
- Requests to Record — replaced with resource-type checkboxes
- Parallel Downloads — dropped (backend-only)

### 9.2 Extension Upgrade

On upgrade from MV2 version:
- Legacy `regex_include` value not migrated (MV2 used different semantics)
- Legacy `user-agents` selection not migrated (different enum values)
- User sees default options on first MV3 options page open
- Existing captured requests remain exportable; advanced JMX formatting only applies to new exports after options are loaded

## 10. Acceptance Criteria

### AC1 — URL Filter Pattern Controls Capture

Given a filter pattern `https://api.example.com/*` stored in options:

- User navigates to `api.example.com/endpoint` — request is captured
- User navigates to `other.example.com/page` — request is ignored
- Popup shows only `api.example.com` in domain selector

### AC2 — Resource Types Selective Capture

Given `recordCss=false`, `recordJs=true`, `recordImages=true`:

- CSS file requests are not stored
- JavaScript file and XHR/fetch requests are stored
- Image requests are stored

Given `recordJs=false`, `recordCss=true`, `recordImages=true`:

- XHR/fetch requests are not stored
- Page navigation, script, CSS, and image requests are still eligible according to their own resource-type settings

### AC3 — CookieManager Separation

Given `recordCookies=true` and a request with `Cookie: session=abc`:

- Generated JMX contains a `CookieManager` element with the cookie
- `HeaderManager` does not include the Cookie header

Given `recordCookies=false`:

- Cookie header remains in `HeaderManager`
- No `CookieManager` element in JMX

### AC4 — User Agent Override in JMX

Given `userAgent="firefox-win"`:

- Each `HTTPSamplerProxy` has its User-Agent header set via `HeaderManager`
- The custom User-Agent appears in samplers' request headers

Given `userAgent="current"`:

- No User-Agent header is emitted in JMX HeaderManager entries, even if the browser request contained one

### AC5 — Options Persist Across Sessions

- User opens Options, sets `recordJs=false`, saves
- User closes and reopens popup
- Options page shows `recordJs` unchecked
- New recording session respects the setting

### AC6 — Validation Prevents Invalid Saves

Given user enters `not-a-url` in filter pattern:

- Save button shows red border on field
- Error text: "Enter a valid URL pattern or *"
- `chrome.storage.local.set` is not called

### AC7 — Existing Playback Unaffected

Given recording completed before this spec:

- Exported JMX behavior unchanged for requests without cookies or User-Agent override
- CookieManager is emitted only when `recordCookies=true` is selected for new exports
- User-Agent headers are omitted by default unless an override is selected

## 11. Definitions

| Term | Definition |
|------|------------|
| Resource Type | `chrome.webRequest.ResourceType` value (stylesheet, script, image, media, etc.) |
| Redirect Deduplication | Covered in 009; separate from `recordRedirects` checkbox |
| CookieManager | JMeter element for cookie handling; distinct from HTTP headers |
| Current Browser | The User-Agent string of the browser running the extension; represented in JMX by omitting User-Agent headers rather than preserving captured values |

## 12. Dependencies

| Spec | Dependency Type |
|------|-----------------|
| 009-jmx-export-quality | Implements think-time timers and assertions used alongside these options |
| 006-enhance-jmx-implementation | Provides `JmxOptionsStore` pattern to follow |
| 011-quality-uplift | May audit these options for permission and storage handling |

---

**Status:** Implemented

**Target Milestone:** Post-009 stable release

**Estimated Effort:** Medium (completed)

## 13. Implementation Progress

| Action | Status | Notes |
|--------|--------|-------|
| 010-A1 | ✅ Completed | `src/options/advanced-options.ts` — schema, defaults, normalization, validation helpers, and storage store |
| 010-A2 | ✅ Completed | `src/options/user-agents.json` — predefined User-Agent strings |
| 010-A3 | ✅ Completed | `src/options/user-agents.ts` — `getUserAgentString()` helper |
| 010-A4 | ✅ Completed | `src/options/options.html` — advanced options section markup: `filterPattern`, `recordCss`, `recordJs`, `recordImages`, `recordRedirects`, `recordCookies`, `userAgent`, `customUserAgent`, `saveAdvancedOptions`, `resetAdvancedOptions` |
| 010-A5 | ✅ Completed | `src/options/options.ts` — advanced options UI handlers, validation, save/reset logic, load from storage |
| 010-A6 | ✅ Completed | `src/options/options.test.ts` — options page integration tests |
| 010-A7 | ✅ Completed | `src/options/advanced-options.test.ts` — unit tests for normalization, validation, and storage |
| 010-A8 | ✅ Completed | `src/background/traffic-capture.ts` — URL and resource-type filtering during capture |
| 010-A9 | ✅ Completed | `src/background/recorder-service.ts` — loads advanced options for capture and export |
| 010-A10 | ✅ Completed | `src/jmx/serializer.ts` — applies CookieManager and User-Agent header behavior |
| 010-A11 | ✅ Completed | Validation rules prevent invalid saves: filter patterns, resource-type minimums, custom UA constraints |

### Verification

All 010 acceptance criteria (AC1–AC7) satisfied. Code merged to master via PR #5. Existing JMX export flows remain unaffected when advanced options are left at defaults.
