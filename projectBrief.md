# Project Brief: BM JMX Recorder

## Goal

Replace JMeter recorder friction with an MV3 extension that outputs JMX.

## Scope

- Browser recording only; no system MITM
- Deliverables: canonical CapturedRequest model, jmx/serializer, background RecorderService, content-script interceptors, CI, signed .crx

## Constraints

- Enterprise must be able to force-install
- No runtime OSS on endpoints

## Success metrics

- JMX opens in JMeter
- Enterprise silent install validated

## Architecture

### Modules

- `capture/` — Request capture logic (webRequestAdapter, contentCapture)
- `jmx/` — JMX serializer
- `background/` — RecorderService with state management
- `ui/` — Popup and options UI
- `models/` — TypeScript interfaces

### Data flow

1. Content script intercepts fetch/XHR/form submissions
2. Background service worker collects CapturedRequest objects
3. `buildJmx()` transforms requests into JMeter XML
4. User downloads .jmx file or extension auto-saves

## Technical decisions

- Vite + CRXJS for fast HMR and MV3 support
- TypeScript strict mode with `noImplicitAny`, `strictNullChecks`
- Vitest for unit tests, Playwright for E2E
- Enterprise packaging via `pack-crx` script producing signed artifact