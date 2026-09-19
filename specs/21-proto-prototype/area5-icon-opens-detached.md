# Feature 21 Prototype — Area 5: Toolbar Icon Opens Detached Window

**Branch:** `prototype/area5-icon-opens-detached`
**Depends on:** Existing Feature 21 detached inspector UI; Chrome MV3 `action` and `windows` APIs
**Type:** UX prototype / extension action routing
**Status:** Branch open — implementation is present on this branch and is not merged.

---

## 1. Outcome

Clicking the extension toolbar icon opens the existing popup UI in a separate,
user-resizable browser window instead of Chrome's constrained action popup. The
detached window loads `popup/popup.html?detached=1`, reuses and focuses an
existing detached window, and keeps the recorder and transaction-inspector
behaviour unchanged.

**Ships value:** More usable inspection space for long URLs and transaction details without changing capture or export semantics.
**Stop if:** The shipped manifest still declares `action.default_popup`, the
toolbar icon opens the constrained popup, or the detached window cannot load or
be resized.

---

## 2. Scope

### In scope

1. Route toolbar clicks through `chrome.action.onClicked` in the service worker.
2. Ensure the **shipped** MV3 manifest has no `action.default_popup` while the
   build still emits the popup HTML asset.
3. Open `popup/popup.html?detached=1` as a focused `type: 'popup'` window with
   an initial 900 × 720 size.
4. Position a new detached window at the top-right of the browser window whose
   icon was clicked, falling back to the last focused window and then to Chrome
   default placement when geometry is unavailable.
5. Reuse an existing detached window and focus it instead of creating a
   duplicate.
6. Apply the detached-only popup layout: a content column up to 1200px wide and
   a transaction panel that consumes the remaining window height.
7. Retain the existing detached-window bounds helpers and tests: validate and
   clamp bounds, use a 700 × 600 minimum, persist bounds with a 500ms debounce,
   and ignore minimized, maximized, fullscreen, or otherwise unusable bounds.
8. Preserve the existing recording-start option and hidden legacy Detach
   control as compatibility and reversion paths.

### Out of scope

- Changes to traffic capture, recording state, JMX, Playwright export, or
  correlation behaviour.
- A new permission or a new inspector page.
- Guaranteed always-on-top behaviour; the OS can still cover a detached
  browser window.
- Response-body capture or privacy-policy changes.
- Replacing the existing options toggle or removing the legacy Detach path.

### Current implementation notes

- `src/manifest.json` still contains `action.default_popup` as the CRXJS build
  input. `vite.config.ts` intentionally removes it from `dist/manifest.json`;
  loading the source manifest directly would bypass `action.onClicked`. The
  built artifact is the authoritative contract for this prototype.
- The options toggle is active, not inert: `src/options/options.html` exposes
  it, `src/options/options.ts` persists it, and `src/popup/popup.ts` calls
  `openDetachedInspectorWindowIfEnabled()` after a successful recording start.
  The stale comment describing that option as inert must not be treated as
  behavioural documentation.
- The toolbar-click service-worker path creates the initial window directly
  and restores the user's last persisted bounds on first open via the shared
  `detached-bounds` helpers (Issue 2 is fixed: stored bounds are read from
  `chrome.storage.local` and applied with a top-right fallback when absent or
  invalid).

---

## 3. Code map

| Area | Path | Current role |
| ---- | ---- | ------------ |
| Source manifest input | `src/manifest.json` | Declares the popup for CRXJS asset emission; retains `action.default_popup` in source. |
| Shipped manifest transform | `vite.config.ts` | Strips `action.default_popup` from the output manifest, rewrites output paths, and declares the separate service-worker entry. |
| Toolbar action routing | `src/background/service-worker.ts` | Registers `chrome.action.onClicked`, reuses/focuses an existing detached window, creates the new window at the top-right, and loads persisted bounds via `detached-bounds`. |
| Detached page state | `src/popup/popup.ts` | Reads `?detached=1`, applies the detached layout hook, and provides bounds validation, clamping, persistence, and the legacy opening path. |
| Popup markup | `src/popup/popup.html` | Supplies the shared popup UI and keeps the legacy Detach button hidden. |
| Detached layout | `src/popup/popup.css` | Separates the 1200px detached content column from the 760px action-popup column and gives the transaction list flexible height. |
| Existing option path | `src/options/options.html`, `src/options/options.ts` | Persists “Open detached inspector window when recording starts” and keeps the option available. |
| Unit coverage | `src/popup/popup.test.ts` | Covers bounds validation, fallback, reuse/focus, and debounced persistence for the popup-side detached path. |
| Background unit coverage | `src/background/detached-window-opener.test.ts` | 24 tests cover the service-worker path: reuse/focus, top-right placement, bounds restore-with-fallback, provider error handling, and default-size fallback. |
| Shared bounds helpers | `src/shared/detached-bounds.ts`, `src/shared/detached-bounds.test.ts` | Validate/clamp bounds to the available work area (700 × 600 minimum), read/write `chrome.storage.local` with a 500 ms debounce, and expose `loadDetachedBounds` for injection. |
| Browser coverage | `tests/e2e/spec-020-popup-stability.spec.ts` | Covers detached query-state and 760px/1200px detached layout widths. |

---

## 4. SOLID / DRY / CRAP / CLEAN

- **One action-routing responsibility:** the service worker owns toolbar-click
  window creation; the popup owns its own layout and bounds behaviour.
- **Reuse the existing UI:** both surfaces load the same popup HTML and retain
  the existing safe DOM rendering and recorder message flow.
- **Keep build-time and runtime contracts explicit:** the source manifest and
  shipped manifest intentionally differ; verification must inspect `dist/`.
- **Do not duplicate window state:** an existing detached window is focused
  instead of creating another one.
- **Keep the prototype reversible:** the hidden Detach control and recording-start
  option remain available while the toolbar route is evaluated.
- **No new permission surface:** the existing `windows` permission is sufficient
  for the current `chrome.windows.create` / `update` calls.

---

## 5. Verification audit

| ID | Check | Method | Pass criteria |
| -- | ----- | ------ | ------------- |
| V21-A5.1 | Shipped manifest contract | Run `npm run build`; inspect `dist/manifest.json` | `action.default_popup` is absent; `action.default_title` and `default_icon` remain; the service worker is present. |
| V21-A5.2 | Toolbar route | Load the built extension in Chrome and click the toolbar icon | A separate `popup/popup.html?detached=1` window opens instead of the constrained action popup. |
| V21-A5.3 | Resizable initial window | Inspect the created `chrome.windows.create` call and resize the native window | Initial create data is 900 × 720 (or the persisted bounds from `chrome.storage.local` on first open) with `type: 'popup'`; native resizing is not blocked. |
| V21-A5.4 | Reuse and focus | Click the toolbar icon twice while a detached window is open | The second click focuses the existing window and does not create a duplicate. |
| V21-A5.5 | Placement fallback | Exercise a normal source window, unavailable source geometry, and a minimized source window | The new window is placed at the source top-right when possible and falls back without throwing. |
| V21-A5.6 | Detached layout | Open the built page with `?detached=1` at narrow, 760px, and wide viewports | `data-detached="1"` is set; body width is viewport-limited up to 1200px; the transaction panel uses remaining height. |
| V21-A5.7 | Existing option compatibility | Enable the options toggle, start recording, and use the hidden legacy Detach path where available | The existing recording-start and legacy paths still open/focus a detached window. |
| V21-A5.8 | Bounds behaviour | Run `npm test -- src/background/detached-window-opener.test.ts src/shared/detached-bounds.test.ts src/popup/popup.test.ts` | Valid stored bounds are used; invalid bounds fall back; another/minimized window is ignored; persistence is debounced. |
| V21-A5.9 | Toolbar-click bounds restore (Issue 2) | Reload the built extension with stored bounds in `chrome.storage.local`; click the toolbar icon | The first window opened by the toolbar icon uses the stored width/height/left/top instead of the default 900 × 720. |
| V21-A5.10 | Regression gates | Run `npm run typecheck`, `npm run build`, and the relevant Playwright scenario | Typecheck and build pass; detached browser scenarios pass without capture/export regressions. |
| V21-A5.11 | Permission boundary | Review the shipped manifest and diff | No permission beyond the existing `windows` permission is added for this route. |

---

## 6. Exit criteria

- The built extension opens a resizable detached inspector from the toolbar
  icon and focuses an existing instance on subsequent clicks.
- The shipped manifest has no `action.default_popup`; the source-manifest
  build-input exception is documented and verified in `dist/`.
- The detached page uses the shared popup UI, sets `data-detached="1"`, and
  applies the detached width and transaction-panel layout.
- Placement, reuse, fallback, and permission checks pass.
- Relevant unit, typecheck, build, and Playwright checks pass.
- The recording-start option and hidden legacy Detach path remain compatible.
- The toolbar-click bounds-persistence gap is fixed: the first window opened by
  the toolbar icon restores persisted bounds from `chrome.storage.local` with a
  top-right fallback.
