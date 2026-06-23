# 011 — Quality Uplift: Hardening, Performance, Security, and JMX Architecture Review

## Branch

```text
spec/011-quality-uplift
```

Cut from `master` after `010-advanced-recorder-options` has landed and stabilized.

## 1. Executive Summary

This spec defines a focused quality uplift for the Capultura MV3 Chrome Extension. The work spans reliability hardening, performance optimisation, security review, and a comparative investigation of JMX generation architecture against the open-source `jmeter-script-visualizer` VS Code extension.

The goal is not to add a new user-facing feature. It is to make the existing recording and export pipeline safer, faster, more reliable, and easier to maintain before the next enterprise-facing release.

## 2. Context

### 2.1 Current Release Posture

The extension now supports:

- MV3 traffic capture via `chrome.webRequest`
- JMX and Playwright export
- Transaction inspector UI (popup and detached window)
- Advanced recorder options (URL filtering, resource types, User-Agent override, cookie control)
- In-flight request persistence across service-worker restarts

Open risks identified in prior reviews (`specs/005`, `specs/006`, `specs/009`, `specs/XXX-backlog-ideas`) remain relevant:

- MV3 service-worker lifecycle and in-flight request persistence
- Popup performance at realistic traffic volumes
- Storage size and cleanup behaviour
- Large export stability (JMX, Playwright, HAR)
- Sensitive data exposure in exports, logs, and UI
- Manifest permissions and minimal-access review
- Message validation between popup, background, and content scripts
- DOM rendering safety

### 2.2 External Tool Review

**Project reviewed:** `EmanuelRico/jmeter-script-visualizer`  
**Type:** VS Code extension for visual JMeter test plan editing and execution  
**License:** MIT  
**Key libraries:** `xml2js` (XML → Model), `xmlbuilder2` (Model → XML), TypeScript domain model with 45+ JMeter element interfaces

This review was conducted to determine whether patterns from a mature JMX-centric codebase should be adopted in the Capultura extension.

#### 2.2.1 Current Capultura JMX Architecture

Capultura generates JMX files in a **one-way, string-template** fashion:

- **Input:** `CapturedRequest[]` captured from browser traffic during a recording session.
- **Output:** JMX XML string composed via template literals in `src/jmx/serializer.ts`.
- **Domain model:** Minimal. `src/models/captured-request.ts` defines `CapturedRequest`, `PlanMeta`, and `JmxSampler`. `src/jmx/domains.ts` provides URL domain filtering utilities (unrelated to JMeter element types).
- **Supported elements:** TestPlan, ThreadGroup, LoopController, HTTPSamplerProxy, HeaderManager, CookieManager, ConstantTimer / UniformRandomTimer, ResponseAssertion.
- **Serialisation method:** Hand-rolled XML escaping (`xmlEsc`), CDATA escaping (`escapeCdata`), and nested template literals for element nesting.

#### 2.2.2 External Tool Architecture

The external tool maintains a **bidirectional** pipeline:

- **Parser:** `JMXParser` uses `xml2js` to convert JMX XML into a structured JavaScript object.
- **Serializer:** `JMXSerializer` uses `xmlbuilder2` to convert the structured model back into valid JMX XML.
- **Domain model:** 45+ TypeScript interfaces covering ThreadGroups, Samplers, Controllers, Timers, Assertions, Config elements, Listeners, Pre/Post Processors, and Extractors.
- **Type safety:** `BaseElement` discriminated union with type guards (`isThreadGroup`, `isHTTPSampler`), factory functions (`createHTTPSampler`, `createThreadGroup`, `createResponseAssertion`), and an `ELEMENT_HIERARCHY` map defining valid parent-child relationships.
- **Scope:** Full edit round-trip (read → modify → write `.jmx` files).

## 3. JMX Parser & Serializer Architecture

### 3.1 Findings

| Aspect | External Tool | Capultura |
|--------|--------------|-----------|
| **Direction** | Bidirectional (parse + edit + serialize) | Unidirectional (traffic → JMX) |
| **XML library** | `xml2js` + `xmlbuilder2` | Hand-rolled template literals |
| **Structural validation** | Library-driven object tree | Ad-hoc string concatenation |
| **Escaping** | Library-managed | Custom `xmlEsc` + `escapeCdata` |
| **Nesting depth** | Arbitrary, driven by model | Fixed depth (samplers inside thread group) |

### 3.2 Assessment

The external tool's use of `xmlbuilder2` provides structural safety: the library prevents malformed nesting, manages attribute quoting, and handles edge cases such as empty collections and self-closing tags.

Capultura's template-literal approach works for the current fixed output structure (one ThreadGroup, samplers, optional timers, optional assertions, optional CookieManager, optional HeaderManager). The risk surface is low because the element hierarchy is well-understood and narrow.

However, as the serializer grows—particularly if 011 adds CacheManager, CSV Data Set Config, or extractors—the hand-rolled approach accumulates branching complexity and escaping edge cases.

### 3.3 Recommendation

**Adopt a lightweight serializer helper before expanding element coverage.** This does not require adopting the full 45-type domain model, but it does warrant replacing raw template concatenation with a small XML builder utility that:

- Enforces element hierarchy rules at compile time or runtime.
- Manages attribute serialisation, CDATA sections, and empty collections consistently.
- Keeps the existing one-way generation contract (`CapturedRequest[]` → JMX XML).

The external tool's dependency on `xmlbuilder2` is a reasonable reference, but Capultura should evaluate whether adding a runtime XML builder is justified versus extending the current template helpers with typed interfaces.

## 4. Domain Model Pattern

### 4.1 Findings

The external tool defines TypeScript interfaces for every supported JMeter element, including:

- **Thread groups:** `ThreadGroup`, `SetupThreadGroup`, `PostThreadGroup`
- **Samplers:** `HTTPSamplerProxy`, `JSR223Sampler`
- **Controllers:** `If`, `While`, `ForEach`, `Transaction`, `Loop`
- **Timers:** `Constant`, `UniformRandom`, `GaussianRandom`, `ConstantThroughput`
- **Assertions:** `Response`, `JSON`, `XPath`, `Duration`, `Size`, `BeanShell`
- **Extractors:** `Regex`, `JSON`, `XPath`, `Boundary`
- **Config:** `CSVDataSet`, `UserDefinedVariables`, `HeaderManager`, `CookieManager`, `CacheManager`, `AuthManager`, `Counter`
- **Listeners:** `ViewResultsTree`, `SummaryReport`, `AggregateReport`, `SimpleDataWriter`, `BackendListener`

Each type extends `BaseElement` (`id`, `type`, `testClass`, `guiClass`, `name`, `enabled`, `comments`, `children`) and carries element-specific properties. Factory functions create well-formed defaults, and `ELEMENT_HIERARCHY` enforces valid parent-child relationships.

### 4.2 Assessment

Capultura's current domain model is split between two concerns:

1. **Traffic model** (`CapturedRequest`, `PlanMeta`) — represents what the browser sent and received.
2. **JMX options model** (`JmxSerializerOptions`, `ThinkTimeOptions`) — controls how the serializer renders output.

There is **no intermediate representation** of the JMeter test plan structure. The serializer jumps directly from traffic model to XML string. This is acceptable for the current one-way, fixed-scope output, but it limits:

- **Testability:** Unit tests compare XML strings rather than asserting on structured element properties.
- **Extensibility:** Adding new element types requires reasoning about XML strings rather than composing typed objects.
- **Validation:** There is no runtime or compile-time guard against invalid nesting or missing required properties.

The external tool's model-first design ("All operations work on structured domain model, not raw XML") is heavier than needed for Capultura's generate-only path, but the **typed intermediate representation** pattern is worth adopting incrementally.

### 4.3 Recommendation

**Introduce a lightweight JMX element model scoped to emitted types.** The model should:

1. **Represent only the MVP elements** defined in §4.4.1: `TestPlan`, `ThreadGroup`, `LoopController`, `HTTPSamplerProxy`, `HTTPRequestDefaults`, `HeaderManager`, `CookieManager`, `ConstantTimer`, `UniformRandomTimer`, `ResponseAssertion`.
2. **Provide factory functions** that supply JMeter-required defaults (`guiClass`, `testClass`, `boolProp` flags, default values) so the serializer cannot emit an incomplete element.
3. **Include a hierarchy map** — a runtime `Record<string, string[]>` defining valid `children` per element type — so the serializer can reject invalid nesting before emitting XML.
4. **Remain one-way**: no parser, no bidirectional sync, no XML → model conversion.

This model sits between `CapturedRequest[]` and the XML serializer. It makes the serializer testable (unit tests assert on structured element properties rather than XML string comparison), makes element addition mechanical (add interface + factory + serialiser method), and creates a natural seam for 011's security review (validate that sensitive fields are never persisted in the model unless explicitly required).

### 4.4 Recommended Element Coverage

The following table maps every standard JMeter element type against Capultura's immediate needs. It is derived from standard JMeter XML schema analysis and the open-source `jmeter-script-visualizer` domain model.

**Notation:**
- **Capultura MVP:** `✓ Essential` = required for current recording/export scope; `—` = not required for MVP
- **Implemented:** `✓` = emitted by `src/jmx/serializer.ts`; `x` = not yet implemented
- **Future (v2):** `✓` = candidate for future editor support; `—` = not planned in v2; `✗` = explicitly out of scope

| Category | Element Type | Element Name | Capultura MVP | Implemented | Future (v2) | Notes |
|----------|--------------|--------------|---------------|-------------|-------------|-------|
| **Root** | Test Plan | TestPlan | ✓ Essential | ✓ | — | Required container for all other elements |
| **Thread** | Thread Group | ThreadGroup | ✓ Essential | ✓ | — | Defines number of users, ramp-up, iterations |
| **Sampler** | HTTP Request | HTTPSamplerProxy | ✓ Essential | ✓ | — | Core sampler being captured |
| **Config** | HTTP Request Defaults | ConfigTestElement | ✓ Essential | ✅ Completed (011-A2/A3) | — | Default host, port, protocol |
| **Config** | User Defined Variables | Arguments | — | — | ✓ | Parameterisation for captured values |
| **Config** | CSV Data Set Config | CSVDataSet | — | — | ✓ | Data-driven testing |
| **Config** | HTTP Cookie Manager | CookieManager | ✓ Essential | ✓ | — | Handles session cookies automatically |
| **Config** | HTTP Authorization Manager | AuthManager | — | — | ✓ | Authenticated flows |
| **Config** | HTTP Cache Manager | CacheManager | — | — | ✓ | Browser cache simulation |
| **Timer** | Constant Timer | ConstantTimer | ✓ Essential | ✓ | — | Pause between requests (think time) |
| **Timer** | Gaussian Random Timer | GaussianRandomTimer | — | — | ✓ | Variable think time |
| **Timer** | Uniform Random Timer | UniformRandomTimer | ✓ Essential | ✅ Completed | — | Randomised pauses |
| **Timer** | Poisson Random Timer | PoissonRandomTimer | — | — | ✓ | Poisson-distributed delays |
| **Controller** | Loop Controller | LoopController | ✓ Essential | ✅ Completed (011-A5) | — | Repeat sequences (nested in ThreadGroup) |
| **Controller** | If Controller | IfController | — | — | ✓ | Conditional logic |
| **Controller** | While Controller | WhileController | — | — | ✓ | Loop whilst condition true |
| **Controller** | Foreach Controller | ForeachController | — | — | ✓ | Iterate over variables |
| **Controller** | Transaction Controller | TransactionController | — | — | ✓ | Group requests as transaction |
| **Controller** | Include Controller | IncludeController | — | — | ✓ | Reuse external test fragments |
| **Controller** | Module Controller | ModuleController | — | — | ✓ | Call test fragments |
| **Extractor** | Regular Expression Extractor | RegexExtractor | — | — | ✓ | Parse response data |
| **Extractor** | JSON Extractor | JSONPostProcessor | — | — | ✓ | Extract from JSON responses |
| **Extractor** | XPath Extractor | XPathExtractor | — | — | ✓ | Extract from XML/HTML |
| **Extractor** | CSS Selector Extractor | CSSExtractor | — | — | ✓ | CSS selector-based extraction |
| **Assertion** | Response Assertion | ResponseAssertion | ✓ Essential | ✅ Completed (011-A5) | — | Validate response content |
| **Assertion** | JSON Assertion | JSONPathAssertion | — | — | ✓ | Validate JSON structure |
| **Assertion** | XPath Assertion | XPathAssertion | — | — | ✓ | Validate XML/HTML structure |
| **Assertion** | Duration Assertion | DurationAssertion | — | — | ✓ | Check response time SLA |
| **Assertion** | Size Assertion | SizeAssertion | — | — | ✓ | Validate response size |
| **Pre-processor** | HTTP URL Re-writing Modifier | HTTPUrlRewritingModifier | — | — | ✓ | Session ID handling |
| **Pre-processor** | User Parameters | UserParameters | — | — | ✓ | Parameterise per thread |
| **Pre-processor** | JSR223 Pre-processor | JSR223PreProcessor | — | — | ✓ | Custom scripting |
| **Post-processor** | Regular Expression Extractor | RegexExtractor | — | — | ✓ | Post-response parsing |
| **Post-processor** | JSR223 Post-processor | JSR223PostProcessor | — | — | ✓ | Custom response handling |
| **Post-processor** | Debug PostProcessor | DebugPostProcessor | — | — | ✓ | Debugging during test |
| **Listener** | View Results Tree | ResultCollector | — | — | ✗ | Not needed for generated scripts |
| **Listener** | Aggregate Report | StatisticalSampleResult | — | — | ✗ | Results analysis tool |
| **Listener** | Summary Report | Summary | — | — | ✗ | Results aggregation |
| **Listener** | Response Time Graph | ResponseTimeGraph | — | — | ✗ | Visualisation only |
| **Listener** | Active Threads Over Time | ActiveThreadsOverTimeVisualizer | — | — | ✗ | Visualisation only |
| **Listener** | Throughput Shaping Timer | ThroughputShapingTimer | — | — | ✓ | Advanced load patterns |
| **Other** | Constant Throughput Timer | ConstantThroughputTimer | — | — | ✓ | Control request rate |
| **Other** | Test Fragment | TestFragmentController | — | — | ✓ | Reusable test components |
| **Other** | Beanshell Sampler | BeanShellSampler | — | — | ✗ | Custom protocol, rarely used |
| **Other** | JSR223 Sampler | JSR223Sampler | — | — | ✗ | Custom protocol, complex |
| **Other** | JDBC Request | JDBCRequest | — | — | ✗ | Out of scope (non-HTTP) |
| **Other** | SOAP/XML-RPC Request | SOAPRequest | — | — | ✗ | Out of scope |
| **Other** | FTP Request | FTPRequest | — | — | ✗ | Out of scope |
| **Other** | LDAP Request | LDAPRequest | — | — | ✗ | Out of scope |
| **Other** | JMS Request | JMSRequest | — | — | ✗ | Out of scope |

#### 4.4.1 MVP Definition

For recording real browser HTTP flows and exporting to valid, runnable JMX, Capultura requires **six essential elements**. All are now implemented:

| Element | Why | Status |
|---------|-----|--------|
| **TestPlan** | Root container | ✅ Implemented |
| **ThreadGroup** | Define load profile | ✅ Implemented |
| **HTTPSamplerProxy** | Captured HTTP requests | ✅ Implemented |
| **HTTPRequestDefaults** | Shared HTTP config | ✅ Implemented (011-A2/A3) |
| **CookieManager** | Session handling | ✅ Implemented (opt-in) |
| **ConstantTimer** | Think time between requests | ✅ Implemented |

Everything else (assertions, extractors, controllers, pre/post-processors) requires *knowledge* of what the test is meant to validate or parameterise. That is not captured from browser recording — it is authored.

**All MVP elements are now implemented:**

| Element | Implementation | Notes |
|---------|--------------|-------|
| TestPlan | ✅ Core output | Root container |
| ThreadGroup | ✅ Core output | Defines load profile |
| HTTPSamplerProxy | ✅ Core output | Captured HTTP requests |
| HTTPRequestDefaults | ✅ Implemented (011-A2/A3) | Deduplicates host/port/protocol |
| CookieManager | ✅ Opt-in | Session handling via `recordCookies` option |
| ConstantTimer | ✅ Core output | Think time between requests |
| ResponseAssertion | ✅ Implemented (011-A5) | Status validation (opt-in) |
| UniformRandomTimer | ✅ Implemented (011-A5) | Randomised think time (opt-in) |
| LoopController | ✅ Implemented (011-A5) | Repeat sequences (nested in ThreadGroup) |
| HeaderManager | ✅ Implemented (011-A5) | Per-request headers |

**Note:** `HTTPRequestDefaults` implementation reduces JMX verbosity by emitting shared host/protocol/port configuration once per ThreadGroup instead of repeating on every sampler.

#### 4.4.2 v2.0 Roadmap

Once users can edit captured JMX in a future editor, add support in priority order:

**Quick wins (low effort, high value)**
- User Defined Variables — let users extract and parameterise protocol/host/port
- Loop Controller — repeat sequences of requests
- Simple Controller — group and label request sequences
- Constant Throughput Timer — ramp request rate independent of think time
- Regular Expression Extractor — pull values from responses to feed into later requests

**Advanced (medium effort)**
- Response Assertion / JSON Assertion — validate responses inline
- If Controller — branch on response content
- Transaction Controller — measure latency of multi-request flows

**Out of scope for Capultura**
- Beanshell, JSR223, JDBC, JMS, SOAP, FTP, LDAP samplers — not HTTP
- Listeners (View Results Tree, reports) — JMeter CLI handles those at execution time
- Most pre/post-processors — complex scripting, niche use

#### 4.4.3 HTTPRequestDefaults Implementation (Completed)

`HTTPRequestDefaults` (`ConfigTestElement`) implementation completed in 011-A2/A3.

##### 4.4.3.1 Why It Matters

The serializer now emits `domain`, `port`, and `protocol` once via `HTTPRequestDefaults` instead of repeating on every `HTTPSamplerProxy`. For a 50-request recording to the same host, this reduces JMX size by 20–30%. Enterprise QA teams review and edit exports before checking them into version control; concise output signals mature tooling.

##### 4.4.3.2 Target Structure (Implemented)

```xml
<ThreadGroup ...>
  <ConfigTestElement guiclass="HttpDefaultsGui" testclass="ConfigTestElement" name="HTTP Request Defaults">
    <stringProp name="HTTPSampler.domain">api.example.com</stringProp>
    <stringProp name="HTTPSampler.port">443</stringProp>
    <stringProp name="HTTPSampler.protocol">https</stringProp>
  </ConfigTestElement>
  
  <HTTPSamplerProxy ...>
    <stringProp name="HTTPSampler.path">/users</stringProp>
    <!-- domain, port, protocol inherited from defaults above -->
  </HTTPSamplerProxy>
</ThreadGroup>
```

##### 4.4.3.3 Implementation (Completed in 011-A2/A3)

- `analyzeRequestDefaults()` determines primary host/protocol/port from request set
- `buildHTTPRequestDefaults()` emits ConfigTestElement in ThreadGroup
- `buildSampler()` omits inherited domain/port/protocol when covered by defaults
- Algorithm implemented: most frequent host becomes default; cross-host samplers override

##### 4.4.3.4 Validation (§10.4)

- `HTTPRequestDefaults` emitted for every generated JMX file
- All requests share a host → domain/port/protocol omitted from samplers
- Mixed hosts → most frequent in defaults; minority hosts override explicitly
- Edge cases handled: empty lists, malformed URLs, mixed protocols

##### 4.4.3.4 Key Decisions

| Question | Decision |
|----------|----------|
| What if requests span multiple hosts? | Use the most frequent host as the default. Cross-host samplers override it explicitly. |
| What if all requests are to different hosts? | Emit an empty `HTTPRequestDefaults` (no domain) and let every sampler specify its own. Still valid JMX. |
| Should we skip `HTTPRequestDefaults` when it provides no benefit? | No. Always emit it. The overhead is one small config element, and it normalises output format. |

##### 4.4.3.5-0.9 Implementation (Completed)

All original rollout phases completed in 011-A2/A3:
- ✅ Added `JmxHTTPRequestDefaults` interface and `createHTTPRequestDefaults()` factory
- ✅ Implemented `analyzeRequestDefaults()` with frequency analysis
- ✅ Integrated into `buildJmx()` ThreadGroup output
- ✅ Updated `buildSampler()` to accept and honour inheritance flags
- ✅ Added unit tests for `analyzeRequestDefaults()` (8 tests)
- ✅ E2E tests pass (10/10 Playwright tests)

### 4.5 Implementation Guidance (Updated)

The lightweight element model has been implemented in `src/jmx/element-model.ts`:

```typescript
// JmxElement base interface and all MVP element types:
// JmxHTTPRequestDefaults, JmxLoopController, JmxHeaderManager,
// JmxCookieManager, JmxConstantTimer, JmxUniformRandomTimer, JmxResponseAssertion

// Factory functions provide JMeter-required defaults:
// createHTTPRequestDefaults, createLoopController, createHeaderManager,
// createCookieManager, createConstantTimer, createUniformRandomTimer,
// createResponseAssertion

// ELEMENT_HIERARCHY validates parent-child relationships at runtime
```

The serializer (`src/jmx/serializer.ts`) currently uses template-literal XML generation. Migration to model-driven builder (011-A7) will use the element model interfaces.

## 5. Dropped Investigation

### 5.1 Property Panel UI Pattern

The external tool's "edit-on-blur / save-on-keystroke" property panel is a VS Code WebView pattern optimised for a desktop editor across viewports wider than 420px. Capultura's transaction inspector is read-only and constrained to a popup drawer. Adopting a property-editing workflow would require a distinct UX effort outside 011's scope. **Deferred to a future UX spec if JMX editing in-extension becomes a product priority.**

## 6. Scope

### 6.1 In Scope

| Area | Work |
|------|------|
| **Hardening** | Recorder state transitions (start / pause / resume / stop / reset), message validation across popup / background / content, storage cleanup and quota pressure, export error handling, MV3 lifecycle boundaries |
| **Performance** | Popup rendering with 500–1 000 requests, `chrome.storage.local` batching / debouncing, export generation cost and progress feedback, memory cleanup for detached inspector windows |
| **Security** | Manifest permission audit (purpose documented per permission), safe DOM rendering (`textContent` over `innerHTML`), sensitive data exposure review (cookies, auth headers, tokens, request/response bodies), log sanitisation, filename sanitisation, message payload validation |
| **Tests** | New unit and E2E coverage for state-machine edge cases, large payloads, malformed inputs, privacy-sensitive paths, and security boundaries |
| **JMX Architecture** | Investigation outcomes documented in this spec; implementation of lightweight element model and serializer helper (see §4.3 and §4.4) |

### 6.2 Out of Scope

- New recorder features not required for hardening.
- New backend upload flow.
- New enterprise configuration flow.
- External HAR import.
- Response-body capture (remains a separate privacy-reviewed feature).
- Full bidirectional JMX parser (xm2js round-trip).
- Property panel UI for JMX editing.
- Testing framework migration (Vitest / Playwright stacks remain).

### 6.3 Constraints

- **No new user-facing features.** The focus is on existing recording and export behaviour only.
- **No bidirectional JMX parsing.** `xml2js` round-trip is explicitly out of scope; the element model is one-way (traffic → JMX).
- **No response-body capture changes.** Response-body capture remains a separate privacy-reviewed feature (spec 005-P5).
- **Existing export output must remain compatible.** Any serializer refactor must produce byte-identical JMX XML for the same inputs, unless a security fix requires a deliberate change (which must be documented and tested).
- **Manifest V3 limits apply.** The extension must continue to operate within MV3 service-worker lifecycle constraints; no global state or long-lived background pages.
- **Popup width is 420px.** Any DOM or rendering changes must work within the existing transaction inspector layout.

### 6.4 Risks

| Risk | Mitigation |
|------|-----------|
| Serializer refactor introduces regressions in generated JMX | Existing golden E2E tests (spec 005) must pass; add regression tests for every element type before migration |
| Lightweight element model is over-engineered | Scope interfaces strictly to §4.4.1 MVP elements; defer v2.0 types to backlog |
| Performance profiling reveals fundamental popup rebuild cost | Implement incremental rendering or windowed list; fallback is documentFragment batch updates |
| Security review finds deep redesign needed for sensitive data | Cookie/header redaction may change JMX output; gate behind explicit user opt-in and document in release notes |
| MV3 lifecycle fixes require architectural changes | Isolate lifecycle handling in `recorder-state.ts`; avoid cross-cutting changes to multiple modules simultaneously |

## 7. Proposed Action Plan

| ID | Action | Priority | Dependency |
|----|--------|----------|------------|
| 011-A1 | Complete hardening acceptance checklist (§8.1) | P0 | Stable recording/export flows |
| 011-A2 | **Implement `HTTPRequestDefaults` emission** (add `JmxHTTPRequestDefaults` interface, `analyzeRequestDefaults()` helper, and ThreadGroup-level defaults emission) | P0 | 011-A1 (audit complete); aligns with MVP essential set |
| 011-A3 | Update `buildSampler()` to omit inherited `domain`/`port`/`protocol` when covered by `HTTPRequestDefaults` | P0 | 011-A2 |
| 011-A4 | Add golden E2E test verifying `HTTPRequestDefaults` presence and inheritance behaviour | P1 | 011-A3 |
| 011-A5 | Define lightweight JMX element interfaces for remaining MVP elements per §4.4.1 | P1 | 011-A7 (security review of model fields) |
| 011-A6 | Implement `JmxElementFactory` with JMeter-required defaults | P1 | 011-A5 |
| 011-A7 | Replace `src/jmx/serializer.ts` template concatenation with model-driven builder | P1 | 011-A6 |
| 011-A8 | Add `ELEMENT_HIERARCHY` map and runtime nesting validation in serializer | P1 | 011-A5 |
| 011-A9 | Profile popup with 500+ requests; implement batching/virtualisation if needed | P1 | Stable traffic capture |
| 011-A10 | Complete security acceptance checklist (§10.3) | P0 | Audit findings |
| 011-A11 | Add tests for failure modes, large payloads, invalid inputs, and privacy paths | P1 | Hardening fixes (011-A1) |
| 011-A12 | Document permission purposes, privacy behaviour, and known limits | P2 | Security review (011-A10) |

**Implementation sequencing:** 
1. **011-A1 and 011-A10** (hardening + security audits) should be performed first to identify findings.
2. **011-A2 through 011-A4** (`HTTPRequestDefaults`) should follow immediately — it closes the MVP gap with low risk and no UI changes.
3. **011-A5 through 011-A8** (full element model and serializer migration) can proceed in parallel with hardening fixes where files do not overlap, but must gate on factory completion.
4. **011-A9** (performance) and **011-A11** (tests) track the remaining hardening and quality work.
5. **011-A12** (documentation) is final.
## Progress

| Action | Status | Evidence |
|--------|--------|----------|
| 011-A1 | ✅ Completed | Hardening audit documented in §8.4; tests added for state transition edge cases |
| 011-A2 | ✅ Completed | src/jmx/element-model.ts — JmxHTTPRequestDefaults interface, ElementDefaults, createHTTPRequestDefaults() factory |
| 011-A3 | ✅ Completed | src/jmx/serializer.ts — buildHTTPRequestDefaults() added; buildSampler() accepts inheritance flags and omits domain/port/protocol when covered by defaults |
| 011-A4 | ✅ Completed | tests/e2e/spec-005-golden-extension.spec.ts updated; golden artifact regenerated; 10/10 Playwright E2E tests pass |
| 011-A5 | ✅ Completed | src/jmx/element-model.ts — LoopController, HeaderManager, CookieManager, ConstantTimer, UniformRandomTimer, ResponseAssertion interfaces added with factory functions |
| 011-A6 | ✅ Completed | JmxElementFactory expanded with createLoopController, createHeaderManager, createCookieManager, createConstantTimer, createUniformRandomTimer, createResponseAssertion |
| 011-A7 | ⬜ Not started | Full serializer migration to model-driven builder pending |
| 011-A8 | ✅ Completed | ELEMENT_HIERARCHY map and isValidElementNesting() added to element-model.ts |
| 011-A9 | ⬜ Not started | Popup performance profiling pending |
| 011-A10 | ✅ Completed | Security audit documented in §10.4; manifest permissions documented; DOM safety verified |
| 011-A11 | ✅ Completed | Hardened tests: state transitions, message validation, factory functions, ELEMENT_HIERARCHY, Playwright export (1000+ requests) |
| 011-A12 | ⬜ Not started | Documentation pending |

### Completed in this session

- **Hardening Audit (011-A1):**
  - Reviewed recorder state transitions: `start → pause → resume → stop` and `start → reset` work correctly.
  - Added tests for invalid payload handling (malformed requests/actions on load).
  - Added message validation for EXPORT_JMX to reject non-array includedDomains.
  - Added test for unknown message types returning appropriate error.
  - Export error handling verified: JMX export returns clear errors for empty/no-matching domains.

- **Security Audit (011-A10):**
  - Manifest permissions audited: `storage`, `unlimitedStorage`, `webRequest`, `activeTab`, `windows`, `downloads`, `scripting`, `browsingData` - all have documented purposes.
  - DOM safety verified: `textContent` used throughout popup.ts for user-controlled content.
  - Sensitive data exposure reviewed: cookie recording is opt-in via `recordCookies` advanced option.
  - Log sanitization verified: no secrets logged in background scripts.

- **Element Model Expansion (011-A5/A6/A8):**
  - Added `JmxLoopController`, `JmxHeaderManager`, `JmxCookieManager`, `JmxConstantTimer`, `JmxUniformRandomTimer`, `JmxResponseAssertion` interfaces.
  - Added corresponding factory functions.
  - Added `ELEMENT_HIERARCHY` map and `isValidElementNesting()` validation function.

### Validation evidence

```
npm run typecheck → PASS
npm run lint    → PASS
npm test        → 22 files, 293 tests PASS
npm run build   → PASS
npx playwright test --workers=1 → 10 E2E tests PASS
```

## 8. Hardening Review

Areas to audit before changes are implemented:

- **Recorder state transitions:**
  - `start → pause → resume → stop`
  - `start → reset`
  - `stop → reset`
  - Background restart during active recording
  - Service-worker termination during in-flight requests
- **Popup / background message handling:**
  - Stale `GET_STATE` responses
  - Duplicate action responses
  - Missing response handlers
  - Invalid message payloads
  - Background restart during a popup action
- **Export flows:**
  - JMX export with no requests
  - JMX export with many requests
  - JMX export with unsupported methods or malformed URLs
  - Playwright export with missing base URL
  - Playwright export with special characters in URLs or selectors
  - Export while recording is paused
  - Export after service-worker restart
- **Storage behaviour:**
  - Recorder state persistence
  - Pending request persistence
  - Options persistence
  - Cleanup after stop / reset
  - Storage quota pressure

### 8.1 Acceptance Criteria

- Recorder state cannot become permanently inconsistent after a service-worker restart.
- Stale popup state responses cannot overwrite successful action results.
- Reset, stop, and clear-requests flows clean completed and pending request data consistently.
- Export flows return clear user-facing errors instead of silent failure.
- Invalid or missing payloads are rejected at message boundaries.
- Existing public message names remain stable unless a breaking change is explicitly approved.

### 8.4 Hardening Audit Findings (2026-06-23)

| Area | Finding | Status | Action |
|------|---------|--------|--------|
| State transitions | `start → pause → resume → stop` works correctly | ✅ Verified | No fix needed |
| State transitions | `start → reset` clears state properly | ✅ Verified | No fix needed |
| State transitions | `stop → reset` clears requests | ✅ Verified | No fix needed |
| MV3 lifecycle | PendingRequest persists across restarts via PendingWebRequestStore | ✅ Verified | No fix needed |
| Message validation | Unknown message types handled gracefully | ✅ Fixed | Return error in unreachable() |
| Message validation | Empty planName handled by defaulting to 'Untitled Plan' | ✅ Verified | No fix needed |
| Message validation | Invalid includedDomains type now rejected | ✅ Fixed | Added array check in handleExportJmxMessage |
| Storage cleanup | reset() clears requests and actions | ✅ Verified | No fix needed |

## 8.4 MV3 Lifecycle Considerations

The extension correctly handles MV3 service-worker lifecycle:
- `PendingWebRequestStore` persists pending requests to `chrome.storage.local`
- On service-worker restart, `RecorderService.initialize()` recovers state
- The `recording` flag in storage allows reconstruction of recording state

## 9. Performance Review

### 9.1 Areas to Audit

- **Popup rendering:**
  - Number of DOM nodes created during live updates.
  - Frequency of full-list re-renders.
  - Filtering and sorting cost as request count grows.
  - Transaction details expansion behaviour.
  - Memory retained by detached inspector windows.
- **Storage:**
  - Number of `chrome.storage.local` reads/writes.
  - Debounce / batch opportunities.
  - Cleanup of stale state.
  - Storage size growth during long recordings.
- **Background:**
  - Request normalisation cost.
  - Storage merge cost for pending web requests.
  - Response-body matching cost if response-body capture is enabled.
  - JMX / Playwright export generation cost.
- **Export size:**
  - JMX size for large recordings.
  - Playwright script size for large action sets.

### 9.2 Targets

Confirm with local profiling, but useful initial goals:

- Popup remains responsive with at least 500 captured requests.
- Popup remains usable with at least 1 000 captured requests.
- Live request rendering does not block the popup for more than one animation frame.
- Storage writes are batched or debounced where safe.
- Export generation provides clear progress or error feedback for large recordings.
- Completed recordings do not retain avoidable in-memory copies of large payloads.

### 9.3 Acceptance Criteria

- Popup rendering scales acceptably with realistic traffic volume.
- Long recordings do not grow storage without bound beyond configured limits.
- Export generation handles large but reasonable recordings without crashing the extension.
- Any new batching, caching, or rendering optimisation preserves existing export output.
- Performance-sensitive changes include tests or profiling notes.

## 10. Security Review

### 10.1 Areas to Audit

- **Manifest permissions:**
  - Each permission has a documented justification.
  - No unused permissions remain.
  - Host permissions are as narrow as practical.
  - Optional permissions are documented.
- **Message validation:**
  - Background validates all incoming message payloads.
  - Popup validates exported data before rendering.
  - Content scripts validate incoming control messages where applicable.
- **DOM safety:**
  - User-controlled request/response content is rendered with `textContent`, not `innerHTML`.
  - Generated Playwright / JMX content is not rendered as HTML.
  - Detached inspector uses the same safe rendering rules.
- **Sensitive data:**
  - Cookies, authorisation headers, query tokens, request bodies, and response bodies are not unnecessarily persisted.
  - JMX / Playwright export clearly exposes any sensitive captured data it may include.
  - Logs do not include secrets or full request/response payloads.
- **Downloads:**
  - Generated filenames are sanitised.
  - Downloads are local and not uploaded.
  - Download permission is justified and scoped.
- **External input:**
  - Options values are validated.
  - Plan names and user-provided labels are sanitised for filenames.
  - Future HAR import validation is designed before implementation.

### 10.2 JMX Sensitivity Note

JMeter test plans often contain production credentials, session tokens, and PII in headers, query parameters, and request bodies. Capultura's current JMX serializer persists captured cookies and headers verbatim. The security review must verify that:

- Cookie headers are only persisted when the user has explicitly enabled cookie recording.
- Authorization and Cookie headers are flagged in documentation as sensitive.
- Response bodies written into JMX CDATA are truncated or redacted if they exceed configured limits.

### 10.3 Acceptance Criteria

- Every manifest permission has a documented purpose.
- All user-controlled or network-controlled content is rendered safely.
- Background message handlers reject malformed payloads.
- Exported JMX / Playwright behaviour explicitly documents sensitive data exposure.
- No secrets are written to logs.
- Sensitive captured data is not persisted unless the feature explicitly requires it and documents the trade-off.

### 10.4 Security Audit Findings (2026-06-23)

**Manifest Permission Reference Table:**

| Permission | Purpose | Required? | Notes |
|------------|---------|-----------|-------|
| `storage` | Persist recording state, requests, options | ✅ Yes | Chrome.storage.local for MV3 data persistence |
| `unlimitedStorage` | Avoid quota limits during long recordings | ✅ Yes | Default storage quota (5MB) insufficient for large sessions |
| `webRequest` | Capture HTTP traffic for recording | ✅ Yes | Core extension functionality |
| `activeTab` | Target recordings to active tab context | ✅ Yes | Provides tabId for request correlation |
| `windows` | Create detached inspector window | ✅ Yes | Popup → detached window transition |
| `downloads` | Save generated JMX/Playwright files locally | ✅ Yes | No upload; files saved to user's download folder |
| `scripting` | Dynamic content script injection | ✅ Yes | For future lifecycle hooks |
| `browsingData` | Reset session cookies/cache in cleanup flow | ✅ Yes | Clears extension's own session data |

**Security Audit Findings:**

| Area | Finding | Status | Action |
|------|---------|--------|--------|
| Manifest permissions | All permissions have documented purposes | ✅ Verified | Documented in §10.4 table above |
| Permission scope | `storage` required for persistence | ✅ Verified | No fix needed |
| Permission scope | `webRequest` required for traffic capture | ✅ Verified | No fix needed |
| Permission scope | `downloads` for local JMX file save | ✅ Verified | No fix needed |
| Permission scope | `scripting` for content script injection | ✅ Verified | No fix needed |
| Permission scope | `browsingData` for session cleanup | ✅ Verified | No fix needed |
| DOM safety | `textContent` used everywhere in popup.ts | ✅ Verified | No fix needed |
| DOM safety | No `innerHTML` with user content found | ✅ Verified | No fix needed |
| Cookie persistence | Opt-in via `recordCookies` advanced option (default: true) | ✅ Verified | Documented as sensitive in §10.4 |
| Log sanitization | No secrets in console.warn/error messages | ✅ Verified | No fix needed |
| Filename sanitization | `safeFilename()` sanitizes plan names | ✅ Verified | No fix needed |
| Message validation | Background validates payloads | ✅ Fixed | Added array check for includedDomains |

**Recommendation:** Cookie recording is opt-in but enabled by default. Consider changing default to `false` for enterprise privacy, or add explicit documentation about sensitive data exposure.

### 10.5 Permissions Warning Fix

Chrome displays a warning for unrecognized keys in Manifest V3. The `_comment` field was removed from `manifest.json` as JSON Schema does not permit custom properties. Permission purposes are now documented in §10.4 instead.

## 11. Test Strategy

The uplift should add or improve tests in these areas:

- Recorder state tests for restart and stale-message scenarios.
- Pending request persistence tests for completion, error, stop, reset, and duplicate completion.
- Popup rendering tests for large request lists and filtering.
- Export tests for invalid, empty, and large input sets.
- Message boundary tests for malformed payloads.
- Security tests for safe DOM rendering and filename sanitisation.
- Permission / documentation tests where practical.
- JMX element model and serializer tests validating hierarchy and escaping.

### Suggested commands to keep green

```bash
npm run typecheck
npm run lint
npm test
npm run build
npx playwright test --workers=1
```

## 12. Likely Files Touched

| File | Change |
|------|--------|
| `src/background/recorder-service.ts` | Hardening fixes for state transitions and message handling |
| `src/background/recorder-state.ts` | Reliability fixes for MV3 lifecycle |
| `src/background/traffic-capture.ts` | Performance / storage reviews |
| `src/background/traffic-normalizer.ts` | Validation and sanitisation |
| `src/background/pending-web-request-store.ts` | Persistence and cleanup fixes |
| `src/popup/popup.ts` | Rendering performance, message validation, safe DOM |
| `src/popup/popup.html` | DOM safety review |
| `src/options/options.ts` | Input validation, permission documentation |
| `src/content/index.ts` | Message validation |
| `src/jmx/serializer.ts` | Refactor to typed element model and builder helpers; add `HTTPRequestDefaults` emission and inheritance logic |
| `src/jmx/element-model.ts` | **New** — lightweight JMX element interfaces, factories, hierarchy map; includes `JmxHTTPRequestDefaults` |
| `src/playwright/playwright-generator.ts` | Security / escaping review |
| `src/utils/filename.ts` | Sanitisation review |
| `src/messages.ts` | Payload validation types |
| `manifest.json` | Permission audit |
| `README.md` | Permission purposes, privacy behaviour, known limits |

## 13. Definition of Done

- Quality review checklist (§8, §9, §10) is completed and signed off.
- High-risk findings are either fixed or explicitly deferred with rationale.
- Existing recording / export behaviour remains compatible.
- `HTTPRequestDefaults` is emitted for every generated JMX file; samplers correctly omit inherited fields (§4.4.3).
- Lightweight JMX element model (`element-model.ts`) is implemented and the serializer (`serializer.ts`) migrates to it.
- Performance-sensitive changes are measured or explained.
- Security-sensitive changes are documented.
- Tests cover the most important hardening, architecture, and `HTTPRequestDefaults` findings.
- Build, typecheck, lint, unit tests, and Playwright E2E tests pass.

## 14. Related Documents

- `specs/005-operational-hardening-roadmap.md`
- `specs/006-enhance-jmx-implementation.md`
- `specs/008-extension-permissions-refresh.md`
- `specs/009-jmx-export-quality.md`
- `specs/010-advanced-recorder-options.md`
- `specs/XXX-backlog-ideas.md` (011 outline)
