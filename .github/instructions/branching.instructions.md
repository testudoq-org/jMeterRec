
# Branching & Contribution Rules

## Branching Model

* Every feature, fix, or change must use a dedicated branch.
* New branch format: `spec/NNN-short-description` (for example, `spec/005-operational-hardening-roadmap`).
* Historical branches may omit the `spec/` prefix, such as `004-improve-ux-ui-implementation`.
* Never commit directly to `main` or `master`.
* Open a PR for every change.

## Workflow

1. Find the relevant spec in `specs/`.
2. Create the branch: `git checkout -b spec/NNN-short-description`.
3. Implement only what the spec describes.
4. Commit format: `[spec-NNN] Description of change`.
5. Push and open a PR. Reference the spec file in the PR description.
6. All automated checks must pass before merge:
   * `npm test`
   * `npm run typecheck`
   * `npm run lint`
   * `npm run build`
   * `npm run test:e2e` when the change touches extension behaviour, UI, export output, or E2E coverage.

## Scope

* Modify only files relevant to the current spec.
* If a change requires touching a different spec, stop and explain in the PR.
* Keep documentation consistent with the current roadmap in `specs/005-operational-hardening-roadmap.md`.
* Never commit `.env` or secrets.

## Specification Source of Truth

* Read the relevant spec in `specs/` before starting.
* Treat the active roadmap spec as the implementation plan for multi-phase work.
* Log architectural decisions in the relevant spec or PR description.

## PR Checklist

* [ ] Branch name matches the spec.
* [ ] Implementation matches only the current spec.
* [ ] `npm test` passes.
* [ ] `npm run typecheck` passes.
* [ ] `npm run lint` passes.
* [ ] `npm run build` passes.
* [ ] `npm run test:e2e` passes when required by the spec.
* [ ] PR description links to the spec file.
* [ ] No stale branch/process references remain in updated Markdown.
