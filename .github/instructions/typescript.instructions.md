
# TypeScript Instructions

## Source

* All source code lives under `src/`.
* TypeScript (`.ts`) only. No committed JavaScript output files.
* Build compiles to ES6 MJS.

## Module Rules

* `package.json` must have `"type": "module"`.
* ES module syntax only. No CommonJS.
* Target ES2020/ES2022.
* No barrel files (`index.ts`). They hide dependencies.

## Naming

* Classes: `PascalCase` → `Employee.ts`
* Utilities: `camelCase` → `formatDate.ts`
* Tests: `.test.ts` suffix → `Employee.test.ts`

## Type Safety

* Prefer explicit types and interfaces.
* Avoid `any` except in narrow, documented cases.
* Prefer small, single-purpose types over large ad-hoc unions.

## Validation

* `npm run typecheck` before committing.
* `npm run lint` for static analysis.
* All new code must pass both.

## Agent Guidance

* Use the existing `tsconfig.json` and lint config. Do not invent new settings.
