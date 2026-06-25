# 012 - External HAR Import and Convert to JMX
Status: Implemented

## 1. Purpose

This specification defines an external HAR import path for the Capultura MV3 Chrome Extension. It enables users to select an existing `.har` file, validates its structure, optionally filters by domain, and converts it to JMX using the existing `convertHarToJmx()` pipeline.

The feature adds a parallel import path alongside the existing captured-traffic export flow, allowing users to transform HAR files from external sources (browser devtools exports, other proxy tools, etc.) without modifying recorded traffic behavior.

## 2. Scope

### In Scope

| Item | Description |
|------|-------------|
| HAR file selection | File input accepting `.har` files and JSON MIME types |
| HAR parsing and validation | Parse JSON, validate HAR 1.2 structure, log object, entries |
| Domain filtering UI | Extract unique domains from HAR entries, render selector for user filtering |
| JMX conversion | Convert filtered HAR to JMX via existing `convertHarToJmx()` |
| Download delivery | Trigger JMX file download with sanitized filename |

### Out of Scope

| Item | Reason |
|------|--------|
| HAR persistence | HAR data is not saved to storage or sent to remote servers |
| HAR export | Exporting recorded traffic as a standalone HAR file (separate feature) |
| HAR schema extensions | No additional HAR fields beyond existing converter support |
| Remote conversion | No server-side processing; all conversion is local |

## 3. Current State

The extension currently provides:

- **Captured traffic flow**: `Recorded browser traffic → CapturedRequest[] → buildHar() → convertHarToJmx() → JMX download`
- **HAR types**: `HAR` interface and `validateHar()` function in `src/jmx/har-to-jmx.ts`
- **HAR→JMX converter**: `convertHarToJmx(har, meta, serializerOptions)` with full TrafficEntry mapping
- **Message contract**: `EXPORT_JMX` message with `includedDomains: string[]`
- **Domain selector UI**: Existing checkbox rendering in popup for captured domains

This spec extends the system to accept HAR input from file selection instead of capture.

## 4. Detailed Requirements

### 4.1 HAR File Selection

**Input acceptance:**

- File input accepts `.har` extension and `application/json` MIME type
- Multiple file selection is disabled
- Empty file selection is rejected immediately with inline error

**UI placement:**

- New "Import HAR file" section appears in popup under the JMX export area
- Appears after the "Export JMX" button row
- Uses `type="file"` input element

### 4.2 HAR Parsing and Validation

**Client-side validation (popup):**

- File content must be valid JSON
- HAR object must have a `log` property
- `log.version` must equal `"1.2"`
- `log.entries` must exist and be a non-empty array

**Server-side validation (background):**

- All client-side validations repeated before conversion
- Each entry must have required fields: `startedDateTime`, `request.method`, `request.url`, `request.headers`, `request.queryString`, `response.status`, `response.headers`, `response.content`, `timings`

**Error messages:**

- Invalid JSON: "Invalid HAR file: file is not valid JSON"
- Missing log: "Invalid HAR file: missing log object"
- Wrong version: "Unsupported HAR version: expected 1.2"
- No entries: "Invalid HAR file: no entries found"

### 4.3 Domain Extraction and Filtering

**Domain extraction:**

- Unique domains are extracted from all HAR entry URLs
- Domain extraction uses URL parsing (`new URL(entry.request.url)`)
- Invalid URLs are skipped during extraction but preserved for conversion

**Domain selector:**

- All domains selected by default
- Checkbox list mirrors existing JMX domain selector UI
- "Convert HAR to JMX" button is disabled when no domains selected
- User can toggle individual domains to filter before conversion

**Domain filtering:**

- Filter occurs before JMX conversion
- Filtered HAR entries are passed to `convertHarToJmx()`
- Error shown if no entries match selected domains: "No requests match the selected domains"

### 4.4 JMX Conversion Flow

**Conversion steps:**

1. Filter HAR entries by selected domains
2. Build `PlanMeta` from:
   - Plan name from popup `planNameInput`, or saved JMX option default
   - Threads/rampUp/loops from `JmxOptionsStore`
   - Filename from sanitized plan name
3. Call `convertHarToJmx(filteredHar, meta, serializerOptions)`
4. Return `{ success: true, jmx, filename }` to popup
5. Popup triggers download via Blob URL

### 4.5 Privacy and Security

**Data handling:**

- Imported HAR is not persisted to `chrome.storage`
- Imported HAR is only held in memory during conversion
- Imported HAR is not transmitted to remote servers
- HAR data is discarded immediately after conversion

**Sensitive data warnings:**

- HAR files may contain cookies, authorization headers, query tokens, request/response bodies
- Users should be warned that this data will be included in JMX output unless manually redacted

## 5. Architecture

### 5.1 Data Flow

```
Current (preserved):
Recorded browser traffic
  → CapturedRequest[]
  → buildHar()
  → convertHarToJmx()
  → JMX download

New (parallel):
User-selected .har file
  → parsed HAR object (popup)
  → validate HAR (popup + background)
  → domain selector UI
  → filter by selected domains
  → convertHarToJmx()
  → JMX download
```

### 5.2 Message Contract

**New request type:**

```typescript
type BackgroundRequest =
  | ...
  | {
      type: 'IMPORT_HAR'
      har: HAR
      includedDomains: string[]
    }
```

**Response type:**

```typescript
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

## 6. Implementation Modules

| Module | Responsibility |
|--------|--------------|
| `src/messages.ts` | Add `IMPORT_HAR` request type to `BackgroundRequest` |
| `src/popup/popup.ts` | File input handler, HAR parsing, domain extraction, validation, UI state |
| `src/popup/popup.html` | Import HAR section markup |
| `src/popup/popup.css` | Styling for import HAR section (if needed) |
| `src/background/recorder-service.ts` | `IMPORT_HAR` handler, domain filtering, conversion, response |
| `src/jmx/har-to-jmx.ts` | Strengthened validation helpers (exported `validateHar` for reuse) |

### 6.1 Popup UI State

```typescript
interface ImportHarState {
  har: HAR | null
  availableDomains: string[]
  selectedDomains: Set<string>
  error: string
  parsing: boolean
}
```

### 6.2 DOM Elements (new)

| Element ID | Type | Description |
|------------|------|-------------|
| `importHarFile` | `input[type="file"]` | File input for HAR selection |
| `importHarSection` | `div` | Container for import HAR UI |
| `importHarDomains` | `div` | Domain selector container (mirrors `jmxDomains`) |
| `importHarDomainStatus` | `div` | Domain count status text |
| `importHarError` | `div` | Error message display |
| `convertHarToJmx` | `button` | Convert button |

## 7. Acceptance Criteria

### AC1 — User can select a HAR file through file input

Given the popup is open with JMX export mode selected:

- User sees an "Import HAR file" section under the export area
- User can click "Choose HAR file" and select a `.har` file
- The file input accepts `.har` and JSON MIME types
- Selecting a file triggers parsing and validation

### AC2 — Imported HAR is validated

Given a selected file:

- Valid HAR 1.2 files proceed to domain selector
- Invalid JSON is rejected with error message
- Missing `log` object is rejected with error message
- Unsupported HAR versions are rejected with error message
- HAR with no entries is rejected with error message

### AC3 — Imported domains are shown with selector UI

Given a valid HAR with multiple domains:

- Unique domains are extracted from entry URLs
- All domains are pre-selected in a checkbox list
- Domain count shows "N of M domains selected"
- "Convert HAR to JMX" button is enabled when domains selected
- User can deselect individual domains

### AC4 — HAR converts to JMX

Given a valid HAR and selected domains:

- User clicks "Convert HAR to JMX"
- Popup sends `IMPORT_HAR` with HAR and selected domains
- Background validates HAR again
- Background filters entries by selected domains
- Background calls `convertHarToJmx()` with filtered HAR
- JMX file is downloaded

### AC5 — Existing captured-traffic export remains unchanged

Given recorded traffic:

- Existing "Export JMX" flow via `EXPORT_JMX` still works
- Existing domain selector for captured traffic unchanged
- External HAR import uses separate message and UI path
- No regression in existing JMX export behavior

### AC6 — No HAR persistence

Given an imported HAR:

- HAR is not saved to `chrome.storage.local`
- HAR is not transmitted to any remote server
- HAR data exists only in popup memory and background message
- HAR data is discarded after conversion completes

### AC7 — E2E tests pass

Given the implementation is complete:

- All 342 unit tests pass
- E2E tests for HAR import pass with `headless: false` (required for Chrome extension testing)
- `dist/` builds successfully
- TypeScript compiles without errors
- Lint checks pass

## 8. Testing Strategy

### Unit Tests

- `src/popup/popup.test.ts`: File input handling, HAR parsing, domain extraction
- `src/background/recorder-service.test.ts`: `IMPORT_HAR` handler, domain filtering, validation
- `src/jmx/har-to-jmx.test.ts`: HAR validation edge cases

### Integration Tests

- E2E test loading a fixture HAR (`src/har/example.com.har`)
- Verify domain selector renders correctly
- Verify filtered conversion produces correct JMX
- Verify download triggers with correct filename

**Note:** E2E tests use `headless: false` in Playwright's `launchPersistentContext` because Chrome extensions cannot be loaded in headless mode. This is standard for all E2E tests in this project.

## 9. Risks and Considerations

### R9.1 Large HAR files

Large HAR files may exceed `chrome.runtime.sendMessage` size limits. Consider:

- Chunking large HAR payloads (deferred)
- Warning user if HAR exceeds threshold (deferred)

### R9.2 Duplicate HAR structures

Existing internal `HAR` type is duplicated in `har-to-jmx.ts`. Consider:

- Exporting `HAR` type from a shared location for reuse
- Importing popup-validated HAR type in background

### R9.3 Security boundary

HAR files from untrusted sources may contain malicious payloads. Mitigation:

- Background always validates before conversion
- Popup uses `textContent` for any HAR error rendering
- No `eval()` or unsafe rendering of HAR content

## 10. Dependencies

- `convertHarToJmx()` — existing HAR→JMX converter (stable)
- `"downloads"` permission — already present in manifest
- Popup JMX domain selector UI — existing patterns to follow
- HAR validation helpers — strengthen existing `validateHar()`

## 11. Sequencing Notes

This spec should be implemented after `009-jmx-export-quality` is stable, because:

- The `convertHarToJmx()` pipeline is mature and tested
- Domain selector patterns are established in popup
- HAR types and validation are already defined

Coordination with `008-extension-permissions-refresh`:

- `"downloads"` permission is already justified for JMX export
- No new permissions required for this feature

## 12. Implementation Progress

| Action | Status | Notes |
|--------|--------|-------|
| 012-A1 | ✅ Completed | `messages.ts` — `IMPORT_HAR` added to `BackgroundRequest` union type with `{ type: 'IMPORT_HAR', har: HAR, includedDomains: string[] }` |
| 012-A2 | ✅ Completed | `src/popup/popup.html` — Import HAR section markup added: `importHarFile`, `importHarSection`, `importHarDomains`, `importHarDomainStatus`, `importHarError`, `convertHarToJmx` |
| 012-A3 | ✅ Completed | `src/popup/popup.ts` — `handleImportHarFile()` with client-side validation (JSON parse, log object, version 1.2, non-empty entries); `renderImportHarDomainSelector()` with checkbox UI; `convertImportedHarToJmx()` sending `IMPORT_HAR` message; Blob URL download |
| 012-A4 | ✅ Completed | `src/background/recorder-service.ts` — `handleImportHarMessage()` validates HAR via `validateHar()`, filters entries via `filterHarEntriesByDomains()`, calls `convertHarToJmxResponse()` |
| 012-A5 | ✅ Completed | `src/jmx/har-to-jmx.ts` — `validateHar()` and `extractHarDomains()` exported for reuse |
| 012-A6 | ✅ Completed | `src/jmx/domains.ts` — `filterHarEntriesByDomains()` builds filtered HAR for conversion pipeline |
| 012-A7 | ✅ Completed | Unit tests — 9 popup tests (`popup.test.ts`), 5 recorder-service tests, har-to-jmx validation tests; all 342 tests pass |
| 012-A8 | ✅ Completed | `src/popup/popup.html` — Privacy warning added between muted description and file input; styled with existing `status-warning` class |
| 012-A9 | ✅ Completed | `tests/e2e/spec-012-har-import.spec.ts` — E2E test exercising full flow: upload `src/har/example.com.har`, verify domain extraction, convert, verify JMX download + content |
| 012-A11 | ✅ Completed | Fixed E2E test: added missing `node:fs` imports, corrected regex escape in `extensionIdFromContext` |
| 012-A12 | ✅ Completed | Created `src/jmx/index.ts` barrel export for JMX functions |
| 012-A10 | ✅ Completed | Error messages aligned in `src/popup/popup.ts` — "Unsupported HAR version: expected 1.2" matches spec §4.2; empty/rejected file handled before parsing |

### Completed in this session

- Added `tests/shared/har-test-utils.ts` — extracted `createMockHarFile`, `createValidHarJson`, `parseHarJson` from inline definitions for reuse across test files
- Added `setupHarImportTest()` + `loadHarFile()` helpers in `popup.test.ts` — eliminates ~40 lines of repeated file-input mocking boilerplate
- Added `until(condition, timeout, label)` polling helper — replaces fragile `await Promise.resolve() × 3` pattern with explicit timeout
- Split `popup HAR import` describe block from flat 313-line sequence into 5 sub-describes: `mode visibility`, `file parsing`, `domain selection`, `clear and reset`, `conversion and download`
- Added `afterEach` teardown — clears `fileInput.files` to prevent cross-test state leakage

### JMX Structure Fix (June 2026)

Fixed critical JMeter import compatibility issue where exported JMX files failed with:
```
ClassCastException: class org.apache.jmeter.protocol.http.sampler.HTTPSamplerProxy cannot be cast to class org.apache.jorphan.collections.HashTree
```

**Root cause:** The `ConfigTestElement` element (HTTP Request Defaults) was not followed by its required child `<hashTree/>` element, causing JMeter's XStream deserializer to misinterpret the next sampler as a HashTree.

**Changes made:**

| Module | Change |
|--------|--------|
| `src/jmx/serializer.ts` | Added `<hashTree/>` after `${defaultsXml}` in the document outline (line 107) |
| `src/jmx/serializer.ts` | Made cookie section conditional: `${cookieSection}` only includes `<hashTree/>` when cookies exist |
| `src/jmx/serializer.ts` | Fixed think timer format: removed leading whitespace to match golden file format |
| `src/jmx/serializer.ts` | Fixed sampler hashTree format: changed `\n        <hashTree/>` to `<hashTree/>\n` |
| `src/jmx/serializer.test.ts` | Added explicit test verifying `ConfigTestElement` → `<hashTree/>` → `HTTPSamplerProxy` ordering |
| `src/jmx/element-model.ts` | Confirmed `serializeHTTPRequestDefaults` uses correct `<ConfigTestElement>` tag (not `<HTTPRequestDefaults>`) |

**Technical details:**

JMeter's JMX schema requires each element under a ThreadGroup to be followed by its child `<hashTree/>` before the next sibling element. The correct structure is:
```xml
<ThreadGroup>...</ThreadGroup>
<hashTree>
  <ConfigTestElement>...</ConfigTestElement>
  <hashTree/>
  <HTTPSamplerProxy>...</HTTPSamplerProxy>
  <hashTree/>
</hashTree>
```

Using `<HTTPRequestDefaults>` as the element tag would also cause failure because JMeter's `saveservice.properties` maps `ConfigTestElement` → `org.apache.jmeter.config.ConfigTestElement` but has no alias for `HTTPRequestDefaults`.

### Validation evidence

```
npm run build       → Generated dist/ successfully
npm run typecheck   → PASS
npm run lint        → PASS
npm test            → 22 files, 342 tests PASS (added hashTree ordering test)
E2E tests           → All tests PASS (headless: false required for Chrome extension testing)
```

### Implementation plan for remaining gaps

All remaining gaps have been closed. Final verification completed:

| Item | Action | Status |
|------|--------|--------|
| E2E tests | `npx playwright test tests/e2e/spec-012-har-import.spec.ts --workers=1` - Both tests pass with `headless: false` (required for Chrome extension testing) | ✅ Done |
| Spec `Status:` field | Updated to `Implemented` | ✅ Done |
| `filterHarEntriesByDomains` export | Added to `src/jmx/index.ts` barrel export | ✅ Done |
| JMX structure validation | Added test verifying `ConfigTestElement` → `<hashTree/>` ordering | ✅ Done |
