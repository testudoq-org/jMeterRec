# 015 — Improve Export to JMX: XML 1.0 Sanitization and BlazeMeter Compatibility

Status: Proposed

## 1. Purpose

Fix a class of JMX export defects where un-sanitized binary payload data (NUL bytes, control characters, lone surrogates) from recorded HTTP POST bodies or HAR imports is embedded directly into CDATA sections, producing JMX files that JMeter accepts but strict XML-validating runtimes such as BlazeMeter reject with `SAXParseException`.

This specification defines the sanitization utilities, serializer guards, capture-time filtering, and validation tests required to guarantee that exported JMX is valid XML 1.0 regardless of input payload content.

## 2. Context

Specs 006–014 established a typed JMX serializer (`src/jmx/element-model.ts`, `src/jmx/serializer.ts`), a HAR→JMX converter (`src/jmx/har-to-jmx.ts`), and a `chrome.webRequest` capture pipeline (`src/background/traffic-normalizer.ts`, `src/background/traffic-capture.ts`). The generated JMX passes JMeter's lenient parser, but fails on strict parsers when request or response bodies contain raw binary data.

A user-reported failure occurred at **line 8088, column 44** of an exported JMX file. The offending sampler was named `POST play.google.com/log #51`, and the CDATA section contained a recorded HTTP POST body with embedded NUL bytes and non-UTF-8 sequences. BlazeMeter rejected the file; JMeter opened it without warning.

The root cause is that the serializer's `escapeCdata()` function only splits the `]]>` terminator and does not strip XML 1.0 illegal characters. The capture pipeline's `decodeBytes()` uses `TextDecoder` with `fatal: false`, which preserves NUL bytes because they are valid UTF-8.

## 3. Current State

- `src/jmx/element-model.ts:952-953` — `escapeCdata()` splits `]]>` but does not sanitize illegal XML characters.
- `src/jmx/element-model.ts:944-950` — `xmlEsc()` escapes `&`, `<`, `>`, `"` but does not sanitize illegal characters.
- `src/jmx/element-model.ts:813` — `serializeHTTPSampler()` writes request/response body into `<![CDATA[...]]>`.
- `src/jmx/element-model.ts:779` — query argument values are written into CDATA.
- `src/jmx/element-model.ts:933` — `RegexExtractor.regex` is written into CDATA.
- `src/background/traffic-normalizer.ts:199-201` — `decodeBytes()` decodes raw `ArrayBuffer` bytes to a string with no XML sanitization.
- `src/utils/response-body.ts:19-39` — `measureBody()` captures response bodies but does not filter XML-illegal characters.
- `src/jmx/har-to-jmx.ts:64-65` — HAR `postData.text` and `response.content.text` are passed unsanitized into the model.
- `src/jmx/serializer.test.ts` — existing tests cover `]]>` splitting and HTML entities but not NUL/control characters.
- `src/background/traffic-normalizer.test.ts` — no binary-payload decode tests.

## 4. Scope

### In Scope

| Item | Description |
|------|-------------|
| XML 1.0 character sanitization utility | Strip `Char`-illegal code points from any string before it reaches XML output |
| Capture-time sanitization | Filter illegal characters in `decodeBytes()` and response-body capture paths |
| HAR import sanitization | Filter illegal characters in `convertHarToJmx()` for `postData.text` and `response.content.text` |
| Serializer guard | Ensure `xmlEsc()` and `escapeCdata()` are last-line defenses |
| JMX validation gate | Add `assertJmxWellFormedInDom()` that parses generated XML and throws on invalid output |
| Test coverage | Unit tests for sanitization utilities, integration tests for binary POST bodies, and a DOMParser-based XML validity gate |
| Error surfacing | Export flow should report sanitization/validation failures instead of writing broken files |

### Out of Scope

| Item | Reason |
|------|--------|
| JMX schema-level element validation | Out of scope; 013 already covers hashTree ordering and element tag names |
| Binary body encoding (base64) | Would change JMeter runtime semantics; deferred |
| CDATA to `base64Prop` conversion | JMeter does not natively decode base64 in `stringProp`; out of scope |
| Response body capture redesign | 005/011 territory; this spec only hardens existing capture paths |
| HAR export | Unrelated to JMX export |

## 5. Detailed Requirements

### 5.1 Shared sanitization utility

Create `src/utils/xml-sanitizer.ts`:

```typescript
/**
 * Removes XML 1.0 illegal characters from a string.
 *
 * Per XML 1.0 (Fifth Edition) Char production:
 *   Char ::= #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
 *
 * Stripping rather than replacing preserves payload length predictability
 * and avoids inserting replacement characters that could alter protocol semantics.
 */
export function sanitizeForXml(value: string): string {
  return value.replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u10000-\u10FFFF]/g, '')
}
```

This utility must be imported by:
- `src/jmx/element-model.ts`
- `src/background/traffic-normalizer.ts`
- `src/utils/response-body.ts`
- `src/jmx/har-to-jmx.ts`

### 5.2 Capture-time sanitization

**File:** `src/background/traffic-normalizer.ts`

Modify `decodeBytes()` (line 199):

```typescript
function decodeBytes(bytes: ArrayBuffer): string {
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  return sanitizeForXml(raw)
}
```

This ensures persisted `PendingRequest.body` and `CapturedRequest.body` never carry XML-illegal characters downstream.

**File:** `src/utils/response-body.ts`

Modify `measureBody()` (line 19) to sanitize after truncation:

```typescript
export function measureBody(
  body: string,
  maxBytes = MAX_RESPONSE_BODY_BYTES
): CapturedResponseBody {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(body)
  const size = bytes.length
  const truncated = size > maxBytes
  const safeBytes = new Uint8Array(Math.min(size, maxBytes))
  safeBytes.set(bytes.subarray(0, safeBytes.length))
  const decoder = new TextDecoder()
  const truncatedBody = size === 0 ? '' : decoder.decode(safeBytes, { stream: false })
  const sanitized = sanitizeForXml(truncatedBody)

  return {
    body: sanitized,
    truncated,
    redacted: false,
    size,
    capturedAtMs: Date.now(),
  }
}
```

### 5.3 HAR import sanitization

**File:** `src/jmx/har-to-jmx.ts`

In `convertHarToJmx()` (lines 64–65):

```typescript
const body = sanitizeForXml(entry.request.postData?.text ?? '')
const responseBody = sanitizeForXml(entry.response.content.text ?? '')
```

### 5.4 Serializer last-line defense

**File:** `src/jmx/element-model.ts`

Update `xmlEsc()` (line 944) to chain sanitization:

```typescript
export function xmlEsc(s: string): string {
  return sanitizeForXml(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
```

Update `escapeCdata()` (line 952) to chain sanitization:

```typescript
export function escapeCdata(value: string): string {
  return sanitizeForXml(value).replaceAll(']]>', ']]]]><![CDATA[>')
}
```

This guarantees that even if an upstream caller forgets to sanitize, the serializer never emits XML-illegal characters in element content, attribute values, or CDATA sections.

### 5.5 JMX validation gate

**File:** `src/jmx/serializer.ts`

Add a `assertJmxWellFormedInDom()` function and invoke it from `buildJmx()` before returning the string:

```typescript
export function validateJmx(jmx: string): void {
  // In test/browser environments DOMParser is available.
  // In production (service worker) we rely on the serializer guards above;
  // validation is a test-time and optional runtime assertion.
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(jmx, 'application/xml')
    const error = doc.querySelector('parsererror')
    if (error !== null) {
      throw new Error(`Generated JMX is not valid XML: ${error.textContent?.slice(0, 200)}`)
    }
  }
}
```

In `buildJmx()`, assemble the JMX string, then call `validateJmx(jmx)` before returning. The function is a no-op in Node.js / service-worker environments where `DOMParser` is unavailable; the serializer guards (`sanitizeForXml` in `xmlEsc`/`escapeCdata`) are the authoritative runtime defense in those environments.

**File:** `src/background/recorder-service.ts`

Extract a shared `generateJmx()` helper that both the recorded-traffic export path (`buildJmxExportResponse`) and the external HAR import path (`convertHarToJmxResponse`) use. This helper loads JMX/advanced options, builds `PlanMeta`, calls `convertHarToJmx()` inside a try/catch, and rethrows as `Error`. Validation failures (including XML validity failures from `validateJmx`) surface as user-facing errors instead of broken JMX files.

## 6. Implementation Modules

| Module | Responsibility |
|--------|----------------|
| `src/utils/xml-sanitizer.ts` | New. `sanitizeForXml()` — strip XML 1.0 `Char`-illegal code points |
| `src/jmx/element-model.ts` | Update `xmlEsc()` and `escapeCdata()` to chain `sanitizeForXml()` |
| `src/background/traffic-normalizer.ts` | Sanitize request body in `decodeBytes()` |
| `src/utils/response-body.ts` | Sanitize response body in `measureBody()` |
| `src/jmx/har-to-jmx.ts` | Sanitize `postData.text` and `response.content.text` in `convertHarToJmx()` |
| `src/jmx/serializer.ts` | Add `assertJmxWellFormedInDom()`; call it from `buildJmx()` in test/dev mode |
| `src/background/recorder-service.ts` | Catch validation errors in `EXPORT_JMX` path and return user-facing error |
| `src/jmx/serializer.test.ts` | Add CDATA binary-body and XML validity tests |
| `src/jmx/har-to-jmx.test.ts` | Add HAR binary-body sanitization test |
| `src/background/traffic-normalizer.test.ts` | Add binary-payload decode test |
| `src/utils/response-body.test.ts` | Add control-character response-body test (if file exists; otherwise create) |

## 7. Acceptance Criteria

### AC1 — NUL bytes are stripped from exported CDATA

Given a `CapturedRequest` with `body: '\x00\x01\x02payload\x00data'` and `method: 'POST'`:

- Exported JMX contains no `\x00`, `\x01`, or `\x02` characters.
- The body is still wrapped in `<![CDATA[...]]>`.
- JMeter can open the file without warnings.
- A strict XML parser (e.g., BlazeMeter's SAX parser) accepts the file.

### AC2 — All serializer text paths are guarded

Given strings containing XML 1.0 illegal characters injected into:

- HTTP sampler body
- Query argument values
- Regex extractor regex
- Header values
- Cookie values
- Element names and attributes

- Exported JMX contains no illegal characters in any of those positions.
- `DOMParser.parseFromString(jmx, 'application/xml')` returns no `parsererror`.

### AC3 — Capture-time sanitization

Given a raw `ArrayBuffer` request body containing `0x00`–`0x1F` control bytes:

- `decodeBytes()` in `traffic-normalizer.ts` returns a string without those characters.
- The persisted `CapturedRequest.body` is XML-safe.

### AC4 — HAR import sanitization

Given a HAR entry with `postData.text` containing `\x00\x01`:

- `convertHarToJmx()` produces JMX without those characters.
- The generated JMX passes `DOMParser` validation.

### AC5 — Validation gate catches regressions

Given any future code path that reintroduces illegal characters:

- `assertJmxWellFormedInDom()` throws before the file is written.
- The popup/background displays an error instead of silently saving a broken file.

### AC6 — Backward compatibility

Given clean-text request/response bodies and HARs:

- Exported JMX output is byte-identical to pre-015 output for all text that does not require sanitization.
- Existing unit tests for CDATA `]]>` splitting and HTML entity escaping continue to pass.

## 8. Testing Strategy

### Unit Tests

| File | Test |
|------|------|
| `src/utils/xml-sanitizer.test.ts` (new) | `sanitizeForXml()` strips NUL, control chars, lone surrogates; preserves `\x09`, `\x0A`, `\x0D`, printable ASCII, valid Unicode |
| `src/jmx/element-model.test.ts` (new or extend) | NUL in body CDATA, control chars in CDATA terminator interaction, NUL in regex CDATA, NUL in header values, NUL in cookie values |
| `src/jmx/serializer.test.ts` | Binary POST body CDATA; full DOMParser validity gate on `buildJmx()` output |
| `src/jmx/har-to-jmx.test.ts` | Binary `postData.text` and `response.content.text` sanitized |
| `src/background/traffic-normalizer.test.ts` | `decodeBytes()` strips illegal chars from raw bytes |
| `src/utils/response-body.test.ts` | `measureBody()` strips illegal chars from captured response bodies |

### Integration / E2E

- Add a golden JMX fixture generated from a request with `body: '\x00\x01...binary...\x7F'` and assert it parses as XML.
- Run the existing Playwright E2E export test against the updated serializer to confirm no regressions.

### Validation Gate Test

```typescript
it('produces XML that passes DOMParser validation for the reported BlazeMeter failure case', () => {
  const binaryBody = String.fromCharCode(...Array.from({ length: 256 }, (_, i) => i))
  const requests: CapturedRequest[] = [
    {
      id: '1',
      timestamp: '2024-01-01T00:00:00Z',
      method: 'POST',
      url: 'https://play.google.com/log',
      headers: { 'content-type': 'application/octet-stream' },
      queryParams: {},
      body: binaryBody,
    },
  ]
  const jmx = buildJmx(meta, requests)
  const parser = new DOMParser()
  const doc = parser.parseFromString(jmx, 'application/xml')
  expect(doc.querySelector('parsererror')).toBeNull()
})
```

## 9. Risks and Considerations

### R15.1 — Data loss from stripping

Stripping illegal characters removes bytes from the captured payload. For protocol-level replay this is acceptable because the body cannot be faithfully transmitted as raw binary in JMeter's `stringProp` anyway. If users need exact binary replay, a future spec should introduce base64 encoding with a corresponding JMeter `Base64Encoder` decoder or a JSR223 pre-processor.

### R15.2 — Performance of regex sanitization

`sanitizeForXml()` runs a single regex replace across the entire body string. For typical JMX payloads (< 1 MB) this is negligible. For pathological multi-megabyte bodies, the cost is still linear and bounded. No batching or streaming is required.

### R15.3 — Service worker DOMParser availability

`DOMParser` is not guaranteed in MV3 service workers. The `assertJmxWellFormedInDom()` function must therefore be gated behind `typeof DOMParser !== 'undefined'`. The serializer guards (`sanitizeForXml` in `xmlEsc`/`escapeCdata`) are the authoritative runtime defense; `assertJmxWellFormedInDom()` is a development and optional-runtime assertion.

### R15.4 — Interaction with existing `]]>` escaping

`sanitizeForXml()` strips `\x00`–`\x08`, `\x0B`, `\x0C`, `\x0E`–`\x1F`, and `\x7F`. It does **not** strip `]` or `>`. Therefore the subsequent `escapeCdata()` `replaceAll(']]>', '...')` still works correctly on the sanitized string.

## 10. Dependencies

| Spec | Dependency Type |
|------|----------------|
| 013-jmx-output-hardening | Provides the current serializer structure and CDATA handling that this spec modifies |
| 009-jmx-export-quality | Provides the base serializer, body handling, and test patterns |
| 012-external-har-import | Provides the HAR→JMX conversion path that this spec hardens |

## 11. Sequencing Notes

Implement in the following order to minimize regression risk:

1. Add `src/utils/xml-sanitizer.ts` with `sanitizeForXml()`.
2. Update `src/jmx/element-model.ts` (`xmlEsc`, `escapeCdata`) to chain `sanitizeForXml()`.
3. Add unit tests for `sanitizeForXml()` and serializer CDATA binary-body cases.
4. Update capture-time paths (`traffic-normalizer.ts`, `response-body.ts`) to sanitize at entry.
5. Update HAR import (`har-to-jmx.ts`) to sanitize at boundary.
6. Add `assertJmxWellFormedInDom()` and wire it into `buildJmx()` and `recorder-service.ts`.
7. Run full test suite (`npm test && npm run typecheck && npm run lint`).

## 12. Implementation Progress

| Action | Status | Notes |
|--------|--------|-------|
| 015-A1 | Pending | `src/utils/xml-sanitizer.ts` — create `sanitizeForXml()` |
| 015-A2 | Pending | `src/jmx/element-model.ts` — chain `sanitizeForXml()` in `xmlEsc` and `escapeCdata` |
| 015-A3 | Pending | `src/background/traffic-normalizer.ts` — sanitize in `decodeBytes()` |
| 015-A4 | Pending | `src/utils/response-body.ts` — sanitize in `measureBody()` |
| 015-A5 | Pending | `src/jmx/har-to-jmx.ts` — sanitize body/responseBody at lines 64–65 |
| 015-A6 | Pending | `src/jmx/serializer.ts` — add `assertJmxWellFormedInDom()` and wire into `buildJmx()` |
| 015-A7 | Pending | `src/background/recorder-service.ts` — catch validation errors in export path |
| 015-A8 | Pending | Tests — `xml-sanitizer.test.ts`, `element-model.test.ts`, `serializer.test.ts`, `har-to-jmx.test.ts`, `traffic-normalizer.test.ts`, `response-body.test.ts` |


## 13. Post-Implementation Review: assertJmxWellFormedInDom() and buildJmx()

A review of the assertJmxWellFormedInDom() and buildJmx() implementation identified the following improvements and simplifications, prioritized by impact. **No code changes were made.**

### 13.1 Priority 1 — High (correctness, clarity, API surface)

#### 13.1.1 assertJmxWellFormedInDom() is exported unnecessarily

**Finding:** assertJmxWellFormedInDom() is exported from serializer.ts but only called by buildJmx() within the same module. The only external consumer is serializer.test.ts, which can access module-private functions via the parent module or by adjusting test imports.

**Improvement:** Make assertJmxWellFormedInDom() module-private (remove export). This reduces public API surface and prevents external code from depending on a function that is effectively an internal assertion.

**Risk:** Low. Tests can be adjusted to import buildJmx() and rely on its internal call, or the test can import the module and access the private function through the existing import path if needed.

#### 13.1.2 assertJmxWellFormedInDom() gives false confidence in production

**Finding:** The function gates on typeof DOMParser !== undefined. In the actual JMX export runtime (MV3 service worker), DOMParser is not available, so assertJmxWellFormedInDom() is a **silent no-op**. The real protection is the sanitizeForXml() guards in xmlEsc()/escapeCdata().

**Improvement:** Either remove assertJmxWellFormedInDom() entirely and rely on the serializer guards (which are authoritative), or document it explicitly as a **development-only assertion** that runs in browser/jsdom test environments. If kept, the function name should reflect its limited scope (e.g., assertJmxWellFormedInDom()).

**Risk:** Medium. Removing it entirely means no XML-level regression guard in environments where DOMParser *is* available (e.g., popup scripts, tests). Keeping it with better documentation is safer.

#### 13.1.3 buildJmx() mixes too many responsibilities

**Finding:** The function handles: (a) request analysis, (b) model construction, (c) per-sampler sequence building with timers/assertions/extractors, (d) document assembly, (e) validation.

**Improvement:** Extract the per-sampler sequence builder (lines 93–151 in serializer.ts) into a separate buildSamplerSequence() function. This makes buildJmx() a high-level orchestrator and makes the sequence logic independently testable.

**Risk:** Low. Pure extraction, no behavior change.

### 13.2 Priority 2 — Medium (maintainability, DRY)

#### 13.2.1 Extractor routing uses if/else if instead of a lookup

**Finding:** Lines 111–138 in buildJmx() use:

```typescript
if (ext.type === 'JSONPostProcessor') { ... }
if (ext.type === 'RegexExtractor') { ... }
```

Adding a new extractor type requires another if branch and duplicates the create->serialize pattern.

**Improvement:** Replace with a Map<string, (ext: JmxExtractor) => string> lookup table. This centralizes the mapping, eliminates the if chain, and makes new extractor types a one-line addition.

**Risk:** Low. Pure refactor, but the Map approach may be overkill for only 2 extractors. Worth it if more extractors are planned.

#### 13.2.2 Nested ternary expressions hurt readability

**Finding:** Lines 101–110 in buildJmx():

```typescript
const assertionXml =
  options?.assertion?.enabled === true
    ? serializeResponseAssertion(createResponseAssertion(options.assertion.expectStatus))
    : ''
const durationAssertionXml =
  options?.durationAssertion?.enabled === true
    ? serializeDurationAssertion(...)
      : ''
```

These are independent but visually nested in the .map() callback.

**Improvement:** Extract into small helper functions like buildAssertionXml(options) and buildDurationAssertionXml(options). This flattens the .map() callback and gives each concern a name.

**Risk:** Low. Pure readability improvement.

#### 13.2.3 recorder-service.ts duplicates options mapping

**Finding:** Both convertHarToJmxResponse (line 354) and buildJmxExportResponse (line 402) build identical convertHarToJmx() option objects with the same nested ternary structure.

**Improvement:** Extract a buildJmxSerializerOptions(jmxOptions, advancedOptions) helper. Both methods then call this helper. This is the extraction attempted in the previous implementation pass that was partially reverted.

**Risk:** Low. Eliminates duplication; makes future option additions single-point.

### 13.3 Priority 3 — Low (simplification, testing)

#### 13.3.1 buildJmx() creates models and serializes them inline

**Finding:** The function interleaves create*() and serialize*() calls (e.g., serializeHTTPRequestDefaults(createHTTPRequestDefaults(...))).

**Improvement:** Build all models first, then serialize in a second pass. This separates data construction from string generation and makes it easier to inspect or validate the model before serialization.

**Risk:** Low, but adds intermediate variables. May be over-engineering for a function that is already well-understood.

#### 13.3.2 assertJmxWellFormedInDom() error message truncation is arbitrary

**Finding:** error.textContent?.slice(0, 200) cuts off the parser error at 200 characters. If the underlying issue is interesting, this truncation hides it.

**Improvement:** Remove the slice, or make the limit configurable. For a development assertion, full context is more useful than a fixed truncation.

**Risk:** Low. Only affects error messages during development/testing.

#### 13.3.3 buildJmx() takes requests: CapturedRequest[] but doesn't validate

**Finding:** If an empty array is passed, the function still emits a valid (but empty) JMX. There is no guard or warning.

**Improvement:** Add an early return or assertion if requests.length === 0. This is already handled at the recorder-service.ts level, but buildJmx() is a public API and could be called directly.

**Risk:** Low. Defensive programming.

### 13.4 Recommended Action Order

| Order | Improvement | Effort | Impact |
|-------|-------------|--------|--------|
| 1 | Make assertJmxWellFormedInDom() module-private | 5 min | Reduces API surface |
| 2 | Document assertJmxWellFormedInDom() as dev-only assertion | 2 min | Prevents false confidence |
| 3 | Extract buildSamplerSequence() from buildJmx() | 15 min | Improves testability, readability |
| 4 | Extract extractor lookup table | 10 min | DRY, extensible |
| 5 | Extract buildJmxSerializerOptions() in recorder-service.ts | 10 min | Eliminates duplication |
| 6 | Extract assertion/duration builders | 10 min | Flattens nested ternaries |
| 7 | Remove assertJmxWellFormedInDom() error truncation | 2 min | Better debugging |

Items 1-3 are the highest-value changes. Items 4-6 are nice-to-have maintainability improvements. Item 7 is a minor quality-of-life tweak.

