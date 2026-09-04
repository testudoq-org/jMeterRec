# Feature 18 — Capture Honesty

**Branch:** `feature/18-capture-honesty`  
**Depends on:** Feature 17 merged  
**Blocks:** Feature 19+  
**Type:** Capture + model extension  

---

## 1. Outcome

Every stored exchange can state what was captured and what was not. Response-body availability is explicit. Binary and unsupported cases do not corrupt recordings or JMX. Existing recordings still load.

**Ships value:** Trustworthy recordings.  
**Stop if:** Bodies remain silent empty strings with no reason, or export breaks.

---

## 2. Problem statement

Today Capultura captures requests via `chrome.webRequest` and optionally attaches response bodies from a content-script fetch/XHR wrap. Gaps are easy to miss:

- Missing body often looks like “no field” rather than “unavailable: reason”.
- HTML is redacted/forbidden without a structured availability model.
- Matching failures in `ResponseBodyMatchingService` can drop bodies quietly.
- Header maps collapse duplicates.
- There is no recording schema version for safe evolution.

Correlation (Feature 19–20) must not run on silent incomplete data.

---

## 3. Scope

### In scope

- Recording schema version + load defaults for older data.
- Explicit body availability and diagnostics on completed exchanges.
- `ResponseBodyProvider` interface with content-script and unsupported implementations.
- Safer body encoding (text vs base64 vs unavailable).
- Matching failure diagnostics.
- Export tolerance for missing/redacted/binary bodies.
- Fixtures and unit tests for the above.
- Short docs update: capture limits (webRequest vs content script).

### Out of scope

- Chrome debugger / CDP.
- Correlation candidates or JMX extractors.
- In-extension playback engine.
- Full multipart parser.
- Rewriting Playwright generator beyond “do not break”.
- Broad UI redesign (minimal inspector fields allowed).

---

## 4. Target model (adapt existing types)

Prefer extending `CapturedRequest` rather than a parallel hierarchy.

```typescript
// Conceptual — align names with repo style

type BodyEncoding = 'utf8' | 'base64' | 'urlencoded' | 'json' | 'unknown'
type BodyAvailability =
  | 'available'
  | 'unavailable'
  | 'partial'
  | 'blocked'
  | 'not-requested'
  | 'capture-error'

interface CapturedBodyMeta {
  available: BodyAvailability
  encoding?: BodyEncoding
  mimeType?: string
  contentEncoding?: string
  size?: number
  error?: string
  truncated?: boolean
  redacted?: boolean
  source?: string // e.g. 'content-fetch' | 'content-xhr' | 'none'
}

// On CapturedRequest / PendingRequest:
// keep responseBody?: string
// add responseBodyMeta?: CapturedBodyMeta
// add captureSources?: string[]
// add diagnostics?: string[]
// recording-level: schemaVersion: number
```

Migration: missing `schemaVersion` → treat as `1` (or current); fill defaults (`available: 'not-requested'` or `'unavailable'` with reason when status exists but no body path ran).

---

## 5. Code map — reuse and refactor

| Existing | Path | Change |
| -------- | ---- | ------ |
| Model | `src/models/captured-request.ts` | Add optional meta fields; keep required fields stable |
| Pending | `src/models/pending-web-request.ts` | Version constant if needed; type guards |
| Normalizer | `src/background/traffic-normalizer.ts` | `applyCapturedResponseBody` sets meta; never invent body |
| Matching | `src/background/response-body-matching-service.ts` | Return diagnostic on 0 or >1 match |
| Content capture | `src/content/response-body-capture.ts` | Implement provider contract; report source |
| Body utils | `src/utils/response-body.ts` | Shared availability helpers; binary-safe measure |
| Recorder | `src/background/recorder-service.ts` | Wire diagnostics; schema on save/load |
| State | `src/background/recorder-state.ts` | Persist new fields |
| Serializer | `src/jmx/serializer.ts` | Tolerate missing body; no invalid XML |
| Messages | `src/messages.ts` | Extend payload if needed for meta |

### New modules (keep small)

```text
src/models/recording-schema.ts          # version + migrateRecording()
src/capture/response-body-provider.ts   # interface only
src/capture/providers/content-script-response-body-provider.ts
src/capture/providers/unsupported-response-body-provider.ts
```

Do not move all of `traffic-capture.ts` in this branch unless required.

---

## 6. SOLID / DRY / CRAP / CLEAN requirements

**SOLID**

- `ResponseBodyProvider`: `canCapture(ctx)` + `capture(ctx) → result` with availability always set.
- Unsupported provider is a real implementation (null object), not scattered `if (!enabled)`.
- Normalizer depends on result DTO, not on DOM or `window.fetch`.

**DRY**

- Single function builds “body reason” strings.
- Size/truncate/redact logic stays in `utils/response-body.ts`.
- Masking (if any log path) shared; no secrets in diagnostics by default.

**CRAP**

- Avoid nested match logic; table or early returns in matching service.
- Provider switch is data-driven or simple strategy list, not deep conditionals.

**CLEAN**

- Names: `bodyAvailability`, `bodyReason`, not `flag2`.
- No `any`; extend Chrome types only at boundaries.
- Comments only for non-obvious MV3 limits.

---

## 7. Behavioural rules

1. If response body capture is disabled → `available: 'not-requested'`.
2. If capture enabled but content script never saw the request → `unavailable` + reason.
3. If match ambiguous or expired → `unavailable` + reason; do not attach wrong body.
4. If content type forbidden/redacted (current HTML policy) → `blocked` or `redacted` meta; preserve policy unless product explicitly changes it in this branch (default: keep current HTML policy, make it explicit in meta).
5. Non-text binary → prefer `encoding: 'base64'` with data, or `unavailable` with reason if not stored; never corrupt UTF-8 paths.
6. Truncation remains allowed; set `truncated: true` and size.
7. Diagnostics array is append-only explanations suitable for developer UI (no raw cookies/tokens).

---

## 8. Implementation steps (suggested commits)

1. `recording-schema` + migrate defaults + tests  
2. `CapturedBodyMeta` fields on model + normalizer apply path  
3. Provider interface + content-script adapter + unsupported  
4. Matching diagnostics  
5. Serializer/export tolerance + tests  
6. Fixtures + docs (`docs/capture-limits.md` or README section)  

---

## 9. Fixtures (sanitised)

Place under `tests/fixtures/capture/` or existing fixture layout:

1. JSON response with a token-like field (fetch)  
2. Form-urlencoded request body  
3. Missing body (simulate no content capture)  
4. Redacted/forbidden content type  
5. Set-Cookie response headers only  
6. Redirect `Location` header  
7. Legacy recording JSON without schemaVersion  

No real credentials.

---

## 10. Verification audit

| ID | Check | Method | Pass criteria |
| -- | ----- | ------ | ------------- |
| V1.1 | Legacy load | Unit migrate | Old fixture loads; defaults present |
| V1.2 | Body available path | Unit + optional E2E | Meta `available` + body set for fetch fixture |
| V1.3 | Body missing reason | Unit | Reason non-empty when unavailable |
| V1.4 | Ambiguous match | Unit matching service | No body attached; diagnostic set |
| V1.5 | Binary safety | Unit | No invalid UTF-8 injection into JMX path |
| V1.6 | Export | Unit serializer | JMX still well-formed without body |
| V1.7 | Regression | Full `npm run test` + E2E | Green |
| V1.8 | Complexity | `npm run crap` / `dry` | No large unexplained spike on new files |
| V1.9 | Secrets | Grep fixtures | No live tokens |

---

## 11. Exit criteria

- Schema version present on new saves.
- Every completed exchange can expose body availability (field or derived default).
- Content-script capture reports source; failures explain why.
- Existing JMX/Playwright export paths work.
- Spec verification audit signed off in PR description.
- `progress-master.md` → Feature 18 `Merged`.

---

## 12. Manual validation

1. Load unpacked `dist/`.  
2. Enable response body capture if required by options.  
3. Record a same-origin page that performs `fetch` JSON.  
4. Stop recording; inspect stored request for body + meta/diagnostics.  
5. Record a full navigation to an HTML page; confirm body blocked/unavailable with reason, not a silent blank that looks like success.  
6. Export JMX; open in JMeter.
