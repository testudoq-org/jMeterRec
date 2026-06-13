
# Testing Instructions

## Strategy

* Write failing tests before implementation. No exceptions.
* Use Vitest for unit and integration tests.
* Use Playwright for end-to-end tests.
* Write Playwright scenarios as user behaviour, not click-through scripts.
* Keep each test focused on a single concern.

## Unit Tests

* Collocate with source: `src/domain/Feature.test.ts`.
* Use `.test.ts` suffix.
* No browser dependency.
* Run: `npm test`

## End-to-End Tests

* Place in `tests/e2e/`.
* File naming: `spec-NNN-*.spec.ts`.
* Write in Given/When/Then form.
* Use page objects as helpers only, not to drive implementation.
* Run: `npm run test:e2e`

## Fixtures

* Place in `tests/fixtures/`.
* Sanitised or synthetic data only. Never real personal data.

## Commands

| Command                | Purpose           |
| ---------------------- | ----------------- |
| `npm test`           | Unit tests        |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e`   | Playwright E2E    |

## Agent Guidance

* Reference `tests/e2e/AI_TESTING_GUIDE.md` for Playwright specifics.
* Reference `tests/unit/AI_TESTING_GUIDE.md` for Vitest specifics.
* Only add tests relevant to the current spec branch.
