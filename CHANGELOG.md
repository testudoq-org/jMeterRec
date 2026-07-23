# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 0.2.0

_Expected 2026-07-23_

- **JMX export hardening:** strip XML 1.0 illegal characters (NUL, controls, DEL, C1 ranges) from request/response bodies, headers, cookies, query args, and regex extractors so generated JMX passes strict validators like BlazeMeter.
- **Serializer refactor:** extracted `buildSamplerSequence()`, `buildAssertionXml()`, `buildDurationAssertionXml()`, and `EXTRACTOR_BUILDERS` lookup table from `buildJmx()`; replaced extractor `if/else if` chain with `Map`-based dispatch.
- **Capture-time sanitization:** `decodeBytes()` and `measureBody()` now sanitize payloads at ingestion boundaries.
- **HAR import sanitization:** `convertHarToJmx()` sanitizes `postData.text` and `response.content.text`.
- **Defense-in-depth:** `buildJmx()` applies a final `sanitizeForXml()` pass to the complete assembled JMX string.
- **Module-private validation:** renamed `validateJmx()` to `assertJmxWellFormedInDom()` and made it module-private; documented as a dev-only DOM assertion.
- **Options backward compat:** `parseExtractors()` normalizes legacy extractor types (`json` → `JSONPostProcessor`, `regex` → `RegexExtractor`).
- **Tests:** added binary payload CDATA tests, HAR sanitization test, capture-time decode tests, and strengthened assertions to target CDATA content specifically.

## [0.0.4] - 2026-06-28

- Deterministic Node.js release workflow for Chrome Web Store verified CRX uploads (`scripts/release.mjs`).
- Privacy policy update with Chrome Web Store data usage disclosures.
- Private signing key (`extension.pem`) cleanup verified after CRX packaging.
- Removed deprecated `key` field from `manifest.json`; restored public key handling from PEM.

## [0.1.0] - 2026-06-28

- Initial signed CRX release workflow (replaced manual zip upload with scripted build → sign → zip → tag).
- MV3 BETA compliance: migrated to `@crxjs/vite-plugin`, updated branding to "Capultura BETA".
- Added `PRIVACY.md`, `SECURITY.md`, and support page with FAQ/contact form.
- HTTP request defaults (`HTTPRequestDefaults`) support with domain/port/protocol inheritance.
- CacheManager and DurationAssertion support in JMX export.
- Expanded unit and E2E test coverage for serializer, recorder state, and traffic normalizer.

## [0.0.5] - 2026-06-27

- Completed JMX output hardening spec actions (013-A7, 013-A8).
- Added external HAR import functionality with JMeter JMX export.
- Response body capture with opt-in model and privacy safeguards.
- Pending web request persistence across service-worker restarts.
- Golden extension E2E coverage.
- Advanced recorder options (content script injection, URL filters, custom user agents) with storage sync.
- Operational hardening: P4 JMX options normalization, P3 request-body fidelity roadmap.
