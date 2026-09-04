# Feature 17 — Baseline Lock

**Branch:** `feature/17-baseline-lock`  
**Depends on:** `master` only  
**Blocks:** Feature 18+  
**Type:** Hygiene / safety net  

---

## 1. Outcome

Make current `master` a known-good baseline so later feature branches can be judged against frozen behaviour and tests.

---

## 2. Scope

### In scope

- Confirm unit and E2E suites pass on a clean checkout.
- Document current capture, export, and known limits in a short baseline note (link from `progress-master.md` or `docs/baseline.md`).
- Optionally pin or refresh golden fixtures if they already exist and are intentional.
- Ensure `npm run crap` and `npm run dry` run without tooling failure (record current hotspots; do not fix unrelated debt unless it blocks the suite).

### Out of scope

- New features, model changes, permission changes, correlation, debugger.

---

## 3. Code areas (touch only if required for green builds)

| Area | Path | Action |
| ---- | ---- | ------ |
| Tests | `src/**/*.test.ts`, `tests/e2e/` | Run and fix only breakages caused by environment |
| Scripts | `package.json`, `vitest.config.ts`, `playwright.config.ts` | No behaviour change |
| Docs | `docs/` or `roadmap/` | Baseline note only |

Prefer **zero production code changes**. If a flaky test must be stabilised, keep the fix minimal and documented in the PR.

---

## 4. SOLID / DRY / CRAP / CLEAN

- Do not introduce new abstractions.
- Do not deduplicate aggressively in this branch; record duplication for later features.
- Keep the branch boring and reversible.

---

## 5. Implementation steps

1. `git checkout master && git pull`
2. `npm ci`
3. `npm run typecheck && npm run lint && npm run test`
4. `npm run build && npx playwright test`
5. Capture a short baseline note:
   - Node version, Chrome/Chromium used for E2E
   - Test counts
   - Known failures (if any) with ticket/issue reference
   - Known product limits (no CDP, partial response bodies, export-only playback)
6. Open PR titled `feature/17-baseline-lock` with the note only (or empty commit + note if policy requires a commit).

---

## 6. Verification audit

| ID | Check | Method | Pass criteria |
| -- | ----- | ------ | ------------- |
| V0.1 | Unit suite | `npm run test` | Exit 0 |
| V0.2 | Typecheck | `npm run typecheck` | Exit 0 |
| V0.3 | Lint | `npm run lint` | Exit 0 |
| V0.4 | E2E | build + Playwright | Exit 0 |
| V0.5 | Baseline note | File present | Limits and commands documented |
| V0.6 | No feature creep | Diff review | No correlation/analysis modules added |

---

## 7. Exit criteria

- All gates green on CI (or documented equivalent).
- Baseline note merged.
- `progress-master.md` status for Feature 17 set to `Merged`.

---

## 8. Stop conditions

Stop and fix before any Feature 18 work if:

- Tests are red on clean `master`.
- Build cannot produce `dist/` for E2E.
- Permissions or packaging scripts are broken.
