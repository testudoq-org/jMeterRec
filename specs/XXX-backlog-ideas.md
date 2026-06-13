### Summary

You already have a working MV3 extension that captures browser traffic, records Selenium interactions, and exports YAML. The fastest, lowest-friction path to a JMeter-compatible recorder is to **finish the MV3 extension** by adding robust JMX serialization, cleaning the background/service-worker code, and hardening the content-script capture for request bodies and correlation.

> **From the brief:** **Recommendation: TypeScript MV3 Chrome extension, deployed via enterprise Chrome policy.**
> **From the brief:** **The work is 70% done.**

---

### Quick comparison (decision table)

| **Attribute**                         | **Go CLI (local proxy)** | **TypeScript MV3 extension**         | **Notes**                                |
| ------------------------------------------- | -----------------------------: | ------------------------------------------ | ---------------------------------------------- |
| **Feasibility for browser recording** |                           High | High                                       | Both capture browser HTTP traffic              |
| **User friction (certs / proxy)**     |                           High | Low                                        | Go requires CA install and proxy config        |
| **Enterprise open-source risk**       |                      Ambiguous | Low                                        | Extension compiled JS is easiest to approve    |
| **Non-browser traffic capture**       |                  **Yes** | No                                         | Go can capture system-wide traffic             |
| **Request body fidelity**             |                           Full | Good via onBeforeRequest + content scripts | Extension already uses requestBody workarounds |
| **Deployment & scaling**              |             Installer required | Enterprise policy (.crx)                   | Extension can be force-installed silently      |

**Verdict:** **TypeScript MV3 extension** is the recommended primary approach for browser-based recording in enterprise environments. Use a Go CLI only if you must capture non-browser traffic.

---

### Refactor plan — high level (6 steps)

1. **Separate concerns and modularize**

   - Move JMX serialization into a single module `jmx/serializer.ts`.
   - Keep capture logic in `capture/` with two submodules: `webRequestAdapter.ts` and `contentCapture.ts`.
   - Keep UI and orchestration in `ui/` and `background/` respectively.
2. **Stabilize request capture**

   - Use `chrome.webRequest.onBeforeRequest` with `requestBody` where available.
   - For forms, file uploads, and fetch/XHR bodies, add content-script interception fallback that posts messages to the service worker.
   - Normalize captured requests into a single canonical `CapturedRequest` interface.
3. **Implement robust JMX serializer**

   - Build a deterministic XML template generator that maps `CapturedRequest` → JMeter HTTPSamplerProxy nodes.
   - Add support for common JMeter elements: CookieManager, CacheManager, Timers, CSV Data Set Config, JSON/Regex extractors.
   - Provide a compact mapping config to control sampler naming and grouping.
4. **Refactor background service worker**

   - Convert large monolithic `dist/background/index.js` into typed modules with clear lifecycle hooks: `startRecording`, `pause`, `resume`, `stopRecording`, `exportJMX`.
   - Replace global state with a `RecorderState` class instance persisted to `chrome.storage.local`.
5. **Testing and QA**

   - Unit tests for serializer and canonicalization logic using `mocha` + `chai` or `jest` in CI.
   - End-to-end tests using a headless Chrome runner that loads the extension and performs scripted navigation to validate JMX output.
   - Add a small sample site and golden JMX files for regression tests.
6. **Enterprise packaging & policy**

   - Build a reproducible release pipeline that outputs a signed `.crx` and the compiled JS bundle.
   - Provide an enterprise install manifest and a one-click GPO/GPO-like instruction set for ExtensionInstallForcelist deployment.

---

### Concrete code-level refactors

#### 1. Canonical request model

Create a single TypeScript interface and conversion helpers.

```ts
export interface CapturedRequest {
  id: string;
  timestamp: string;
  method: 'GET'|'POST'|'PUT'|'DELETE'|string;
  url: string;
  headers: Record<string,string>;
  queryParams: Record<string,string>;
  body?: string | ArrayBuffer;
  contentType?: string;
  tabId?: number;
  frameId?: number;
  initiator?: string;
}
```

- **Why**: simplifies serializer and downstream transforms.
- **Action**: implement `normalizeWebRequest(details): CapturedRequest` and `normalizeContentScriptMessage(msg): CapturedRequest`.

#### 2. JMX serializer API

Expose a small API:

```ts
export function buildJmx(planMeta: PlanMeta, requests: CapturedRequest[]): string
```

- **Implementation notes**:
  - Use a small XML builder that escapes values safely.
  - Group samplers by host and path prefix to reduce noise.
  - Support configurable naming templates like `${method} ${host}${path} #${counter}`.

#### 3. Background worker lifecycle

Replace ad-hoc message handling with a command router.

```ts
class RecorderService {
  state: RecorderState;
  startRecording(name: string, tabId?: number): Promise<void>;
  pauseRecording(): void;
  resumeRecording(): void;
  stopRecording(): Promise<string>; // returns JMX string
}
```

- **Why**: easier to reason about and test.
- **Action**: wire `chrome.runtime.onMessage` to call these methods and return structured responses.

#### 4. Content script fallbacks

- Intercept `fetch` and `XMLHttpRequest` bodies in content scripts and forward to background via `chrome.runtime.sendMessage`.
- For form submissions, attach `submit` listeners and serialize `FormData` to a safe representation.

#### 5. Performance and memory

- Stream captured requests to `chrome.storage.local` in batches to avoid memory spikes.
- Keep an in-memory ring buffer for live UI preview and persist full capture to storage on stop.

---

### Acceptance criteria (minimal)

- **Recording**: Start/stop/pause/resume works and captures all navigations and XHR/fetch bodies for modern SPAs.
- **JMX output**: Generated JMX opens in JMeter and reproduces the recorded sequence with correct methods, headers, bodies, and basic assertions.
- **No external calls**: Recording and JMX generation are fully local.
- **Enterprise deployable**: Compiled artifact can be force-installed via ExtensionInstallForcelist and requires no CA or proxy changes.
- **Tests**: Unit tests for serializer and an E2E test that validates a golden JMX file.

---

### Spec-format prompts for implementation tasks

Use these prompts with an engineer or an AI code generator. Each prompt is a self-contained spec.

```yaml
- title: "Canonical request model and normalizers"
  goal: "Create a single CapturedRequest interface and two normalizers"
  inputs:
    - "chrome.webRequest details object"
    - "content-script message object"
  outputs:
    - "src/models/CapturedRequest.ts"
    - "src/adapters/webRequestAdapter.ts"
    - "src/adapters/contentCaptureAdapter.ts"
  acceptance_criteria:
    - "webRequestAdapter.normalize(details) returns CapturedRequest"
    - "contentCaptureAdapter.normalize(msg) returns CapturedRequest"
    - "unit tests cover GET, POST, multipart/form-data, fetch, XHR"
```

```yaml
- title: "JMX serializer module"
  goal: "Serialize an array of CapturedRequest into a valid JMeter JMX XML string"
  inputs:
    - "Plan metadata (name, thread group settings)"
    - "CapturedRequest[]"
  outputs:
    - "src/jmx/serializer.ts"
    - "tests/jmx/golden.test.ts"
  acceptance_criteria:
    - "buildJmx returns XML that JMeter can open"
    - "Sampler names are configurable via template"
    - "Supports CookieManager, CSV Data Set Config, and basic extractors"
```

```yaml
- title: "Background service worker refactor"
  goal: "Replace monolithic background script with RecorderService class"
  inputs:
    - "Existing dist/background/index.js behavior"
  outputs:
    - "src/background/recorderService.ts"
    - "src/background/messageRouter.ts"
  acceptance_criteria:
    - "startRecording/pause/resume/stopRecording methods implemented"
    - "chrome.runtime.onMessage routes to RecorderService methods"
    - "State persisted to chrome.storage.local"
```

```yaml
- title: "Content script body capture fallbacks"
  goal: "Ensure request bodies are captured for fetch, XHR, and forms"
  inputs:
    - "content scripts injected at document_start"
  outputs:
    - "src/content/fetch-interceptor.ts"
    - "src/content/xhr-interceptor.ts"
    - "src/content/form-interceptor.ts"
  acceptance_criteria:
    - "Interceptors post normalized messages to background"
    - "Large binary uploads are represented as metadata and SHA256"
```

```yaml
- title: "Enterprise packaging and CI"
  goal: "Produce reproducible builds and enterprise install artifacts"
  inputs:
    - "TypeScript source"
  outputs:
    - "build pipeline config (GitHub Actions or similar)"
    - "signed .crx artifact"
    - "enterprise install manifest and docs"
  acceptance_criteria:
    - "CI produces deterministic .crx and source map"
    - "Release notes and install instructions included"
```

---

### Testing, rollout, and monitoring

- **Golden tests**: keep a small set of sample sites and expected JMX outputs.
- **Beta rollout**: publish to a small enterprise OU first via ExtensionInstallForcelist.
- **Telemetry**: optional anonymized metrics for errors and export success rates. Ensure telemetry is opt-in and documented for enterprise review.
- **Rollback**: provide a simple uninstall script and a version pinning mechanism for enterprise admins.
