# Playwright Recording Mode — Specification

## Current Status

**IMPLEMENTED WITH FOLLOW-UPS.** The extension now:
- Exports HTTP traffic to Playwright format (Path A)
- Captures browser actions (clicks, form input) via content script (Path B)
- Combines both HTTP requests and actions in generated test output
- Exposes the Playwright export mode from the compact popup UI
- Supports an optional base URL for Playwright exports

Remaining follow-ups are tracked in `specs/XXX-backlog-ideas.md` and are not blockers for the Playwright export path itself:
- Frame context tracking
- Additional action commands such as select and more complete wait handling
- E2E tests for action recording and generated Playwright output
- Documentation for generated test format

## Implemented Components

### Path A: HTTP-only Playwright Export
- ✅ `EXPORT_PLAYWRIGHT` message type (src/messages.ts:22)
- ✅ `buildPlaywrightResponse()` handler (src/background/recorder-service.ts:130-154)
- ✅ `buildPlaywrightTest()` generator (src/generators/playwright.ts:58-79)
- ✅ UI export mode selector (src/popup/popup.html:101-106)
- ✅ Export routing in popup (src/popup/popup.ts:75-110)

### Path B: Browser Action Recording
- ✅ `ActionStep` interface (src/models/captured-request.ts:23-29)
- ✅ `SelectorBuilder` class for element selector generation (src/content/action-recorder.ts:4-23)
- ✅ `ActionRecorder` content script (src/content/action-recorder.ts:49-202)
- ✅ `ADD_ACTION` message type (src/messages.ts:22)
- ✅ `addAction()` and `getActions()` in RecorderState (src/background/recorder-state.ts:95-107)
- ✅ Combined HTTP + action step output (src/background/recorder-service.ts:139-146)

### Supporting Components
- ✅ `PlaywrightLocatorBuilder` class (src/generators/playwright-locator.ts)
- ✅ Unit tests for all new functionality (61 tests passing across the current suite)

---

## Overview

The extension now generates Playwright test scripts (`.spec.ts` files) from recorded browser interactions with two paths:

### Path A: HTTP-only Playwright Export (Implemented)

Export HTTP traffic to Playwright's `page.route()` API to mock/modify HTTP requests. This complements the existing JMX export.

### Path B: Full Browser Interaction Recording (Implemented with follow-ups)

Browser action recording for clicks, typing, and form submissions is active. Generated tests combine page interactions with HTTP request mocks. Frame context tracking and additional action coverage remain follow-ups.

---

## Architecture

### Current Implementation (HTTP/JMX + Playwright)

```
                      ┌─────────────────────────────────┐
                      │     Browser HTTP Traffic          │
                      │     (Chrome webRequest API)      │
                      └──────────────┬──────────────────┘
                                     │
                                     ▼
                      ┌─────────────────────────────────┐
                      │     RecorderState + RecorderService │
                      │  (state persisted to chrome.storage) │
                      └──────────────┬──────────────────┘
                                     │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                   ▼
             [JMX Export]    [Playwright TS Export]   [Future: Other Formats]
             (existing)      (NEW - Combined output)   (e.g., HAR, curl)
```

### Action Recording Flow

```
         ┌─────────────────────────────────┐
         │     Browser DOM Events            │
         │     (click, change, submit)      │
         └──────────────┬──────────────────┘
                        │
                        ▼
         ┌─────────────────────────────────┐
         │     ActionRecorder content script │
         │     (SelectorBuilder for locators)│
         └──────────────┬──────────────────┘
                        │
                        ▼
         ┌─────────────────────────────────┐
         │     RecorderService.handleMessage │
         │     ADD_ACTION case handler         │
         └──────────────┬──────────────────┘
                        │
                        ▼
         ┌─────────────────────────────────┐
         │     RecorderState.addAction()     │
         │     State persisted with actions  │
         └─────────────────────────────────┘
```

---

## File Structure

### Implemented Files
```
src/
├── models/captured-request.ts      ← ActionStep interface, PlaywrightStep type
├── messages.ts                      ← ADD_ACTION, EXPORT_PLAYWRIGHT types
├── generators/
│   ├── playwright.ts              ← HTTP + action test generator
│   ├── playwright.test.ts         ← 6 tests
│   ├── playwright-locator.ts      ← PlaywrightLocatorBuilder class
│   └── playwright-locator.test.ts ← 9 tests
├── content/
│   ├── index.ts                    ← Imports action-recorder
│   ├── action-recorder.ts         ← ActionRecorder, SelectorBuilder
│   └── action-recorder.test.ts    ← 6 tests
└── background/
    ├── recorder-service.ts         ← ADD_ACTION handler, combined output
    ├── recorder-service.test.ts   ← 1 test
    └── recorder-state.ts           ← addAction(), getActions()
```

---

## Implementation Status

### Task 1 — Message Type Extension ✅
- `EXPORT_PLAYWRIGHT` response type: `{ success: true; playwright: string; filename: string }`
- `ADD_ACTION` message type: `{ type: 'ADD_ACTION'; action: ActionStep }`

### Task 2 — Background Handler ✅
- Handler in `RecorderService.handleMessage()` (line 96-100)
- `buildPlaywrightExportResponse()` combines HTTP and action steps (line 130-154)

### Task 3 — Playwright Generator ✅
- `buildPlaywrightTest()` generates combined test output
- HTTP requests → `page.route()` mocks
- Action steps → `page.goto()`, `page.fill()`, `page.click()` calls

### Task 4 — Popup UI Integration ✅
- Export mode selector with JMX/Playwright options in the compact popup layout
- Base URL input field for Playwright exports
- Conditional display of playwrightOptions div
- Related UX/UI details are documented in `specs/004-improve-ux-ui-implementation.md`

### Task 5 — Action Recording (Phase 2) ✅
- Content script captures click, change, submit events
- SelectorBuilder generates CSS selectors (#id, .class, tag)
- Actions sent to background via ADD_ACTION message

---

## Design Decisions Made

1. **Export Scope**: Both HTTP requests AND page interactions are included
2. **Test Structure**: Single test per export, with HTTP mocks and actions interleaved
3. **HTTP Export Method**: Uses `page.route()` for mocking (not `page.request.*`)
4. **Assertions**: Minimal - focuses on request/response recording

---

## Testing

Current unit suite: 61 tests passing.

| File | Tests | Coverage |
|------|-------|----------|
| recorder-state.test.ts | 6 | State management, action persistence |
| recorder-service.test.ts | 1 | ADD_ACTION message handling |
| playwright.test.ts | 6 | Combined HTTP + action test generation |
| playwright-locator.test.ts | 9 | Selector building, URL handling |
| action-recorder.test.ts | 6 | SelectorBuilder, createActionStep |
| traffic-normalizer.test.ts | 6 | Request normalization |
| serializer.test.ts | 6 | JMX generation |
| popup.test.ts | 6 | Popup timer/state behavior |
| options.test.ts | 5 | Options normalization |

---

## Constraints

- ✅ Works with strict TypeScript (`noImplicitAny: true`, `strict: true`)
- ✅ Pure client-side (no backend calls)
- ✅ All traffic serialized locally
- ✅ Enterprise deployment compatible

---

## Remaining Work

- [ ] Frame context tracking (FrameContextTracker mentioned in original context)
- [ ] Additional action commands (select, waitForElement fully tested)
- [ ] E2E tests for action recording
- [ ] Documentation for generated test format