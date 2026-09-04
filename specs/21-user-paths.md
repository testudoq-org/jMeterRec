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

### In scope

- Grouping proposals from timestamps, tab/frame, navigation events, action steps, URL patterns.
- User merge/split/rename/reorder before export.
- Map to Transaction Controller / Simple Controller.
- Optional think-time timers between groups.
- Optional filter for static resources (align with advanced options already present).

### Out of scope

- Throughput/Switch logic beyond simple optional controllers.
- Plugin-based controllers.
- Automatic business-name NLP.

---

## 3. Code map

```text
src/analysis/path-grouping.ts     # pure proposals
src/transform/path-plan.ts         # accepted groups in/near transformation plan
```

Reuse: `ActionStep`, request timestamps, existing domain/resource filters in advanced options, JMX serializer controller emission (extend carefully).

---

## 4. SOLID / DRY / CRAP / CLEAN

- Grouping pure; UI only edits DTOs.  
- Do not duplicate resource-type filters — call existing advanced-options helpers.  
- Keep heuristics table-driven (rules for “new navigation”, “submit follows click”).

---

## 5. Verification audit

| ID | Check | Pass criteria |
| -- | ----- | ------------- |
| V4.1 | Proposal generated | Groups non-empty on multi-step fixture |
| V4.2 | Edit persists | User rename reflected in export |
| V4.3 | Controller in JMX | Transaction Controller names match groups |
| V4.4 | Editable required | Cannot export locked-only auto groups without confirm |

---

## 6. Exit criteria

- User can edit groups; JMX reflects edits; tests cover grouping pure functions.
