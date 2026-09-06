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
- Value extraction from JSON, headers, cookies, redirect Location, HTML hidden inputs, application/x-www-form-urlencoded bodies, simple XML when present.
- Reuse detection (exact value producer → later consumers).
- Optional two-recording change detection.
- Noise filters (timestamps, obvious cache-busters, analytics-only ids).
- Cookie Manager awareness: flag standard session cookies as managed by JMeter so they do not become false-positive extractor candidates.
- Candidate DTO with confidence, reasons, proposed extractor type/expression, JMeter-safe variable name, and structural scope.
- Masking for display (reuse existing utility where possible).
- Minimal UI: inspector section bound to analysis result.
- Actions: Accept / Reject / Edit metadata **in memory / plan draft only** (persist plan structure optional; full plan apply is Feature 20).

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
  | 'authorization'
  | 'uuid'
  | 'business-id'
  | 'hidden-field'
  | 'cookie'
  | 'header'
  | 'viewstate'
  | 'unknown'

type ExtractorKind = 'jsonpath' | 'regex' | 'boundary' | 'xpath' | 'css' | 'header' | 'cookie'

interface AnalysisRecording {
  id: string
  schemaVersion: number
  exchanges: readonly CapturedRequest[]
}

interface AnalysisInput {
  primary: AnalysisRecording
  baseline?: AnalysisRecording  // optional second recording for change detection
}

interface ValueCandidate {
  id: string
  value: string                 // masked in UI when sensitive
  normalizedValue?: string      // lowercased + trimmed form used for reuse matching only
  sourceExchangeId: string
  sourceLocation: string        // e.g. response.body.json:$.token
  consumerExchangeIds: string[]
  consumerLocations: string[]   // e.g. request.header:Authorization
  candidateType: CandidateType
  variableName: string          // JMeter-safe, deduplicated
  confidence: number            // 0..1 from documented scoring function
  reasons: string[]
  proposedExtractor?: {
    kind: ExtractorKind
    expression: string
    matchNo?: number
    defaultValue?: string       // e.g. NOT_FOUND
    variableName: string
  }
  warnings: string[]            // e.g. producer body was partial
  scope: {
    producerIndex: number       // index into exchanges[]
    consumerIndices: number[]   // indices into exchanges[]
  }
  rejected?: boolean            // true = rejectedNoise, false/absent = candidate
}

interface AnalysisResult {
  recordingVersion: number
  recordingId: string
  candidates: ValueCandidate[]
  rejectedNoise: ValueCandidate[]  // candidates with rejected === true
  diagnostics: string[]
}
```

`AnalysisInput` defines the immutable contract between capture and analysis. `normalizedValue` is derived, not stored in recordings. `variableName` is owned by analysis; Feature 20 consumes it. Align field naming with repo conventions when implementing.

---

## 5. Code map

### New package (preferred)

```text
src/analysis/
  types.ts
  run-analysis.ts
  reuse-detector.ts
  change-detector.ts      # small; inline if optional stays optional
  noise-filters.ts
  extractors/
    json.ts
    form-urlencoded.ts
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
| `src/utils/diagnostics.ts` | Reuse `maskSecretHeaders` for analysis display masking |
| Recording schema version | `AnalysisRecording.schemaVersion` |

### Fixtures

Place under `tests/fixtures/analysis/` following Feature 18 fixture conventions.

### UI (thin)

- Inspector section bound to analysis result (same panel used for request inspection).
- Actions: Accept / Reject / Edit expression / Rename variable (updates draft only).

---

## 6. Detection rules (deterministic)

### Ordering

Use `startedAtMs` (epoch ms) as the canonical chronological key. `timestamp` (ISO string) is derived from the same value and must not be used for ordering because string comparison can differ from numeric order for timestamps with mixed precision.

### Confidence scoring

Confidence is a number in `[0, 1]` computed by a documented weighted sum. Base score is `0`.

| Factor | Weight | Condition |
| ------ | ------ | -------- |
| Value changes between recordings | +0.15 | `baseline` provided and producer value differs from baseline value |
| Producer body available | +0.10 | `responseBodyMeta.available === 'available'` |
| Consumer count | +0.05 per consumer, max +0.15 | `consumerExchangeIds.length` |
| Structural location | +0.10 | JSON key, hidden input name, known header name, redirect `Location` |
| Named token pattern | +0.10 | Name matches known patterns (`csrf`, `viewstate`, `token`, `session`, `authorization`, `x-csrf-token`) |
| Cookie managed by JMeter | -0.30 | Standard session cookie pattern (`JSESSIONID`, `PHPSESSID`, `connect.sid`, etc.) |

**Penalties**

| Penalty | Amount | Condition |
| ------- | ------ | -------- |
| Missing producer body | -0.25 | `responseBodyMeta.available` is `unavailable`, `blocked`, `capture-error`, or `partial` |
| No consumer | -0.20 | `consumerExchangeIds.length === 0` |
| Single-use cache buster | -0.15 | Value appears only once and matches cache-buster heuristics |
| Timestamp / analytics id | -0.30 | Matches timestamp or obvious analytics-id heuristics |

Clamp final score to `[0, 1]`. Round to two decimal places for display. The function must be unit-testable with fixed inputs.

### Step matching for two-recording diff

When `baseline` is provided, steps are matched by `url` + `method` within a configurable correlation window.

```typescript
interface AnalysisOptions {
  correlationWindowMs?: number   // default: recording duration (all subsequent)
  sameTabOnly?: boolean          // default: true
  matchStepsBy: 'url-method'     // only url-method in this feature
}
```

If no matching baseline step is found within the window, the value-changes bonus is not applied.

### Duplicate producer / consumer handling

- **Multiple producers:** rank by highest confidence producer. If scores are equal, prefer `available` body over unavailable, then prefer JSON over header over cookie.
- **Multiple consumers:** all matching consumers are included. If consumer count exceeds the scoring cap, score is capped but all consumers are listed.

### Cookie Manager awareness

Standard session cookie names are flagged as managed by JMeter `CookieManager`. These receive a confidence penalty and a warning reason. They still appear in results but are clearly marked so the UI can de-prioritise or hide them by default.

### Reuse detection scope

By default, reuse is limited to the same tab (`tabId`) when `sameTabOnly` is true. Cross-tab session reuse is possible but should be an explicit opt-in because it increases false positives.

### Two-recording change detection

"Optional two-recording change detection" compares the primary recording against the optional `baseline` recording using step matching above. Only values that changed between the matched baseline step and the primary step receive the value-changes confidence bonus.

### Extractor proposal priority

1. JSONPath for JSON bodies  
2. CSS/XPath for HTML hidden fields  
3. `form-urlencoded` field extraction (boundary or regex on raw body)  
4. Boundary when stable left/right text exists  
5. Header/cookie specialised  
6. Regex fallback  

Default value always proposed as `NOT_FOUND` (or project standard).

### Rejected noise criteria

A candidate is placed in `rejectedNoise` when it matches hard noise heuristics (timestamp, build id, cache buster, analytics-only id). Low-confidence candidates that are not hard noise remain in `candidates` with a low score and warnings.

---

## 7. SOLID / DRY / CRAP / CLEAN

- Each extractor module: one format in → list of raw finds out.
- `run-analysis` composes; no extractor knows about JMX.
- Reuse `maskSecretHeaders` from `src/utils/diagnostics.ts` for analysis display masking; do not duplicate masking logic.
- Rule tables for named patterns and scoring weights instead of nested if/else forests.
- Unit tests per extractor and per scoring rule with fixtures; no browser.
- Pure functions only in `analysis/`; no mutation of input recordings.

---

## 8. Implementation steps

1. Scaffold `src/analysis` with `AnalysisInput` / `AnalysisResult` types and empty `run-analysis`.  
2. JSON + form-urlencoded + header/cookie extractors + tests.  
3. HTML hidden + XML + named CSRF/ViewState patterns.  
4. Reuse detector + confidence scoring with documented weights + unit tests for each factor.  
5. Noise filters + Cookie Manager awareness + duplicate producer/consumer ranking.  
6. Step matching and optional two-recording change detector.  
7. Masking (reuse existing utility) + inspector UI list (accept/reject/rename variable).
8. Docs: how analysis uses body availability and schema version.

---

## 9. Verification audit

| ID | Check | Method | Pass criteria |
| -- | ----- | ------ | ------------- |
| V2.1 | Pure package | Import graph / eslint boundary | No chrome in `analysis/` |
| V2.2 | Input contract | Type unit | `AnalysisInput` accepted; immutable after call |
| V2.3 | JSON token reuse | Fixture unit | Candidate with producer + consumer |
| V2.4 | Form-urlencoded hidden | Fixture unit | Form-field candidate when body present |
| V2.5 | Hidden CSRF | Fixture unit | Hidden-field candidate when body present |
| V2.6 | Noise | Unit | Timestamp not in primary candidates |
| V2.7 | Cookie Manager | Unit | Standard session cookie flagged / penalised |
| V2.8 | Missing body | Unit | Warning / lower confidence / no false producer |
| V2.9 | Confidence scoring | Unit | Deterministic output for fixed inputs; weights documented |
| V2.10 | Variable naming | Unit | JMeter-safe, deduplicated `variableName` on every candidate |
| V2.11 | Two-recording diff | Unit | Value-changes bonus applied only when matched baseline step exists |
| V2.12 | Duplicate producers | Unit | Highest-confidence producer wins; ties broken by body availability then location type |
| V2.13 | Immutability | Test | Input recording deep-equal after analysis |
| V2.14 | UI draft only | Manual/E2E | Reject does not write JMX |
| V2.15 | Suite | `npm run test` | Green |

---

## 10. Exit criteria

- `runAnalysis(input: AnalysisInput)` returns `AnalysisResult` with `recordingVersion`, candidates, `rejectedNoise`, and diagnostics.
- Recording storage unchanged by analysis.
- Review UI can accept/reject/rename variable without generating JMX.
- Feature 20 can consume `ValueCandidate[]` without re-parsing bodies from scratch.
- Confidence scoring is deterministic, documented, and unit-testable.
- Standard session cookies are flagged as managed by JMeter CookieManager.
- Form-urlencoded bodies produce candidates when hidden fields or known keys are present.

---

## 12. Spec verification audit

| ID | Check | Evidence path | Result |
| -- | ----- | ------------- | ------ |
| V2.1 | Pure package | `rg "chrome\." src/analysis` → empty | PASS |
| V2.2 | Input contract | `src/analysis/types.test.ts` (3 type-level tests) | PASS |
| V2.3 | JSON token reuse | `src/analysis/run-analysis.test.ts` → `produces candidate for JSON token reuse` | PASS |
| V2.4 | Form-urlencoded hidden | `src/analysis/extractors/form-urlencoded.test.ts` → `returns finds for hidden-field-like keys` | PASS |
| V2.5 | Hidden CSRF | `src/analysis/extractors/form-urlencoded.test.ts` → `returns finds for authenticity_token` | PASS |
| V2.6 | Noise | `src/analysis/noise-filters.test.ts` + `src/analysis/run-analysis.test.ts` → `rejects timestamp values as noise` + `rejects single-use cache buster values as noise` | PASS |
| V2.7 | Cookie Manager | `src/analysis/cookie-awareness.test.ts` + `src/analysis/run-analysis.test.ts` → `flags managed session cookie with penalty` | PASS |
| V2.8 | Missing body | `src/analysis/extractors/json.test.ts` → `returns empty array when body is unavailable` + `src/analysis/immutability.test.ts` (deep-equal after `runAnalysis`) | PASS |
| V2.9 | Confidence scoring | `src/analysis/scoring.test.ts` (8 deterministic tests: structuralLocation, namedTokenPattern, isSingleUseCacheBuster, consumer count, value-changes, cookie penalty, clamping, caps) + `src/analysis/run-analysis.test.ts` → `JSON token with named pattern and structural location gets confidence >= 0.3` | PASS |
| V2.10 | Variable naming | `src/analysis/variable-naming.test.ts` (6 tests: sanitise + dedupe) | PASS |
| V2.11 | Two-recording diff | `src/analysis/change-detector.test.ts` → `returns true when response body differs` + `src/analysis/run-analysis.test.ts` → `applies value-changes bonus with baseline` | PASS |
| V2.12 | Duplicate producers | `src/analysis/reuse-detector.test.ts` → `ranks producer by body availability then extractor kind` (two-pass ranking by body availability + extractor kind) | PASS |
| V2.13 | Immutability | `src/analysis/immutability.test.ts` (deep-clone input, assert unchanged after `runAnalysis`) | PASS |
| V2.14 | UI draft only | `src/popup/popup.test.ts` → `shows analysis panel after recording stops`, `renders candidates after clicking Analyse`, `accept button moves candidate to Accepted section`, `renaming variable updates the rendered name and stores edit` | PASS |
| V2.15 | Suite | `npm test` → 601 passed | PASS |

**Commands executed:**

```bash
npm test          # 601 passed
npm run typecheck # exit 0
npm run lint      # exit 0
npm run build     # exit 0
npm run crap      # 0 high/moderate risk
npm run dry       # exit 0
```

**Known limitations:**

1. `responseHeaders` collapses duplicate headers (e.g. multiple `Set-Cookie`). Documented in `docs/capture-limits.md §8`.
2. Reuse detector uses exact value equality after lowercasing/trimming; no fuzzy matching.
3. E2E test (`tests/e2e/spec-019-analysis.spec.ts`) is minimal and requires a full browser environment to run.
4. HTML hidden-input and XML extractors use lightweight regex rather than full parsers; sufficient for Feature 19 but may miss malformed markup.
