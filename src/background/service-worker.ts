import type { BackgroundRequest, BackgroundResponse } from '../messages'
import { RecorderService } from './recorder-service'
import { createDetachedOpener } from './detached-window-opener'
import { loadStoredDetachedBounds } from '../shared/detached-bounds'

const service = new RecorderService()

service.initialize().catch((err: unknown) => {
  console.error('Failed to initialize Capultura.', err)
})

console.log(
  '[Capitura] background loaded, scripting available:',
  typeof (chrome as { scripting?: unknown }).scripting
)

chrome.runtime.onMessage.addListener((message: BackgroundRequest, sender, sendResponse) => {
  void service
    .handleMessage(message, sender)
    .then((response: BackgroundResponse) => sendResponse(response))
    .catch((err: unknown) => {
      sendResponse({
        success: false,
        error: err instanceof Error ? err.message : 'Unexpected error',
      })
    })

  return true
})

chrome.runtime.onInstalled.addListener(() => {
  console.log('Capultura installed')
})

const DETACHED_POPUP_URL = chrome.runtime.getURL('popup/popup.html?detached=1')
const DETACHED_POPUP_DEFAULT = { width: 900, height: 720 }

const detachedOpener = createDetachedOpener({
  detachedPopupUrl: DETACHED_POPUP_URL,
  defaultSize: DETACHED_POPUP_DEFAULT,
  windows: {
    getAll: (options) => chrome.windows.getAll(options),
    get: (windowId) => chrome.windows.get(windowId),
    getLastFocused: () => chrome.windows.getLastFocused(),
    create: (options) => chrome.windows.create(options),
    update: (windowId, options) => chrome.windows.update(windowId, options),
  },
  // Restore the last size/location the user gave the detached window on the
  // first open through the toolbar icon. Service workers have no `window`, so
  // clamp with the built-in fallback work area rather than throwing. A null
  // result (nothing stored, invalid, or unavailable) falls back to the
  // default-size + top-right placement path.
  loadDetachedBounds: () => loadStoredDetachedBounds(chrome.storage.local),
})

// PROTOTYPE (area 5): clicking the toolbar icon opens the popup as a separate,
// user-resizable window instead of the constrained 800x600 action popup. This
// only works when `action.default_popup` is absent — Chrome fires
// `action.onClicked` only when the action has no popup of its own (see
// chrome.action docs). Back out by restoring `default_popup` in the manifest
// and deleting this block.
chrome.action.onClicked.addListener((tab) => {
  void detachedOpener.openDetachedPopupWindow(tab.windowId)
})
