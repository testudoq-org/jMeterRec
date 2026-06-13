
# Branching & Contribution Rules

## Branching Model

* Every feature, fix, or change must use a dedicated branch.
* Branch format: `spec/NNN-short-description` (e.g. `spec/002-domain-models`).
* Never commit directly to `main` or `master`.
* Open a PR for every change.

## Workflow

1. Find the relevant spec in `specs/`.
2. Create the branch: `git checkout -b spec/NNN-short-description`.
3. Implement only what the spec describes.
4. Commit format: `[spec-NNN] Description of change`.
5. Push and open a PR. Reference the spec file in the PR description.
6. All automated checks (lint, typecheck, tests) must pass before merge.

## Scope

* Modify only files relevant to the current spec.
* If a change requires touching a different spec, stop and explain in the PR.
* Never commit `.env` or secrets.

## Memory Bank

* Read `memory-bank/` for context before starting.
* Log architectural or process decisions in `memory-bank/decisionLog.md`.

## PR Checklist

* [ ] Branch name matches the spec
* [ ] Implementation matches only the current spec
* [ ] `npm test` passes
* [ ] `npm run typecheck` passes
* [ ] `npm run lint` passes
* [ ] PR description links to the spec file
* [ ] `decisionLog.md` updated if an architectural decision was made
