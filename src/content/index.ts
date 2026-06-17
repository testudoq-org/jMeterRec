import type { RecorderSnapshot } from '../messages'
import { actionRecorder } from './action-recorder'
import { responseBodyCapture } from './response-body-capture'

const CONTAINER_ID = 'capultura-transaction-panel'

type ContentMessage =
  | { type: 'ADD_TRANSACTION_POPUP_UI' }
  | { type: 'REMOVE_TRANSACTION_POPUP_UI' }
  | { type: 'STATE_CHANGED'; snapshot: RecorderSnapshot }
  | { type: 'REQUEST_CAPTURED' }

let panel: HTMLDivElement | undefined
let requestCount = 0

function showPanel(): void {
  if (panel?.isConnected) {
    return
  }

  panel = document.createElement('div')
  panel.id = CONTAINER_ID
  panel.setAttribute('role', 'status')
  panel.style.cssText = [
    'position:fixed',
    'right:16px',
    'top:16px',
    'z-index:2147483647',
    'min-width:220px',
    'padding:10px 12px',
    'border:1px solid #9aa7b7',
    'border-radius:8px',
    'background:#ffffff',
    'box-shadow:0 4px 18px rgba(15,23,42,0.22)',
    'color:#0f172a',
    'font:13px/1.4 Arial, sans-serif',
  ].join(';')

  panel.innerHTML = `
    <div style="font-weight:700;margin-bottom:4px;">Capultura</div>
    <div id="capultura-status">Idle</div>
    <div id="capultura-count">Requests: 0</div>
  `

  document.documentElement.append(panel)
}

function removePanel(): void {
  panel?.remove()
  panel = undefined
}

function updatePanel(snapshot: RecorderSnapshot): void {
  requestCount = snapshot.requestCount
  showPanel()

  const status = panel?.querySelector<HTMLElement>('#capultura-status')
  const count = panel?.querySelector<HTMLElement>('#capultura-count')

  if (status !== null && status !== undefined) {
    status.textContent =
      snapshot.status === 'recording'
        ? 'Recording'
        : snapshot.status === 'paused'
          ? 'Paused'
          : 'Idle'
  }

  if (count !== null && count !== undefined) {
    count.textContent = `Requests: ${requestCount}`
  }
}

function isContentMessage(message: unknown): message is ContentMessage {
  if (typeof message !== 'object' || message === null) {
    return false
  }

  const record = message as Record<string, unknown>

  return (
    (record.type === 'ADD_TRANSACTION_POPUP_UI' && Object.keys(record).length === 1) ||
    (record.type === 'REMOVE_TRANSACTION_POPUP_UI' && Object.keys(record).length === 1) ||
    (record.type === 'STATE_CHANGED' &&
      typeof record.snapshot === 'object' &&
      record.snapshot !== null) ||
    (record.type === 'REQUEST_CAPTURED' && Object.keys(record).length === 1)
  )
}

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isContentMessage(message)) {
    return
  }

  switch (message.type) {
    case 'ADD_TRANSACTION_POPUP_UI':
      updatePanel({
        status: 'idle',
        recording: false,
        planName: 'Untitled Plan',
        requestCount,
      })
      break
    case 'REMOVE_TRANSACTION_POPUP_UI':
      removePanel()
      break
    case 'STATE_CHANGED':
      actionRecorder.applySnapshot(message.snapshot)
      updatePanel(message.snapshot)
      applyResponseBodyCaptureState(message.snapshot)
      break
    case 'REQUEST_CAPTURED':
      updatePanel({
        status: 'recording',
        recording: true,
        planName: 'Untitled Plan',
        requestCount: requestCount + 1,
      })
      break
  }
})

chrome.runtime
  .sendMessage({ type: 'GET_STATE' })
  .then((response: unknown) => {
    if (isStateResponse(response) && response.success && response.snapshot?.recording) {
      actionRecorder.applySnapshot(response.snapshot)
      updatePanel(response.snapshot)
      applyResponseBodyCaptureState(response.snapshot)
    }
  })
  .catch((err: unknown) => {
    console.warn('Unable to read recorder state in content script.', err)
  })

function isStateResponse(
  response: unknown
): response is { success: boolean; snapshot?: RecorderSnapshot } {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    typeof (response as Record<string, unknown>).success === 'boolean'
  )
}

async function applyResponseBodyCaptureState(snapshot: RecorderSnapshot): Promise<void> {
  const enabled = snapshot.status === 'recording' || snapshot.status === 'paused'

  if (!enabled) {
    responseBodyCapture.setEnabled(false)
    return
  }

  try {
    const stored = await chrome.storage.local.get({ captureResponseBody: false })
    responseBodyCapture.setEnabled(stored.captureResponseBody === true)
  } catch {
    responseBodyCapture.setEnabled(false)
  }
}
