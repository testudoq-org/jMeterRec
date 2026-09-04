# Feature 24 — Future JMeter Plugin (Design Only)

**Branch:** `feature/24-plugin-design`  
**Depends on:** Features 18–22 experience (what stock JMX cannot do)  
**Type:** Design document only — **no plugin implementation**  

---

## 1. Outcome

A written boundary document that lists features which truly need a JMeter plugin versus those already solved by standard elements generated from Capultura plans.

**Ships value:** Clear boundary.  
**Stop if:** The “plugin” is used to implement features that stock extractors, controllers, and CSV configs already cover.

---

## 2. Scope

### In scope (documentation)

For each proposed plugin capability, specify:

- Why standard JMeter elements are insufficient  
- Extension point (GUI, sampler, config, listener, post-processor)  
- GUI component  
- Runtime component  
- Serialized JMX representation  
- Non-GUI behaviour  
- Distributed-mode behaviour  
- Thread-safety requirements  
- Compatibility (JMeter versions)  
- Test strategy  

### Candidate topics (evaluate, do not assume all are needed)

- Runtime correlation diagnostics beyond Debug Sampler  
- Advanced dynamic data sources  
- Non-HTTP protocols  
- Specialised load-model controllers  
- Correlation failure reporting aggregated across threads  

### Out of scope

- Implementing Java plugin code on this branch.
- Making generated JMX depend on the plugin for ordinary HTTP correlation.

---

## 3. Deliverable location

```text
docs/future-jmeter-plugin-boundary.md
```

Link from `progress-master.md` when merged.

---

## 4. SOLID / DRY / CLEAN (design quality)

- Prefer documenting **extension of Capultura transform output** over new runtime concepts when stock JMX suffices.
- Explicit non-goals section.
- Trace each plugin feature to a failure mode observed after Features 20–22.

---

## 5. Verification audit

| ID | Check | Pass criteria |
| -- | ----- | ------------- |
| V7.1 | Doc complete | All template sections filled or marked N/A |
| V7.2 | Non-dependency | States ordinary JMX works without plugin |
| V7.3 | No code | Diff has no plugin Java/Kotlin sources |

---

## 6. Exit criteria

- Boundary doc merged; implementation explicitly **not** started on this track.
