# Master Baseline — Verified State

**Branch:** `feature/17-baseline-lock`  
**Date:** 2026-09-04  
**Commit base:** `master`  
**Status:** Verified clean — all quality gates pass

---

## Verification Results

| Gate       | Command            | Result                                  |
|------------|--------------------|-----------------------------------------|
| Unit tests | `npm run test`     | **438 passed** (24 test files)          |
| Types      | `npm run typecheck`| Exit 0 — no errors                      |
| Lint       | `npm run lint`     | eslint + prettier — clean               |
| Build      | `npm run build`    | Complete — `dist/` emitted (613ms)      |
| Complexity | `npm run crap`     | 0 high-risk, 0 moderate functions       |
| Duplication| `npm run dry`      | Exit 0 — minor duplicates only          |

All 8 progress-table status entries in `xxx-progress-master.md` are `Not started`.

---

## Architecture Summary

### Build / Tooling
- **Framework:** Manifest V3 Chrome extension (Crx-Vite)
- **Package name:** `capyultura`
- **Version:** 0.2.1 (manifest + VERSION file)
- **Test runner:** Vitest (node env, `src/**/*.test.ts`)
- **E2E:** Playwright on chromium, fixtures served via `scripts/e2e-server.mjs`
- **Scripts:** `dev`, `build`, `lint`, `test`, `crap` (CRAP complexity), `dry` (duplication)

### Source Layout (`src/`)

```
src/
├── background/          # Service worker
│   ├── index.ts          # Entry: message listener dispatch
│   ├── recorder-service.ts     (574) — orchestrator
│   ├── traffic-capture.ts      (431) — webRequest listeners
│   ├── traffic-normalizer.ts   (253) — request normalization
│   ├── response-body-store.ts  (144) — body TTL store
│   ├── response-body-matching-service.ts (112)
│   ├── pending-web-request-store.ts (140)
│   ├── recorder-state.ts        — State persistence
│   └── ...                     (domain, messages, etc.)
├── content/             # Content scripts
│   ├── index.ts          # UI injection
│   ├── action-recorder.ts (264) — click/type/submit recording
│   ├── response-body-capture.ts (302) — fetch/XHR wrapping
│   └── selector-builder.ts
├── popup/               # Popup UI
│   ├── popup.ts          (1321) — main UI controller
│   ├── jmx-validation.ts (93)
│   ├── jmx-preview.ts
│   └── ...
├── options/             # Options pages
│   ├── options.ts
│   ├── jmx-options.ts     (235)
│   └── advanced-options.ts (389)
├── jmx/                 # JMX serialization & validation
│   ├── serializer.ts     (350) — buildJmx()
│   ├── element-model.ts  (957) — ELEMENT_HIERARCHY + factories
│   ├── har-to-jmx.ts     (381) — convertHarToJmx()
│   ├── validator.ts      (587) — JMXValidator
│   ├── domains.ts        (89)
│   └── ...
├── har/                 # HAR construction
│   └── har-builder.ts    (148) — buildHar()
├── generators/          # Export format generators
│   ├── playwright.ts     (97) — buildPlaywrightTest()
│   └── playwright-locator.ts
├── models/              # Shared type definitions
│   ├── captured-request.ts  (61)
│   └── pending-web-request.ts (54)
├── utils/               # Shared utilities
│   ├── xml-sanitizer.ts   (24) — sanitizeForXml()
│   ├── response-body.ts   (110)
│   ├── filename.ts
│   └── ...
└── manifest.json        # MV3 manifest

### Legacy Code
- **`src-ori/`** — Original SideeX code. Not included in the build. Retained for historical reference.
```

### Key Design Decisions (frozen at baseline)

| Concern | Implementation |
|---------|----------------|
| HTTP capture | `chrome.webRequest` (blocking + extraHeaders) |
| Response bodies | Opt-in content-script fetch/XHR wrapping; HTML (`text/html`, `application/xhtml+xml`) redacted |
| Body storage | TTL 15 min, max 200 entries |
| Body matching | By tab + frame + method + URL (no body from webRequest itself) |
| Actions | Content-script `ActionRecorder` with `SelectorBuilder` |
| State persistence | `chrome.storage.session` + `chrome.storage.local` (unlimitedStorage) |
| Export formats | JMX (primary), Playwright TS, HAR import |
| Playback | Export-only — no in-extension replay engine |
| Correlation | Not implemented (manual extractors via options only) |
| Debugger/CDP | Not used |

### Known Limitations (must not regress)

1. **Response bodies unavailable from `webRequest`** — only via content-script wrapping of fetch/XHR; navigation, cross-origin, opaque, and non-XHR requests invisible.
2. **HTML bodies redacted** — `shouldRedact()` in `src/utils/response-body.ts`.
3. **Header maps collapse duplicate names** — last-value-wins behavior.
4. **Action-to-request association is weak** — no direct linking between UI actions and HTTP requests.
5. **Content script cannot see all traffic** — limited to page context.

### CI Configuration

- **`.github/workflows/ci.yml`** triggers on `master` and `main` (branch mirror).
- **AGENTS.md** states `master` is canonical default branch; `main` is a mirror.

### Documentation Status

| File | Notes |
|------|-------|
| `README.md` | Current status & features |
| `PRIVACY.md` | Effective June 28, 2026 |
| `CHANGELOG.md` | Correct — version 0.2.1 released July 23, 2026, matches VERSION/manifest/CWS |
| `docs/permissions.md` | Permissions table — `scripting`: pending, `browsingData`: pending |
| `specs/xxx-progress-master.md` | Updated (00-07 → 17-24 mapping) |

### Spec Inventory

| Spec | Description | Status |
|------|-----------|--------|
| `specs/17-baseline-lock.md` | Baseline lock & review | Current work |
| `specs/18-capture-honesty.md` | Capture honesty diagnostics | Not started |
| `specs/19-analysis-library.md` | Analysis library for correlation candidates | Not started |
| `specs/20-transformation-plan.md` | Autocorrelation + parameterisation plan | Not started |
| `specs/21-user-paths.md` | User path grouping | Not started |
| `specs/22-jmx-hardening.md` | JMX CI-readiness | Not started |
| `specs/23-debugger-provider.md` | Debugger/CDP provider | Optional/gated |
| `specs/24-plugin-design.md` | Plugin design (doc only) | Design only |

### Legacy Spec Files (pre-renumbering, still present)

Files `specs/003` through `specs/017` retained with historical notes. Cross-references updated to point to `xxx-progress-master.md`.
