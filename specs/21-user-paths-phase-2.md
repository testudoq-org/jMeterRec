# Feature 21 Phase 2 — User Paths: Full Heuristic Surface

**Branch:** `feature/21-user-paths-phase-2`
**Based on:** Phase 1 (`feature/21-user-paths`, commit `afe509a`, merged)
**Depends on:** Feature 20 (plan model stable); Feature 18 data
**Type:** Grouping + JMX controllers

---

## 1. Outcome

Phase 1 shipped timestamp-gap + URL-path-prefix grouping, user edits
(rename/merge/split/reorder), and TransactionController / SimpleController
emission. Phase 2 extends the grouping heuristic surface to the full
`GroupingRule` table defined in the Phase 1 spec (§5.1), and fixes the
HAR round-trip data loss that currently blocks those rules from running.

**Ships value:** Business-shaped scripts from realistic recordings.
**Stop if:** Groups still inferred only from URL names with no edit UI.

---

## 2. Scope

### In scope

**Prerequisite (must land before any heuristic runs):**
6. **HAR round-trip data loss fix** (Phase 1 spec §6.3) — `buildHar`
   discards `type`, `tabId`, `frameId`, `transactionKey`;
   `convertHarToJmx` reconstructs `CapturedRequest` without them.
   Heuristics 1–4 below need these fields, so the fix is a
   **prerequisite**, not an optional extra. The drop point is
   `toExportView` (`src/utils/diagnostics.ts`); see §4 risks.

**Heuristics:**
1. **`GroupingRule` extensions to `DEFAULT_GROUPING_RULES`** — add the
   remaining §5.1 rules without touching the grouping engine:
   - `main_frame` navigation — `request.type === 'main_frame'` starts a
     new group.
   - `tab-boundary` — `request.tabId !== prev.tabId` starts a new group.
   - `frame-boundary` — `request.frameId !== prev.frameId` starts a
     new group.
   - `form-submit` — matched `ActionStep.command === 'submit'` links to
     its HTTP request via `transactionKey`. See V4.8 for the
     missing-link clause.
5. **Static-resource URL-extension filter** (Phase 1 spec §2 item 7) —
   drop `.css`, `.js`, `.png`, `.woff`, etc. from the grouping input.
   **Opt-in, default off** — see §4 risks.
7. **Interleaved flow model** — merge `CapturedRequest[]` and
   `ActionStep[]` into a single `FlowStep[]` timeline sorted by
   timestamp, then apply rules. Requires `ActionStep.timestamp`.
   High-risk, least-provable item — see §7 for the Phase 2b split
   recommendation.

### Out of scope

- Throughput/Switch logic beyond simple optional controllers.
- Plugin-based controllers.
- Automatic business-name NLP.

---

## 3. Code map

```text
src/analysis/path-grouping.ts       # extend DEFAULT_GROUPING_RULES
src/models/captured-request.ts      # ActionStep.timestamp (model change)
src/har/har-builder.ts              # encode type/tabId/frameId/transactionKey
src/jmx/har-to-jmx.ts               # reconstruct those fields
src/transform/path-plan.ts          # unchanged; operates on AcceptedGroup[]
src/jmx/serializer.ts               # unchanged; consumes GroupMapping[]
```

### Existing code reused

| Existing | Path | Role |
|---|---|---|
| `CapturedRequest` | `src/models/captured-request.ts:25-54` | Provides `timestamp`, `type`, `tabId?`, `frameId?`, `transactionKey?` |
| `ActionStep` | `src/models/captured-request.ts:56-62` | `command` (click/type/submit), `target`, `transactionKey` |
| `isPlaywrightHttpStep` | `src/models/captured-request.ts:67-69` | Type guard for HttpStep vs ActionStep (interleaved flow model) |
| `RecorderState.getActions` | `src/background/recorder-state.ts:125-127` | ActionStep source |
| `RecorderState.getRequests` | `src/background/recorder-state.ts:117-119` | CapturedRequest source |
| `buildThinkTimeTimer` | `src/jmx/serializer.ts:300-325` | Reuse for timers between groups |
| `buildProducerIndexMap` | `src/transform/jmx-plan-applier.ts:104-109` | Maps exchange IDs to request indices |
| `toExportView` | `src/utils/diagnostics.ts:47-50` | **Drop point for `type`/`tabId`/`frameId`/`transactionKey`** — the HAR fix must preserve these fields through this transform, not bypass it |

---

## 4. SOLID / DRY / CRAP / CLEAN

- **Grouping pure** (`path-grouping.ts`): no I/O, no Chrome APIs.
- **Table-driven heuristics** (Phase 1 spec §5.1): add rules to
  `DEFAULT_GROUPING_RULES` without touching the grouping engine.
- **Do not duplicate resource-type filters**: the static-resource
  filter uses simple URL-extension checks in `path-grouping.ts`.
  Do NOT call `shouldCaptureResourceType()` from
  `advanced-options.ts` — it requires `AdvancedOptions` (options-layer
  dependency from analysis-layer is a violation) and a Chrome
  `resourceType` string (lost in HAR).
- **Reuse existing think-time timer**: `buildThinkTimeTimer()` already
  handles ConstantTimer/UniformRandomTimer. Group-boundary timers reuse
  this with the gap between last request of prev group and first
  request of next group.
- **Reuse existing element-model pattern**: controllers already follow
  `interface + factory + serialize + ELEMENT_HIERARCHY`.

### Risks

- **HAR round-trip fix is on the shared, backward-sensitive path.**
  `buildHar`/`convertHarToJmx` are also consumed by the plain export
  path and by Feature 22's hardening. The fix must be **additive**:
  existing HAR exports that carry no `type`/`tabId`/`frameId`/
  `transactionKey` must remain byte-identical. Gate this with V4.9 and
  V4.12 before touching either file.
- **Static-resource filter is lossy.** A JS bundle can embed a CSRF token
  or dynamic config object that a later API call consumes. Filtering it
  drops a legitimate *producer*. Mitigation: opt-in, default off.
- **Extension-based filtering is a blunt proxy.** `/api/users.json`
  looks static but is a JSON endpoint; `/app/dashboard` (no extension)
  is a real page load but wouldn't be caught by either side. The accurate
  version uses Chrome's `resourceType`, which is lost in HAR until the
  §2 prerequisite is fixed.
- **`ActionStep.timestamp` is a model change** affecting
  `recorder-state.ts` (persistence), `action-recorder.ts` (creation), and
  all tests. Phase 1 explicitly deferred this; Phase 2 must carry it.
- **Action-to-request association is weak** (master baseline). The
  `form-submit` heuristic links via `transactionKey`; when that key is
  absent on either side the rule must no-op cleanly rather than throw —
  see V4.8's missing-link clause.

---

## 5. Verification audit

| ID | Check | Pass criteria |
| -- | ----- | ------------- |
| V4.5 | `main_frame` rule | New group starts on `type === 'main_frame'` |
| V4.6 | `tab-boundary` rule | New group starts on `tabId` change |
| V4.7 | `frame-boundary` rule | New group starts on `frameId` change |
| V4.8 | `form-submit` rule | Submit action links to HTTP request via `transactionKey`. **Missing-link clause:** when `transactionKey` is absent on the action, on the request, or on both, the rule no-ops cleanly and the exchange falls back to timestamp/path grouping; the skip is recorded in export diagnostics. The rule must never throw. |
| V4.9 | HAR round-trip survives | **Concrete test contract:** given a `CapturedRequest` with `type`, `tabId`, `frameId`, and `transactionKey` all populated → `buildHar` → `convertHarToJmx` → assert the reconstructed request carries the same four values. Also assert that a HAR entry with none of the four fields round-trips byte-identically (backward-compat). |
| V4.10 | Static-resource filter opt-in | Default off → identical output; enabled → assets dropped |
| V4.11 | Interleaved flow | `FlowStep[]` merges requests + actions, sorted by timestamp |
| V4.12 | Backward compat | Phase 1 output byte-identical when new rules disabled |
| V4.13 | Absent-field safety | Grouping produces identical output when `type`/`tabId`/`frameId` are absent (e.g. HAR-reconstructed requests before the §2 prerequisite lands, or recordings that never captured them). Rules skip silently; no throw. |

---

## 6. Exit criteria

- Full `GroupingRule` table from Phase 1 spec §5.1 implemented and tested.
- HAR round-trip preserves `type`/`tabId`/`frameId`/`transactionKey`.
- Static-resource filter is opt-in (default off), preserving the
  backward-compat invariant.
- Phase 1 output byte-identical when new heuristics are disabled.
- All tests green; no regressions in the 659 pre-Phase-1 tests or the
  67 Phase 1 tests.

---

## 7. Recommended split (Phase 2a / Phase 2b)

Item 7 of §2 (interleaved flow model) is the heaviest and least-provable
item in this spec. It requires the `ActionStep.timestamp` model change —
which touches `recorder-state.ts` persistence, `action-recorder.ts`
creation, and every test that constructs an `ActionStep` — *and* a new
`FlowStep` merge. The master baseline also records that
"Action-to-request association is weak", so the `form-submit` link via
`transactionKey` is on shaky ground.

**Recommendation:** ship §2 items 1–6 as **Phase 2a** (the heuristic
surface + HAR fix, all HTTP-driven and independently testable against
V4.5–V4.13), and defer the interleaved action model to **Phase 2b** once
the HAR fix proves `type`/`tabId`/`frameId` actually flow through to the
serializer. Phase 2b would then own `ActionStep.timestamp` and the
`FlowStep` merge as its own audit items.

This de-risks the branch: Phase 2a's exit criteria are met without the
model change, and Phase 2b can be planned against real HAR data rather
than assumptions about action-to-request association.