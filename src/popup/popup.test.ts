import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type RuntimeMessage = Record<string, unknown>

const storageGetCalls: Array<{ keys: unknown }> = []
const storageSetCalls: Array<Record<string, unknown>> = []
const runtimeMessageListeners = new Set<(message: unknown) => void>()
let pendingGetStateResolve: ((value: unknown) => void) | undefined
let delayGetStateResponse = false

const recordingSnapshot = {
  status: 'recording',
  recording: true,
  planName: 'Untitled Plan',
  requestCount: 0,
  startedAt: '2026-01-01T00:00:00.000Z',
}

const pausedSnapshot = {
  ...recordingSnapshot,
  status: 'paused',
}

const idleSnapshot = {
  status: 'idle',
  recording: false,
  planName: 'Untitled Plan',
  requestCount: 0,
}

const chromeStub = {
  runtime: {
    sendMessage: vi.fn((message: unknown) => {
      const record = isRuntimeMessage(message) ? message : {}

      if (record.type === 'START_RECORDING') {
        broadcastState(recordingSnapshot)
        return Promise.resolve({ success: true, snapshot: recordingSnapshot })
      }

      if (record.type === 'PAUSE_RECORDING') {
        broadcastState(pausedSnapshot)
        return Promise.resolve({ success: true, snapshot: pausedSnapshot })
      }

      if (record.type === 'RESUME_RECORDING') {
        broadcastState(recordingSnapshot)
        return Promise.resolve({ success: true, snapshot: recordingSnapshot })
      }

      if (record.type === 'GET_STATE') {
        if (delayGetStateResponse) {
          return new Promise((resolve) => {
            pendingGetStateResolve = resolve
          })
        }

        return Promise.resolve({ success: true, snapshot: idleSnapshot })
      }

      if (record.type === 'STOP_RECORDING') {
        return Promise.resolve({ success: true, requestCount: 0 })
      }

      return Promise.resolve({ success: true })
    }),
    onMessage: {
      addListener: vi.fn((listener: (message: unknown) => void) => {
        runtimeMessageListeners.add(listener)
      }),
    },
    onSuspend: { addListener: vi.fn() },
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
  },
  storage: {
    local: {
      get: vi.fn(async (keys: unknown) => {
        storageGetCalls.push({ keys })
        return {}
      }),
      set: vi.fn(async (values: Record<string, unknown>) => {
        storageSetCalls.push({ ...values })
      }),
    },
  },
  windows: {
    create: vi.fn(),
    update: vi.fn(),
    onRemoved: { addListener: vi.fn() },
  },
}

vi.stubGlobal('chrome', chromeStub)

function isRuntimeMessage(message: unknown): message is RuntimeMessage {
  return typeof message === 'object' && message !== null
}

function broadcastState(snapshot: unknown): void {
  for (const listener of runtimeMessageListeners) {
    listener({ type: 'STATE_CHANGED', snapshot })
  }
}

function buildPopupHtml(): string {
  return `<!doctype html>
  <html lang="en">
    <body>
      <input id="planName" />
      <div id="status"></div>
      <div id="elapsedTime"></div>
      <button id="start"></button>
      <button id="pause"></button>
      <button id="resume"></button>
      <button id="stop"></button>
      <select id="exportMode"><option value="jmx">jmx</option><option value="playwright">playwright</option></select>
      <button id="export"></button>
      <button id="clear"></button>
      <div id="jmxOptions"></div>
      <div id="jmxDomains"></div>
      <div id="jmxDomainStatus"></div>
      <div id="jmxDomainError"></div>
      <button id="exportJmxSelected"></button>
      <div id="playwrightOptions"></div>
      <input id="baseUrl" />
      <p id="transactionSummary"></p>
      <select id="transactionMethodFilter"></select>
      <select id="transactionStatusFilter"></select>
      <input id="transactionSearch" />
      <div id="transactionList"></div>
      <button id="openDetachedInspector"></button>
      <select id="themeMode"><option value="light">light</option><option value="dark">dark</option></select>
      <div id="error"></div>
    </body>
  </html>`
}

async function loadPopupModule() {
  vi.resetModules()
  runtimeMessageListeners.clear()
  pendingGetStateResolve = undefined
  delayGetStateResponse = false
  storageGetCalls.length = 0
  storageSetCalls.length = 0
  chromeStub.runtime.sendMessage.mockClear()
  chromeStub.windows.create.mockClear()
  chromeStub.windows.update.mockClear()
  chromeStub.storage.local.get.mockClear()
  chromeStub.storage.local.set.mockClear()

  vi.stubGlobal('document', new JSDOM(buildPopupHtml()).window.document)

  await import('./popup.ts')
  await flushRuntimeResponse()
}

async function flushRuntimeResponse(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('popup timer and state contract', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-01-01T00:00:00.000Z')
  })

  afterEach(() => {
    vi.useRealTimers()
    delayGetStateResponse = false
    pendingGetStateResolve = undefined
  })

  it('clicking Start sets elapsed to 00:00 and begins advancing the timer', async () => {
    await loadPopupModule()
    const elapsedEl = document.getElementById('elapsedTime') as HTMLElement
    const startBtn = document.getElementById('start') as HTMLButtonElement
    const pauseBtn = document.getElementById('pause') as HTMLButtonElement

    expect(elapsedEl.textContent).toBe('Elapsed: 00:00')
    expect(startBtn.disabled).toBe(false)
    expect(pauseBtn.disabled).toBe(true)

    startBtn.click()
    await flushRuntimeResponse()
    expect(pauseBtn.disabled).toBe(false)

    vi.advanceTimersByTime(1500)
    expect(elapsedEl.textContent).toBe('Elapsed: 00:01')
  })

  it('ignores a stale initial state response after Start succeeds', async () => {
    delayGetStateResponse = true
    await loadPopupModule()

    const statusEl = document.getElementById('status') as HTMLElement
    const pauseBtn = document.getElementById('pause') as HTMLButtonElement
    const startBtn = document.getElementById('start') as HTMLButtonElement

    startBtn.click()
    await flushRuntimeResponse()
    expect(statusEl.textContent).toBe('Recording')
    expect(pauseBtn.disabled).toBe(false)

    pendingGetStateResolve?.({ success: true, snapshot: idleSnapshot })
    pendingGetStateResolve = undefined
    delayGetStateResponse = false
    await flushRuntimeResponse()

    expect(statusEl.textContent).toBe('Recording')
    expect(pauseBtn.disabled).toBe(false)
  })

  it('clicking Pause stops the timer and disables Pause', async () => {
    await loadPopupModule()

    const startBtn = document.getElementById('start') as HTMLButtonElement
    const pauseBtn = document.getElementById('pause') as HTMLButtonElement
    const elapsedEl = document.getElementById('elapsedTime') as HTMLElement

    startBtn.click()
    await flushRuntimeResponse()
    vi.advanceTimersByTime(2000)
    expect(elapsedEl.textContent).toBe('Elapsed: 00:02')

    pauseBtn.click()
    await flushRuntimeResponse()
    expect(pauseBtn.disabled).toBe(true)

    vi.advanceTimersByTime(2000)
    expect(elapsedEl.textContent).toBe('Elapsed: 00:02')
  })

  it('clicking Resume restarts the timer from the paused value', async () => {
    await loadPopupModule()

    const startBtn = document.getElementById('start') as HTMLButtonElement
    const pauseBtn = document.getElementById('pause') as HTMLButtonElement
    const resumeBtn = document.getElementById('resume') as HTMLButtonElement
    const elapsedEl = document.getElementById('elapsedTime') as HTMLElement

    startBtn.click()
    await flushRuntimeResponse()
    vi.advanceTimersByTime(1000)
    runtimeMessageListeners.clear()
    pauseBtn.click()
    await flushRuntimeResponse()

    vi.advanceTimersByTime(2000)
    expect(elapsedEl.textContent).toBe('Elapsed: 00:01')

    runtimeMessageListeners.clear()
    resumeBtn.click()
    await flushRuntimeResponse()
    vi.advanceTimersByTime(2000)
    expect(elapsedEl.textContent).toBe('Elapsed: 00:03')
  })

  it('applies action response snapshots even when state broadcasts are missed', async () => {
    await loadPopupModule()

    const statusEl = document.getElementById('status') as HTMLElement
    const startBtn = document.getElementById('start') as HTMLButtonElement
    const pauseBtn = document.getElementById('pause') as HTMLButtonElement
    const resumeBtn = document.getElementById('resume') as HTMLButtonElement

    runtimeMessageListeners.clear()
    startBtn.click()
    await flushRuntimeResponse()
    expect(statusEl.textContent).toBe('Recording')
    expect(statusEl.className).toBe('status status-recording')
    expect(startBtn.disabled).toBe(true)
    expect(pauseBtn.disabled).toBe(false)

    runtimeMessageListeners.clear()
    pauseBtn.click()
    await flushRuntimeResponse()
    expect(statusEl.textContent).toBe('Paused recorder state...')
    expect(statusEl.className).toBe('status status-paused')
    expect(pauseBtn.disabled).toBe(true)
    expect(resumeBtn.disabled).toBe(false)

    runtimeMessageListeners.clear()
    resumeBtn.click()
    await flushRuntimeResponse()
    expect(statusEl.textContent).toBe('Recording')
    expect(statusEl.className).toBe('status status-recording')
    expect(pauseBtn.disabled).toBe(false)
    expect(resumeBtn.disabled).toBe(true)
  })

  it('clicking Stop clears the timer, resets elapsed, and leaves only Start enabled', async () => {
    await loadPopupModule()

    const startBtn = document.getElementById('start') as HTMLButtonElement
    const pauseBtn = document.getElementById('pause') as HTMLButtonElement
    const resumeBtn = document.getElementById('resume') as HTMLButtonElement
    const stopBtn = document.getElementById('stop') as HTMLButtonElement
    const elapsedEl = document.getElementById('elapsedTime') as HTMLElement

    startBtn.click()
    await flushRuntimeResponse()
    vi.advanceTimersByTime(2500)

    stopBtn.click()
    await flushRuntimeResponse()
    expect(elapsedEl.textContent).toBe('Elapsed: 00:00')
    expect(startBtn.disabled).toBe(false)
    expect(pauseBtn.disabled).toBe(true)
    expect(resumeBtn.disabled).toBe(true)
    expect(stopBtn.disabled).toBe(true)

    vi.advanceTimersByTime(1000)
    expect(elapsedEl.textContent).toBe('Elapsed: 00:00')
  })

  it('does not advance elapsed time while idle even with a stale startedAt timestamp', async () => {
    await loadPopupModule()
    const elapsedEl = document.getElementById('elapsedTime') as HTMLElement
    expect(elapsedEl.textContent).toBe('Elapsed: 00:00')

    vi.advanceTimersByTime(2000)
    expect(elapsedEl.textContent).toBe('Elapsed: 00:00')
  })
})
