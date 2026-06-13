# AI Agent Prompt: Chrome Extension Codebase Analysis

## Stage: Analysis Only (Pre-Port)

---

## AGENT ROLE AND MANDATE

You are a senior TypeScript engineer and Chrome extension architect. Your sole task
in this stage is ANALYSIS — you will produce no new code. You will read the existing
source, map its structure, identify every risk and dependency, and produce a written
analysis report that a second agent (the porting agent) can use as its sole input.

Do not skip sections. Do not summarise prematurely. Work through every task below
in sequence and document your findings in the output format specified at the end.

---

## CONTEXT YOU MUST HOLD THROUGHOUT

The extension under analysis is the BlazeMeter Chrome Recorder (version 6.6.8).

Target outcome of the eventual port:

- Pure TypeScript, Manifest V3, strict mode, no `any` types except where externally
  forced by Chrome API types.
- SideeX content scripts replaced or isolated — do not assume they can be kept.
- All JMX/YAML generation must remain client-side with zero backend calls.
- Must be deployable via Chrome Enterprise `ExtensionInstallForcelist` (no Web Store
  dependency).
- No open-source runtime libraries in the deployed extension artefact. Build-time
  tooling (tsc, esbuild) is acceptable. Runtime dependencies must be justified.
- The `webRequest` permission with blocking must be preserved via enterprise policy
  deployment.

Known facts already established — treat these as ground truth:

1. `manifest.json` declares `manifest_version: 3`. The extension is already MV3.
2. `dist/background/index.js` is a webpack bundle of compiled TypeScript.
3. SideeX content scripts are declared in manifest Group 3 (20 files) and Group 4
   (2 files) and run on `<all_urls>`.
4. The background bundle communicates with SideeX scripts exclusively via Chrome
   message passing — there are no direct function calls across the boundary.
5. JMX/YAML generation is entirely local. No external API calls during record or
   export.
6. The background bundle extension ID `mbopgmdnpcbohhpnfglgohlbhfongabi` is the
   production Chrome Web Store ID. A dev config branch exists in the source.

---

## TASK 1 — ESTABLISH THE FILE INVENTORY

Walk every file in `src-ori/`. For each file record:

- Path relative to `src-ori/`
- File type (.ts, .js, .json, .html, .css, other)
- Line count
- Whether it is a SideeX file (path contains `sideex/`), a compiled dist file
  (path contains `dist/`), a config file, or original source
- Brief one-line description of its apparent purpose

Group files into these buckets and count each:
A. TypeScript source (original, not compiled)
B. JavaScript source (original, not compiled)
C. SideeX content scripts
D. Third-party JS (jQuery, Sizzle, XPath, etc.)
E. Compiled dist output
F. Config files (webpack, tsconfig, package.json, etc.)
G. Assets (images, HTML, CSS)
H. Unknown / unclassifiable

Flag any file larger than 500 lines as a potential god-object requiring decomposition.

---

## TASK 2 — MAP THE ENTRY POINTS

From `manifest.json`, list every entry point the browser loads:

For each entry point record:

- Entry point type: background service_worker / content_script / popup / options /
  web_accessible_resource
- File path
- Execution context: which pages / URLs / frames it runs in
- `run_at` timing if a content script
- Whether it is TypeScript source, compiled output, or legacy JS
- Whether it contains or references SideeX code

Produce a flat list ordered by execution sequence:
document_start content scripts → document_idle content scripts →
background service worker → popup/options (on user action)

---

## TASK 3 — TRACE THE MESSAGE PASSING ARCHITECTURE

The extension coordinates via `chrome.runtime.sendMessage` and
`chrome.tabs.sendMessage`. You must map every message in the system.

For each message type found, record:

- Message identifier (the string key or discriminator field)
- Sender context (background / content script / popup — which file)
- Receiver context (background / content script / popup — which file)
- Whether the receiver is a SideeX file or proprietary code
- Data payload shape (describe fields)
- Whether a response is expected (async sendMessage with callback)
- Whether this message would break if SideeX were removed

Group messages into:

- Recording lifecycle messages (start, pause, resume, stop, reset)
- Command recording messages (clicks, types, assertions captured from page)
- Replay / playback messages (commands sent to content for execution)
- UI / status messages (badge, notifications, popup updates)
- Debugger / remote session messages (dbg- port protocol)
- Traffic capture messages (HTTP request/response data)

At the end of this task, answer explicitly:
Q: Which messages are sent TO SideeX scripts and which are sent FROM SideeX scripts?
Q: If all SideeX files were deleted, which message senders/receivers in proprietary
code would have no listener?

---

## TASK 4 — ANALYSE THE SIDEEX DEPENDENCY SURFACE

SideeX is the Selenium recording and replay engine embedded in the extension.
It is MIT-licensed open-source. The enterprise constraint may require its removal.

For each of the 22 SideeX files declared in the manifest, determine:

a) What does this file do? (One sentence, from reading the file)
b) Does it send messages to the background? If so, which?
c) Does it receive messages from the background? If so, which?
d) Does it expose globals that other content scripts rely on?
e) Does it use Chrome APIs directly? If so, which?
f) Can its function be replicated without it? Estimate effort: trivial /
moderate / significant / unknown without deeper research.

Then answer for the full SideeX set:
Q: Is SideeX used for recording only, replay only, or both?
Q: What is the minimum subset of SideeX files required for HTTP traffic recording
without Selenium replay capability?
Q: What proprietary code in `dist/record-replay/index.js` wraps or extends SideeX?
Q: Is there a clean seam between SideeX and the proprietary recording layer, or are
they tangled?

---

## TASK 5 — CATALOGUE THE CHROME API SURFACE

List every Chrome API namespace used across all source files:

chrome.action._
chrome.browsingData._
chrome.contextMenus._
chrome.notifications._
chrome.runtime._
chrome.scripting._
chrome.storage._
chrome.tabs._
chrome.webNavigation._
chrome.webRequest._
chrome.windows.\*

For each method called, record:

- Which file calls it
- Whether it is MV3-compatible as-is
- Whether it requires a specific permission already in the manifest
- Whether its behaviour differs between public extensions and force-installed
  enterprise extensions

Flag any API call that:

- Was available in MV2 but removed or restricted in MV3
- Requires `webRequestBlocking` (enterprise-only in MV3)
- Uses `chrome.extension.*` (fully deprecated)
- Uses event pages instead of service workers
- Relies on persistent background page state (not safe in service workers)

---

## TASK 6 — IDENTIFY STATE MANAGEMENT RISKS

Chrome MV3 service workers are not persistent — they can be terminated between
events. Identify all places where the existing code holds state that would be
lost on service worker termination:

- Module-level variables (declared with `let` or `var` at module scope)
- In-memory traffic objects
- Recording state flags (op, mode, isRecording, etc.)
- Tab ID tracking
- Transaction arrays

For each piece of state:

- Name the variable
- Identify which file it lives in
- Assess whether it is currently persisted to `chrome.storage` or only held
  in memory
- Classify the severity if lost: silent failure / incorrect behaviour / data loss /
  non-functional

---

## TASK 7 — ASSESS BUILD TOOLING AND TYPE COVERAGE

From `package.json`, `tsconfig.json`, and webpack config:

- What TypeScript version is in use?
- Is `strict` mode enabled? If not, what flags are missing?
- What is the module target (ES5 / ES2017 / ESNext)?
- Is `noImplicitAny` enforced?
- Are Chrome type definitions (`@types/chrome`) present?
- What bundler is used and what version?
- Are there any source maps configured?
- Are there existing tests? What framework?
- What scripts are in `package.json` (build, test, lint)?

Identify gaps that a clean TypeScript port must address:

- Missing strict flags
- Missing type definitions
- Any use of `require()` instead of ES module imports
- Mixed module systems (CommonJS vs ESM)

---

## TASK 8 — IDENTIFY WHAT IS NOT IN THE SOURCE

Based on the manifest entry points, list every file the extension loads that
is NOT present in `src-ori/`. These are the dark spots — things that exist in
the distributed extension but whose source you do not have. For each:

- File path as declared in manifest
- Whether it is SideeX (third-party), jQuery (third-party), or unknown
- Whether the port can proceed without it or must treat it as a black box

---

## TASK 9 — RISK REGISTER

Produce a risk register with the following columns:

Risk ID | Description | Likelihood (H/M/L) | Impact (H/M/L) | Affects Port? | Mitigation

Risks to evaluate at minimum:

R01 - SideeX removal breaks replay capability
R02 - Service worker termination causes recording data loss
R03 - webRequestBlocking unavailable in non-enterprise deployment
R04 - Enterprise security review blocks specific open-source build tools
R05 - Message protocol changes break the debug port (RemoteDebuggerSession)
R06 - Per-host HTTPS certificate generation for replay not possible in extension
R07 - Missing source for one or more manifest entry points
R08 - JMX schema version mismatch with target JMeter installation
R09 - Mixed async patterns (callbacks + promises + async/await) causing
race conditions in service worker context
R10 - `chrome.extension.getBackgroundPage()` calls in legacy code (removed in MV3)

Add any additional risks you identify during your analysis.

---

## TASK 10 — COMPONENT BOUNDARY PROPOSAL

Based on your analysis, propose how the ported extension should be divided into
distinct TypeScript modules. Do not write code — describe the boundaries only.

For each proposed module:

- Module name
- Responsibility (one sentence)
- What it replaces from the existing code
- Its dependencies on other proposed modules
- Whether it has any SideeX equivalent or is net-new

The module list must cover:

- Background service worker coordination
- Traffic capture (webRequest layer)
- Recording state machine
- Sampler / command model (the data structures)
- JMX serialisation
- YAML serialisation (if retained)
- Content script: recording hooks (replaces SideeX record.js + record-api.js)
- Content script: element locator (replaces SideeX finder + locator-builders)
- Content script: replay executor (replaces SideeX commands-api + selenium-api)
- Content script: dialog/prompt handling (replaces SideeX prompt-injecter)
- Popup UI
- Options UI
- Shared types / interfaces (no logic)
- Message type definitions (discriminated unions for all runtime messages)

---

## OUTPUT FORMAT

Produce a single Markdown document with the following top-level sections,
one per task. Do not mix findings across sections.

```
# Extension Analysis Report
## Metadata
  - Date
  - Analyst (agent)
  - Source directory analysed
  - Manifest version confirmed
  - Extension version

## 1. File Inventory
## 2. Entry Points
## 3. Message Architecture
## 4. SideeX Dependency Surface
## 5. Chrome API Surface
## 6. State Management Risks
## 7. Build Tooling and Type Coverage
## 8. Missing Source Files
## 9. Risk Register
## 10. Component Boundary Proposal

## Summary: Go / No-Go for Port
   Answer these three questions directly:
   a) Is the source sufficient to perform a complete port?
   b) Can SideeX be removed without losing HTTP traffic recording?
   c) What is the single highest-risk item the porting agent must resolve first?
```

---

## AGENT BEHAVIOUR RULES

- If a file cannot be read, say so explicitly — do not infer its contents.
- If a question cannot be answered from the source alone, say what additional
  information would resolve it. Do not guess.
- Do not produce any TypeScript, JavaScript, or other code in this stage.
- Do not make recommendations beyond what the output format asks for.
- Every factual claim must cite the file and line number it came from.
- If you find something that contradicts the known facts listed in the context
  section, flag it as a CONFLICT and do not silently resolve it.
- Complete every task. If a task yields no findings, write "No findings" and
  briefly explain why.

---

## INPUTS THE AGENT WILL RECEIVE

Before starting, confirm you have access to:
[ ] src-ori/ directory (full recursive read access)
[ ] manifest.json (already reviewed — use established facts)
[ ] dist/background/index.js (webpack bundle — already reviewed)
[ ] Any tsconfig.json, package.json, webpack config in src-ori/

If any of these are missing, halt and report what is missing before proceeding.

---

# AI Agent Prompt: SideeX Dependency Investigation

## Investigation result

**Short answer:** the Selenium/SideeX stack can be removed for an initial HTTP-traffic-recording and JMX-export build, but it cannot be removed while preserving the existing Selenium action recording, Selenium replay, dialog replay, object picker, and remote-debugger highlight features. The correct initial-phase conclusion is **Partial Removal**: remove the Selenium replay and locator engine now for the HTTP-only path, and keep or replace the SideeX recording bridge only if Selenium command recording remains in scope for the same release.

The actual directory is `src-ori/`; references in this section to `src-orig/` are treated as a prompt typo.

## Confirmed inputs

- Manifest entry points were read from `src-ori/manifest.json`. The MV3 manifest declares the background service worker at `dist/background/index.js` as a module (`src-ori/manifest.json:7-10`) and declares SideeX/Selenium-related content scripts in two all-frame groups (`src-ori/manifest.json:21-33`).
- The same manifest exposes SideeX page-injected scripts as web-accessible resources (`src-ori/manifest.json:58-60`).
- The proprietary background bridge was read from `src-ori/background/sideex/background-ui.ts`, `src-ori/background/sideex/bg-recorder-ui.ts`, and the compiled background bundle `src-ori/dist/background/index.js`.
- The proprietary content bridge was read from `src-ori/content/record-replay/object-highlighter.ts` and `src-ori/content/record-replay/screenshots.ts`.
- SideeX/Selenium files reviewed included `sideex/content/commands-api.js`, `selenium-api.js`, `selenium-browserbot.js`, `atoms.js`, `utils.js`, `findElement.js`, `finder.js`, `locator-builders.js`, `shadow-locator-builder.js`, `record-api.js`, `record.js`, `target-selecter.js`, `sizzle.js`, `shadow-listen.js`, `user-extensions.js`, `prompt-injecter.js`, `monkey-patch-injecter.js`, `prompt-remover.js`, `run-script-injecter.js`, `prompt.js`, `monkey-patch.js`, `run-script.js`, `escape.js`, `IO/save-file.js`, `playback/format-command.js`, `playback/old-playback-api.js`, `commands-parameters.json`, and `js/selenium/xpath/*`.

## Selenium/SideeX functional map

| Area | Files | What it owns | Required for HTTP/JMX? | Initial-phase action |
|---|---|---|---|---|
| Selenium command replay engine | `sideex/content/commands-api.js`, `selenium-api.js`, `selenium-browserbot.js`, `atoms.js`, `utils.js` | Receives replay commands, executes Selenium `do*` commands, locates elements, fires mouse/keyboard events, waits for pages. `commands-api.js` receives `{ commands }` and dispatches `selenium.do...` methods (`src-ori/sideex/content/commands-api.js:22-70`). `Selenium` implements click/type/select/wait commands (`src-ori/sideex/content/selenium-api.js:512-531`, `src-ori/sideex/content/selenium-api.js:1000-1033`, `src-ori/sideex/content/selenium-api.js:1161-1217`, `src-ori/sideex/content/selenium-api.js:2803-2820`). `BrowserBot.findElement` resolves locators recursively through frames (`src-ori/sideex/content/selenium-browserbot.js:1567-1619`). `atoms.js` exposes `bot.locators` and `bot.action` (`src-ori/sideex/content/atoms.js:6616-6656`, `src-ori/sideex/content/atoms.js:8905-8959`). | No | Remove now for HTTP-only. Keep only if existing Selenium replay is in scope. |
| Selenium locator stack | `sideex/content/findElement.js`, `finder.js`, `locator-builders.js`, `shadow-locator-builder.js`, `user-extensions.js`, `sizzle.js`, `js/selenium/xpath/*` | Generates id/name/linkText/css/xpath/shadow locators and resolves them. `locator-builders.js` registers id, linkText, name, data-attribute, css, xpath, and DOM locators (`src-ori/sideex/content/locator-builders.js:385-450`, `src-ori/sideex/content/locator-builders.js:503-627`, `src-ori/sideex/content/locator-builders.js:637-765`). `shadow-locator-builder.js` builds `shadow=` locators through `shadowRoot` (`src-ori/sideex/content/shadow-locator-builder.js:10-70`). `user-extensions.js` adds `locateElementByShadow` (`src-ori/sideex/content/user-extensions.js:60-89`). | No | Remove now for HTTP-only. Replace later with native `querySelector`, `document.evaluate`, and `shadowRoot` traversal. |
| Selenium action recording | `sideex/content/record-api.js`, `record.js`, `escape.js` | Captures DOM events and sends Selenium command messages to the background. `record-api.js` sends `{ command: 'recordCommand', step, url, label }` (`src-ori/sideex/content/record-api.js:182-201`) and sends `{ command: 'recordDom', dom }` for XPath position locators (`src-ori/sideex/content/record-api.js:212-255`). `record.js` records click/type/select events and calls `takeScreenshot` (`src-ori/sideex/content/record.js:96-119`, `src-ori/sideex/content/record.js:162-198`, `src-ori/sideex/content/record.js:926-958`). | No for HTTP capture; yes only if Selenium action recording is in scope | Remove now only if the initial phase drops Selenium action recording. If Selenium action recording is retained, keep this bridge temporarily behind an adapter. |
| Dialog/prompt interception | `sideex/content/prompt-injecter.js`, `prompt-remover.js`, `sideex/prompt.js`, `sideex/content/monkey-patch-injecter.js`, `sideex/monkey-patch.js` | Injects page-level scripts and records/suppresses alerts, confirms, prompts, XHR/fetch bodies. `prompt-injecter.js` injects `sideex/prompt.js` and records `answerDialog`/`assertDialog` commands (`src-ori/sideex/content/prompt-injecter.js:18-33`, `src-ori/sideex/content/prompt-injecter.js:54-80`). `monkey-patch-injecter.js` injects `sideex/monkey-patch.js` (`src-ori/sideex/content/monkey-patch-injecter.js:14-27`). `monkey-patch.js` patches XHR and fetch (`src-ori/sideex/monkey-patch.js:18-34`, `src-ori/sideex/monkey-patch.js:55-78`). | No | Remove now for HTTP-only. Replace later with `chrome.scripting.executeScript({ world: 'MAIN' })` if dialog capture is needed. |
| Object picker and highlighter | `sideex/content/target-selecter.js`, `sideex/content/run-script-injecter.js`, `sideex/run-script.js`, `dist/record-replay/index.js`, `content/record-replay/object-highlighter.ts` | Supports object picking and debugger highlight. `commands-api.js` handles `{ selectMode }` and sends `{ selectTarget }` (`src-ori/sideex/content/commands-api.js:73-103`). `object-highlighter.ts` calls `BrowserBot.createForWindow(window)` and `browserBot.findElement` (`src-ori/content/record-replay/object-highlighter.ts:8-20`). `dist/record-replay/index.js` references `BrowserBot` for `highlightObject` (`src-ori/dist/record-replay/index.js:1`). | No | Remove now for HTTP-only. Keep or replace if remote-debugger object picking/highlight remains in scope. |
| Screenshot bridge | `dist/record-replay/index.js`, `content/record-replay/screenshots.ts` | `dist/record-replay/index.js` owns `takeScreenshot`; `screenshots.ts` sends `{ op: 'takeScreenshot', recordId, cropRect }` to the background (`src-ori/content/record-replay/screenshots.ts:18-22`). | No for HTTP capture; yes only if screenshot annotations are kept | Remove now if screenshots are out of initial scope. Otherwise keep the proprietary bridge and remove only its `BrowserBot` highlight dependency. |

## Capability analysis

### Capability A — HTTP traffic recording and JMX export

**Can be done without SideeX:** yes.

Evidence:
- SideeX/Selenium files are declared only as content scripts and web-accessible resources, not as the background service worker (`src-ori/manifest.json:7-10`, `src-ori/manifest.json:21-33`, `src-ori/manifest.json:58-60`).
- The background service worker is the compiled bundle `dist/background/index.js` (`src-ori/manifest.json:7-10`), and that bundle contains the webRequest traffic-recording strings and state (`src-ori/dist/background/index.js:1`).
- The legacy content script `js/content-script.js` injects the transaction popup and listens for `addTransactionPopupUi` / `removeTransactionPopupUi`; it does not depend on SideeX globals (`src-ori/js/content-script.js:187-199`).
- The proprietary record/replay helper only sends screenshot messages and uses `BrowserBot` for highlighting; it is not the HTTP capture path (`src-ori/content/record-replay/screenshots.ts:18-22`, `src-ori/content/record-replay/object-highlighter.ts:8-20`, `src-ori/dist/record-replay/index.js:1`).

Conclusion: an initial HTTP/JMX build can remove all SideeX/Selenium manifest entries and still preserve the background traffic-recording path, provided the build does not also promise Selenium action recording, Selenium replay, dialog replay, object picking, or debugger highlighting.

### Capability B — Selenium action recording

**Can be done without the current SideeX files:** not without replacement.

Evidence:
- `record.js` is the DOM event recorder and uses locator builders and screenshot capture (`src-ori/sideex/content/record.js:96-119`, `src-ori/sideex/content/record.js:162-198`, `src-ori/sideex/content/record.js:926-958`).
- `record-api.js` is the message adapter that converts those events into `{ command: 'recordCommand', step, url, label }` (`src-ori/sideex/content/record-api.js:182-201`) and `{ command: 'recordDom', dom }` (`src-ori/sideex/content/record-api.js:212-255`).
- The background receives `recordCommand` and `recordDom` and routes them into `BackgroundRecorderUI` (`src-ori/background/sideex/background-ui.ts:75-89`, `src-ori/background/sideex/background-ui.ts:271`).
- The locator stack used by the recorder is SideeX/Selenium-dependent (`src-ori/sideex/content/locator-builders.js:385-450`, `src-ori/sideex/content/locator-builders.js:503-627`, `src-ori/sideex/content/shadow-locator-builder.js:10-70`).

Conclusion: Selenium action recording can be removed from the initial phase. If it must remain, SideeX should stay temporarily or be replaced by a proprietary content recorder that emits the same `recordCommand`, `recordDom`, `selectTarget`, and screenshot messages.

### Capability C — Selenium replay

**Can be done without the current SideeX files:** no, not without a new replay executor.

Evidence:
- `commands-api.js` is the content-side replay dispatcher for `{ commands }` (`src-ori/sideex/content/commands-api.js:22-70`).
- The replay dispatcher creates `new Selenium(BrowserBot.createForWindow(window))`, `new LocatorBuilders(window)`, and `new ShadowLocatorBuilder(window)` (`src-ori/sideex/content/commands-api.js:18-21`).
- `selenium-api.js` implements the replay commands such as click, type, select, and wait (`src-ori/sideex/content/selenium-api.js:512-531`, `src-ori/sideex/content/selenium-api.js:1000-1033`, `src-ori/sideex/content/selenium-api.js:1161-1217`, `src-ori/sideex/content/selenium-api.js:2803-2820`).
- `selenium-browserbot.js` resolves locators and traverses frames (`src-ori/sideex/content/selenium-browserbot.js:1567-1619`).

Conclusion: Selenium replay should be deferred to a later modular implementation. It should not block the initial HTTP/JMX phase.

## Removal blast radius

### Would continue working after removing SideeX/Selenium

- Background service worker loading, because the manifest service worker is `dist/background/index.js` and not a SideeX file (`src-ori/manifest.json:7-10`).
- HTTP traffic capture, because the compiled background bundle contains webRequest traffic state and listeners (`src-ori/dist/background/index.js:1`).
- Transaction popup injection, because `js/content-script.js` injects recorder UI and handles transaction UI messages without SideeX globals (`src-ori/js/content-script.js:61-164`, `src-ori/js/content-script.js:187-199`).
- Existing popup/options/build structure, because SideeX is not the popup or options entry point (`src-ori/manifest.json:2-5`, `src-ori/manifest.json:51-54`).

### Would break immediately after removing SideeX/Selenium

- Selenium replay command execution: `{ commands }` would have no content-side dispatcher (`src-ori/sideex/content/commands-api.js:22-70`).
- Selenium action recording: `{ command: 'recordCommand' }` would have no sender (`src-ori/sideex/content/record-api.js:182-201`).
- XPath-position DOM snapshots: `{ command: 'recordDom' }` would have no sender (`src-ori/sideex/content/record-api.js:212-255`).
- Object picker: `{ selectMode }` would have no content-side handler and `{ selectTarget }` would not be produced (`src-ori/sideex/content/commands-api.js:73-103`).
- Dialog recording/replay: `answerDialog` and `assertDialog` recording would be lost because `prompt-injecter.js` records those commands (`src-ori/sideex/content/prompt-injecter.js:54-80`).
- XHR/fetch body capture from the page context would be lost because `monkey-patch-injecter.js` injects the page-level monkey patch (`src-ori/sideex/content/monkey-patch-injecter.js:14-27`, `src-ori/sideex/monkey-patch.js:18-34`, `src-ori/sideex/monkey-patch.js:55-78`).
- Debugger highlight would fail because `object-highlighter.ts` depends on `BrowserBot.createForWindow(window)` (`src-ori/content/record-replay/object-highlighter.ts:8-20`).

## Recommended initial-phase removal strategy

### Remove now for an HTTP/JMX-only initial phase

Remove all SideeX/Selenium manifest entries and web-accessible resources listed in `src-ori/manifest.json:21-33` and `src-ori/manifest.json:58-60`. This includes:

- `sideex/content/findElement.js`
- `sideex/content/finder.js`
- `sideex/content/shadow-listen.js`
- `sideex/content/atoms.js`
- `sideex/content/utils.js`
- `sideex/content/selenium-browserbot.js`
- `sideex/content/user-extensions.js`
- `sideex/content/escape.js`
- `sideex/content/selenium-api.js`
- `sideex/content/locator-builders.js`
- `sideex/content/shadow-locator-builder.js`
- `sideex/content/record-api.js`
- `sideex/content/record.js`
- `sideex/content/commands-api.js`
- `sideex/content/target-selecter.js`
- `sideex/content/sizzle.js`
- `js/selenium/xpath/util.js`
- `js/selenium/xpath/xmltoken.js`
- `js/selenium/xpath/xpath.js`
- `dist/record-replay/index.js`
- `sideex/content/prompt-injecter.js`
- `sideex/content/monkey-patch-injecter.js`
- `sideex/prompt.js`
- `sideex/monkey-patch.js`
- `sideex/content/prompt-remover.js`

Also remove or disable background paths that send or expect SideeX-only messages: `commands`, `selectMode`, `highlightObject`, `attachPrompt`, `detachPrompt`, and `attachRecorder`/`detachRecorder` when those are used only to control SideeX. The background message router itself is proprietary and should remain (`src-ori/background/sideex/background-ui.ts:50-271`).

### Keep temporarily only if Selenium recording/replay is in the same initial release

If the first release must still preserve Selenium command recording and replay, keep this temporary SideeX subset behind an adapter:

- Recording bridge: `record.js`, `record-api.js`, `locator-builders.js`, `shadow-locator-builder.js`, `finder.js`, `user-extensions.js`, `shadow-listen.js`, `escape.js`.
- Dialog bridge: `prompt-injecter.js`, `monkey-patch-injecter.js`, `prompt.js`, `monkey-patch.js`, `prompt-remover.js`.
- Replay bridge if replay is retained: `commands-api.js`, `selenium-api.js`, `selenium-browserbot.js`, `atoms.js`, `utils.js`, `findElement.js`, `sizzle.js`, `js/selenium/xpath/*`.
- Debugger highlight if retained: `dist/record-replay/index.js` plus the `BrowserBot`/locator stack it depends on (`src-ori/dist/record-replay/index.js:1`, `src-ori/content/record-replay/object-highlighter.ts:8-20`).

This temporary subset is not the recommended HTTP-only path. It is the minimum retention set for preserving existing Selenium features until a proprietary replacement exists.

## Interface contract for a later proprietary replacement

A proprietary replacement should not expose SideeX globals. It should implement the following message contract with the existing background:

- Send `{ command: 'recordCommand', step, url, label }` for DOM actions (`src-ori/sideex/content/record-api.js:182-201`).
- Send `{ command: 'recordDom', dom }` when a locator needs a DOM snapshot (`src-ori/sideex/content/record-api.js:212-255`).
- Send `{ command: 'selectTarget', target }` for object picking (`src-ori/sideex/content/commands-api.js:90-103`).
- Send `{ op: 'takeScreenshot', recordId, cropRect }` for screenshot annotations (`src-ori/content/record-replay/screenshots.ts:18-22`).
- Receive `{ command: 'attachRecorder' }` and `{ command: 'detachRecorder' }` for recording lifecycle (`src-ori/sideex/content/commands-api.js:124-134`).
- Receive `{ command: 'attachPrompt' }` and `{ command: 'detachPrompt' }` for dialog interception (`src-ori/sideex/content/prompt-injecter.js:18-33`).
- Receive `{ commands, target, value, frameId }` only if Selenium replay is implemented later (`src-ori/sideex/content/commands-api.js:22-70`).

Native browser equivalents are sufficient for most locator work: `document.querySelector`, `document.querySelectorAll`, `document.evaluate`, `CSS.escape`, `element.shadowRoot`, and `event.composedPath()` can replace the SideeX locator stack for a scoped recorder. The XPath utilities are not needed for HTTP recording and should be removed unless XPath locators are retained for Selenium recording.

## Final answer

**Can the extension record HTTP traffic and generate JMX output without any SideeX file present?** Yes, for the HTTP/JMX path. The SideeX/Selenium files are content-script and page-injected dependencies, while traffic capture and export live in the compiled background bundle (`src-ori/manifest.json:7-10`, `src-ori/manifest.json:21-33`, `src-ori/dist/background/index.js:1`).

**Can the extension remove SideeX and keep all existing Selenium features?** No. The existing Selenium action recorder, replay executor, dialog bridge, object picker, and debugger highlight all depend on SideeX/Selenium globals and messages (`src-ori/sideex/content/record-api.js:182-201`, `src-ori/sideex/content/commands-api.js:18-21`, `src-ori/sideex/content/selenium-api.js:512-531`, `src-ori/content/record-replay/object-highlighter.ts:8-20`).

**Recommended first step:** ship the initial phase as an HTTP/JMX recorder with all SideeX/Selenium manifest entries removed, keep `js/content-script.js` for transaction UI, and defer Selenium recording/replay to a later proprietary TypeScript adapter.

SideeX should be treated as a later-stage optional module, not as part of the initial HTTP/JMX delivery contract. A separate follow-up spec should define the SideeX module boundary, retained file list, typed message adapter, and acceptance criteria before any Selenium recording or replay work begins.

## Port implementation status after code port

The current working tree now contains an HTTP/JMX-only MV3 port that matches the initial-phase SideeX removal recommendation.

### Implemented from this analysis

- SideeX/Selenium manifest entries are no longer declared in the ported manifest. The active MV3 manifest declares only the service worker, one proprietary content script, popup, options page, storage, `webRequest`, `webRequestBlocking`, `activeTab`, and `<all_urls>` host permissions (`src/manifest.json:1-28`).
- The background entry point is a small service-worker bootstrap that delegates to `RecorderService` and handles typed runtime messages (`src/background/index.ts:1-23`).
- Recording state is persisted to `chrome.storage.local` through `RecorderState`, including status, plan name, tab ID, start time, and captured requests (`src/background/recorder-state.ts:9-113`).
- HTTP capture is implemented with `chrome.webRequest` rather than SideeX. The capture service registers `onBeforeRequest`, `onBeforeSendHeaders`, `onResponseStarted`, `onCompleted`, and `onErrorOccurred` listeners and normalizes requests into the canonical model (`src/background/traffic-capture.ts:19-109`, `src/background/traffic-normalizer.ts:7-61`).
- JMX export is local and client-side. `RecorderService` builds a JMX response from captured requests (`src/background/recorder-service.ts:72-115`), and `buildJmx()` emits `TestPlan`, `ThreadGroup`, `HTTPSamplerProxy`, `HeaderManager`, and raw request-body CDATA (`src/jmx/serializer.ts:3-37`, `src/jmx/serializer.ts:39-73`).
- Popup and options pages were added as vanilla TypeScript MV3 extension pages (`src/popup/popup.ts:1-184`, `src/options/options.ts:1-76`).
- The port keeps the enterprise deployment posture from the analysis: no runtime open-source dependencies, local JMX generation, and `webRequestBlocking` preserved for enterprise policy deployment (`src/manifest.json:6-7`).

### Areas still needing improvement

1. **Content body fallback was removed with SideeX.** The port now relies on `webRequest.requestBody`; a later spec should add a typed content-script fallback for fetch/XHR/form edge cases where browser request-body capture is incomplete.
2. **Mid-flight request persistence is not complete.** Pending `webRequest` records live in memory and can be lost if the service worker terminates between `onBeforeRequest` and `onCompleted`.
3. **JMX coverage is basic.** The serializer covers HTTP samplers, headers, methods, paths, protocols, and raw bodies, but not CookieManager, CacheManager, timers, extractors, assertions, transaction controllers, or sampler grouping.
4. **Options are saved but not used for export metadata.** The options page stores threads/ramp-up/loops/plan defaults, but export still uses fixed thread-group defaults from `RecorderService`.
5. **Popup/options build layout is awkward.** Vite emits popup/options HTML under `dist/src/...`; the manifest works, but a cleaner dist layout or wrapper HTML should be introduced.
6. **E2E coverage is still placeholder-level.** The Playwright test passes but does not load the extension and validate a real golden JMX export.
7. **CRX packaging script still needs validation.** The pack script is present, but it should be run in the intended packaging environment and reviewed for the placeholder CRX path.
