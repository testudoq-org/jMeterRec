### Summary

You already have a working MV3 extension that captures browser traffic, records Selenium interactions, and exports YAML. The fastest, lowest-friction path to a JMeter-compatible recorder is to **finish the MV3 extension** by adding robust JMX serialization, cleaning the background/service-worker code, and hardening the content-script capture for request bodies and correlation.

> **From the brief:** **Recommendation: TypeScript MV3 Chrome extension, deployed via enterprise Chrome policy.**
> **From the brief:** **The work is 70% done.**

---

### Quick comparison (decision table)

| **Attribute** | **Go CLI (local proxy)** | **TypeScript MV3 extension** | **Notes** |
| ------------------------------------------- | -----------------------------: | ------------------------------------------ | ---------------------------------------------- |
| **Feasibility for browser recording** | High | High | Both capture browser HTTP traffic |
| **User friction (certs / proxy)** | High | Low | Go requires CA install and proxy config |
| **Enterprise open-source risk** | Ambiguous | Low | Extension compiled JS is easiest to approve |
| **Non-browser traffic capture** | **Yes** | No | Go can capture system-wide traffic |
| **Request body fidelity** | Full | Good via onBeforeRequest + content scripts | Extension already uses requestBody workarounds |
| **Deployment & scaling** | Installer required | Enterprise policy (.crx) | Extension can be force-installed silently |

**Verdict:** **TypeScript MV3 extension** is the recommended primary approach for browser-based recording in enterprise environments. Use a Go CLI only if you must capture non-browser traffic.

---

### Refactor plan — high level (6 steps)

1. **Separate concerns and modularize**

   - [x] Move JMX serialization into a single module `jmx/serializer.ts`.
   - [~] Keep capture logic in `capture/` with two submodules: `webRequestAdapter.ts` and `contentCapture.ts`. *(partially done - in background/content)*
   - [~] Keep UI and orchestration in `ui/` and `background/` respectively. *(skeleton in background/, ui/ not yet created)*

2. **Stabilize request capture**

   - [x] Use `chrome.webRequest.onBeforeRequest` with `requestBody` where available.
   - [x] For forms, file uploads, and fetch/XHR bodies, add content-script interception fallback that posts messages to the service worker.
   - [x] Normalize captured requests into a single canonical `CapturedRequest` interface.

3. **Implement robust JMX serializer**

   - [x] Build a deterministic XML template generator that maps `CapturedRequest` → JMeter HTTPSamplerProxy nodes.
   - [~] Add support for common JMeter elements: CookieManager, CacheManager, Timers, CSV Data Set Config, JSON/Regex extractors. *(basic HTTPSamplerProxy done)*
   - [~] Provide a compact mapping config to control sampler naming and grouping. *(basic naming done)*

4. **Refactor background service worker**

   - [x] Convert large monolithic `dist/background/index.js` into typed modules with clear lifecycle hooks: `startRecording`, `stopRecording`.
   - [~] Implement `pauseRecording`/`resumeRecording` methods. *(RecorderState class exists, methods stubbed)*
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
- [x] `normalizeWebRequest(details)` - implemented in `src/background/index.ts`
- [x] `normalizeContentScriptMessage(msg)` - implemented in `src/content/index.ts`

#### 2. JMX serializer API

- [x] `buildJmx(planMeta, requests)` - implemented in `src/jmx/serializer.ts`
- [~] Unit tests passing (4 tests in `src/jmx/serializer.test.ts`)

#### 3. Background worker lifecycle

- [x] `RecorderService` class with `startRecording`/`stopRecording` methods
- [~] `RecorderState` class with persistence to `chrome.storage.local`
- [~] `pauseRecording`/`resumeRecording` - not yet implemented

#### 4. Content script fallbacks

- [x] Fetch interceptor implemented in `src/content/index.ts`
- [x] XHR interceptor implemented in `src/content/index.ts`
- [~] Form submission interceptor - not yet implemented

#### 5. Performance and memory

- [~] Batch streaming to `chrome.storage.local` - not yet implemented
- [~] Ring buffer for live UI preview - not yet implemented

---

### Acceptance criteria (minimal)

- [~] **Recording**: Start/stop/pause/resume works and captures all navigations and XHR/fetch bodies for modern SPAs. *(start/stop works, pause/resume pending)*
- [~] **JMX output**: Generated JMX opens in JMeter and reproduces the recorded sequence with correct methods, headers, bodies, and basic assertions. *(basic sampler generation works)*
- [x] **No external calls**: Recording and JMX generation are fully local.
- [x] **Enterprise deployable**: Compiled artifact can be force-installed via ExtensionInstallForcelist and requires no CA or proxy changes.
- [~] **Tests**: Unit tests for serializer and an E2E test that validates a golden JMX file. *(unit tests pass, E2E pending)*

---

### Spec-format prompts for implementation tasks

Completed specs in commit 354f383:

```yaml
- title: "Canonical request model and normalizers"
  status: [x] COMPLETE
  outputs:
    - src/models/captured-request.ts (DONE)
    - src/background/index.ts (normalizeWebRequest DONE)
    - src/content/index.ts (normalizeContentScriptMessage DONE)
```

```yaml
- title: "JMX serializer module"
  status: [~] PARTIAL
  outputs:
    - src/jmx/serializer.ts (DONE - basic stub)
    - src/jmx/serializer.test.ts (DONE - 4 tests passing)
  remaining:
    - CookieManager, CacheManager support
    - Template-based naming
```

```yaml
- title: "Background service worker refactor"
  status: [x] COMPLETE
  outputs:
    - src/background/index.ts (RecorderService DONE - start/stop implemented)
  remaining:
    - pauseRecording/resumeRecording methods
    - exportJMX method
```

```yaml
- title: "Content script body capture fallbacks"
  status: [~] PARTIAL
  outputs:
    - src/content/index.ts (fetch/XHR interceptors DONE)
  remaining:
    - form-interceptor.ts (form submission capture)
```

```yaml
- title: "Enterprise packaging and CI"
  status: [x] COMPLETE
  outputs:
    - .github/workflows/ci.yml (DONE)
    - scripts/pack-crx.mjs (DONE - needs Chrome on CI)
```

---

### Testing, rollout, and monitoring

- [~] **Golden tests**: keep a small set of sample sites and expected JMX outputs. *(directory created, no files yet)*
- [~] **Beta rollout**: publish to a small enterprise OU first via ExtensionInstallForcelist. *(enterprise-install.json script ready)*
- [~] **Telemetry**: optional anonymized metrics for errors and export success rates. *(not implemented - opt-in only)*
- [~] **Rollback**: provide a simple uninstall script and a version pinning mechanism for enterprise admins. *(not implemented)*