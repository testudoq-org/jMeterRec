# Capultura / jMeterRec — Progress Master

**Repository:** https://github.com/testudoq-org/jMeterRec  
**Baseline branch:** `master`  
**Delivery model:** Branch-per-feature (one mergeable branch per ordered feature)  
**Document status:** Living map — update status column when a branch merges  

This file is the single progress map for autocorrelation, parameterisation, and supporting capture/analysis work. Individual specifications live under `specs/`.

---

## 1. Delivery rules

1. Start every feature branch from current `master` (or from the previous merged feature branch only when a hard dependency exists).
2. One feature = one branch = one focused PR. Do not combine capture work with correlation generation.
3. Preserve existing behaviour on `master` until the feature’s exit criteria pass.
4. Prefer reuse and small refactors over rewrites. Follow SOLID, DRY, low CRAP, and CLEAN code (see each spec).
5. No JMeter plugin implementation until Feature 24 design is accepted and earlier features are stable.
6. No automatic mutation of recordings or JMX without an explicit user-accepted transformation plan (Feature 20).
7. Every feature branch must include unit tests for new logic and must keep the existing suite green.
8. Update this file’s status table when the branch is opened, reviewed, and merged.

### Branch naming

```text
feature/17-baseline-lock
feature/18-capture-honesty
feature/19-analysis-library
feature/20-transformation-plan
feature/21-user-paths
feature/21-user-paths-phase-2   # Phase 2: full heuristic surface + HAR fix
prototype/area5-icon-opens-detached # 21-proto Area 5 detached-window prototype
feature/22-jmx-hardening
feature/23-debugger-provider   # optional
feature/24-plugin-design       # design-only
```

### Dependency graph

```text
17 Baseline
  └── 18 Capture honesty
       └── 19 Analysis library
            └── 20 Transformation plan
                  ├── 21 User paths
                  │    ├── 21-p2 User paths Phase 2
                  │    └── 21-proto Area 5 detached-window prototype
                  └── 22 JMX hardening
                      └── 23 Debugger provider (optional)
                           └── 24 Plugin design (doc only)
```

Features 21 and 22 may proceed in parallel after 20 if staffing allows; both require 20’s plan model to remain stable.

---

## 2. Progress table

| Order | Feature id | Branch | Ships value | Stop if | Spec | Status |
| ----- | ---------- | ------ | ----------- | ------- | ---- | ------ |
| 17 | Baseline lock | `feature/17-baseline-lock` | Safe to change | Tests red | [spec-17](./specs/17-baseline-lock.md) | Merged |
| 18 | Capture honesty | `feature/18-capture-honesty` | Trustworthy recordings | Bodies still silent or export breaks | [spec-18](./specs/18-capture-honesty.md) | Merged |
| 19 | Analysis library | `feature/19-analysis-library` | Reviewable candidates | Recording mutated or analysis needs browser | [spec-19](./specs/19-analysis-library.md) | Merged |
| 20 | Transformation plan | `feature/20-transformation-plan` | Real autocorrelation + parameterisation in JMX | Auto-apply without accept | [spec-20](./specs/20-transformation-plan.md) | Merged |
| 21 | User paths | `feature/21-user-paths` | Business-shaped scripts | Groups not editable | [spec-21](./specs/21-user-paths.md) | Merged (Phase 1) |
| 21-p2 | User paths Phase 2 | `feature/21-user-paths-phase-2` | Full heuristic surface + HAR round-trip fix | HAR data loss unfixed; action timestamps missing | [spec-21-p2](./specs/21-user-paths-phase-2.md) | Merged |
| 21-proto | Area 5 detached-window prototype | `prototype/area5-icon-opens-detached` | Resizable inspector from the toolbar icon | Shipped manifest still has `default_popup`; icon opens the constrained popup | [spec-21-proto](./specs/21-proto-prototype/area5-icon-opens-detached.md) | Merged |
| 22 | JMX hardening | `feature/22-jmx-hardening` | CI-ready scripts | Goldens unstable | [spec-22](./specs/22-jmx-hardening.md) | Not started |
| 23 | Debugger provider | `feature/23-debugger-provider` | Broader bodies | Permission rejected | [spec-23](./specs/23-debugger-provider.md) | Optional / gated |
| 24 | Plugin design | `feature/24-plugin-design` | Clear boundary | Features inventable with stock JMX | [spec-24](./specs/24-plugin-design.md) | Design only |

**Status values:** `Not started` · `Branch open` · `In review` · `Merged` · `Blocked` · `Deferred`

---

## 3. Current master baseline (facts)

Derived from repository review of Capultura (package `capyultura`, manifest Capultura BETA, MV3).

| Area | Current state |
| ---- | ------------- |
| HTTP capture | `chrome.webRequest` via `TrafficCaptureService` |
| Response bodies | Opt-in content-script fetch/XHR wrap; HTML often redacted; matching by tab/frame/method/URL |
| Actions | Content-script `ActionRecorder` |
| Storage | `RecorderState` + pending web-request store; `unlimitedStorage` |
| Export | JMX serializer + Playwright generator; HAR import path |
| Playback | Export-only (no in-extension replay engine) |
| Correlation | Plan-based autocorrelation + parameterisation accepted in UI and applied on export as stock JMeter extractors and `${variableName}` substitutions |
| Debugger / CDP | Not used |
| Tests | Vitest unit + Playwright E2E; quality scripts `crap` / `dry` |

Known limits that Feature 18 must document and Feature 19+ must respect:

- Response bodies are not available from `webRequest`.
- Content script cannot see all traffic (navigation, many cross-origin, opaque, non-XHR).
- Header maps collapse duplicate names.
- Action-to-request association is weak.

---

## 4. Cross-cutting quality gates (every feature)

Before merge:

| Gate | Command / check |
| ---- | ---------------- |
| Unit tests | `npm run test` |
| Types | `npm run typecheck` |
| Lint | `npm run lint` |
| Complexity | `npm run crap` on touched packages — no unexplained spikes |
| Duplication | `npm run dry` on touched packages |
| E2E (when UI/export touched) | `npm run build` then `npx playwright test` |
| Secrets | No real tokens/passwords in fixtures, logs, or goldens |
| Permissions | Any manifest change documented in PR and `docs/permissions.md` |

---

## 5. Principles (apply on every branch)

**SOLID**

- Single responsibility: capture, analysis, transform, and serialize stay separate.
- Open/closed: body providers and value extractors behind interfaces.
- Liskov: providers must not pretend they captured a body.
- Interface segregation: analysis must not depend on Chrome APIs.
- Dependency inversion: `RecorderService` orchestrates; pure modules do the work.

**DRY**

- One masking utility, one header/cookie/query parse path, shared extractor type names between analysis and JMX.

**CRAP / CLEAN**

- Prefer pure functions in `analysis/` and `transform/`.
- Small modules; avoid deep nested conditionals (use rule tables).
- Meaningful names; no speculative abstraction.
- Tests document behaviour; production code stays boring.

**Privacy**

- Mask Authorization, Cookie, Set-Cookie, password fields, access/refresh tokens, API keys by default in UI diagnostics and analysis display.

---

## 6. Suggested merge order and stop lines

| Step | Merge when | Do not merge if |
| ---- | ---------- | ---------------- |
| 17 | Suite green and baseline notes committed | Any test red |
| 18 | Diagnostics on exchanges; export still valid | Silent empty bodies or broken JMX |
| 19 | Candidates reviewable; recording immutable | Analysis requires browser runtime or mutates storage |
| 20 | Suite green; accepted plan produces stock JMeter extractors; V3.1–V3.10 audit passing | Anything auto-applied without accept |
| 21 | Groups editable before export | Groups inferred only from URL names with no edit UI |
| 21-proto | Built manifest omits `default_popup`; toolbar icon opens a resizable detached inspector | Source manifest is shipped with `default_popup` or the icon still opens the constrained popup |
| 22 | Goldens stable; multi-iteration smoke passes | Flaky goldens or encoding regressions |
| 23 | Optional; product accepts debugger permission | Forced as required path for ordinary JMX |
| 24 | Design doc only | Implementation of plugin code on this track |

---

## 7. How to use this folder

```text
specs/
  xxx-progress-master.md    ← this file (living map)
  17-baseline-lock.md
  18-capture-honesty.md
  19-analysis-library.md
  20-transformation-plan.md
  21-user-paths.md
  21-user-paths-phase-2.md
  21-proto-prototype/area5-icon-opens-detached.md
  22-jmx-hardening.md
  23-debugger-provider.md
  24-plugin-design.md
```

1. Open the next `Not started` feature spec.  
2. Create the named branch from `master`.  
3. Implement only that spec’s scope.  
4. Run quality gates.  
5. PR → review against the spec’s verification audit.  
6. Merge → set status to `Merged` here → start the next branch.

---

## 8. References

- Repository analysis and capability matrix (project conversation / internal review).
- JMeter correlation reference (extractors, two-recording diff, defaults, scoping) — informs Features 19 and 20.
- Existing repo docs: `README.md`, `docs/permissions.md`, `PRIVACY.md`, `specs/` historical feature notes.
