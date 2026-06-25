# 013 - JMX Output Hardening

Status: Proposed

## 1. Purpose

Harden JMX output for enterprise deployment by ensuring all generated JMX files pass JMeter validation, add missing JMX elements (CacheManager, extractors, assertions), and improve test coverage for edge cases.

## 2. Context

Following the implementation of 009-jmx-export-quality and 012-external-har-import, the codebase now generates JMX files that can be imported into JMeter. However, enterprise users need:

- Guaranteed compatibility across JMeter versions
- Explicit samplers for common testing needs (timers, extractors, assertions)
- Clear documentation of known limitations and edge cases

## 3. Proposed Scope

### In Scope
- Add CacheManager support for caching test scenarios
- Add JSON/Regex extractors for dynamic parameter handling
- Add DurationAssertion for timing validation
- Add ResponseAssertion for status code verification
- Expand test coverage for edge cases (malformed URLs, large payloads, special characters)
- Document known JMX structure limitations

### Out of Scope
- New recorder features
- Backend upload flows
- Framework migration

## 4. Dependencies
- Stable core recording/export flows (009, 012)
- specs/006-enhance-jmx-implementation.md G21
- specs/011-quality-uplift.md

## 5. Proposed Acceptance Criteria

- All generated JMX files pass JMeter 5.2+ import validation
- Extractors work correctly for JSON response bodies
- CacheManager samplers are optional and configurable
- Documentation covers known edge cases
- Test coverage for failure modes and edge cases added
