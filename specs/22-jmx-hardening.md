# Feature 22 — JMX Hardening

**Branch:** `feature/22-jmx-hardening`  
**Depends on:** Feature 20 (and ideally 21 if controllers land first)  
**Type:** Export quality, goldens, diagnostics  

---

## 1. Outcome

Generated JMX from recordings ± accepted plans is **CI-ready**: stable goldens, encoding-safe, multi-iteration friendly, with explicit export diagnostics when something cannot be represented.

**Ships value:** CI-ready scripts.  
**Stop if:** Goldens are unstable or encoding/correlation regressions appear.

---

## 2. Scope

### In scope

- Golden JMX fixtures for: plain capture, correlated JSON token, CSRF/hidden field (when body present), redirect headers, missing-body producers (warnings).
- Export diagnostics list (missing body on accepted correlation, ambiguous multi-match, encoding warnings).
- Review Cookie Manager / Header Manager / Cache Manager consistency with current serializer options.
- Assertions for extraction failure where plan requests them.
- Sanitizer and validator regression tests (reuse `xml-sanitizer`, existing validator).

### Out of scope

- New correlation algorithms.
- Plugin.
- Non-HTTP protocols.

---

## 3. Code map

| Area | Path | Action |
| ---- | ---- | ------ |
| Serializer | `src/jmx/serializer.ts` | Diagnostics hooks; controller/extractor edge cases |
| HAR path | `src/jmx/har-to-jmx.ts` | Same sanitizer guarantees |
| Tests | `src/jmx/*.test.ts`, `tests/fixtures/golden/` | Expand goldens |
| Transform applier | `src/transform/jmx-plan-applier.ts` | Warning aggregation |

---

## 4. SOLID / DRY / CRAP / CLEAN

- Diagnostics collected as data, rendered once.  
- Do not copy sanitizer logic — call `sanitizeForXml`.  
- Golden updates require explicit `UPDATE_GOLDEN=1` style discipline (match existing E2E practice).

---

## 5. Verification audit

| ID | Check | Pass criteria |
| -- | ----- | ------ |
| V5.1 | Goldens | Stable across two local runs |
| V5.2 | Correlated JMX | Loads in JMeter; single-user path OK |
| V5.3 | Multi-iteration | Variables re-extract (manual or automated smoke) |
| V5.4 | Missing producer body | Warning in export diagnostics |
| V5.5 | Suite | Full unit + E2E green |

---

## 6. Exit criteria

- Documented golden set; export diagnostics visible; no silent invalid XML.
