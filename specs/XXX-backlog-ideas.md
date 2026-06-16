### Summary

You now have an MV3 extension port focused on browser HTTP traffic capture and local JMX export without SideeX/Selenium in the initial phase. The next work is to harden request-body fidelity, persist in-flight webRequest state, wire options into export metadata, and add golden E2E coverage.

> **From the brief:** **Recommendation: TypeScript MV3 Chrome extension, deployed via enterprise Chrome policy.**
> **Current status:** HTTP/JMX + Playwright MV3 SideeX-free port implemented in the working tree, with 004 UX/UI transaction inspector completed.

---

### Backlog — newest first

- [x] **004 UX/UI transaction inspector and detached window** — Add compact popup/options styling, transaction panel, filters, bounded live queue, theme persistence, and detached inspector window.
  - Status: implemented in `004-improve-ux-ui-implementation`
  - Depends on: stable popup/options IDs and existing `REQUEST_CAPTURED` / `GET_REQUESTS` APIs
  - Related spec: `specs/004-improve-ux-ui-implementation.md`
  - Remaining follow-ups: response body capture and optional background port forwarding
- [~] **Typed response body capture for transaction inspector** — Add explicit opt-in capture for page-origin response bodies with privacy warnings, size limits, and tests.
  - Status: proposed
  - Depends on: 004 UX/UI transaction inspector landing
  - Related spec: `specs/004-improve-ux-ui-implementation.md`
- [~] **Background port forwarding for transaction panel** — Add a `transaction-panel` runtime port so popup and detached inspector instances receive live `STATE_CHANGED` and `REQUEST_CAPTURED` events more reliably.
  - Status: proposed
  - Depends on: stable broadcast message contract
  - Related spec: `specs/004-improve-ux-ui-implementation.md`
- [~] **Typed content body fallback after SideeX removal** — Add a small proprietary content-script adapter for fetch/XHR/form bodies where `chrome.webRequest.requestBody` is incomplete.
  - Status: proposed
  - Depends on: HTTP/JMX + Playwright port landing
  - Related spec: SideeX dependency investigation
- [~] **Persist in-flight webRequest state** — Store pending request fragments so service-worker termination cannot lose requests between `onBeforeRequest` and `onCompleted`.
  - Status: proposed
  - Depends on: canonical `CapturedRequest` model
- [~] **Wire options into JMX export metadata** — Use saved threads, ramp-up, loops, and default plan name when exporting JMX.
  - Status: proposed
  - Depends on: options page and `RecorderService`
- [~] **Golden E2E extension test** — Load the unpacked extension, record a synthetic site, export JMX, and compare against a golden file.
  - Status: proposed
  - Depends on: stable popup/export flow
- [~] **Cleaner Vite dist layout** — Emit `popup/popup.html` and `options/options.html` at manifest paths instead of `dist/src/...`.
  - Status: proposed
  - Depends on: Vite build configuration review
- [~] **JMX manager/extractor coverage** — Add CookieManager, CacheManager, timers, extractors, assertions, and transaction grouping to the serializer.
  - Status: proposed
  - Depends on: target JMeter version confirmation
- [~] **CRX packaging validation** — Run `npm run pack-crx` in the intended packaging environment and fix placeholder/path handling.
  - Status: proposed
  - Depends on: Chrome/openssl availability
- [x] **HTTP/JMX + Playwright MV3 SideeX-free port** — Remove SideeX manifest entries, replace capture with `webRequest`, add typed background state, popup/options pages, local JMX export, Playwright export, and transaction inspector UI.
  - Status: implemented in working tree
  - Depends on: SideeX analysis
  - Related spec: `specs/004-improve-ux-ui-implementation.md`

### Quick comparison (decision table)

| **Attribute** | **Go CLI (local proxy)** | **TypeScript MV3 extension** | **Notes** |
| ------------------------------------------- | -----------------------------: | ------------------------------------------ | ---------------------------------------------- |
| **Feasibility for browser recording** | High | High | Both capture browser HTTP traffic |
| **User friction (certs / proxy)** | High | Low | Go requires CA install and proxy config |
| **Enterprise open-source risk** | Ambiguous | Low | Extension compiled JS is easiest to approve |
| **Non-browser traffic capture** | **Yes** | No | Go can capture system-wide traffic |
| **Request body fidelity** | Full | Good via `webRequest.requestBody`; fallback needed for edge cases | SideeX content interceptors removed from initial port |
| **Deployment & scaling** | Installer required | Enterprise policy (.crx) | Extension can be force-installed silently |

**Verdict:** **TypeScript MV3 extension** is the recommended primary approach for browser-based recording in enterprise environments. Use a Go CLI only if you must capture non-browser traffic.

---

### Refactor plan — high level (6 steps)

1. **Separate concerns and modularize**

   - [x] Move JMX serialization into a single module `jmx/serializer.ts`.
   - [x] Keep capture logic split between `background/traffic-capture.ts` and `background/traffic-normalizer.ts`.
   - [x] Keep UI and orchestration in popup/options pages and `background/recorder-service.ts`.

2. **Stabilize request capture**

   - [x] Use `chrome.webRequest.onBeforeRequest` with `requestBody` where available.
   - [~] Add typed content-script fallback for fetch/XHR/form bodies where `webRequest.requestBody` is incomplete.
   - [x] Normalize captured requests into a single canonical `CapturedRequest` interface.

3. **Implement robust JMX serializer**

   - [x] Build a deterministic XML template generator that maps `CapturedRequest` → JMeter HTTPSamplerProxy nodes.
   - [~] Add support for common JMeter elements: CookieManager, CacheManager, Timers, CSV Data Set Config, JSON/Regex extractors. *(basic HTTPSamplerProxy done)*
   - [~] Provide a compact mapping config to control sampler naming and grouping. *(basic naming done)*

4. **Refactor background service worker**

   - [x] Convert large monolithic `dist/background/index.js` into typed modules with clear lifecycle hooks: `startRecording`, `stopRecording`, `pauseRecording`, `resumeRecording`, and `EXPORT_JMX`.
   - [x] Implement `pauseRecording`/`resumeRecording` methods through `RecorderState`.
   - [x] Replace global state with a `RecorderState` class instance persisted to `chrome.storage.local`.

5. **Testing and QA**

   - [x] Unit tests for serializer and canonicalization logic using Vitest in CI.
   - [~] End-to-end tests using a headless Chrome runner that loads the extension and performs scripted navigation to validate JMX output. *(placeholder exists)*
   - [~] Add a small sample site and golden JMX files for regression tests. *(stub exists)*

6. **Enterprise packaging & policy**

   - [x] Build a reproducible release pipeline that outputs a signed `.crx` and the compiled JS bundle. *(script created, needs Chrome on CI for actual signing)*
   - [x] Provide an enterprise install manifest and a one-click GPO/GPO-like instruction set for ExtensionInstallForcelist deployment.

---

### Concrete code-level refactors

#### 1. Canonical request model

- [x] `src/models/captured-request.ts` - CapturedRequest and PlanMeta interfaces created
- [x] `traffic-normalizer.ts` - implemented in `src/background/traffic-normalizer.ts`
- [~] `normalizeContentScriptMessage(msg)` - SideeX-free content panel exists; body fallback still pending

#### 2. JMX serializer API

- [x] `buildJmx(planMeta, requests)` - implemented in `src/jmx/serializer.ts`
- [x] Unit tests passing for GET, POST body, CDATA body, and missing optional fields

#### 3. Background worker lifecycle

- [x] `RecorderService` class with `startRecording`/`stopRecording`/`pauseRecording`/`resumeRecording` methods
- [x] `RecorderState` class with persistence to `chrome.storage.local`
- [x] `pauseRecording`/`resumeRecording` implemented; traffic capture checks active recording status

#### 4. Content script lifecycle UI

- [x] SideeX-free status panel implemented in `src/content/index.ts`
- [~] Content body fallback for fetch/XHR/form capture - not yet implemented

#### 5. Performance and memory

- [~] Batch streaming to `chrome.storage.local` - not yet implemented
- [x] Ring buffer for live UI preview - bounded transaction queue implemented in popup; background in-flight persistence remains pending.

---

### Acceptance criteria (minimal)

- [x] **Recording**: Start/stop/pause/resume works and captures HTTP traffic through `webRequest` for the initial SideeX-free phase.
- [~] **JMX output**: Generated JMX opens in JMeter and reproduces recorded HTTP requests with methods, headers, paths, and bodies. *(basic sampler generation works; managers/extractors pending)*
- [x] **No external calls**: Recording and JMX generation are fully local.
- [x] **Enterprise deployable**: Compiled artifact can be force-installed via ExtensionInstallForcelist and requires no CA or proxy changes.
- [~] **Tests**: Unit tests pass; E2E golden extension export test still pending.

---

### Spec-format prompts for implementation tasks

Current implementation notes:

```yaml
- title: "Canonical request model and normalizers"
  status: [x] COMPLETE
  outputs:
    - src/models/captured-request.ts (DONE)
    - src/background/traffic-normalizer.ts (DONE)
    - src/background/traffic-capture.ts (DONE)
```

```yaml
- title: "JMX serializer module"
  status: [~] PARTIAL
  outputs:
    - src/jmx/serializer.ts (DONE - HTTPSamplerProxy/HeaderManager/basic CDATA body)
    - src/jmx/serializer.test.ts (DONE - 4 tests passing)
  remaining:
    - CookieManager, CacheManager support
    - Timers, extractors, assertions, transaction grouping
    - Template-based naming
```

```yaml
- title: "Background service worker refactor"
  status: [x] COMPLETE
  outputs:
    - src/background/recorder-service.ts (DONE - lifecycle/export implemented)
    - src/background/recorder-state.ts (DONE - persisted state)
    - src/background/index.ts (DONE - typed message bootstrap)
  remaining:
    - Persist in-flight webRequest fragments
    - Batch/debounce storage writes
```

```yaml
- title: "SideeX-free content lifecycle UI"
  status: [x] COMPLETE
  outputs:
    - src/content/index.ts (DONE - status panel, no SideeX)
    - src/popup/popup.ts (DONE - start/stop/pause/resume/export)
    - src/options/options.ts (DONE - local options)
  remaining:
    - content body capture fallback for fetch/XHR/form edge cases
```

```yaml
- title: "Enterprise packaging and CI"
  status: [~] PARTIAL
  outputs:
    - .github/workflows/ci.yml (DONE)
    - scripts/pack-crx.mjs (DONE - needs Chrome/openssl validation)
  remaining:
    - run pack-crx in packaging environment
    - fix placeholder CRX/path handling if needed
```

---

### Testing, rollout, and monitoring

- [x] **Unit tests**: serializer, recorder state, and traffic normalizer tests pass in Vitest.
- [~] **Golden tests**: keep a small set of sample sites and expected JMX outputs. *(E2E still placeholder)*
- [~] **Beta rollout**: publish to a small enterprise OU first via ExtensionInstallForcelist. *(enterprise-install.json script ready)*
- [~] **Telemetry**: optional anonymized metrics for errors and export success rates. *(not implemented - opt-in only)*
- [~] **Rollback**: provide a simple uninstall script and a version pinning mechanism for enterprise admins. *(not implemented)*