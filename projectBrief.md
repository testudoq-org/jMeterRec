# Project Brief: Capultura

## Statement

Capultura — Record, script and scale real browser flows (JMX, Playwright) for reliable performance testing.

## Short description

Capultura captures real browser flows, converts recordings into reproducible JMX and Playwright test scripts, and runs scalable performance tests for CI-ready load and functional validation.

## Goal

Provide unified recording and load-testing workflows by supporting JMX-style recording and modern Playwright captures. Record real browser flows, edit and parameterize scripts, then execute them at scale with configurable load patterns, metrics, and CI integrations.

## Scope

- Browser recording only; no system MITM
- Deliverables: canonical CapturedRequest model, ActionStep model, JMX serializer, Playwright generator, background RecorderService, content-script action recorder, popup/options UI, transaction inspector, CI, and signed `.crx`
- Current UI scope: compact popup/options layout, transaction inspector, detached inspector window, and shared theme setting

## Long description

Capultura unifies recording and load-testing workflows by supporting JMX-style recording and modern Playwright captures. Record real browser flows, edit and parameterize scripts, then execute them at scale with configurable load patterns, metrics, and CI integrations. Built for QA and SRE teams, Capultura makes it fast to reproduce user journeys, find performance regressions, and validate functional behavior under realistic load.

The current branch adds a read-only transaction inspector that displays recently captured HTTP requests in the popup, seeds from persisted requests, updates from existing recording broadcasts, and exposes compact filters/details. It does not implement guaranteed response body capture.

## Constraints

- Enterprise must be able to force-install
- No runtime OSS on endpoints
- MV3 service worker lifecycle must be treated as non-persistent
- Response bodies are not reliably available from `chrome.webRequest` and require a separate opt-in capture design

## Success metrics

- JMX opens in JMeter
- Generated Playwright tests run successfully
- Enterprise silent install validated
- Popup remains usable at 420px width
- Transaction inspector updates without changing existing recording/export behavior

## Architecture

### Modules

- `capture/` — Request capture logic (`webRequestAdapter`, `contentCapture`)
- `jmx/` — JMX serializer
- `generators/` — Playwright test generator
- `background/` — RecorderService with state management and HTTP capture
- `content/` — Action recorder for DOM events
- `popup/` — Extension action popup, recorder controls, export controls, transaction inspector
- `options/` — JMX defaults, transaction inspector settings, theme
- `models/` — TypeScript interfaces (`CapturedRequest`, `ActionStep`)

### Data flow

1. Content script intercepts DOM events (click, type, select) and sends action steps to the background.
2. Background service worker collects HTTP requests through `chrome.webRequest` and persists state to `chrome.storage.local`.
3. Background broadcasts `STATE_CHANGED` and `REQUEST_CAPTURED` runtime messages.
4. Popup updates recorder state, seeds its transaction inspector from `GET_REQUESTS`, and appends live `REQUEST_CAPTURED` messages.
5. JMX or Playwright generators transform captured data to test scripts.
6. User downloads `.jmx` or `.spec.ts` file.
7. Optional detached inspector window reuses the popup UI and receives the same runtime messages.

## Technical decisions

- Vite + CRXJS for fast HMR and MV3 support
- TypeScript strict mode with `noImplicitAny`, `strictNullChecks`
- Vitest for unit tests, Playwright for E2E
- Vanilla TypeScript ES modules for popup/options UI
- Manifest permissions currently include `storage`, `unlimitedStorage`, `webRequest`, `activeTab`, and `windows`
- Enterprise packaging via `pack-crx` script producing signed artifact

## Open risks

- Response body capture remains out of scope for the current UX/UI branch
- Service-worker termination can still lose in-flight webRequest fragments
- JMX serializer covers basic HTTP sampler output but not all JMeter managers, timers, extractors, or assertions
- Golden E2E extension export tests are still pending
- CRX packaging needs validation in the intended packaging environment
