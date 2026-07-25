# 016 - Client-Side JMX Validation Parser

Status: Implemented

## 1. Purpose

Add client-side validation for user-uploaded `.jmx` files. The extension already generates JMX (`src/jmx/serializer.ts`, `src/jmx/element-model.ts`) and imports HAR (`src/jmx/har-to-jmx.ts`, `012-external-har-import`). This specification defines the complementary read path: parse an existing JMX document, validate it against layered rules (syntax, structure, semantics, best practices), and surface Passed / Warnings / Errors in the popup UI.

The implementation must **reuse existing JMX infrastructure** rather than create parallel validation modules. It builds on the XML sanitization completed in `015-improve-export-to-jmx` and the HAR validation patterns from `012`.

## 2. Context

Specs 006–015 established a typed, model-driven JMX pipeline:

- `src/jmx/serializer.ts` — `buildJmx()` emits well-formed JMeter XML and contains a development-only `assertJmxWellFormedInDom()` guard using `DOMParser`.
- `src/jmx/element-model.ts` — Typed interfaces for every JMeter element (`JmxTestPlan`, `JmxThreadGroup`, `JmxHTTPSampler`, etc.) and the `ELEMENT_HIERARCHY` map that defines valid parent→child nesting.
- `src/utils/xml-sanitizer.ts` — `sanitizeForXml()` strips XML 1.0 illegal characters.
- `src/jmx/har-to-jmx.ts` — `validateHar()` demonstrates the structured validation pattern used in this codebase: parse → check required fields → throw typed errors.
- `src/options/advanced-options.ts` — `ValidationResult { valid, error? }` is the standard validation return type across the extension.
- `src/popup/popup.ts` lines 550–633 — `handleImportHarFile()` establishes the canonical file-input → parse → validate → domain-selector → convert flow.

The new validator must fit this same architecture. It is not a generic JSON-rule engine applied to arbitrary XML.

## 3. Current State

- `src/jmx/element-model.ts` lines 658–706 — `ELEMENT_HIERARCHY` and `isValidElementNesting()` exist but are only consumed implicitly by the serializer. They are not exposed as a first-class validation API.
- `src/jmx/serializer.ts` lines 211–219 — `assertJmxWellFormedInDom()` is module-private and dev-only; it is the correct syntax-check implementation but not reusable yet.
- `src/options/advanced-options.ts` lines 62–65 — `ValidationResult` is used for filter-pattern, resource-type, and user-agent validation but lacks `warnings` and `info` arrays.
- `src/popup/popup.html` lines 64–97 — HAR import section provides a template for a parallel JMX validation section.
- `src/messages.ts` lines 15–30 — `BackgroundRequest` union has no `VALIDATE_JMX` member.
- `src/background/recorder-service.ts` — `RecorderService` handles `IMPORT_HAR` but has no JMX validation entry point.

## 4. Scope

### In Scope

| Item | Description |
|------|-------------|
| JMX file selection | File input accepting `.jmx` files in popup |
| Syntax validation | XML well-formedness via `DOMParser` (reuse `assertJmxWellFormedInDom` pattern) |
| Structural validation | Required elements (`jmeterTestPlan`, `TestPlan`, `ThreadGroup`), required properties (`num_threads`, `ramp_time`) |
| Nesting validation | Cross-reference `ELEMENT_HIERARCHY` for every nested element |
| Semantic validation | Common pitfalls: empty plan name, zero threads, missing sampler path/method, unknown method, missing domain, deprecated tags |
| Best-practice warnings | Think-time presence, assertion count, loop count, CSV filename |
| Popup UI | Results panel with Passed / Warnings / Errors counts and per-message remediation |
| Test coverage | Unit tests with JMX fixtures; E2E test for file-upload flow |

### Out of Scope

| Item | Reason |
|------|--------|
| Background message round-trip | Deferred. Validation runs in the popup where `DOMParser` is available. A future server-side fallback can add the `VALIDATE_JMX` message type when needed. |
| Configurable rule categories / severity | Deferred. Ship with a fixed rule set. Add toggleable categories only if users request it. |
| JMX editing / auto-fix | Validation only; no mutation or repair of uploaded files |
| XSD / XPath validation | JMeter has no published XSD; validation is heuristic based on `ELEMENT_HIERARCHY` and known element patterns |

## 5. Detailed Requirements

### 5.1 File Selection and Parsing

**UI placement:** New "Validate JMX file" section in `src/popup/popup.html`, placed below the existing "Import HAR file" section. Reuses the same CSS classes (`card`, `card-header`, `muted`, `field`, `error`) so no new styles are needed.

**File input contract:**

- Accepts `.jmx` extension and `application/xml` MIME type.
- Empty selection or zero-byte files are rejected immediately with inline error.
- File content is read via `file.text()` and validated entirely in the popup.

**Client-side guard:** The popup performs an immediate `DOMParser.parseFromString(jmx, 'text/xml')` check for `parsererror` before running rules. This avoids wasted work on trivially malformed files.

### 5.2 Syntax Validation (Layer 1)

The validator parses the file with `new DOMParser().parseFromString(jmx, 'text/xml')` and checks for `parsererror`. If present, return an error and stop. Extract the existing pattern from `src/jmx/serializer.ts` lines 211–219 into a reusable `validateJmxSyntax()` helper.

No structural or semantic rules run for malformed XML.

### 5.3 Structural Validation (Layer 2)

Use the existing `ELEMENT_HIERARCHY` map from `src/jmx/element-model.ts` lines 658–706 and the `isValidElementNesting()` function. The validator must check:

**Root elements:**

- `<jmeterTestPlan>` exists.
- `<TestPlan>` exists inside `<jmeterTestPlan>`, traversing through `<hashTree>` wrapper elements.
- At least one `<ThreadGroup>` exists inside `<TestPlan>`, traversing through `<hashTree>` wrappers.

**Required properties:**

- Each `<ThreadGroup>` has `<stringProp name="ThreadGroup.num_threads">` with a parseable positive integer.
- Each `<ThreadGroup>` has `<stringProp name="ThreadGroup.ramp_time">` with a parseable non-negative integer.
- Each `<HTTPSamplerProxy>` has a non-empty `<stringProp name="HTTPSampler.path">` (string, not integer).
- Each `<HTTPSamplerProxy>` has `<stringProp name="HTTPSampler.method">` with a valid HTTP method.

**Nesting validation:**

- Walk every element with a `testclass` attribute, traversing through `<hashTree>` wrapper elements.
- Cross-reference each element against `ELEMENT_HIERARCHY`.
- Report errors for disallowed nesting (e.g., `HTTPSamplerProxy` appearing directly under `TestPlan`, meaning no `ThreadGroup` intervenes).

### 5.4 Semantic and Best-Practice Rules

Implement plain typed functions that inspect parsed element properties. No generic rule-engine framework is needed for a fixed set of checks.

| Rule ID | Severity | Check |
|---------|----------|-------|
| `empty-plan-name` | warning | `<stringProp name="TestPlan.name">` is empty |
| `zero-threads` | error | `ThreadGroup.num_threads` is `0` |
| `high-thread-count` | warning | `num_threads` exceeds `5000` |
| `missing-path` | error | `<HTTPSamplerProxy>` has empty `<stringProp name="HTTPSampler.path">` |
| `missing-method` | error | `<HTTPSamplerProxy>` has empty `<stringProp name="HTTPSampler.method">` |
| `unknown-method` | warning | Method is not one of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` |
| `missing-domain-protocol` | warning | `<HTTPSamplerProxy>` has both `HTTPSampler.domain` and `HTTPSampler.protocol` empty |
| `deprecated-tag` | error | Element tag name does not match any known JMeter alias for the element's `testclass` value (example: `<HTTPRequestDefaults>` is not a valid alias for `org.apache.jmeter.config.ConfigTestElement`) |
| `no-assertions` | info | ThreadGroup contains zero `<ResponseAssertion>` or `<DurationAssertion>` elements |
| `no-think-time` | info | ThreadGroup contains zero timer elements (`ConstantTimer`, `UniformRandomTimer`, etc.) |
| `high-loop-count` | warning | Loop count exceeds `1000` |
| `missing-csv-filename` | error | `<CSVDataSet>` exists but `<stringProp name="filename">` is empty |

### 5.5 Validation Result Types

```typescript
export type ValidationSeverity = 'error' | 'warning' | 'info'

export interface ValidationMessage {
  severity: ValidationSeverity
  ruleId: string
  element?: string
  message: string
  remediation?: string
}

export interface ValidationReport {
  valid: boolean
  errors: ValidationMessage[]
  warnings: ValidationMessage[]
  info: ValidationMessage[]
}
```

`ValidationReport.valid` is `true` when `errors.length === 0`.

### 5.6 Rule Implementation

Implement each rule as a plain function that receives the parsed `Document` and returns `ValidationMessage[]`:

```typescript
function checkHighThreadCount(doc: Document): ValidationMessage[] {
  // ...
}
```

Collect results from each function into the final report. No `ValidationRule` interface, no category map, no registry pattern.

### 5.7 UI Integration

In `src/popup/popup.html`, add a new `<section>` below the existing HAR import card. Reuse the same CSS classes so no new styles are needed:

```html
<section id="validateJmxSection" class="card" aria-labelledby="validateJmxTitle">
  <div class="card-header">
    <h2 id="validateJmxTitle">Validate JMX file</h2>
  </div>
  <p class="muted" style="font-size: 12px; margin: 0 0 8px">
    Select a .jmx file to validate against common JMeter structure and best-practice rules.
    Processing is local; the file is never uploaded.
  </p>
  <div class="field">
    <label for="validateJmxFile">JMX file</label>
    <input id="validateJmxFile" type="file" accept=".jmx,application/xml" />
  </div>
  <div id="validateJmxError" class="error" aria-live="polite"></div>
  <div id="validateJmxResult" class="validation-result" aria-live="polite"></div>
</section>
```

In `src/popup/popup.ts`, implement `handleValidateJmxFile()` following the exact same pattern as `handleImportHarFile()` (lines 550–633):

- Empty/zero-byte guard.
- `DOMParser` syntax guard (`parsererror` check).
- Run validator on the parsed document.
- Render `ValidationReport` with severity-colored badges.
- On failure, show `validateJmxError.textContent`.

### 5.8 Message Contract (Future Extension)

Reserve a `VALIDATE_JMX` message type in `src/messages.ts` for future server-side fallback:

```typescript
export type BackgroundRequest =
  | { type: 'VALIDATE_JMX'; jmx: string }

export type BackgroundResponse =
  | { success: true; validation: ValidationReport }
  | { success: false; error: string }
```

**Do not implement the background handler in v1.** The popup performs all validation locally.

## 6. Architecture

### 6.1 Data Flow

```
User-selected .jmx file
  → file.text() (popup)
  → client-side DOMParser syntax guard
  → JMXValidator.validate(jmx, rules) runs structure, semantic, and best-practice checks
  → ValidationReport returned to popup
  → Popup renders Passed / Warnings / Errors with remediation
```

No background message hop. No service-worker round-trip. The popup owns the entire flow because `DOMParser` is available there and all validation is CPU-bound DOM walking.

### 6.2 Reuse Contract

| Existing Asset | How the Validator Reuses It |
|----------------|-----------------------------|
| `src/jmx/element-model.ts` — `ELEMENT_HIERARCHY` | Cross-reference every parsed element's parent→children relationship |
| `src/jmx/element-model.ts` — `isValidElementNesting()` | Call directly in structural rules |
| `src/jmx/element-model.ts` — `Jmx*` interfaces | Type the element property readers in rule functions |
| `src/jmx/serializer.ts` — `assertJmxWellFormedInDom()` pattern | Export or extract as `validateJmxSyntax()` so the validator can reuse it |
| `src/utils/xml-sanitizer.ts` — `sanitizeForXml()` | Reuse if the validator normalizes text content before comparison |
| `src/jmx/har-to-jmx.ts` — `validateHar()` | Pattern reference for structured validation error messages |
| `src/options/advanced-options.ts` — `ValidationResult` | Extend into `ValidationMessage` and `ValidationReport` |
| `src/popup/popup.ts` — `handleImportHarFile()` | Mirror file-input, guard, error-display, and state-clear pattern |

## 7. Implementation Modules

| Module | Responsibility |
|--------|----------------|
| `src/jmx/validator.ts` | New. `JMXValidator` class with `validate(jmx: string): ValidationReport`; typed rule functions for syntax, structure, semantic, and best-practice checks |
| `src/jmx/validator.test.ts` | New. Unit tests with inline JMX strings for each rule category |
| `src/messages.ts` | Modify. Reserve `VALIDATE_JMX` types (no handler implemented in v1) |
| `src/popup/popup.html` | Modify. Add JMX validation section markup |
| `src/popup/popup.ts` | Modify. Add `handleValidateJmxFile()` and result rendering |
| `src/popup/popup.test.ts` | Modify. Add tests for file input, validation flow, and error surface |

### 7.1 DOM Elements (new)

| Element ID | Type | Description |
|------------|------|-------------|
| `validateJmxFile` | `input[type="file"]` | File input for JMX selection |
| `validateJmxSection` | `section` | Container for validation UI |
| `validateJmxError` | `div` | Inline error message display |
| `validateJmxResult` | `div` | Validation report render target |

## 8. Acceptance Criteria

### AC1 — User can select and validate a JMX file

Given the popup is open:

- User sees a "Validate JMX file" section.
- User can select a `.jmx` file.
- Empty or zero-byte files show an inline error without parsing.
- Valid files proceed to validation.

### AC2 — Syntax errors are reported

Given a JMX file with unclosed tags or invalid XML:

- The validator returns `valid: false` with at least one `error` severity `ValidationMessage`.
- The popup displays the error and a remediation hint (e.g., "Fix XML well-formedness before import").
- No structural or semantic rules are run for malformed XML.

### AC3 — Structural rules use existing element hierarchy

Given a valid JMX with invalid nesting (e.g., `<HTTPSamplerProxy>` directly under `<TestPlan>`):

- The validator reports an `error` referencing the offending element path.
- The validation uses `isValidElementNesting()` against `ELEMENT_HIERARCHY`, ensuring generation and validation stay aligned.

### AC4 — All fixed rules run without configuration

Given a valid JMX with one warning and one info:

- The validator returns `valid: true` (warnings and info do not fail validation).
- The report contains `errors`, `warnings`, and `info` arrays populated according to the fixed rule set in §5.4.
- No options-page toggles exist in v1.

### AC5 — Background message type is reserved but unused

Given the implementation is complete:

- `src/messages.ts` exports `VALIDATE_JMX` in `BackgroundRequest` for future use.
- `src/background/recorder-service.ts` has no `VALIDATE_JMX` handler.
- No new permissions are required.

### AC6 — Existing flows remain unaffected

Given recorded traffic and HAR import:

- `EXPORT_JMX` and `IMPORT_HAR` flows behave identically to pre-016 behaviour.
- `npm test` and `npm run typecheck` pass without modification to existing modules.

## 9. Testing Strategy

### Unit Tests

| File | Coverage |
|------|----------|
| `src/jmx/validator.test.ts` (new) | Syntax check on malformed XML; root-element presence; required property checks; `ELEMENT_HIERARCHY` nesting violations; each semantic rule; best-practice warnings |
| `src/popup/popup.test.ts` (extend) | `handleValidateJmxFile()`: empty file, malformed XML, valid JMX with warnings/info, error rendering |

### JMX Test Fixtures

Create small JMX strings inline in tests (do not ship fixture files) for speed:

- `valid-minimal` — `TestPlan` → `ThreadGroup` → single `HTTPSamplerProxy` with correct `hashTree`.
- `invalid-xml` — missing closing tag.
- `missing-threadgroup` — `TestPlan` with no `ThreadGroup`.
- `invalid-nesting` — `HTTPSamplerProxy` directly under `TestPlan`.
- `high-threads` — `num_threads > 5000`.

### Integration / E2E

- Add E2E test in `tests/e2e/` that loads the popup, selects a fixture JMX file, and asserts the validation result renders with the correct severity counts.
- Ensure E2E runs with `headless: false` (required for Chrome extension testing, per `012-external-har-import`).

## 10. Risks and Considerations

### R16.1 — Large JMX files and memory

`DOMParser` allocates a DOM proportional to file size. For JMX files above 5 MB the popup parse may freeze the UI thread. Document a recommended size limit. For v1, show a warning for files above the limit. Chunked parsing is not feasible for XML DOM and is deferred.

### R16.2 — Rule complexity drift

Unconstrained addition of rules turns the validator into a JMeter linter with unbounded scope.

**Mitigation:** This spec ships with exactly the rules listed in §5.4. Additional rules require a new spec or an explicit change to this document.

### R16.3 — `ELEMENT_HIERARCHY` completeness

The existing map in `element-model.ts` covers the elements this extension generates. It may not cover every JMeter element a user can upload (e.g., `IfController`, `TransactionController`, `JDBCSampler`).

**Mitigation:** Unknown elements are treated as leaf nodes with no nesting constraint. Only elements present in `ELEMENT_HIERARCHY` are validated for parent→child legality. This prevents false positives on valid JMX files that use elements outside this project's serializer scope.

## 11. Dependencies

| Spec | Dependency Type |
|------|-----------------|
| 012-external-har-import | Provides file-input pattern, domain-selector UI style, and `ValidationResult`-like error handling in popup |
| 013-jmx-output-hardening | Provides `ELEMENT_HIERARCHY`, `isValidElementNesting()`, and typed `Jmx*` interfaces that the validator cross-references |
| 015-improve-export-to-jmx | Provides `assertJmxWellFormedInDom()` implementation pattern and `sanitizeForXml()` |

## 12. Sequencing Notes

Implement in the following order to minimize regression risk:

1. Export `assertJmxWellFormedInDom()` from `src/jmx/serializer.ts` (or extract a shared `validateJmxSyntax()` helper) so the validator can reuse it.
2. Create `src/jmx/validator.ts` with syntax, structure, semantic, and best-practice rules.
3. Wire popup UI (`popup.html`, `popup.ts`) file-input and result rendering.
4. Add unit tests in `src/jmx/validator.test.ts` and extend `src/popup/popup.test.ts`.
5. Run full suite (`npm test && npm run typecheck && npm run lint && npm run build`).

This spec should be implemented after `015-improve-export-to-jmx` is stable, because the exported XML validation function and `sanitizeForXml()` boundaries are established by 015.

## 13. Implementation Progress

| Action | Status | Notes |
|--------|--------|-------|
| 016-A1 | Completed | `src/jmx/serializer.ts` — `validateJmxSyntax()` was already exported; no extraction needed |
| 016-A2 | Completed | `src/jmx/validator.ts` — `JMXValidator` with syntax, structure, semantic, and best-practice rule functions |
| 016-A3 | Completed | `src/jmx/validator.test.ts` — 21 unit tests covering all rule categories using inline JMX strings |
| 016-A4 | Completed | `src/messages.ts` — `VALIDATE_JMX` reserved in `BackgroundRequest` / `BackgroundResponse` |
| 016-A5 | Completed | `src/popup/popup.html` — JMX validation section markup added |
| 016-A6 | Completed | `src/popup/popup.ts` / `src/popup/jmx-validation.ts` — validation wiring extracted to dedicated module; `initJmxValidation()` wired in popup |
| 016-A7 | Completed | `src/popup/popup.test.ts` — 7 new tests for mode visibility, file parsing, and error surface |
| 016-A8 | Completed | `tests/e2e/spec-016-jmx-validation.spec.ts` — E2E test added mirroring spec-012 pattern |
| 016-B1 | Completed | Removed dead `DOMParser` environment guard from `JMXValidator.validate()` |
| 016-B2 | Completed | Replaced `innerHTML` with `textContent` + `document.createElement('strong')` in `renderValidationResult` |
| 016-B3 | Completed | Extracted `checkThreadGroupContent()` helper for assertion/timer checks |
| 016-C1 | Completed | Fixed `ELEMENT_HIERARCHY` to include `ConfigTestElement` as valid child of `ThreadGroup` and `TestPlan`, resolving false positive `invalid-nesting` error |
| 016-C2 | Completed | Fixed `missing-domain-protocol` to skip warning when `ConfigTestElement`/`HTTPRequestDefaults` provides inherited domain/protocol values |
| 016-C3 | Completed | Fixed `empty-plan-name` to check `testname` attribute when `TestPlan.name` stringProp is absent |

## 14. Review

### 14.1 Completed Improvements

| Improvement | Impact | Status |
|-------------|--------|--------|
| **Dead DOMParser guard removed** | Eliminated unreachable branch in `JMXValidator.validate()`; `syntaxErrorMessages` + `new DOMParser()` already cover unsupported environments. | Completed |
| **`innerHTML` → `textContent`** | Removed XSS risk surface in `renderValidationResult` by using safe DOM construction (`createElement('strong').textContent`). | Completed |
| **`checkThreadGroupContent` helper** | Reduced duplication in semantic rule layer; `checkNoAssertions` and `checkNoThinkTime` now delegate to shared helper. | Completed |
| **JMX validation wiring extracted** | Moved validation DOM refs, event binding, and rendering from `popup.ts` (1394 → 1316 lines) into `src/popup/jmx-validation.ts`, keeping popup as wiring-only. | Completed |
| **E2E test added** | `spec-016-jmx-validation.spec.ts` exercises file upload → validation → DOM rendering for both valid and malformed JMX. | Completed |
| **`ConfigTestElement` added to `ELEMENT_HIERARCHY`** | `ConfigTestElement` (XML tag for `HTTPRequestDefaults`) is now recognised as a valid child of `ThreadGroup` and `TestPlan`, eliminating false-positive `invalid-nesting` errors on real-world JMX files. | Completed |
| **`missing-domain-protocol` inheritance check** | Samplers that inherit domain/protocol from a parent `HTTPRequestDefaults`/`ConfigTestElement` are no longer flagged. | Completed |
| **`empty-plan-name` attribute fallback** | `TestPlan` elements that set their name via the `testname` attribute (without a `TestPlan.name` stringProp) are no longer flagged as having an empty name. | Completed |
| **Fixed e2e test for malformed XML** | `spec-016-jmx-validation.spec.ts` malformed-XML test now checks `#validateJmxResult` (where validation errors render) instead of `#validateJmxError` (only populated by exceptions during `file.text()`). | Completed |

### 14.2 Complexity Analysis

- **crap4js**: 0 functions at high risk, 0 at moderate risk.
- **dry-4-js**: 10 duplicate pairs found in the codebase. None are introduced by 016. The two validator duplicates flagged (`checkZeroThreads`/`checkHighThreadCount` loop pattern, `checkNoAssertions`/`checkNoThinkTime` wrapper pattern) are intentional and differ in condition/logic; extracting `checkThreadGroupContent` resolved the direct assertion/timer duplication.

### 14.3 Verification

| Check | Result |
|-------|--------|
| `npx vitest run` | 431 tests passed (24 files) |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Pass (eslint + prettier) |
| `npm run build` | Pass (vite production build) |
| `npm run crap` | Pass (0 high/moderate risk) |
| `npm run dry` | Pass (no new duplicates introduced) |

## 15. Next Steps

No further implementation steps required per current spec boundaries. Future work:

1. **Background fallback (optional):** If users need server-side validation for large JMX files, implement the existing `VALIDATE_JMX` handler stub in `recorder-service.ts` to run the same rules off the main thread.
2. **Configurable rule toggles (optional):** If users request toggleable categories, add section toggles in the popup rather than overhauling the rule engine.

## 15. Open Questions

| Question | Decision Owner | Status |
|----------|---------------|--------|
| Should `missing-domain-protocol` also check for an empty protocol, or is an empty domain with explicit protocol acceptable? | Engineering | Open |
| Should `deprecated-tag` maintain an explicit allowlist of JMeter 5.x tag aliases, or derive from the local `ELEMENT_HIERARCHY` keys? | Engineering | Open |
| Should `unknown-method` be case-insensitive (JMeter normalizes to uppercase)? | Engineering | Open |
| Should the popup disable the file input while parsing to prevent double-submit? | Product | Open |
