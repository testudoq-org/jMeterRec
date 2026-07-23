# 014 Deliverables — MV3 BETA Compliance & Release Readiness

## Assessment Summary

Specs 001–013 are complete. The next priority is **publishing readiness for a Chrome Developer BETA release**, not new recorder features.

## Current MV3 State

The extension is structurally Manifest V3 compliant:

- `manifest_version: 3` with ES module service worker
- `chrome.webRequest` capture using non-blocking listeners
- No `browserAction`, `background.page`, or remote code
- Host permissions declared via `host_permissions`

## Gaps vs Chrome BETA Publishing Guide

| Gap                                                                      | Severity |
| ------------------------------------------------------------------------ | -------- |
| No BETA label in `name` or `description`                                 | Must-fix |
| Version mismatch: `package.json` 0.0.5 vs `manifest.json` 0.1.0          | Must-fix |
| No stable extension `key` for enterprise force-install                   | High     |
| No `minimum_chrome_version`                                              | Medium   |
| Ensure all stale "BM JMX Recorder" branding is replaced with "capultura" | High     |
| `pack-crx.mjs` emits broken placeholder `.crx` when Chrome is absent     | High     |
| `enterprise-install.json` contains unmapped `file://` placeholder paths  | High     |
| No privacy policy or support URLs for Chrome Web Store listing           | Must-fix |
| Icon paths and Vite dist layout unverified                               | Medium   |
| Golden E2E tests exist but unvalidated against current build             | Medium   |

## Prioritized Deliverables

### P0 — Must-fix before BETA submission

1. **BETA manifest label** — Append "BETA" to `name`; add "THIS EXTENSION IS FOR BETA TESTING" to `description`
2. **Version alignment** — Bump `package.json`, `manifest.json`, and `VERSION` to `0.1.0`
3. **Privacy policy and support URLs** — Add `homepage_url`, `support_url` to manifest; create `PRIVACY.md`

### P1 — High priority (release blockers for enterprise)

4. **Stable extension key** — Add `key` to `manifest.json` for reproducible enterprise install IDs
5. **pack-crx fail-fast** — Exit non-zero when Chrome is unavailable; stop emitting placeholder `.crx`
6. **Enterprise install path fix** — Replace broken `file://` paths with `REPLACE_WITH_YOUR_CRX_HOST_URL`
7. **README branding cleanup** — Replace all "BM JMX Recorder" and "Betamax" with "Capultura"

### P2 — Medium priority (quality gates)

8. **minimum_chrome_version** — Add `"minimum_chrome_version": "88"` to manifest
9. **Icon and dist layout verification** — Confirm `src/icons/` files and Vite emit paths match manifest
10. **Golden E2E validation** — Run Playwright against latest build; update golden fixture if needed

### P3 — Hardening (MV3 lifecycle)

11. **In-flight request persistence** — Add TTL-based and tab-mismatch eviction to `pending-web-request-store.ts`
12. **Documentation hygiene** — Remove stale SideeX/Betamax references from published docs
13. **Backlog update** — Close pre-013 backlog items; add 014 outcomes

## Implementation Sequence

1. All stale "BM JMX Recorder" branding (014-E) — zero code risk
2. Documentation cleanup (014-M) — parallel with above
3. Version alignment (014-B) — prerequisite for BETA label
4. BETA labeling (014-A) — after version fix
5. Manifest metadata: `minimum_chrome_version` (014-D), `key` (014-C), URLs (014-H) — independent, parallel
6. Icons and dist layout (014-I/J) — independent
7. Golden E2E validation (014-K) — independent
8. pack-crx fail-fast (014-F) — independent
9. Enterprise install paths (014-G) — after 014-F
10. Pending store hardening (014-L) — independent
11. Backlog update (014-N) — last

## Acceptance Criteria

- Manifest `name` contains "BETA" and `description` contains "BETA TESTING"
- `package.json`, `manifest.json`, and `VERSION` all match
- `npm run pack-crx` exits 0 with Chrome and non-zero without; no placeholder `.crx`
- `enterprise-install.json` uses `REPLACE_WITH_YOUR_CRX_HOST_URL`
- `PRIVACY.md` exists and is referenced from README
- All four icon files exist at manifest-declared paths
- `npm test && npm run typecheck && npm run lint && npm run build && npm run test:e2e` all pass
- No stale "SideeX", "Betamax", or "BM JMX Recorder" references in published docs

## Out of Scope

- New recorder features (response body capture, port forwarding)
- Playwright export changes
- Backend upload flow (007)
- Golden E2E expansion beyond validation
