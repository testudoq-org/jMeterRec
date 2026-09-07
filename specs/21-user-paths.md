# Feature 21 — User Paths and Transactions

**Branch:** `feature/21-user-paths`
**Depends on:** Feature 20 (plan model stable); Feature 18 data  
**Type:** Grouping + JMX controllers

---

## 1. Outcome

Propose and **user-editable** groups of exchanges/actions (navigation, form submit, custom transactions). Export maps groups to standard JMeter controllers (Transaction Controller, Simple Controller, optional timers).

**Ships value:** Business-shaped scripts.  
**Stop if:** Groups are not editable and only inferred from URL names.

---

## 2. Scope

### In scope (MVP — implementation order)

1. Grouping proposals from **timestamp gaps** and **URL path prefixes** (Phase 1).
2. Grouping proposals from **tab/frame boundaries** and **main_frame navigation events** (Phase 2 — requires export-path fix, see §7.2).
3. Grouping proposals from **action steps** (submit follows click) (Phase 2).
4. User **merge / split / rename / reorder** before export.
5. Map to **Transaction Controller** (primary) and **Simple Controller** (fallback / non-timing groups).
6. Optional **think-time timers** between groups (reuse existing `buildThinkTimeTimer`).
7. Optional **filter for static resources** (URL-extension based, see §7.4).

### Out of scope

- Throughput/Switch logic beyond simple optional controllers.
- Plugin-based controllers.
- Automatic business-name NLP.

---

## 3. Code map

```text
src/analysis/path-grouping.ts       # pure proposal: CapturedRequest[] → ProposedGroup[]
src/transform/path-plan.ts         # accepted/edited groups ↔ ScriptTransformationPlan
src/transform/types.ts             # extends ScriptTransformationPlan with groups (Section 4.1)
src/jmx/element-model.ts           # new: JmxTransactionController, JmxSimpleController
src/jmx/serializer.ts              # extends buildSamplerSequence with group wrapping
src/transform/jmx-plan-applier.ts  # extends applyPlan() to emit group→sampler-index mapping
```

### Existing code reused

| Existing | Path | Role for Feature 21 |
|---|---|---|
| `CapturedRequest` | `src/models/captured-request.ts:25-54` | Provides `timestamp`, `type`, `tabId?`, `frameId?`, `transactionKey?` |
| `ActionStep` | `src/models/captured-request.ts:56-62` | `command` (click/type/submit), `target`, `transactionKey` |
| `buildTransformationPlan` | `src/transform/plan-builder.ts:33-77` | Immutable factory pattern to follow for `proposeGroups` |
| `AnalysisDraftState` | `src/transform/plan-builder.ts:17-20` | Pattern for user-editable draft DTOs (`acceptedIds` + `edits`) |
| `buildProducerIndexMap` | `src/transform/jmx-plan-applier.ts:104-109` | Maps exchange IDs to request indices; extend for group membership |
| `buildThinkTimeTimer` | `src/jmx/serializer.ts:300-325` | Reuse for timers between groups (not just between requests) |
| `shouldCaptureResourceType` | `src/options/advanced-options.ts:346-379` | Resource-type filter at capture time (reference only — see §7.4) |
| `isPlaywrightHttpStep` | `src/models/captured-request.ts:67-69` | Type guard for HttpStep vs ActionStep (for interleaved flow model) |
| `RecorderState.getActions` | `src/background/recorder-state.ts:125-127` | ActionStep source |
| `RecorderState.getRequests` | `src/background/recorder-state.ts:117-119` | CapturedRequest source |

---

## 4. Types

### 4.1 Group DTOs (new, additive to `ScriptTransformationPlan`)

```typescript
/**
 * Heuristic-proposed group before user acceptance.
 * Matches `CorrelationProposal` pattern from Feature 20.
 */
export interface ProposedGroup {
  id: string
  name: string            // auto-generated: "Login Flow", "Form Submit", etc.
  memberExchangeIds: string[]
  source: 'timestamp' | 'navigation' | 'tab' | 'frame' | 'action' | 'url-pattern'
  confidence: number      // heuristic confidence 0–1
  locked: boolean         // true = user-edited; false = auto-proposed, editable
  explanation: string     // human-readable reason for the group boundary
}

/**
 * User's edits to a proposed group before export.
 * Mirrors `AnalysisDraftState.edits` pattern from Feature 20.
 */
export interface GroupEditDraft {
  groupId: string
  name?: string           // user-rename override (V4.2)
  memberExchangeIds?: string[]  // merge/split/reorder edit
  locked: boolean         // true once user edits are applied (V4.4)
}

/**
 * Controller type to emit for a group in JMX.
 */
export type ControllerKind = 'TransactionController' | 'SimpleController'

/**
 * Accepted group in the transformation plan (after edits applied).
 */
export interface AcceptedGroup {
  id: string
  name: string
  memberExchangeIds: string[]
  controllerKind: ControllerKind
  locked: boolean
  thinkTimeEnabled: boolean
}

/**
 * Extend ScriptTransformationPlan with groups.
 * V1 of ScriptTransformationPlan (transform/types.ts:81-87) gains one field.
 */
export interface ScriptTransformationPlan {
  version: number
  correlations: CorrelationProposal[]
  parameterizations: ParameterizationProposal[]
  replacements: ReplacementOperation[]
  groups: AcceptedGroup[]  // NEW — empty array when no groups
  warnings: string[]
}
```

---

## 5. Heuristics (table-driven)

### 5.1 Rules table

Each rule is a pure predicate: `(curr: FlowStep, prev: FlowStep | undefined) => boolean`.
A new group boundary starts when any rule returns `true`.

| Rule name | Condition | Source | Phase |
|---|---|---|---|
| `timestamp-gap` | `gap > 5000ms` between prev and curr request | `CapturedRequest.timestamp` | 1 |
| `path-prefix-change` | URL pathname top-segment differs from prev | `CapturedRequest.url` | 1 |
| `main-frame-navigation` | `request.type === 'main_frame'` | `CapturedRequest.type` | 2 |
| `tab-boundary` | `request.tabId !== prev.request.tabId` | `CapturedRequest.tabId` | 2 |
| `frame-boundary` | `request.frameId !== prev.request.frameId` | `CapturedRequest.frameId` | 2 |
| `form-submit` | matched `ActionStep.command === 'submit'` for this exchange | `ActionStep.transactionKey` | 2 |

### 5.2 Interleaved flow model

HTTP requests and ActionSteps must be merged into a single timeline before applying rules.
The existing `PlaywrightStep = HttpStep | ActionStep` union (`captured-request.ts:65`) and
`isPlaywrightHttpStep` guard (`captured-request.ts:67-69`) provide the type infrastructure.

```
FlowStep = { request: CapturedRequest | null, action: ActionStep | null, timestamp: number }
```

- HTTP-only steps have `action: null`.
- Action-only steps (clicks/types/submits that may not produce HTTP) have `request: null`.
- Submit actions link to the HTTP request via `transactionKey` (both `ActionStep.transactionKey`
  and `CapturedRequest.transactionKey`).
- Steps are sorted by timestamp: `CapturedRequest.timestamp` for HTTP, `ActionStep` has no
  timestamp field (Phase 1 uses HTTP timestamps only; Phase 2 needs action timestamps added
  to `ActionStep` or inferred from adjacent requests).

---

## 6. Export flow integration

### 6.1 Current flow (no groups)

```
popup.ts → EXPORT_JMX → recorder-service.ts:handleExportJmxMessage
  → buildJmxExportResponse (recorder-service.ts:402-454)
    → requests = state.getRequests() → toExportView → filterRequestsByDomains
    → har = buildHar(exportRequests)                    ← HAR round-trip
    → convertHarToJmx(har, meta, serializerOptions)
      → buildJmx(meta, requests, options)               ← serializer.ts:186-249
        → buildSamplerSequence(requests, options)        ← serializer.ts:142-184
```

### 6.2 Group-aware flow

```
popup.ts → EXPORT_JMX_WITH_GROUPS → recorder-service.ts
  → buildJmxExportResponse
    → requests = state.getRequests()                     ← pre-HAR: has type, tabId, frameId
    → actions = state.getActions()                       ← ActionSteps
    → proposedGroups = proposeGroups(requests, actions)  ← path-grouping.ts (pure)
    → acceptedGroups = applyGroupEdits(proposedGroups, groupDraft)  ← path-plan.ts
    → exportRequests = requests.map(toExportView)
    → har = buildHar(exportRequests)                     ← type/tabId/frameId lost here
    → convertHarToJmx(har, meta, { ...serializerOptions, groups: acceptedGroups })
      → buildJmx(meta, requests, options)
        → buildSamplerSequence(requests, options)  ← wraps group members in controllers
```

### 6.3 Critical constraint: HAR round-trip data loss

`buildHar()` (`src/har/har-builder.ts:88-148`) encodes only `method`, `url`, `headers`,
`queryParams`, `body`, `contentType`, `statusCode`, `responseHeaders`, `responseBody`,
`timestamp`. It **discards** `type`, `tabId`, `frameId`, `transactionKey`.

`convertHarToJmx()` (`src/jmx/har-to-jmx.ts:112-128`) reconstructs `CapturedRequest`
without those fields.

**Decision:** Grouping must run on the original `CapturedRequest[]` (pre-HAR) so that
`type`/`tabId`/`frameId` are available for Phase 2 heuristics. The `AcceptedGroup` DTO
references `memberExchangeIds` (exchange IDs, not indices), so it is resilient to the
HAR round-trip — the serializer matches groups to reconstructed requests by exchange ID.

For Phase 1 (timestamp + URL-path grouping only), the data survives the HAR round-trip
because `timestamp` and `url` are preserved. This allows Phase 1 to be implemented without
modifying `buildHar`/`convertHarToJmx`.

---

## 7. SOLID / DRY / CRAP / CLEAN

- **Grouping pure** (`path-grouping.ts`): No I/O, no Chrome APIs. Takes `CapturedRequest[]` + `ActionStep[]`, returns `ProposedGroup[]`. Testable with existing `makeExchange` helpers.
- **UI only edits DTOs**: `GroupEditDraft` mirrors `AnalysisDraftState` pattern (`plan-builder.ts:17-20`). Plan builder merges drafts into `AcceptedGroup[]` before export.
- **Do not duplicate resource-type filters**: The Phase 1 static-resource filter uses simple URL-extension checks (`.css`, `.js`, `.png`, `.woff`) in `path-grouping.ts`. Do NOT call `shouldCaptureResourceType()` from `advanced-options.ts` — it requires `AdvancedOptions` (options-layer dependency from analysis-layer is a violation) and a Chrome `resourceType` string (lost in HAR). Phase 2 may align with advanced-options booleans if the HAR round-trip is fixed.
- **Table-driven heuristics** (Section 5.1): Rules are a `GroupingRule[]` array, each a named-export predicate function (following `noise-filters.ts` pattern). Add rules without touching the grouping engine.
- **Reuse existing think-time timer**: `buildThinkTimeTimer()` (`serializer.ts:300-325`) already handles ConstantTimer/UniformRandomTimer. Group-boundary timers reuse this with the gap between last request of prev group and first request of next group.
- **Reuse existing element-model pattern**: `JmxTransactionController`/`JmxSimpleController` follow the exact `interface + factory + serialize + ELEMENT_HIERARCHY` pattern used by `JmxConstantTimer` (`element-model.ts:260-265, 397-406, 933-948`).
- **No god service**: Split into `path-grouping.ts` (pure proposal) + `path-plan.ts` (apply edits + produce `AcceptedGroup[]`) + serializer extension. Each is independently testable.

---

## 8. Verification audit

| ID | Check | Pass criteria | Test location |
| -- | ----- | ------------- | ------------- |
| V4.1 | Proposal generated | Groups non-empty on multi-step fixture (≥3 requests, ≥2 groups) | `path-grouping.test.ts` |
| V4.2 | Edit persists | User rename reflected in `AcceptedGroup.name` → TransactionController testname in JMX | `path-plan.test.ts` + `integration-21.test.ts` |
| V4.3 | Controller in JMX | Transaction Controller elements present, names match group names, samplers nested under group hashTrees | `serializer.test.ts` (new describe block) + golden file |
| V4.4 | Editable required | `ScriptTransformationPlan.groups` with all `locked: false` cannot export without `GroupEditDraft` confirmation; export returns `{ success: false, error: '...', requiresConfirmation: true }` | `jmx-plan-applier.test.ts` + `recorder-service.test.ts` |

### 8.1 V4.1 test fixture (multi-step flow)

```typescript
// 3-step login flow: GET /login → POST /login → GET /dashboard
const multiStepFixture: CapturedRequest[] = [
  { id: 'r-0', timestamp: '2024-01-01T00:00:00.000Z', method: 'GET',    url: 'https://app.example.com/login',    ... },
  { id: 'r-1', timestamp: '2024-01-01T00:00:02.000Z', method: 'POST',   url: 'https://app.example.com/login',    ... },
  { id: 'r-2', timestamp: '2024-01-01T00:00:03.000Z', method: 'GET',    url: 'https://app.example.com/dashboard', ... },
]
// Expect: 2 groups — ["Login Form"] (r-0, r-1), ["Dashboard"] (r-2)
```

### 8.2 V4.3 test assertions

```typescript
// TransactionController element present
expect(jmx).toContain('TransactionController')
// Controller name matches user-renamed group
expect(jmx).toContain('testname="User Login"')
// Samplers are nested inside group hashTree (not flat under ThreadGroup)
expect(jmx).toMatch(/<TransactionController[^>]*>[\s\S]*<hashTree>[\s\S]*<HTTPSamplerProxy/)
```

### 8.3 Golden file

Extend `tests/fixtures/golden/` with `golden-21-grouped-login.jmx` — a 3-request login flow
wrapped in a `TransactionController` named "Login Flow", verified by `golden-21.test.ts`.

### 8.4 Existing fixtures to reuse

| Fixture / Helper | Location | Reusable for |
|---|---|---|
| `makeExchange()` | `integration.test.ts:46-85` | V4.1 multi-step fixture |
| `makeCandidate()` | `integration.test.ts:20-44` | V4.2 correlation-in-group test |
| `samplerCount()` / `samplerStartIndexes()` | `serializer.test.ts:10-42` | V4.3 controller nesting assertions |
| `golden-20-correlated-login.jmx` | `tests/fixtures/golden/` | V4.3 golden comparison baseline |
| `harEntry()` | `har-to-jmx.test.ts:21-72` | Phase 2 tests (if HAR path extended) |

---

## 9. Implementation steps

1. **Types** — Add `ProposedGroup`, `GroupEditDraft`, `AcceptedGroup`, `ControllerKind` to `transform/types.ts`. Add `groups: AcceptedGroup[]` to `ScriptTransformationPlan`. Update `PlanStore.load()` to handle missing `groups` as `[]`.
2. **Grouping pure function** — Create `src/analysis/path-grouping.ts` with `proposeGroups()`, table-driven rules (Phase 1: timestamp-gap + path-prefix-change). Pure, no Chrome APIs.
3. **Plan builder** — Create `src/transform/path-plan.ts` with `applyGroupEdits()` (merges `ProposedGroup[]` + `GroupEditDraft[]` → `AcceptedGroup[]`). Pure.
4. **Element model** — Add `JmxTransactionController` + `JmxSimpleController` interfaces, factory functions, serialization functions, and `ELEMENT_HIERARCHY` entries to `element-model.ts`.
5. **Applier** — Extend `applyPlan()` in `jmx-plan-applier.ts` to also output `groups: { name, requestIndices: number[] }[]`.
6. **Serializer** — Extend `JmxSerializerOptions` with `groups` field. Modify `buildSamplerSequence` to wrap group members in `TransactionController`/`hashTree` when groups are present. Keep flat path as default (backward compatible). Add think-time timer between groups when `thinkTime` enabled.
7. **Export wiring** — Modify `buildJmxExportResponse` in `recorder-service.ts` to: run `proposeGroups` on pre-HAR requests, apply `GroupEditDraft` from plan store, pass groups to serializer. Implement V4.4 confirmation gate.
8. **Tests** — V4.1: `path-grouping.test.ts`. V4.2: `path-plan.test.ts`. V4.3: `serializer.test.ts` + golden. V4.4: `jmx-plan-applier.test.ts` + `recorder-service.test.ts`.
9. **Phase 2 (follow-up)** — Add `main_frame`, tab/frame, and action-step heuristics. Requires fixing HAR round-trip data loss (Section 6.3).

---

## 10. Exit criteria

- User can edit groups (rename, merge, split, reorder) via `GroupEditDraft` DTOs persisted in `PlanStore`.
- JMX reflects edits — controller `testname` matches user-renamed group name; sampler nesting matches group membership.
- Tests cover grouping pure functions (`path-grouping.ts`) — V4.1, V4.2 unit tests.
- Tests cover controller emission in JMX — V4.3 unit + golden file tests.
- Tests cover editable-required gate — V4.4 unit + recorder-service integration tests.
- Phase 1 complete: timestamp-gap + URL-path-prefix grouping + TransactionController emission + user edits.
- 659 existing tests remain green (no regressions from backward-compatible serializer extension).
