# Capultura — Real Browser Flow Recorder

Capultura captures real user interactions across Selenium, JMX and Playwright, converts recordings into reproducible test scripts, and runs scalable performance tests for CI-ready load and functional validation.

## Quick start

```bash
npm ci
npm run dev  # builds and watches; load dist/ as unpacked extension
npm run build  # production bundle
```

## Development notes

- TypeScript strict mode enforced
- Source in `src/`, reference legacy code in `src-ori/`
- Keep `memory-bank/` for design artifacts
- Instructions are in .github\instructions
- Specifications are in the specs/

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
│   └── manifest.json   # MV3 manifest
├── tests/
│   ├── unit/           # Vitest unit tests
│   └── e2e/            # Playwright E2E tests
├── scripts/            # Build scripts
└── .github/workflows/  # CI/CD
```