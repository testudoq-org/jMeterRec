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
- Wire into existing `jmx/serializer.ts` / extractor builders.
- Defaults (`NOT_FOUND`), producer placement, optional assertion on failed extraction.
- Parameterisation proposals mapped to CSV/UDV/function only when user selects source.

### Out of scope

- Silent apply on export.
- JSR223 as default extractor.
- Plugin.
- Full user-path controllers (Feature 21).

---

## 4. Types

```typescript
interface CorrelationProposal {
  id: string
  variableName: string
  confidence: number
  producerExchangeId: string
  consumerExchangeIds: string[]
  extractor: {
    type: 'jsonpath' | 'regex' | 'boundary' | 'xpath' | 'css' | 'header' | 'cookie'
    expression: string
    matchNo?: number
    fieldToCheck?: 'body' | 'headers' | 'url'
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

interface ScriptTransformationPlan {
  version: number
  correlations: CorrelationProposal[]
  parameterizations: ParameterizationProposal[]
  replacements: ReplacementOperation[]
  warnings: string[]
}
```

---

## 5. Code map

```text
src/transform/
  types.ts
  plan-builder.ts          # candidates → plan draft
  plan-store.ts
  jmx-plan-applier.ts      # pure apply
  preview.ts               # masked original vs modified
```

### Reuse

| Existing | Path | Role |
| -------- | ---- | ---- |
| Serializer / extractors | `src/jmx/serializer.ts`, element builders | Emit JSON/Regex/Boundary/XPath extractors |
| Options extractors | `src/options/jmx-options.ts` | Align type names |
| Analysis candidates | Feature 19 | Input |
| Correlation guide rules | — | Defaults, Match No, encoding notes in warnings |

---

## 6. Generation rules

1. Extractor is a **child of the producer sampler** in the logical JMX tree.  
2. Prefer structured extractor (JSONPath > XPath/CSS > Boundary > Regex).  
3. Always set default value.  
4. Consumers reference `${variableName}`.  
5. URL Encode flag when replacement location needs it and value may contain reserved characters — warn on possible double-encoding.  
6. Optional Response Assertion: variable must not equal `NOT_FOUND`.  
7. Cookie Manager remains preferred for ordinary session cookies; only extract cookie to variable when the value is also needed outside the manager.  
8. Parameterisation never creates extractors; correlation never invents CSV files without user source.

---

## 7. SOLID / DRY / CRAP / CLEAN

- Applier does not call Chrome or touch disk.  
- Serializer remains responsible for XML shape; applier supplies a DTO the serializer already understands or a thin extension.  
- Shared variable naming rules (sanitize to JMeter-safe names).  
- One preview masking path (DRY with analysis masking).  
- Avoid a god “ExportService” that mixes analysis + apply + download.

---

## 8. Implementation steps

1. Plan types + store + version.  
2. Plan builder from accepted candidates.  
3. Preview API.  
4. JMX applier for one correlation (JSON path happy path).  
5. Expand extractor kinds + parameterisation stubs.  
6. UI: accept → plan → export with plan.  
7. Goldens for correlated login-style fixture.

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

---

## 10. Exit criteria

- End-to-end: analyse → accept one CSRF/JSON token → export JMX with stock extractor.  
- Plan serialisable and re-applicable.  
- No auto-apply path on default export without plan.
