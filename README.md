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
