# 009 - JMX Export Quality

## 1. Purpose

This specification defines targeted improvements to the JMX export functionality of the Capultura MV3 Chrome Extension. It focuses on increasing the **correctness**, **editability**, and **practical usefulness** of the generated JMX files for real-world JMeter usage.

It builds directly upon the foundation laid in `006-enhance-jmx-implementation.md` and coordinates with permission and recording changes in `008-extension-permissions-refresh.md`.

## 2. Scope

### In Scope (Core G20 JMX Quality Items)
- Fix `postBodyRaw` flag by HTTP method
- Fix error-request method defaulting to GET
- Add support for think-time timers
- Add basic response assertions
- Improve cookie handling using `CookieManager`
- Implement redirect deduplication logic
- Improve query parameter serialization as `HTTPArgument` elements

### Out of Scope
- Enterprise backend upload path (G1/G2)
- Full transaction grouping / extractors / advanced timers
- Major UI redesigns
- New recording permissions or core recorder features (belongs in 010+)
- Playwright/Selenium compatibility shims

## 3. Current State

- `src/jmx/serializer.ts` provides basic `HTTPSamplerProxy`, `HeaderManager`, and CDATA body support.
- Several correctness and idiomatic JMeter issues remain.
- Generated JMX files require manual fixes in JMeter for many common scenarios.

## 4. Detailed Requirements

### 4.1 postBodyRaw Semantics
- Set `HTTPSampler.postBodyRaw = true` **only** for methods that support a request body.
- **Should be true**: `POST`, `PUT`, `PATCH`, `DELETE` (with body)
- **Should be false**: `GET`, `HEAD`, `OPTIONS`, `TRACE`
- Affects: `src/jmx/serializer.ts`

### 4.2 Error Request Method Fix
- When a request fails before full metadata is captured, preserve the original HTTP method instead of defaulting to `GET`.
- Primary location: `src/background/traffic-normalizer.ts` + `createErrorRequest` logic.

### 4.3 Think-Time Timers
- Export recorded think times between requests as JMeter timers.
- Prefer `ConstantTimer` by default, with support for `UniformRandomTimer` when "Randomize recorded think times" is enabled.
- Make timer generation configurable via `JmxOptionsStore`.
- Locations: `src/options/jmx-options.ts`, `src/jmx/serializer.ts`

### 4.4 Response Assertions
- Generate basic assertions for common cases:
  - `ResponseAssertion` for status code (e.g. `200`)
  - `DurationAssertion` for response time thresholds (optional)
- Provide an option in Advanced Options to enable/disable assertion generation.
- Locations: `src/options/jmx-options.ts`, `src/jmx/serializer.ts`

### 4.5 CookieManager Support
- Extract `Cookie` / `Cookie2` headers into a dedicated `CookieManager` element under the ThreadGroup.
- Decide between **additive** (keep in HeaderManager too) vs **breaking** (remove from HeaderManager).
- Recommended: Additive initially for safety.
- Location: `src/jmx/serializer.ts`

### 4.6 Redirect Deduplication
- Collapse redirect chains (3xx responses + follow-up request) into a single sampler with `follow_redirects=true`.
- Provide an Advanced Option: "Deduplicate Redirects".
- Locations: `src/background/traffic-normalizer.ts`, `src/jmx/serializer.ts`

### 4.7 Query Parameter Serialization
- Use parsed `queryParams` from `CapturedRequest` to generate `HTTPArgument` entries inside the sampler.
- This makes query parameters individually editable in JMeter GUI.
- Location: `src/jmx/serializer.ts` + `src/models/captured-request.ts`

## 5. Priority (Recommended)

| Priority | Item                              | Effort |
|----------|-----------------------------------|--------|
| P0       | postBodyRaw by method             | Low    |
| P0       | Error-request method fix          | Low    |
| P1       | CookieManager                     | Medium |
| P1       | Query parameter serialization     | Medium |
| P2       | Think-time timers                 | Medium |
| P2       | Basic response assertions         | Medium |
| P3       | Redirect deduplication            | High   |

## 6. Acceptance Criteria

- Generated JMX files open in JMeter 5.6+ without major warnings.
- `postBodyRaw` is set correctly per HTTP method.
- Failed requests preserve their original method.
- Cookies appear in a `CookieManager`.
- Query parameters are editable as individual arguments.
- Think times and assertions (when enabled) are present and functional.
- All new behavior is covered by unit tests with golden JMX fixtures where output is deterministic.
- No regression in existing basic export functionality.

## 7. Files Impacted

- `src/jmx/serializer.ts` (primary)
- `src/background/traffic-normalizer.ts`
- `src/models/captured-request.ts`
- `src/options/jmx-options.ts`
- `src/options/options.ts` / `options.html`
- Test files under `src/jmx/` and `src/background/`

## 8. Non-Functional Requirements

- Maintain full TypeScript strict compliance.
- Keep serialization logic pure and testable.
- Do not increase service worker blocking time significantly.
- Provide clear error messages / warnings in the popup for export issues.
- Ensure backward compatibility for existing JMX consumers where possible.

## 9. Success Definition

The exported JMX should feel professional and require minimal manual editing in JMeter, closely matching the quality expected from commercial recording tools.

---

**Status**: Draft  
**Depends on**: 006-enhance-jmx-implementation  
**Related**: 008-extension-permissions-refresh  
**Target Milestone**: Post-006 stabilization

---

## 10. Implementation audit findings (referenced from 008 post-delivery review)

This section records findings from a code-and-spec audit of the 008
implementation (`specs/008-extension-permissions-refresh.md`). The findings
are reproduced here because they directly affect the scope of 009. Items in
§13.4 are deferred to 009 as P0/P1 implementation work; the rest are
implementation gaps in 008 that should be tracked alongside 009 execution.

### 10.1 Surgical modification feasibility

The 008 pipeline is isolated to three pure-function entry points:
- `src/har/har-builder.ts:88` — `buildHar(requests: CapturedRequest[]): HAR`
- `src/jmx/har-to-jmx.ts:52` — `convertHarToJmx(har: HAR, meta: PlanMeta): string`
- `src/background/recorder-service.ts:257-286` — `buildJmxExportResponse(includedDomains)`

Each has a single responsibility and is covered by unit tests.

### 10.2 HAR builder correctness issues (008 implementation; affects 009 input quality)

- `src/har/har-builder.ts:95` — `req.body ?? req.responseBody ?? ''` conflates request and response bodies in the HAR representation.
- `src/har/har-builder.ts:97` — `bodySize: body.length` uses char length for both request and response; should use `responseBodySize` for response.
- `src/har/har-builder.ts:95` timestamp — empty string `""` does not fall back to `now` per spec §5.1.
- `response.cookies` always `[]`.
- `body.length` used for byte size (multi-byte UTF-8 incorrect).

### 10.3 HAR→JMX converter quality issues (008)

- `src/jmx/har-to-jmx.ts:60-61` — Response body drives sampler content.
- `src/jmx/har-to-jmx.ts:170` — Duplicate HAR type declarations.
- `src/jmx/har-to-jmx.ts:254-261` — Redundant lowercase checks.
- No per-entry validation; malformed URLs silently produce broken samplers.
- `TrafficModel.metadata` is computed but unused by `buildJmx`.

### 10.4 JMX Serializer issues (009 P0/P1 — these are 009's core work)

- `postBodyRaw` hardcoded `true` — **009 P0**. Should be method-aware.
- Query params embedded in `path` — **009 P0/P1**. Should be separate `HTTPArgument` entries.
- `responseBody` overrides `body` for sampler content — **009 P0**. Should use request body.
- Empty `HeaderManager` always rendered — should omit when empty.

### 10.5 Testing gaps in 008

- No golden JMX fixture for HAR→JMX path.
- `buildJmxExportResponse` has no unit tests (negative paths: empty domains, zero matches, serializer failures).

### 10.6 Popup download regression

- `src/popup/popup.ts:827-836` uses `<a>` click instead of `chrome.downloads.download()`. Fragile if popup closes before click.
