
# Spec Template

Copy to `specs/NNN-feature-name.md`. Fill in every section before writing a single line of code.

---

# Spec NNN — Feature Name

## Branch

```
spec/NNN-feature-name
```

Cut from `master` before starting.

## Context

One paragraph. Why does this feature exist? What problem does it solve? What must exist before it can be built?

## Scope

## **In scope:**

**Out of scope (deferred):**

* Spec NNN — reason for deferral

## Domain Objects

List the domain classes this spec touches or creates.

## Repository / API Changes

List any new or modified repository methods, API routes, or data access changes this spec needs.

## State Changes

Describe any new state shape or state transitions this spec introduces.

## Acceptance Criteria

Write as Playwright scenarios. These are the definition of done.

```
Scenario: [Name]
  Given [initial state]
  When [user action]
  Then [observable outcome]
```

Cover the happy path and the key edge cases.

## Unit Tests Required

List the Vitest tests that must pass. Domain logic only — no DOM.

## UI Behaviour

What the user sees and can do. No implementation detail.

## Dependencies

* Spec NNN — name

## Definition of Done

* [ ] Branch cut from `master`
* [ ] Relevant upstream specs reviewed or updated
* [ ] Playwright scenarios written and failing
* [ ] Unit tests written and failing
* [ ] Implementation complete
* [ ] `npm test` passes
* [ ] `npm run typecheck` passes
* [ ] `npm run lint` passes
* [ ] `npm run build` passes
* [ ] `npm run test:e2e` passes when required by the spec
* [ ] CRAP gate green (no function above 30)
* [ ] DRY gate green
* [ ] No stale branch/process references remain in updated Markdown
* [ ] PR raised against `master`
