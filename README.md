# Capultura — Real Browser Flow Recorder

Capultura captures real browser flows, converts recordings into reproducible JMX and Playwright test scripts, and runs scalable performance tests for CI-ready load and functional validation.

## Current status

The current implementation is a Manifest V3 Chrome extension focused on browser HTTP traffic capture, JMX export, Playwright export, and a compact UX/UI pass for the popup/options pages.

Implemented in the current branch:

- HTTP traffic capture through `chrome.webRequest`
- JMX export with domain selection
- Playwright `.spec.ts` export with optional base URL
- Browser action recording for clicks, typing, and form submissions
- Popup transaction inspector with method/status/search filters
- Detached inspector window using `chrome.windows.create`
- Shared popup/options theme setting
- Unit tests for serializer, recorder state, traffic normalizer, action recording, Playwright generation, popup state, and options normalization
- Golden E2E extension export tests (`tests/e2e/spec-005-golden-extension.spec.ts`)
- Cross-window sync E2E test validating popup ↔ options page state synchronization
- Recorder state E2E tests (`tests/e2e/spec-001-extension.spec.ts`)
- HAR 1.2 builder and HAR→JMX conversion pipeline
- Permission refresh with `scripting` and `browsingData`

### Popup status text

- Idle / initial load: `Please start recording`
- Recording: `Recording`
- Paused: `Paused recorder state...`
- After stop / clear: `Please start recording`

### E2E tests

```bash
# Build the extension first (E2E loads from dist/)
npm run build

# Run Playwright E2E tests (starts fixture server automatically)
npx playwright test

# Update golden files if outputs changed intentionally
UPDATE_GOLDEN=1 npx playwright test
```

E2E tests require Chromium and the fixture server. Tests live in `tests/e2e/` and use
`playwright.config.ts`. Golden fixtures are in `tests/fixtures/golden/` and the local
fixture server is `scripts/e2e-server.mjs`.

## Code quality

```bash
npm run test:coverage   # unit tests with V8 coverage
npm run dry             # duplicate code detection (dry4js)
npm run crap            # CRAP risk analysis (crap4js)
```

## Quick start

```bash
npm ci
npm run dev  # builds and watches; load dist/ as unpacked extension
npm run build  # production bundle
```

## Development notes

- TypeScript strict mode enforced
- Source in `src/`, reference legacy code in `src-ori/`
- Specifications are in `specs/`
- CI guidance and project instructions are in `.github/instructions`
- Operational hardening roadmap is tracked in `specs/005-operational-hardening-roadmap.md`

## Enterprise packaging

```bash
npm run pack-crx  # produces signed .crx and enterprise-install.json for ExtensionInstallForcelist
```

## Permissions

Each manifest permission is required for core functionality:

| Permission | Purpose |
|------------|---------|
| `storage` | Persists recorder state (requests, plan name, options) across service-worker restarts. |
| `unlimitedStorage` | Allows recordings to exceed Chrome's default 5MB storage quota for large exports. |
| `webRequest` | Captures HTTP request headers and response status codes for traffic recording. |
| `activeTab` | Provides context for the active tab when starting a recording. |
| `windows` | Creates detached inspector popup windows for transaction review. |
| `downloads` | Enables local download of exported JMX and Playwright test scripts. |
| `scripting` | Dynamic content script injection for response body capture (opt-in). |
| `browsingData` | Clears captured data on explicit user request (reset action). |
| `<all_urls>` | Host permission; narrowed by URL filter patterns in advanced options. |

## Privacy & Sensitive Data

The extension captures and may export sensitive data. Understanding the behavior:

- **Cookies:** Only persisted when "Emit cookies in JMX" is checked (`recordCookies: true`). Captured cookies appear in exports.
- **Authorization headers:** Captured and included in JMX exports. These may contain session tokens or API keys.
- **Query parameters:** Captured and included in exports. May contain PII, tokens, or sensitive identifiers.
- **Request bodies:** Captured and included in JMX exports. May contain credentials or PII.
- **Response bodies:** Only captured when "Capture response bodies" is enabled (opt-in, separate feature). Truncated if large.

See [PRIVACY.md](./PRIVACY.md) for the complete privacy policy.

**Recommendation:** Review exported JMX files before committing to version control or sharing. Remove sensitive data or use the extension only against non-production environments.

## Known Limits

| Limit | Value | Notes |
|-------|-------|-------|
| Max transactions displayed | 200 | Configurable via storage; older requests are trimmed. |
| Storage quota | Unlimited | Requires `unlimitedStorage` permission; bounded by device capacity. |
| Popup width | 420px | Transaction inspector constrained to popup drawer. |
| Service worker lifecycle | MV3 | Recording state persists via `chrome.storage.local`; no persistent background page. |
| Response body capture | Opt-in | Requires explicit user enable; adds runtime overhead. |
| Large exports | Tested to 1000 steps | Playwright export tested with 1000 requests; JMX tested to similar scale. |

## E2E tests

```bash
# Build the extension first (E2E loads from dist/)
npm run build

# Run Playwright E2E tests (starts fixture server automatically)
npx playwright test

# Update golden files if outputs changed intentionally
UPDATE_GOLDEN=1 npx playwright test
```

E2E tests require Chromium and the fixture server. Tests live in `tests/e2e/` and use
`playwright.config.ts`. Golden fixtures are in `tests/fixtures/golden/` and the local
fixture server is `scripts/e2e-server.mjs`.
