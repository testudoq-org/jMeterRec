# 013 - JMX Output Hardening

Status: Finalized

## 1. Purpose

Finalize and harden the JMX export path for enterprise deployment. Close the remaining coverage gaps identified in `009-jmx-export-quality` and `012-external-har-import` by adding CacheManager, JSON and regex extractors, DurationAssertion, expanded edge-case tests, and explicit documentation of JMeter schema limitations.

## 2. Context

Following the delivery of `009-jmx-export-quality` (timers, assertions, CookieManager, redirect dedup, query-argument serialization) and `012-external-har-import` (parallel HAR-import flow, strengthened HAR validation), the extension generates JMX files that now pass JMeter import validation. Enterprise users have requested additional elements that are common in production test suites:

- Cache control headers for server-emulation accuracy.
- Dynamic parameter extraction (JSON path and regular expression) to parameterise subsequent requests.
- Timing validation (DurationAssertion) alongside the existing status-code ResponseAssertion.
- Explicit documentation of JMeter structural requirements so maintainers and contributors do not reintroduce schema-violating regressions.

`010-advanced-recorder-options` (URL filter, resource-type filtering, User-Agent override, CookieManager separation) is implemented and delivered. 013 builds on that stable foundation.

## 3. Current State

- `src/jmx/serializer.ts` emits TestPlan → ThreadGroup → hashTree → ConfigTestElement → hashTree → CookieManager → hashTree → Timer/Assertion/Sampler → hashTree.
- ResponseAssertion exists; DurationAssertion is not generated.
- No extractor elements (JSON PostProcessor or Regular Expression) are emitted.
- No CacheManager element is emitted.
- Edge-case coverage exists for HAR import and basic sampler formatting; fewer tests cover filter, redirect, and assertion fallback paths.

## 4. Scope

### In Scope

| Item | Description |
|------|-------------|
| CacheManager | Optional CacheManager under ThreadGroup to control JMeter client-side caching behaviour |
| JSON PostProcessor | JSON Path extractor for dynamic parameter handling in JSON response bodies |
| Regular Expression Extractor | Regex extractor for response-body / header pattern matching |
| DurationAssertion | Per-sampler response-time assertion for timing validation |
| Edge-case tests | Expand test coverage for malformed URLs, large payloads, special characters, empty bodies, missing headers |
| JMX limitations doc | Document known structural constraints (hashTree ordering, element aliases, JMeter-version compatibility) |

### Out of Scope

| Item | Reason |
|------|--------|
| Backend upload flows | Delivery remains local-only (`007-jmx-backend-upload`) |
| XPath or Boundary extractors | Not requested; JSON and regex cover the dominant use cases |
| Transaction controllers | Out of scope for serializer hardening; separate recording feature |
| Playwright generator changes | 013 is JMX-only |

## 5. Detailed Requirements

### 5.1 CacheManager

- **Element:** JMeter `CacheManager` under the ThreadGroup `hashTree`.
- **Configurability:** Controlled by `JmxSerializerOptions.cacheEnabled: boolean`.
- **Defaults:** `false` (disabled) for backward compatibility.
- **Fields to control:**
  - `clearEachIteration` — whether the cache is cleared between loop iterations.
  - `maxNumberOfResults` — bounded cache size.
- **Location:** `src/jmx/element-model.ts` factory + serializer; `src/jmx/serializer.ts` document outline.

### 5.2 JSON PostProcessor

- **Element:** JMeter `JSONPostProcessor` with JSON Path expressions.
- **Trigger:** Produced when a response body is detected as JSON (content-type contains `application/json`) and an extractor is configured.
- **Parameters:**
  - `JSONPostProcessor.referenceNames` — comma-separated variable names.
  - `JSONPostProcessor.jsonPathExpressions` — matching JSON path expressions.
  - `JSONPostProcessor.defaultValues` — fallback values (empty string by default).
  - `match_numbers` — first match by default.
- **Configurability:** Added to `JmxSerializerOptions.extractors: SerializerExtractor[]`.
- **Persistence:** Extractor definitions are stored in `JmxOptionsStore` (or a dedicated substore) so they apply across export sessions.

### 5.3 Regular Expression Extractor

- **Element:** JMeter `RegexExtractor`.
- **Parameters:**
  - `RegexExtractor.refname` — variable name.
  - `RegexExtractor.regex` — Java-compatible regular expression.
  - `RegexExtractor.template` — `$1$` default.
  - `RegexExtractor.default` — fallback when no match.
  - `RegexExtractor.match_number` — which match to use (1 = first).
- **Configurability:** Same `JmxSerializerOptions.extractors` list.
- **Validation:** Regex strings are validated at compile time; invalid patterns block save with an inline error.

### 5.4 DurationAssertion

- **Element:** JMeter `DurationAssertion` under each sampler `hashTree`.
- **Trigger:** When `JmxSerializerOptions.durationAssertion.enabled` is `true`.
- **Parameters:**
  - `DurationAssertion.duration` — threshold in milliseconds.
- **Configurability:**
  - `enabled: boolean`
  - `thresholdMs: number` (> 0)
- **Combination:** Renders alongside ResponseAssertion; both can be enabled simultaneously.

### 5.5 Edge-Case Test Coverage

Expand unit and integration tests for:

| Edge case | Coverage area |
|-----------|---------------|
| Malformed response bodies (invalid JSON for extractor) | `serializer.test.ts` — extractor factory returns no extractor or error token |
| Empty response body | `serializer.test.ts` — extractor omitted when body is empty |
| Bodies with special characters / CDATA requirements | `serializer.test.ts` — special chars escaped in XML string props |
| Large payloads (> 1 MB) | `serializer.test.ts` — JMX string length and performance |
| Extremely long URL (> 8 KB) | `serializer.test.ts` — no truncation or injection |
| Missing headers / empty header maps | `serializer.test.ts` — no empty `<elementProp>` emitted |
| `recordCookies` toggle with conflicting headers | `serializer.test.ts` — Cookie header moves between HeaderManager and CookieManager |
| Redirect + User-Agent override interaction | `serializer.test.ts` — UA header appears on original + follow-up samplers |
| Service-worker restart with persisted advanced options | `traffic-capture.test.ts` / `recorder-service.test.ts` — options reload correctly |

## 6. Known JMX Structure Limitations

These constraints are documented to prevent future regressions and to help integrators diagnose import failures.

### L1 — hashTree ordering is strict

Every non-leaf element in a ThreadGroup must be followed by a child `<hashTree/>` before the next sibling element. The correct sequence is:

```xml
<ThreadGroup>...</ThreadGroup>
<hashTree>
  <ConfigTestElement>...</ConfigTestElement>
  <hashTree/>
  <CookieManager>...</CookieManager>
  <hashTree/>
  <HTTPSamplerProxy>...</HTTPSamplerProxy>
  <hashTree/>
  <ResponseAssertion>...</ResponseAssertion>
  <hashTree/>
  <DurationAssertion>...</DurationAssertion>
  <hashTree/>
  <JSONPostProcessor>...</JSONPostProcessor>
  <hashTree/>
  <RegexExtractor>...</RegexExtractor>
  <hashTree/>
</hashTree>
```

Violation causes `ClassCastException: ... cannot be cast to class org.apache.jorphan.collections.HashTree` in JMeter 5.x.

### L2 — element tag names must match JMeter's `saveservice.properties`

- Use `<ConfigTestElement>` (not `<HTTPRequestDefaults>`).
- Use `<CookieManager>` (not `<Cookie>` as a top-level).
- Incorrect tags fail to load because JMeter has no class alias for non-standard names.

### L3 — JMeter-version compatibility

- The generated attributes (`version="1.2" properties="5.0" jmeter="5.6.3"`) assume JMeter 5.2+. Older JMeter versions may reject the `jmeter` attribute or property set.
- `DurationAssertion` is supported since JMeter 2.13; `JSONPostProcessor` is supported since JMeter 3.0 (via JSON Path library bundled with JMeter).
- `RegexExtractor` has been supported since JMeter 1.x and uses Java regular expression syntax.

### L4 — empty child elements

JMeter ignores empty parent elements that lack `<hashTree/>`. For example, an empty CookieManager without its child hashTree may be silently discarded or shift sibling ordering.

### L5 — CDATA for bodies containing entities

Response bodies that include `&`, `<`, or `>` must be wrapped in `<stringProp><![CDATA[...]]></stringProp>` to prevent invalid XML.

## 7. Configuration Storage

New options added to the existing serializer and JMX-options stores:

```typescript
export interface JmxSerializerOptions {
  thinkTime?: { enabled: boolean; randomize: boolean; rangePercent: number }
  assertion?: { enabled: boolean; expectStatus: number }
  durationAssertion?: { enabled: boolean; thresholdMs: number }
  recordCookies?: boolean
  userAgent?: UserAgentId
  cacheEnabled?: boolean
  extractors?: SerializerExtractor[]
}

export interface SerializerExtractor {
  type: 'json' | 'regex'
  refName: string
  expression: string
  defaultValue?: string
  matchNumber?: number
  template?: string
}
```

## 8. Implementation Modules

| Module | Responsibility |
|--------|----------------|
| `src/jmx/element-model.ts` | Add factories for `createCacheManager`, `createJSONPostProcessor`, `createRegexExtractor`, `createDurationAssertion`; add serializers for each |
| `src/jmx/serializer.ts` | Apply new options in `buildJmx()` document outline |
| `src/jmx/serializer.test.ts` | Add tests for new element rendering, hashTree ordering, edge cases |
| `src/options/jmx-options.ts` | Persist new fields in `JmxOptionsStore` |
| `src/options/options.html` | Add UI controls for CacheManager, DurationAssertion, extractors |
| `src/options/options.ts` | Wire new UI controls to options store |
| `src/options/options.test.ts` | Test UI wiring |

## 9. Acceptance Criteria

### AC1 — CacheManager is emitted when enabled

Given `cacheEnabled=true`:

- Generated JMX contains a `CacheManager` element under the ThreadGroup `hashTree`.
- `clearEachIteration` and `maxNumberOfResults` reflect stored values.

### AC2 — DurationAssertion gates slow responses

Given `durationAssertion.enabled=true` and `durationAssertion.thresholdMs=5000`:

- Each sampler `hashTree` contains a `DurationAssertion` with duration `5000`.
- JMeter fails the sample when response time exceeds 5 seconds.

### AC3 — JSON extractor captures values from JSON bodies

Given a response body `{"token":"abc","id":42}` and a JSON extractor `refName=token, jsonPathExpressions=$.token`:

- Generated JMX contains a `JSONPostProcessor` with `referenceNames=token` and `jsonPathExpressions=$.token`.
- Running the JMX stores `${token}` = `abc` in JMeter variables.

### AC4 — Regex extractor captures groups from matched text

Given a response body `Order #12345 shipped` and a regex extractor `refName=orderId, regex=Order #(\d+)`:

- Generated JMX contains a `RegexExtractor` with `refname=orderId` and `regex=Order #(\d+)`.
- Running the JMX stores `${orderId}` = `12345`.

### AC5 — Edge-case inputs do not crash JMeter import

Given malformed bodies, empty strings, large payloads, and special characters:

- Exported JMX is valid XML.
- JMeter imports without `ClassCastException` or SAX errors.
- No empty `<elementProp>` nodes are emitted.

### AC6 — Existing flows remain unaffected

Given advanced options are left at defaults:

- JMX export produces output identical to pre-013 behaviour.
- No CacheManager, extractor, or additional assertions are emitted.

## 10. Testing Strategy

### Unit Tests

- `src/jmx/element-model.test.ts` — new factories and serializers for CacheManager, DurationAssertion, JSONPostProcessor, RegexExtractor.
- `src/jmx/serializer.test.ts` — integration of new elements into document outline; hashTree ordering; empty-element suppression.
- `src/options/options.test.ts` — UI controls for new options.

### Edge-Case Tests

- Bodies with XML/HTML entities, empty bodies, 1 MB+ payloads, binary content.
- URLs near JMeter's 8 KB limit.
- Concurrent extractor definitions (multiple JSON path + regex targets).
- Invalid regex patterns blocked at save time.

### Integration / E2E

- Golden JMX fixture updated for a plan exercising all new elements.
- `npx playwright test` passes headless and headless:false runs.

## 11. Risks and Considerations

### R13.1 — JSON path library version

JMeter's bundled JSON Path implementation may differ from external libraries. Integration should target the JMeter-bundled syntax to ensure imported plans run without extra plugins.

### R13.2 — Regex engine escaping

Java regex syntax differs slightly from JavaScript. The clear-text regex string stored in Chrome options is passed verbatim to JMeter; no JS-to-Java translation should be attempted.

### R13.3 — Performance with many extractors

Large numbers of extractors increase JMeter thread memory footprint. Default configurations should recommend a bounded set; the UI should warn when > 10 extractors are configured.

## 12. Dependencies

| Spec | Dependency Type |
|------|-----------------|
| 009-jmx-export-quality | Provides base ResponseAssertion, CookieManager, and timer infrastructure |
| 010-advanced-recorder-options | Provides User-Agent override, URL/resource filtering, and CookieManager toggle |
| 012-external-har-import | Provides HAR validation patterns and domain filtering UI |

## 13. Sequencing Notes

Implement in the following order to minimise regression risk:

1. Element-model factories and serializers (no UI dependency).
2. HashTree-ordering tests for new elements (fail-first).
3. Integrate new elements into `buildJmx()`.
4. Options-page UI wiring.
5. Edge-case test expansion.
6. Documentation update.

This spec should be implemented after `010-advanced-recorder-options` is stable, because the options-page patterns, storage helpers, and serializer integration points are established by 010.

## 14. Implementation Progress

| Action | Status | Notes |
|--------|--------|-------|
| 013-A1 | ⏳ Planned | `src/jmx/element-model.ts` — add factories and serializers for CacheManager, DurationAssertion, JSONPostProcessor, RegexExtractor |
| 013-A2 | ⏳ Planned | `src/jmx/serializer.ts` — integrate new elements into `buildJmx()` document outline |
| 013-A3 | ⏳ Planned | `src/jmx/serializer.test.ts` — hashTree ordering, element rendering, empty-element suppression |
| 013-A4 | ⏳ Planned | `src/jmx/serializer.test.ts` — edge-case tests (malformed body, large payload, special characters, empty headers) |
| 013-A5 | ⏳ Planned | `src/options/jmx-options.ts` — persist `cacheEnabled`, `durationAssertion`, `extractors` |
| 013-A6 | ⏳ Planned | `src/options/options.html` / `options.ts` — UI controls for CacheManager, DurationAssertion, extractor definitions |
| 013-A7 | ⏳ Planned | `src/options/options.test.ts` — UI wiring tests |
| 013-A8 | ⏳ Planned | Golden JMX fixture and E2E test update for new elements |
