# Project Brief: Capultura

## Statement

Capultura — Record, script and scale real browser flows (Selenium, JMX, Playwright) for reliable performance testing.

## Short description

Capultura captures real user interactions across Selenium, JMX and Playwright, converts recordings into reproducible test scripts, and runs scalable performance tests for CI-ready load and functional validation.

## Goal

Provide unified recording and load-testing workflows by supporting Selenium/JMX-style recording and modern Playwright captures. Record real browser flows, edit and parameterize scripts, then execute them at scale with configurable load patterns, metrics, and CI integrations.

## Scope

- Browser recording only; no system MITM
- Deliverables: canonical CapturedRequest model, ActionStep model, jmx/serializer, Playwright generator, background RecorderService, content-script interceptors, CI, signed .crx

## Long description

Capultura unifies recording and load-testing workflows by supporting Selenium/JMX-style recording and modern Playwright captures. Record real browser flows, edit and parameterize scripts, then execute them at scale with configurable load patterns, metrics, and CI integrations. Built for QA and SRE teams, Capultura makes it fast to reproduce user journeys, find performance regressions, and validate functional behavior under realistic load.

## Constraints

- Enterprise must be able to force-install
- No runtime OSS on endpoints

## Success metrics

- JMX opens in JMeter
- Generated Playwright tests run successfully
- Enterprise silent install validated

## Architecture

### Modules

- `capture/` — Request capture logic (webRequestAdapter, contentCapture)
- `jmx/` — JMX serializer
- `generators/` — Playwright test generator
- `background/` — RecorderService with state management
- `content/` — Action recorder for DOM events
- `ui/` — Popup and options UI
- `models/` — TypeScript interfaces (CapturedRequest, ActionStep)

### Data flow

1. Content script intercepts DOM events (click, type, select)
2. Background service worker collects both HTTP requests and ActionSteps
3. JMX or Playwright generators transform to test scripts
4. User downloads .jmx or .spec.ts file

## Technical decisions

- Vite + CRXJS for fast HMR and MV3 support
- TypeScript strict mode with `noImplicitAny`, `strictNullChecks`
- Vitest for unit tests, Playwright for E2E
- Enterprise packaging via `pack-crx` script producing signed artifact