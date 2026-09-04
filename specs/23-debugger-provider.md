# Feature 23 — Debugger Response Body Provider (Optional)

**Branch:** `feature/23-debugger-provider`  
**Depends on:** Feature 18 provider interface; product approval for permission  
**Type:** Optional capture adapter  
**Default:** Deferred until 18–20 stable and permission accepted  

---

## 1. Outcome

Optional `DebuggerProtocolResponseBodyProvider` implements the same interface as the content-script provider, enabling broader response bodies when the user opts in to attaching the debugger.

**Ships value:** Broader bodies.  
**Stop if:** Debugger permission is rejected or becomes mandatory for ordinary exports.

---

## 2. Scope

### In scope

- Implement provider behind Feature 18 interface.
- Feature flag / options opt-in.
- Attach/detach lifecycle, clear diagnostics when not attached.
- Permission documentation update (`docs/permissions.md`, PRIVACY impact).
- Tests with mocked debugger API where possible.

### Out of scope

- Making debugger the only body source.
- Using debugger for request modification.
- Plugin work.

---

## 3. Code map

```text
src/capture/providers/debugger-protocol-response-body-provider.ts
```

Wire into recorder only when option enabled. Manifest may need `"debugger"` permission — **document and justify in PR**.

---

## 4. SOLID / DRY / CRAP / CLEAN

- Same result DTO as content-script provider.  
- No debugger calls inside normalizer.  
- Failure modes always set `bodyAvailability` + reason.

---

## 5. Verification audit

| ID | Check | Pass criteria |
| -- | ----- | ------------- |
| V6.1 | Interface | Drop-in provider |
| V6.2 | Opt-in | Default off; no permission prompt path unless enabled |
| V6.3 | Detached | Unavailable + reason when not attached |
| V6.4 | Docs | Permissions + privacy updated |

---

## 6. Exit criteria

- Optional path works; stock JMX path never requires debugger.
- Product sign-off on permission UX.
