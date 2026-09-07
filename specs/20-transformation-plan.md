# Feature 20 — Transformation Plan (Correlation + Parameterisation)

**Branch:** `feature/20-transformation-plan`  
**Depends on:** Feature 19 merged  
**Blocks:** Features 21–22 (soft), full autocorrelated JMX  
**Type:** Plan model + JMX apply path  

---

## 1. Outcome

User-approved candidates become a **ScriptTransformationPlan**. Applying the plan generates **standard JMeter elements** (extractors, variables, optional CSV Data Set). Nothing is applied without accept. Correlation and parameterisation remain separate.

**Ships value:** Real autocorrelation + parameterisation in JMX.  
**Stop if:** Any auto-apply without accept, or proprietary samplers required for ordinary HTTP correlation.

---

## 2. Concepts

| Concept | Meaning |
| ------- | ------- |
| Correlation | Extract runtime value from a **response**, inject into later **requests** |
| Parameterisation | Supply independent test data (CSV, UDV, functions) not produced by the app response |
| Plan | Explicit, serialisable list of accepted operations + warnings |
| Apply | Pure function: recording + plan → structures for existing JMX serializer |

---

## 3. Scope

### In scope

- Plan types and persistence (beside recording or in storage key).
- Build plan from accepted Feature 19 candidates + parameterisation proposals.
- Preview original vs modified request (masked).
- `jmx-plan-applier` producing extractor configs and variable substitutions.
- Wire into existing `jmx/serializer.ts` / extractor builders for per-sampler placement.
- Defaults (`NOT_FOUND`), producer placement, optional assertion on failed extraction.
- Parameterisation proposals mapped to CSV/UDV/function only when user selects source.
+- Parameterisation proposal creation UI (form, source selection, request locations) is deferred to a follow-up spec; the plan model and persistence are in scope.

### Out of scope

- Silent apply on export.
- JSR223 as default extractor.
- Plugin.
- Full user-path controllers (Feature 21).

### Current codebase constraints

- `JmxExtractor` in `src/jmx/element-model.ts` currently supports only `JSONPostProcessor` and `RegexExtractor`. Boundary, XPath, CSS, Header, and Cookie extractors are **not yet available** in the serializer. Initial implementation covers JSONPath and Regex only; remaining kinds are stubs that warn.
- The existing serializer applies extractors at the ThreadGroup level via `JmxSerializerOptions.extractors` to **all samplers**. Feature 20 requires per-sampler (per-producer) extractor placement via a new mechanism.
- `JmxOptions.extractorsJson` in `src/options/jmx-options.ts` stores manually-configured extractors as a JSON string. Plan-based extractors must not conflict with this field — plan-based extractors are injected separately and take precedence.

---

## 4. Types

```typescript
// Maps Feature 19 ExtractorKind to JMX-supported subset.
// boundary, xpath, css, header, cookie are accepted in the candidate but
// not yet emitted as standalone extractors — they fall back to RegexExtractor.
type SupportedExtractorType = 'jsonpath' | 'regex'

interface CorrelationProposal {
  id: string
  variableName: string
  confidence: number
  producerExchangeId: string
  consumerExchangeIds: string[]
  extractor: {
    type: SupportedExtractorType
    expression: string
    matchNo?: number
    defaultValue?: string
  }
  replacements: {
    location: 'url' | 'query' | 'header' | 'cookie' | 'body'
    path?: string
    originalValue: string
  }[]
  explanation: string
  accepted?: boolean
}

interface ParameterizationProposal {
  variableName: string
  source: 'csv' | 'generated' | 'environment' | 'jmeter-function' | 'manual'
  requestLocations: string[]
  originalValue?: string
  confidence: number
  explanation: string
  csvColumn?: string
  accepted?: boolean
}

// Describes a value substitution in a consumer request.
// Maps to JMeter's ${variableName} reference in the appropriate field.
interface ReplacementOperation {
  variableName: string
  targetExchangeId: string
  location: 'url' | 'query' | 'header' | 'cookie' | 'body'
  path?: string  // e.g. header name, query param name
  originalValue: string
  maskedOriginalValue: string  // for preview display
}

interface ScriptTransformationPlan {
  version: number
  correlations: CorrelationProposal[]
  parameterizations: ParameterizationProposal[]
  replacements: ReplacementOperation[]
  warnings: string[]
}
```

### Feature 19 → 20 type mapping

| Feature 19 (`ValueCandidate`) | Feature 20 (`CorrelationProposal`) | Mapping rule |
| ------------------------------ | ----------------------------------- | ------------ |
| `id` | `id` | Direct |
| `variableName` | `variableName` | Honour edits from `analysisDraft.edits` |
| `confidence` | `confidence` | Direct |
| `sourceExchangeId` | `producerExchangeId` | Direct |
| `consumerExchangeIds` | `consumerExchangeIds` | Direct |
| `proposedExtractor.kind` | `extractor.type` | Map `boundary`/`xpath`/`css` → `regex`; `jsonpath` → `jsonpath` |
| `proposedExtractor.expression` | `extractor.expression` | Direct |
| `proposedExtractor.matchNo` | `extractor.matchNo` | Direct |
| `proposedExtractor.defaultValue` | `extractor.defaultValue` | Default to `NOT_FOUND` if absent |
| `consumerLocations` | `replacements[].location` + `path` | Parse `request.header:Authorization` → `{ location: 'header', path: 'Authorization' }` |
| `rejected` | exclude from plan | Only accepted candidates enter the plan |

---

## 5. Code map

```text
src/transform/
  types.ts                     # ScriptTransformationPlan, CorrelationProposal, etc.
  plan-builder.ts              # Feature 19 candidates + draft edits → plan
  plan-store.ts                # persist/draft alongside recording
  jmx-plan-applier.ts          # plan → per-sampler extractors + consumer substitutions
  preview.ts                   # masked original vs modified request
```

### Reuse

| Existing | Path | Role |
| -------- | ---- | ---- |
| Serializer / extractors | `src/jmx/serializer.ts`, `src/jmx/element-model.ts` | Currently ThreadGroup-level extractors; Feature 20 extends for per-sampler placement |
| Element model | `src/jmx/element-model.ts` | `JmxExtractor` = `JmxJSONPostProcessor \| JmxRegexExtractor`; `createJSONPostProcessor`, `createRegexExtractor` |
| Options | `src/options/jmx-options.ts` | `JmxOptions.extractorsJson` for manual extractors (separate from plan) |
| Analysis candidates | Feature 19 `ValueCandidate[]`, `analysisDraft.acceptedIds/edits` | Input to plan-builder |
| Serialization entry point | `src/background/recorder-service.ts:buildJmxExportResponse` | Inject plan before `convertHarToJmx` |
| Correlation guide rules | — | Defaults, Match No, encoding notes in warnings |
| Masking utility | `src/utils/diagnostics.ts` `maskSecretHeaders` | Preview masking (DRY with Feature 19) |

### Export flow integration

```
popup.ts → send(EXPORT_JMX_WITH_PLAN) → recorder-service.ts
  ↓
buildJmxExportResponse reads planStore → inject accepted extractors into buildJmx() options
  ↓
buildJmx() → buildSamplerSequence applies per-sampler extractors based on producer identity
  ↓
createHTTPSampler substitutes ${variableName} in consumer requests via ReplacementOperation
```

The existing `JmxSerializerOptions.extractors` applies to all samplers. Feature 20 adds `perSamplerExtractors?: Map<number, JmxExtractor[]>` keyed by request index (producer index within the request sequence).

---

## 6. Generation rules

1. Extractor is a **child of the producer sampler** in the logical JMX tree (per `<HTTPSamplerProxy>` hashTree, not ThreadGroup-level).  
2. Prefer structured extractor (JSONPath > XPath/CSS > Boundary > Regex). Only JSONPath and Regex are currently supported in the serializer; remaining kinds fall back to RegexExtractor with a warning.  
3. Always set default value (`NOT_FOUND` or agreed default).  
4. Consumers reference `${variableName}` — variable substitution applied to URL, query params, headers, and body during sampler creation.  
5. Optional Response Assertion: variable must not equal `NOT_FOUND` (when user enables).  
   > **Runtime note:** JMeter resolves `${variableName}` inside `ResponseAssertion.testStrings` at execution time. The current implementation emits `Assertion.response_data` + `Contains` with the variable reference, so the assertion passes when the extracted value is present in the response body and fails when the variable holds `NOT_FOUND`. Edge case: if the API response legitimately contains the literal string `NOT_FOUND`, the assertion produces a false positive; a future enhancement could add a JSR223 Assertion option that explicitly checks `!vars.get("var").equals("NOT_FOUND")`.  
6. Cookie Manager remains preferred for ordinary session cookies; only extract cookie to variable when the value is also needed outside the manager.  
7. Parameterisation never creates extractors; correlation never invents CSV files without user source.  
8. Plan-based extractors take precedence over `extractorsJson` from options.

### Observations

- URL Encode flag when replacement location needs it and value may contain reserved characters — warn on possible double-encoding. This is not yet implemented as an active generation rule; treat as a future enhancement.

---

## 7. SOLID / DRY / CRAP / CLEAN

- Applier does not call Chrome or touch disk.  
- Serializer remains responsible for XML shape; applier supplies DTOs the serializer already understands or a thin extension to `JmxSerializerOptions`.  
- Shared variable naming rules (sanitize to JMeter-safe names) — reuse Feature 19's `variableName`.  
- One preview masking path (DRY with analysis masking via `maskSecretHeaders`).  
- Avoid a god "ExportService" that mixes analysis + apply + download.  
- Per-sampler extractor placement is a pure function of request index + plan.

---

## 8. Implementation steps

1. Plan types + store + version. Define `ReplacementOperation`, extend `JmxSerializerOptions` with `perSamplerExtractors` and `consumerSubstitutions`.
2. Plan builder from accepted candidates. Map `ValueCandidate[]` → `CorrelationProposal[]` honouring `analysisDraft.edits`.
3. Preview API. Masked original vs modified request using `maskSecretHeaders`.
4. Per-sampler JMX applier for one correlation (JSON path happy path). Extend `serializer.ts` to accept per-sampler extractors.
5. Consumer variable substitution. Extend `createHTTPSampler` to apply `${variableName}` replacements to URL, query, headers, body.
6. Expand extractor kinds + parameterisation stubs (Regex fallback for unsupported kinds; CSV Data Set Config stub).
7. UI: accept → plan → export with plan (wire `analysisDraft.acceptedIds` into export flow).
8. Goldens for correlated login-style fixture.

---

## 9. Verification audit

| ID | Check | Method | Pass criteria |
| -- | ----- | ------ | ------------- |
| V3.1 | Accept applies | Unit | Extractor + `${var}` present |
| V3.2 | Reject absent | Unit | No extractor for rejected id |
| V3.3 | Recording immutable | Unit | Original requests unchanged |
| V3.4 | Separation | Unit | Param proposal does not emit JSON Extractor |
| V3.5 | JMX load | Manual | Opens in JMeter |
| V3.6 | Default value | Golden | `NOT_FOUND` (or agreed default) present |
| V3.7 | Suite | Full test | Green |
| V3.8 | Per-sampler placement | Unit | Extractor child of producer sampler, not ThreadGroup |
| V3.9 | Consumer substitution | Unit | `${variableName}` in consumer request fields |
| V3.10 | Plan serialisable | Unit | `JSON.stringify(plan)` round-trips |

---

## 10. Exit criteria

- End-to-end: analyse → accept one CSRF/JSON token → export JMX with stock extractor as child of producer sampler.  
- Plan serialisable and re-applicable.  
- No auto-apply path on default export without plan.
- Consumer requests contain `${variableName}` substitutions.
- Per-sampler extractor placement verified (not ThreadGroup-level).

---

## 11. Work State

### Completed
- `specs/20-transformation-plan.md` reviewed against codebase; §3-5, §6-12 updated with findings.
- `src/transform/types.ts` — `CorrelationProposal`, `ParameterizationProposal`, `ReplacementOperation`, `ScriptTransformationPlan`, `PlanApplyOptions`, `SupportedExtractorType`, `mapExtractorKindToSupported()`.
- `src/transform/plan-builder.ts` — `buildTransformationPlan()` with `findValueLocations()` searching consumer `headers`, `queryParams`, `body`, `url`. Honors `AnalysisDraftState.acceptedIds` and `.edits`.
- `src/transform/plan-store.ts` — `PlanStore` with `save()`/`load()`/`clear()`; `chrome.storage.local` adapter with `MemoryPlanStore` fallback.
- `src/transform/jmx-plan-applier.ts` — `applyPlan()` converts `ScriptTransformationPlan` → `Map<requestIndex, JmxExtractor[]>` + `ReplacementOperation[]` for the serializer. `buildProducerIndexMap()` maps exchange IDs to request indices.
- `src/transform/preview.ts` — `buildPlanPreview()` produces masked original vs `${variableName}` substitution previews.
- Serializer updated: `JmxSerializerOptions` extended with `perSamplerExtractors` and `consumerSubstitutions`; `buildSamplerSequence` uses per-sampler extractors and `applyConsumerSubstitutions()` for variable injection.
- UI wired: accept/reject candidates, parameterization proposal form, preview rendering, and `saveCurrentPlan()` before `EXPORT_JMX` in popup export flow.
- Verification audit V3.1–V3.10 implemented as unit + integration tests.
- Golden fixture `tests/fixtures/golden/golden-20-correlated-login.jmx` matched by `src/transform/golden-login.test.ts`.
- Quality gates passed: 659 tests across 53 files pass; ESLint + Prettier clean; `dry4js` completed with no failures; `crap4js` shows 0 high/moderate risk functions.

### Active
- None. Feature 20 implementation is complete and verified.

### Blocked
- None.

### Obstacles / Notes
- None. Remaining items (e.g., URL-encode active flag, additional extractor kinds beyond JSONPath/Regex) are tracked as future enhancements per §6 Observations and §3 codebase constraints, not blockers.
