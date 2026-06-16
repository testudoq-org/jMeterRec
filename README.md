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

Deferred follow-ups:

- Guaranteed response body capture
- Background port forwarding for transaction events
- Mid-flight request persistence across service-worker termination
- Golden E2E extension export tests
- Full CRX packaging validation in the intended packaging environment

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

## Project structure

```
├── src/
│   ├── background/     # Service worker
│   ├── content/        # Content scripts (action recorder)
│   ├── generators/     # Playwright test generator
│   ├── jmx/            # JMX serializer
│   ├── models/         # TypeScript interfaces
│   ├── popup/          # Extension action popup
│   ├── options/        # Extension options page
│   └── manifest.json   # MV3 manifest
├── tests/
│   ├── unit/           # Vitest unit tests
│   └── e2e/            # Playwright E2E tests
├── scripts/            # Build scripts
└── .github/workflows/  # CI/CD
```
