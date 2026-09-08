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

1. **`main_frame` navigation heuristic** — `request.type === 'main_frame'`
   starts a new group (Phase 1 spec §5.1, currently deferred).
2. **`tab-boundary` heuristic** — `request.tabId !== prev.tabId` starts a
   new group.
3. **`frame-boundary` heuristic** — `request.frameId !== prev.frameId`
   starts a new group.
4. **`form-submit` heuristic** — matched `ActionStep.command === 'submit'`
   links to its HTTP request via `transactionKey`.
5. **Static-resource URL-extension filter** (Phase 1 spec §2 item 7) —
   drop `.css`, `.js`, `.png`, `.woff`, etc. from the grouping input.
   **Opt-in, default off** — see §4 risks.
6. **HAR round-trip data loss fix** (Phase 1 spec §6.3) — `buildHar`
   discards `type`, `tabId`, `frameId`, `transactionKey`;
   `convertHarToJmx` reconstructs `CapturedRequest` without them.
   Phase 2 heuristics 1–4 need these fields, so the fix is a
   **prerequisite**, not an optional extra.
7. **Interleaved flow model** — merge `CapturedRequest[]` and
   `ActionStep[]` into a single `FlowStep[]` timeline sorted by
   timestamp, then apply rules. Requires `ActionStep.timestamp`.

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

- **Static-resource filter is lossy.** A JS bundle can embed a CSRF token
  or dynamic config object that a later API call consumes. Filtering it
  drops a legitimate *producer*. Mitigation: opt-in, default off.
- **Extension-based filtering is a blunt proxy.** `/api/users.json`
  looks static but is a JSON endpoint; `/app/dashboard` (no extension)
  is a real page load but wouldn't be caught by either side. The accurate
  version uses Chrome's `resourceType`, which is lost in HAR until §2
  item 6 is fixed.
- **`ActionStep.timestamp` is a model change** affecting
  `recorder-state.ts` (persistence), `action-recorder.ts` (creation), and
  all tests. Phase 1 explicitly deferred this; Phase 2 must carry it.

---

## 5. Verification audit

| ID | Check | Pass criteria |
| -- | ----- | ------------- |
| V4.5 | `main_frame` rule | New group starts on `type === 'main_frame'` |
| V4.6 | `tab-boundary` rule | New group starts on `tabId` change |
| V4.7 | `frame-boundary` rule | New group starts on `frameId` change |
| V4.8 | `form-submit` rule | Submit action links to HTTP request via `transactionKey` |
| V4.9 | HAR round-trip survives | `type`/`tabId`/`frameId`/`transactionKey` survive `buildHar` → `convertHarToJmx` |
| V4.10 | Static-resource filter opt-in | Default off → identical output; enabled → assets dropped |
| V4.11 | Interleaved flow | `FlowStep[]` merges requests + actions, sorted by timestamp |
| V4.12 | Backward compat | Phase 1 output byte-identical when new rules disabled |

---

## 6. Exit criteria

- Full `GroupingRule` table from Phase 1 spec §5.1 implemented and tested.
- HAR round-trip preserves `type`/`tabId`/`frameId`/`transactionKey`.
- Static-resource filter is opt-in (default off), preserving the
  backward-compat invariant.
- Phase 1 output byte-identical when new heuristics are disabled.
- 659 existing tests remain green (no regressions).