# Feature 19 — Analysis Library

**Branch:** `feature/19-analysis-library`  
**Depends on:** Feature 18 merged  
**Blocks:** Feature 20  
**Type:** Pure analysis + light review UI  

---

## 1. Outcome

Offline, deterministic analysis produces **reviewable correlation candidates** (and clear non-candidates) from one or two normalised recordings. The stored recording is never mutated by analysis.

**Ships value:** Reviewable candidates.  
**Stop if:** Analysis mutates recordings, or the library cannot run without the browser.

---

## 2. Problem statement

Manual correlation in JMeter relies on: record twice and diff; find producer response → consumer request; choose an extractor. Capultura should automate **detection and explanation**, not silent rewrite.

Inputs must include Feature 18 body availability so weak producers are down-ranked or flagged.

---

## 3. Scope

### In scope

- Pure TypeScript analysis package (no `chrome.*` imports).
- Value extraction from JSON, headers, cookies, redirect Location, HTML hidden inputs (when body available), simple XML when present.
- Reuse detection (exact value producer → later consumers).
- Optional two-recording change detection.
- Noise filters (timestamps, obvious cache-busters, analytics-only ids).
- Candidate DTO with confidence, reasons, proposed extractor type/expression.
- Masking for display.
- Minimal UI: list candidates, accept/reject/edit metadata **in memory / plan draft only** (persist plan structure optional; full plan apply is Feature 20).

### Out of scope

- Writing extractors into JMX.
- Auto-accept.
- LLM as primary detector.
- Debugger provider.
- Parameterisation CSV file generation (detect likely params only if cheap; full param proposals can start here but apply in 03).

---

## 4. Core types

```typescript
type CandidateType =
  | 'csrf-token'
  | 'session-id'
  | 'jwt'
  | 'uuid'
  | 'business-id'
  | 'hidden-field'
  | 'cookie'
  | 'header'
  | 'viewstate'
  | 'unknown'

type ExtractorKind = 'jsonpath' | 'regex' | 'boundary' | 'xpath' | 'css' | 'header' | 'cookie'

interface ValueCandidate {
  id: string
  value: string                 // masked in UI when sensitive
  normalizedValue?: string
  sourceExchangeId: string
  sourceLocation: string        // e.g. response.body.json:$.token
  consumerExchangeIds: string[]
  consumerLocations: string[]   // e.g. request.header:Authorization
  candidateType: CandidateType
  confidence: number            // 0..1
  reasons: string[]
  proposedExtractor?: {
    kind: ExtractorKind
    expression: string
    matchNo?: number
    defaultValue?: string       // e.g. NOT_FOUND
  }
  warnings?: string[]           // e.g. producer body was partial
}

interface AnalysisResult {
  recordingId?: string
  candidates: ValueCandidate[]
  rejectedNoise: ValueCandidate[]  // optional, for transparency
  diagnostics: string[]
}
```

Align field naming with repo conventions when implementing.

---

## 5. Code map

### New package (preferred)

```text
src/analysis/
  types.ts
  run-analysis.ts
  reuse-detector.ts
  change-detector.ts
  noise-filters.ts
  masking.ts
  extractors/
    json.ts
    html-hidden.ts
    xml.ts
    headers-cookies.ts
    named-patterns.ts      # CSRF, ViewState, JSESSIONID, Bearer
```

### Reuse

| Existing | Use |
| -------- | --- |
| Feature 18 meta | Skip or warn when `bodyAvailability` is not available |
| Header/query maps on `CapturedRequest` | Input to extractors |
| JMeter correlation guide patterns | `named-patterns.ts` rules |

### UI (thin)

- Popup or inspector section bound to analysis result.
- Actions: Accept / Reject / Edit expression (updates draft only).

---

## 6. Detection rules (deterministic)

**Stronger confidence when:**

- Value changes between two recordings of the same step, and
- Value appears in an earlier response, and
- Value is reused in a later request, and
- Location is structurally meaningful (JSON key, hidden name, known header), and
- Name matches known token patterns (`csrf`, `viewstate`, `token`, `session`, `authorization`).

**Weaker / noise when:**

- Looks like timestamp, build id, cache buster (`_`, `cb=`, long random only once).
- Used only once with no consumer.
- Producer body was `unavailable` / `blocked`.

**Extractor proposal priority**

1. JSONPath for JSON bodies  
2. CSS/XPath for HTML hidden fields  
3. Boundary when stable left/right text exists  
4. Header/cookie specialised  
5. Regex fallback  

Default value always proposed as `NOT_FOUND` (or project standard).

---

## 7. SOLID / DRY / CRAP / CLEAN

- Each extractor module: one format in → list of raw finds out.
- `run-analysis` composes; no extractor knows about JMX.
- Shared masking and path string helpers.
- Rule tables for named patterns instead of nested if/else forests.
- Unit tests per extractor with fixtures; no browser.

---

## 8. Implementation steps

1. Scaffold `src/analysis` with types and empty `run-analysis`.  
2. JSON + header/cookie extractors + tests.  
3. HTML hidden + named CSRF/ViewState patterns.  
4. Reuse detector + confidence scoring.  
5. Noise filters + two-recording change detector.  
6. Masking + UI list (accept/reject draft state).  
7. Docs: how analysis uses body availability.

---

## 9. Verification audit

| ID | Check | Method | Pass criteria |
| -- | ----- | ------ | ------------- |
| V2.1 | Pure package | Import graph / eslint boundary | No chrome in `analysis/` |
| V2.2 | JSON token reuse | Fixture unit | Candidate with producer + consumer |
| V2.3 | Hidden CSRF | Fixture unit | Hidden-field candidate when body present |
| V2.4 | Noise | Unit | Timestamp not in primary candidates |
| V2.5 | Missing body | Unit | Warning / lower confidence / no false producer |
| V2.6 | Immutability | Test | Input recording deep-equal after analysis |
| V2.7 | UI draft only | Manual/E2E | Reject does not write JMX |
| V2.8 | Suite | `npm run test` | Green |

---

## 10. Exit criteria

- `runAnalysis(recording)` (and optional second recording) returns candidates with reasons.
- Recording storage unchanged by analysis.
- Review UI can accept/reject without generating JMX.
- Feature 20 can consume `ValueCandidate[]` without re-parsing bodies from scratch.
