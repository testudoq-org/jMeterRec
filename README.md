# bm-jmx-recorder — MV3 JMeter recorder

What: Browser recorder that captures HTTP + Selenium interactions and exports JMX.

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

## Enterprise packaging

```bash
npm run pack-crx  # produces signed .crx and enterprise-install.json for ExtensionInstallForcelist
```

## Project structure

```
├── src/
│   ├── background/     # Service worker
│   ├── content/        # Content scripts
│   ├── jmx/            # JMX serializer
│   ├── models/         # TypeScript interfaces
│   └── manifest.json   # MV3 manifest
├── tests/
│   ├── unit/           # Vitest unit tests
│   └── e2e/            # Playwright E2E tests
├── scripts/            # Build scripts
└── .github/workflows/  # CI/CD
```