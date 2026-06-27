# 014 - MV3 BETA Compliance and Release Readiness

Status: Proposed

## 1. Purpose

Finalize Manifest V3 compliance and prepare the extension for a **BETA release** targeting Chrome Developer
Program private testers. Closes remaining gaps from the Manifest V3 migration guide
(<https://developer.chrome.com/docs/extensions/develop/migrate/publish-mv3>) and resolves
packaging, branding, privacy, and E2E-validation gaps after 012/013.

No new user-facing recorder features. All changes are:

- BETA-publishing prerequisites from Chrome Web Store,
- ManifestV3 compliance hardening,
- Packaging / enterprise-install fixes,
- Privacy policy and support URL setup,
- Documentation cleanup for stale branding and architecture references.

## 2. Context

Specs 001-013 are delivered. The extension is functionally complete for BETA.
Remaining work is **publishing readiness**.

### 2.1 Known gaps vs Chrome BETA publishing guide

| Gap                                                         | Severity                                         |
| ----------------------------------------------------------- | ------------------------------------------------ |
| Manifest `name` lacks "BETA" label                          | Must-fix — rejected for repetitive content       |
| Manifest `description` lacks BETA notice                    | Must-fix — same reason                           |
| Version mismatch: package.json 0.0.5 vs manifest.json 0.1.0 | Must-fix                                         |
| Manifest missing `key` for stable extension ID              | High — enterprise force-install needs stable ID  |
| Manifest missing `minimum_chrome_version`                   | Medium — MV3 requires Chrome 88+                 |
| README uses "capyultura" (stale)                            | High — confusing for users/testers               |
| pack-crx.mjs falls back to placeholder text                 | High — CI produces broken .crx                   |
| enterprise-install.json has placeholder paths               | High — unusable manifest                         |
| No privacy policy URL declared                              | Must-fix — required for Chrome Web Store listing |
| No support URL declared                                     | Must-fix — required for Chrome Web Store listing |
| Icons directory not verified at manifest paths              | Medium                                           |
| Vite dist layout vs manifest path alignment                 | Medium                                           |
| Golden E2E tests exist but unvalidated against latest build | Medium                                           |

## 3. Scope

### In Scope

| #     | Item                                                  |
| ----- | ----------------------------------------------------- |
| 014-A | BETA-label manifest (name, description)               |
| 014-B | Align versions (package.json, manifest.json, VERSION) |
| 014-C | Add `key` to manifest for stable extension ID         |
| 014-D | Add `minimum_chrome_version`                          |
| 014-E | Fix README branding (Capultura)                       |
| 014-F | Fix pack-crx.mjs fail-fast (no placeholder)           |
| 014-G | Fix enterprise-install.json placeholder paths         |
| 014-H | Add privacy policy and support URLs                   |
| 014-I | Verify icons directory and manifest icon paths        |
| 014-J | Verify Vite dist layout matches manifest paths        |
| 014-K | Validate golden E2E tests against latest build        |
| 014-L | Harden in-flight webRequest persistence               |
| 014-M | Clean stale SideeX/Betamax references from docs       |
| 014-N | Update backlog with 014 outcomes                      |

### Out of Scope

- New recorder features (response body, port forwarding)
- Playwright export changes
- Backend upload flow
- Golden E2E expansion beyond validation

## 4. Detailed Requirements

### 4.1 014-A — BETA-label manifest

Add "BETA" to name and BETA notice to description per Chrome guide:

```json
"name": "Capultura BETA",
"description": "Capultura BETA - Record, script and scale real browser flows (JMX, Playwright) for reliable performance testing. THIS EXTENSION IS FOR BETA TESTING."
```

**Files**: src/manifest.json
**Verification**: Extension card in Chrome shows "BETA".

### 4.2 014-B — Version alignment

Bump `package.json` and `manifest.json` to `0.1.0`. Update `VERSION` file.
Rationale: first MV3-complete, externally-publishable state.

**Files**: package.json, src/manifest.json, VERSION
**Verification**: All three report same semver string.

### 4.3 014-C — Stable extension ID via `key`

Add `key` to manifest.json so enterprise CI force-install uses a stable ID.

Generate with:

```
openssl genrsa -out extension.pem 2048
openssl rsa -in extension.pem -pubout -outform DER | openssl base64 -A
```

Base64 value becomes `"key"` field. Store PEM in .gitignore.

**Files**: src/manifest.json, .gitignore, scripts/pack-crx.mjs
**Verification**: Unpacked ID matches key-derived ID across re-installs.

### 4.4 014-D — Minimum Chrome version

```json
"minimum_chrome_version": "88"
```

**Files**: src/manifest.json

### 4.5 014-E — README branding fix

Replace all "capyultura" with "Capultura". Replace "Betamax" with "Capultura".
Window titles and internal comments may retain "BM" for clarity but user-facing docs must use "Capultura".

**Files**: README.md, scripts/pack-crx.mjs, projectBrief.md
**Verification**: grep -ri "bm jmx\|betamax" README.md returns no results.

### 4.6 014-F — pack-crx.mjs fail-fast

When Chrome is unavailable, exit non-zero with clear error. Do NOT write placeholder CRX.
CI-friendly message: install Chrome or set CHROME_BIN.

**Files**: scripts/pack-crx.mjs

### 4.7 014-G — enterprise-install.json placeholder paths

Replace `file:///path/to/dist/` with `REPLACE_WITH_YOUR_CRX_HOST_URL/` and document in README
that admins must point this to a publicly-accessible CRX URL for ExtensionInstallForcelist.

### 4.8 014-H — Privacy policy and support URLs

Add to manifest.json:

```json
"homepage_url": "https://github.com/testudoq-org/jMeterRec",
"support_url": "https://github.com/testudoq-org/jMeterRec/issues"
```

Create `PRIVACY.md`:

- What is captured (HTTP traffic, cookies, headers, query params)
- Storage location (local chrome.storage.local only)
- External transmission (none during recording/export)
- Retention (cleared on reset/stop)
- User controls (reset, opt-in response body capture)

### 4.9 014-I — Icons directory verification

Verify `src/icons/` contains all four files. Confirm Vite build copies them to dist.

**Files**: src/icons/, vite.config.ts

### 4.10 014-J — Vite dist layout verification

Manifest paths:

```json
"action.default_popup": "src/popup/popup.html"
"options_ui.page": "src/options/options.html"
"background.service_worker": "background/background.js"
```

Verify that `npm run build` produces matching paths in `dist/`.
Fix `scripts/copy-manifest.mjs` if paths diverge.

### 4.11 014-K — Golden E2E test validation

1. Run `npm run build && npm run test:e2e`
2. Update golden with `UPDATE_GOLDEN=1` if needed
3. Ensure golden JMX reflects all 013 elements (CacheManager, DurationAssertion, extractors)
4. Commit updated golden fixture

**Files**: tests/fixtures/golden/golden-extension.jmx

### 4.12 014-L — In-flight webRequest persistence hardening

Strengthen `pending-web-request-store.ts`:

1. **TTL-based eviction**: Stale fragments > 5 minutes discarded on load.
2. **Tab-mismatch eviction**: Fragments for closed tabs discarded on load.
3. **Restart recovery documentation**: Comment block in `RecorderService.initialize()`
   describing the lifecycle.

**Files**: src/background/pending-web-request-store.ts, src/background/recorder-service.ts
**Tests**: Add unit tests for TTL and tab-mismatch scenarios.

### 4.13 014-M — Documentation cleanup: stale references

Remove/replace in README.md and projectBrief.md:

- "SideeX" (content-script dependency removed)
- "Betamax" (original project name)
- "capyultura" (branding)

Spec files may retain historical references if contextually accurate.

**Files**: README.md, projectBrief.md
**Verification**: grep returns no matches for stale terms.

### 4.14 014-N — Backlog update

Update `specs/XXX-backlog-ideas.md`:

- Close pre-013 items with outcomes.
- Add "Released in 014" section.
- Preserve future items (response body, port forwarding, etc.) with updated priorities.

## 5. Implementation Sequence

1. 014-E — README branding (safe, no code impact)
2. 014-M — Doc cleanup (parallel with 014-E)
3. 014-B — Version alignment (before BETA label)
4. 014-A — BETA labeling (after 014-B)
5. 014-D — minimum_chrome_version (independent)
6. 014-C — Stable key (independent)
7. 014-H — Privacy/support URLs (independent)
8. 014-I — Icons verification (independent)
9. 014-J — Vite dist layout (independent)
10. 014-K — Golden E2E validation (independent)
11. 014-F — pack-crx fail-fast (independent)
12. 014-G — enterprise-install.json paths (after 014-F)
13. 014-L — Pending store hardening (independent)
14. 014-N — Backlog update (last)

## 6. Testing Strategy

### Automated

```bash
npm test              # Vitest unit tests
npm run typecheck     # TypeScript strict
npm run lint          # ESLint + Prettier
npm run build         # Vite production
npm run test:e2e      # Playwright (uses built dist)
```

### Manual BETA verification

1. Load unpacked from dist/ in Chrome 88+
2. Name shows "Capultura BETA" in extension card
3. Popup, options, content script, service worker all function
4. Record HTTP traffic; requests appear in popup
5. Export JMX; open in JMeter 5.x; import succeeds
6. Detached inspector shows live updates
7. HAR import + Convert HAR to JMX works end-to-end
8. Icons appear in toolbar and extension card
9. Reset/stop clears state; recording resumes cleanly

### CI verification

- pack-crx fails without Chrome; no placeholder CRX
- enterprise-install.json uses REPLACE_WITH_YOUR_CRX_HOST_URL

## 7. Acceptance Criteria

### AC1 — BETA label visible

Manifest name contains "BETA"; description contains "BETA TESTING".

### AC2 — Versions aligned

package.json, manifest.json, VERSION all match.

### AC3 — Enterprise install reproducible

pack-crx exits 0 with Chrome, non-zero without. No placeholder CRX.
enterprise-install.json contains REPLACE_WITH_YOUR_CRX_HOST_URL.
Extension ID stable across re-packs (key field present).

### AC4 — Chrome Web Store listing complete

PRIVACY.md exists and referenced from README. README contains support URL.
homepage_url and support_url in manifest. Icons exist at all paths.

### AC5 — Build produces loadable extension

dist/ contains all manifest-referenced files. Unpacked load succeeds in Chrome.

### AC6 — E2E tests validate

npm run test:e2e passes without UPDATE_GOLDEN.

### AC7 — In-flight persistence robust

Stale fragments >5 min discarded. Fragments for closed tabs discarded.
No unbounded storage growth.

### AC8 — Documentation accurate

No stale references to SideeX, Betamax, capyultura in published docs.
Backlog reflects 014 completion.

## 8. Risks

### R14.1 — BETA label removal before public

Documented as one-line revert in 014; must be done before public release.

### R14.2 — Extension ID rotation from key addition

Adding `key` changes extension ID. Enterprise admins must update ExtensionInstallForcelist.
Communicate in release notes.

### R14.3 — Privacy policy scope

Current policy covers recording-only. If backend upload (007) activates, policy must be updated.

### R14.4 — pack-crx CI availability

GitHub ubuntu-latest has no Chrome. Acceptable to fail CI pack-crx job for BETA
with clear documentation. Manual packaging via local Chrome or Chromium path works.

## 9. Dependencies

| Spec | Type                                    |
| ---- | --------------------------------------- |
| 013  | Hardened JMX output for BETA validation |
| 012  | HAR import flow for BETA testing        |
| 010  | Options UI patterns used in packaging   |

## 10. Definition of Done

- [ ] Manifest has BETA label and notice
- [ ] Versions aligned (package.json, manifest.json, VERSION)
- [ ] Stable `key` and `minimum_chrome_version` in manifest
- [ ] `homepage_url` and `support_url` in manifest
- [ ] `PRIVACY.md` exists and linked from README
- [ ] README branding consistent (Capultura)
- [ ] pack-crx fails fast without Chrome
- [ ] enterprise-install.json uses REPLACE_WITH_YOUR_CRX_HOST_URL
- [ ] All four icon files exist at manifest paths
- [ ] Vite dist layout matches manifest paths
- [ ] Golden E2E tests pass without UPDATE_GOLDEN
- [ ] Pending fragments have TTL and tab-mismatch eviction
- [ ] No stale architectural references in published docs
- [ ] Backlog updated with 014 outcomes
- [ ] npm test && typecheck && lint && build && test:e2e all pass
