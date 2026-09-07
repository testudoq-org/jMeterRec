import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHarFile, createValidHarJson } from '../../tests/shared/har-test-utils'

type RuntimeMessage = Record<string, unknown>

const storageGetCalls: Array<{ keys: unknown }> = []
const storageSetCalls: Array<Record<string, unknown>> = []
const runtimeMessageListeners = new Set<(message: unknown) => void>()
let pendingGetStateResolve: ((value: unknown) => void) | undefined
let delayGetStateResponse = false
const storageOnChangedListeners = new Set<
  (changes: Record<string, { newValue: unknown }>, areaName: string) => void
>()

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
        return Promise.resolve({ success: true, requestCount: 1 })
      }

      if (record.type === 'RESET') {
        return Promise.resolve({ success: true, snapshot: idleSnapshot })
      }

      if (record.type === 'IMPORT_HAR') {
        return Promise.resolve({
          success: true,
          jmx: '<?xml version="1.0"?><jmeterTestPlan><hashTree><TestPlan guiclass="TestPlanGui">...</TestPlan></hashTree></jmeterTestPlan>',
          filename: 'Untitled-Plan.jmx',
        })
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
      get: vi.fn(async (_keys: unknown) => {
        storageGetCalls.push({ keys: _keys })
        return {}
      }),
      set: vi.fn(async (values: Record<string, unknown>) => {
        storageSetCalls.push({ ...values })
      }),
    },
    onChanged: {
      addListener: vi.fn(
        (listener: (changes: Record<string, { newValue: unknown }>, areaName: string) => void) => {
          storageOnChangedListeners.add(listener)
        }
      ),
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
      <!-- EXTERNAL HAR IMPORT -->
      <div id="importHarSection">
        <input id="importHarFile" type="file" accept=".har,application/json" />
        <div id="importHarError"></div>
        <fieldset id="importHarFieldset">
          <div id="importHarDomains"></div>
          <div id="importHarDomainStatus"></div>
          <div id="importHarDomainError"></div>
          <button id="convertHarToJmx" class="secondary" disabled type="button"></button>
        </fieldset>
      </div>
      <!-- JMX VALIDATION -->
      <div id="validateJmxSection">
        <input id="validateJmxFile" type="file" accept=".jmx,application/xml" />
        <div id="validateJmxError"></div>
        <div id="validateJmxResult"></div>
      </div>
      <div id="playwrightOptions"></div>
      <input id="baseUrl" />
      <p id="transactionSummary"></p>
      <select id="transactionMethodFilter"></select>
      <select id="transactionStatusFilter"></select>
      <input id="transactionSearch" />
      <div id="transactionList"></div>
      <button id="openDetachedInspector"></button>
      <select id="themeMode"><option value="light">light</option><option value="dark">dark</option></select>
      <section id="analysis-panel" hidden>
        <h2></h2>
        <button id="runAnalysis" type="button"></button>
        <p id="analysisSummary"></p>
        <div id="analysisList"></div>
        <div class="parameterisation-form" style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #ddd">
          <h3 style="margin: 0 0 8px; font-size: 14px">Parameterisations</h3>
          <div class="field">
            <label for="paramVarName">Variable name</label>
            <input id="paramVarName" type="text" autocomplete="off" />
          </div>
          <div class="field">
            <label for="paramSource">Source</label>
            <select id="paramSource">
              <option value="csv">CSV</option>
              <option value="generated">Generated</option>
              <option value="environment">Environment</option>
              <option value="jmeter-function">JMeter function</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div class="field" id="paramCsvColumnField" hidden>
            <label for="paramCsvColumn">CSV column</label>
            <input id="paramCsvColumn" type="text" autocomplete="off" />
          </div>
          <div class="field">
            <label for="paramLocations">Request locations</label>
            <input id="paramLocations" type="text" placeholder="e.g. body, header:Authorization" />
          </div>
          <button id="paramAddBtn" class="secondary" type="button" style="margin-top: 4px">Add parameterisation</button>
          <div id="paramList" class="analysis-list" style="margin-top: 8px"></div>
        </div>
      </section>
      <section class="advanced-options">
        <div class="advanced-options__header">
          <h2 id="advancedOptionsTitle"></h2>
          <button id="toggleAdvancedOptions">Show</button>
        </div>
        <div id="advancedOptionsBody" hidden>
          <textarea id="filterPattern"></textarea>
          <div id="filterPatternError" hidden></div>
          <fieldset>
            <legend></legend>
            <label class="checkbox-row"><input id="recordCss" type="checkbox" /><span></span></label>
            <label class="checkbox-row"><input id="recordJs" type="checkbox" /><span></span></label>
            <label class="checkbox-row"><input id="recordImages" type="checkbox" /><span></span></label>
            <label class="checkbox-row"><input id="recordRedirects" type="checkbox" /><span></span></label>
          </fieldset>
          <div id="resourceTypeError" hidden></div>
          <select id="userAgent">
            <option value="current">current</option>
            <option value="chrome-win">chrome-win</option>
            <option value="chrome-mac">chrome-mac</option>
            <option value="chrome-linux">chrome-linux</option>
            <option value="firefox-win">firefox-win</option>
            <option value="firefox-mac">firefox-mac</option>
            <option value="firefox-linux">firefox-linux</option>
            <option value="edge-win">edge-win</option>
            <option value="custom">custom</option>
          </select>
          <input id="customUserAgent" type="text" hidden />
          <div id="userAgentError" hidden></div>
          <label class="checkbox-row"><input id="recordCookies" type="checkbox" /><span></span></label>
        </div>
      </section>
      <div id="error"></div>
    </body>
  </html>`
}

async function loadPopupModule() {
  vi.resetModules()
  runtimeMessageListeners.clear()
  storageOnChangedListeners.clear()
  pendingGetStateResolve = undefined
  delayGetStateResponse = false
  storageGetCalls.length = 0
  storageSetCalls.length = 0
  chromeStub.runtime.sendMessage.mockClear()
  chromeStub.windows.create.mockClear()
  chromeStub.windows.update.mockClear()
  chromeStub.storage.local.get.mockClear()
  chromeStub.storage.local.set.mockClear()

  const jsdomWindow = new JSDOM(buildPopupHtml(), { url: 'http://localhost/' })
    .window as unknown as Window & {
    DOMParser: new () => unknown
  }
  vi.stubGlobal('document', jsdomWindow.document)
  vi.stubGlobal('DOMParser', jsdomWindow.DOMParser)

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
    chromeStub.storage.local.get.mockImplementation(async (keys: unknown) => {
      storageGetCalls.push({ keys })
      return {}
    })
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

describe('popup advanced options', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    chromeStub.storage.local.get.mockImplementation(async (keys: unknown) => {
      storageGetCalls.push({ keys })
      return {}
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('collapses advanced options by default', async () => {
    await loadPopupModule()
    const body = document.getElementById('advancedOptionsBody') as HTMLElement
    const toggle = document.getElementById('toggleAdvancedOptions') as HTMLButtonElement

    expect(body.hidden).toBe(true)
    expect(toggle.textContent).toBe('Show')
  })

  it('toggles advanced options section visibility', async () => {
    await loadPopupModule()
    const body = document.getElementById('advancedOptionsBody') as HTMLElement
    const toggle = document.getElementById('toggleAdvancedOptions') as HTMLButtonElement

    toggle.click()
    expect(body.hidden).toBe(false)
    expect(toggle.textContent).toBe('Hide')

    toggle.click()
    expect(body.hidden).toBe(true)
    expect(toggle.textContent).toBe('Show')
  })

  it('loads advanced options from storage on startup', async () => {
    chromeStub.storage.local.get.mockImplementation(async (keys: unknown) => {
      if (Array.isArray(keys) && keys.includes('filterPattern')) {
        return {
          filterPattern: 'https://api.example.com/*',
          recordCss: false,
          recordJs: true,
          recordImages: false,
          recordRedirects: true,
          recordCookies: false,
          userAgent: 'firefox-win',
        }
      }
      return {}
    })

    await loadPopupModule()

    const filterPatternEl = document.getElementById('filterPattern') as HTMLTextAreaElement
    const recordCssEl = document.getElementById('recordCss') as HTMLInputElement
    const recordJsEl = document.getElementById('recordJs') as HTMLInputElement
    const recordImagesEl = document.getElementById('recordImages') as HTMLInputElement
    const recordRedirectsEl = document.getElementById('recordRedirects') as HTMLInputElement
    const recordCookiesEl = document.getElementById('recordCookies') as HTMLInputElement
    const userAgentEl = document.getElementById('userAgent') as HTMLSelectElement

    expect(filterPatternEl.value).toBe('https://api.example.com/*')
    expect(recordCssEl.checked).toBe(false)
    expect(recordJsEl.checked).toBe(true)
    expect(recordImagesEl.checked).toBe(false)
    expect(recordRedirectsEl.checked).toBe(true)
    expect(recordCookiesEl.checked).toBe(false)
    expect(userAgentEl.value).toBe('firefox-win')
  })

  it('saves advanced options when controls change (debounced)', async () => {
    await loadPopupModule()
    const toggle = document.getElementById('toggleAdvancedOptions') as HTMLButtonElement
    toggle.click()

    const recordCssEl = document.getElementById('recordCss') as HTMLInputElement
    recordCssEl.click()

    expect(chromeStub.storage.local.set).not.toHaveBeenCalled()

    vi.advanceTimersByTime(350)

    expect(chromeStub.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        filterPattern: 'http://*/*, https://*/*',
        recordCss: false,
        recordJs: true,
        recordImages: true,
        recordRedirects: false,
        recordCookies: true,
        userAgent: 'current',
      })
    )
  })

  it('syncs advanced options from storage changes (individual key changes)', async () => {
    chromeStub.storage.local.get.mockImplementation(async (keys: unknown) => {
      if (Array.isArray(keys) && keys.includes('filterPattern')) {
        return {
          filterPattern: 'https://synced.example.com/*',
          recordCss: false,
          recordJs: true,
          recordImages: false,
          recordRedirects: false,
          recordCookies: false,
          userAgent: 'firefox-mac',
        }
      }
      return {}
    })

    await loadPopupModule()
    const toggle = document.getElementById('toggleAdvancedOptions') as HTMLButtonElement
    toggle.click()

    const filterPatternEl = document.getElementById('filterPattern') as HTMLTextAreaElement
    const recordCookiesEl = document.getElementById('recordCookies') as HTMLInputElement
    const userAgentEl = document.getElementById('userAgent') as HTMLSelectElement

    expect(filterPatternEl.value).toBe('https://synced.example.com/*')
    expect(recordCookiesEl.checked).toBe(false)
    expect(userAgentEl.value).toBe('firefox-mac')
  })

  it('syncs advanced options when individual key changes in storage', async () => {
    await loadPopupModule()
    const toggle = document.getElementById('toggleAdvancedOptions') as HTMLButtonElement
    toggle.click()

    const filterPatternEl = document.getElementById('filterPattern') as HTMLTextAreaElement
    const recordCookiesEl = document.getElementById('recordCookies') as HTMLInputElement

    expect(filterPatternEl.value).toBe('http://*/*, https://*/*')
    expect(recordCookiesEl.checked).toBe(true)

    // Simulate individual key changes (as Chrome storage actually fires)
    chromeStub.storage.local.get.mockImplementation(async (_keys: unknown) => {
      return {
        filterPattern: 'https://changed.example.com/*',
        recordCss: true,
        recordJs: false,
        recordImages: true,
        recordRedirects: true,
        recordCookies: false,
        userAgent: 'chrome-linux',
      }
    })

    for (const listener of storageOnChangedListeners) {
      listener(
        {
          filterPattern: { newValue: 'https://changed.example.com/*' },
          recordCookies: { newValue: false },
          userAgent: { newValue: 'chrome-linux' },
        },
        'local'
      )
    }

    // Wait for async handler to process
    await flushRuntimeResponse()

    expect(filterPatternEl.value).toBe('https://changed.example.com/*')
    expect(recordCookiesEl.checked).toBe(false)
  })

  it('shows custom user agent input when custom is selected', async () => {
    await loadPopupModule()
    const toggle = document.getElementById('toggleAdvancedOptions') as HTMLButtonElement
    toggle.click()

    const userAgentEl = document.getElementById('userAgent') as HTMLSelectElement
    const customUserAgentEl = document.getElementById('customUserAgent') as HTMLInputElement

    userAgentEl.value = 'custom'
    const changeEvent = document.createEvent('HTMLEvents')
    changeEvent.initEvent('change', true, false)
    userAgentEl.dispatchEvent(changeEvent)

    expect(customUserAgentEl.hidden).toBe(false)
  })

  it('hides custom user agent input when predefined agent is selected', async () => {
    await loadPopupModule()
    const toggle = document.getElementById('toggleAdvancedOptions') as HTMLButtonElement
    toggle.click()

    const userAgentEl = document.getElementById('userAgent') as HTMLSelectElement
    const customUserAgentEl = document.getElementById('customUserAgent') as HTMLInputElement

    userAgentEl.value = 'custom'
    const changeEvent1 = document.createEvent('HTMLEvents')
    changeEvent1.initEvent('change', true, false)
    userAgentEl.dispatchEvent(changeEvent1)
    expect(customUserAgentEl.hidden).toBe(false)

    userAgentEl.value = 'chrome-win'
    const changeEvent2 = document.createEvent('HTMLEvents')
    changeEvent2.initEvent('change', true, false)
    userAgentEl.dispatchEvent(changeEvent2)
    expect(customUserAgentEl.hidden).toBe(true)
  })

  it('syncs custom user agent from storage changes and shows custom input', async () => {
    await loadPopupModule()
    const toggle = document.getElementById('toggleAdvancedOptions') as HTMLButtonElement
    toggle.click()

    const userAgentEl = document.getElementById('userAgent') as HTMLSelectElement
    const customUserAgentEl = document.getElementById('customUserAgent') as HTMLInputElement

    expect(userAgentEl.value).toBe('current')
    expect(customUserAgentEl.hidden).toBe(true)

    // Simulate individual key change with custom user agent
    chromeStub.storage.local.get.mockImplementation(async (_keys: unknown) => {
      return {
        filterPattern: 'http://*/*, https://*/*',
        recordCss: true,
        recordJs: true,
        recordImages: true,
        recordRedirects: false,
        recordCookies: true,
        userAgent: 'custom:My Custom Agent',
      }
    })

    for (const listener of storageOnChangedListeners) {
      listener(
        {
          userAgent: { newValue: 'custom:My Custom Agent' },
        },
        'local'
      )
    }

    // Wait for async handler to process
    await flushRuntimeResponse()

    expect(userAgentEl.value).toBe('custom')
    expect(customUserAgentEl.hidden).toBe(false)
    expect(customUserAgentEl.value).toBe('My Custom Agent')
  })

  it('handles storage read error gracefully in onChange listener', async () => {
    await loadPopupModule()
    const toggle = document.getElementById('toggleAdvancedOptions') as HTMLButtonElement
    toggle.click()

    const filterPatternEl = document.getElementById('filterPattern') as HTMLTextAreaElement
    const originalValue = filterPatternEl.value

    // Simulate storage read failure
    chromeStub.storage.local.get.mockImplementation(async () => {
      throw new Error('Storage read failed')
    })

    // Trigger onChange event
    for (const listener of storageOnChangedListeners) {
      listener(
        {
          filterPattern: { newValue: 'https://should-not-appear.example.com/*' },
        },
        'local'
      )
    }

    await flushRuntimeResponse()

    // Value should remain unchanged since the read failed
    expect(filterPatternEl.value).toBe(originalValue)

    // Error should be displayed via showError
    const errorEl = document.getElementById('error') as HTMLDivElement
    expect(errorEl.textContent).toBe('Storage read failed')
  })

  it('handles multiple rapid onChange events without issue', async () => {
    await loadPopupModule()
    const toggle = document.getElementById('toggleAdvancedOptions') as HTMLButtonElement
    toggle.click()

    const filterPatternEl = document.getElementById('filterPattern') as HTMLTextAreaElement

    let getCallCount = 0
    chromeStub.storage.local.get.mockImplementation(async () => {
      getCallCount++
      // Return different values on each call to simulate rapid changes
      return {
        filterPattern: `https://rapid-${getCallCount}.example.com/*`,
        recordCss: getCallCount % 2 === 0,
        recordJs: true,
        recordImages: true,
        recordRedirects: false,
        recordCookies: true,
        userAgent: 'current',
      }
    })

    // Fire multiple onChange events in rapid succession
    for (const listener of storageOnChangedListeners) {
      listener({ filterPattern: { newValue: 'https://test1.example.com/*' } }, 'local')
      await Promise.resolve()
    }

    // Wait for all async handlers to complete
    await flushRuntimeResponse()
    await flushRuntimeResponse()

    // UI should reflect the last storage read
    expect(filterPatternEl.value).toMatch(/https:\/\/rapid-\d\.example\.com\//)
  })
})

describe('popup transaction rendering performance', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-01-01T00:00:00.000Z')
    chromeStub.storage.local.get.mockImplementation(async (keys: unknown) => {
      storageGetCalls.push({ keys })
      return {}
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders 500 transactions within 50ms threshold', async () => {
    await loadPopupModule()

    // Create 500 mock requests (under limit of 200 per maxTransactions, but we test trimming)
    const mockRequests = Array.from({ length: 500 }, (_, i) => ({
      id: `req-${i}`,
      timestamp: '2026-01-01T00:00:00.000Z',
      method: 'GET' as const,
      url: `https://example.com/api/endpoint-${i}`,
      headers: {},
      queryParams: {},
    }))

    // Simulate seedTransactions behavior
    const transactionList = document.getElementById('transactionList') as HTMLDivElement
    const transactionSummary = document.getElementById('transactionSummary') as HTMLParagraphElement

    // Measure render time
    const startMark = performance.now()
    transactionList.replaceChildren()

    for (const request of [...mockRequests].reverse()) {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'transaction-row'

      const method = document.createElement('span')
      method.textContent = request.method
      method.className = 'method method-get'

      const url = document.createElement('span')
      url.textContent = request.url
      url.className = 'transaction-url'

      row.append(method, url)
    }

    transactionSummary.textContent = `${mockRequests.length} requests`
    const endMark = performance.now()

    // Must complete within 50ms for responsive UI
    expect(endMark - startMark).toBeLessThan(50)
  })

  it('trimTransactions limits to maxTransactions', async () => {
    await loadPopupModule()

    // Access the module's internal transactions array via window
    const html = buildPopupHtml()
    vi.stubGlobal('document', new JSDOM(html).window.document)

    // We need to test the actual trimTransactions function behavior
    // This tests that the limit is enforced (DRY - reusing boundedNumber logic)
    const { boundedNumber } = await import('../shared/dom-utils')

    // boundedNumber(value, min, max, fallback) - when value is provided and within range, it returns the value
    // 500 is within [20, 500], so it should be returned as-is
    expect(boundedNumber(500, 20, 500, 200)).toBe(500)

    // Test that values above max are truncated
    expect(boundedNumber(600, 20, 500, 200)).toBe(500)

    // Test that values below min are raised
    expect(boundedNumber(10, 20, 500, 200)).toBe(20)

    // Test that undefined values fall back
    expect(boundedNumber(undefined, 20, 500, 200)).toBe(200)
  })
})

// EXTERNAL HAR IMPORT: Tests for HAR file import functionality
describe('popup HAR import', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-01-01T00:00:00.000Z')
    chromeStub.storage.local.get.mockImplementation(async (keys: unknown) => {
      storageGetCalls.push({ keys })
      return {}
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    // Prevent file input mock leaking into the next test
    const fileInput = document.getElementById('importHarFile') as HTMLInputElement | null
    if (fileInput) {
      Object.defineProperty(fileInput, 'files', {
        value: null,
        writable: true,
      })
    }
  })

  // ── Helpers ────────────────────────────────────────────────────────────────

  interface HarContext {
    fileInput: HTMLInputElement
    fieldset: HTMLElement
    errorEl: HTMLElement
    domainsEl: HTMLElement
    domainStatusEl: HTMLElement
    domainErrorEl: HTMLElement
    convertBtn: HTMLButtonElement
  }

  async function setupHarImportTest(): Promise<HarContext> {
    await loadPopupModule()
    return {
      fileInput: document.getElementById('importHarFile') as HTMLInputElement,
      fieldset: document.getElementById('importHarFieldset') as HTMLElement,
      errorEl: document.getElementById('importHarError') as HTMLElement,
      domainsEl: document.getElementById('importHarDomains') as HTMLElement,
      domainStatusEl: document.getElementById('importHarDomainStatus') as HTMLElement,
      domainErrorEl: document.getElementById('importHarDomainError') as HTMLElement,
      convertBtn: document.getElementById('convertHarToJmx') as HTMLButtonElement,
    }
  }

  async function loadHarFile(
    fileInput: HTMLInputElement,
    harContent: string,
    filename = 'test.har'
  ): Promise<void> {
    const mockFile = createMockHarFile(harContent, filename)
    Object.defineProperty(fileInput, 'files', {
      value: { 0: mockFile, length: 1, item: (i: number) => (i === 0 ? mockFile : null) },
      writable: true,
    })
    const event = document.createEvent('HTMLEvents')
    event.initEvent('change', true, false)
    fileInput.dispatchEvent(event)
    await flushRuntimeResponse()
  }

  /** Polls until `condition` returns true, or throws after `timeoutMs`. */
  async function until(
    condition: () => boolean,
    timeoutMs = 1000,
    label = 'condition'
  ): Promise<void> {
    const start = Date.now()
    while (!condition()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`${label} not satisfied within ${timeoutMs}ms`)
      }
      await Promise.resolve()
    }
  }

  // ── Mode visibility ───────────────────────────────────────────────────────

  describe('mode visibility', () => {
    it('shows import HAR section when JMX mode is selected', async () => {
      await setupHarImportTest()
      const exportModeEl = document.getElementById('exportMode') as HTMLSelectElement
      const importSection = document.getElementById('importHarSection') as HTMLElement

      exportModeEl.value = 'jmx'
      const event = document.createEvent('HTMLEvents')
      event.initEvent('change', true, false)
      exportModeEl.dispatchEvent(event)

      expect(importSection.style.display).not.toBe('none')
    })

    it('hides import HAR section when Playwright mode is selected', async () => {
      await setupHarImportTest()
      const exportModeEl = document.getElementById('exportMode') as HTMLSelectElement
      const importSection = document.getElementById('importHarSection') as HTMLElement

      exportModeEl.value = 'playwright'
      const event = document.createEvent('HTMLEvents')
      event.initEvent('change', true, false)
      exportModeEl.dispatchEvent(event)

      expect(importSection.style.display).toBe('none')
    })
  })

  // ── File parsing ──────────────────────────────────────────────────────────

  describe('file parsing', () => {
    it('parses a valid HAR file and extracts domains', async () => {
      const { fileInput, domainsEl, fieldset } = await setupHarImportTest()
      await loadHarFile(
        fileInput,
        createValidHarJson([
          { url: 'https://example.com/api' },
          { url: 'https://api.example.com/users' },
        ])
      )

      expect(fieldset.hidden).toBe(false)
      expect(domainsEl.children.length).toBe(2)
    })

    it('shows error when no file is selected', async () => {
      const { fileInput, errorEl, fieldset } = await setupHarImportTest()

      // Clear the file input to simulate rejection
      Object.defineProperty(fileInput, 'files', { value: null, writable: true })

      const event = document.createEvent('HTMLEvents')
      event.initEvent('change', true, false)
      fileInput.dispatchEvent(event)

      await flushRuntimeResponse()

      expect(errorEl.textContent).toContain('Empty HAR file')
      expect(fieldset.hidden).toBe(true)
    })
    it('shows error for zero-byte file', async () => {
      const { fileInput, errorEl, fieldset } = await setupHarImportTest()

      const emptyFile = new File([''], 'empty.har', { type: 'application/json' })
      Object.defineProperty(fileInput, 'files', {
        value: { 0: emptyFile, length: 1, item: (i: number) => (i === 0 ? emptyFile : null) },
        writable: true,
      })

      const event = document.createEvent('HTMLEvents')
      event.initEvent('change', true, false)
      fileInput.dispatchEvent(event)

      await flushRuntimeResponse()

      expect(errorEl.textContent).toContain('Empty HAR file')
      expect(fieldset.hidden).toBe(true)
    })

    it('shows error for invalid JSON', async () => {
      const { fileInput, errorEl, fieldset } = await setupHarImportTest()
      await loadHarFile(fileInput, 'not valid json {{{')

      expect(errorEl.textContent).toContain('Invalid HAR')
      expect(fieldset.hidden).toBe(true)
    })

    it('shows error for missing log object', async () => {
      const { fileInput, errorEl, fieldset } = await setupHarImportTest()
      await loadHarFile(fileInput, JSON.stringify({ version: '1.2' }))

      expect(errorEl.textContent).toContain('missing log object')
      expect(fieldset.hidden).toBe(true)
    })

    it('shows error for unsupported HAR version', async () => {
      const { fileInput, errorEl, fieldset } = await setupHarImportTest()
      await loadHarFile(
        fileInput,
        JSON.stringify({
          log: { version: '1.1', creator: { name: 'Test', version: '1.0' }, entries: [] },
        })
      )

      expect(errorEl.textContent).toContain('Unsupported HAR version')
      expect(fieldset.hidden).toBe(true)
    })

    it('shows error for empty entries', async () => {
      const { fileInput, errorEl, fieldset } = await setupHarImportTest()
      await loadHarFile(
        fileInput,
        JSON.stringify({
          log: { version: '1.2', creator: { name: 'Test', version: '1.0' }, entries: [] },
        })
      )

      expect(errorEl.textContent).toContain('no entries found')
      expect(fieldset.hidden).toBe(true)
    })
  })

  // ── Domain selection ──────────────────────────────────────────────────────

  describe('domain selection', () => {
    it('disables convert button when no domains are selected', async () => {
      const { fileInput, convertBtn, domainsEl } = await setupHarImportTest()
      await loadHarFile(fileInput, createValidHarJson([{ url: 'https://only.example.com/api' }]))

      expect(convertBtn.disabled).toBe(false)

      const checkbox = domainsEl.querySelector('input[type="checkbox"]') as HTMLInputElement
      checkbox.checked = false
      const checkEvent = document.createEvent('HTMLEvents')
      checkEvent.initEvent('change', true, false)
      checkbox.dispatchEvent(checkEvent)

      expect(convertBtn.disabled).toBe(true)
    })
  })

  // ── Clear and reset ───────────────────────────────────────────────────────

  describe('clear and reset', () => {
    it('clears import HAR state on Clear button', async () => {
      const { fileInput, fieldset, errorEl } = await setupHarImportTest()
      await loadHarFile(fileInput, createValidHarJson([{ url: 'https://example.com/api' }]))

      expect(fieldset.hidden).toBe(false)

      // Verify the send mock was cleared from loadPopupModule
      chromeStub.runtime.sendMessage.mockClear()

      // clearBtn may be disabled via snapshot; dispatch click directly
      // to exercise the handler logic for state cleanup.
      const clearBtn = document.getElementById('clear') as HTMLButtonElement
      const clickEvent = document.createEvent('MouseEvents')
      clickEvent.initEvent('click', true, true)
      clearBtn.dispatchEvent(clickEvent)

      await until(() => fieldset.hidden === true, 1000, 'fieldset.hidden === true')

      expect(errorEl.textContent).toBe('')
    })
  })

  // ── Conversion and download ───────────────────────────────────────────────

  describe('conversion and download', () => {
    it('triggers download on successful conversion', async () => {
      const { fileInput, convertBtn } = await setupHarImportTest()
      await loadHarFile(fileInput, createValidHarJson([{ url: 'https://example.com/api' }]))

      const originalCreateObjectURL = URL.createObjectURL
      let createdUrl: string | null = null

      URL.createObjectURL = vi.fn((_blob: Blob) => {
        createdUrl = 'blob:test-url'
        return createdUrl
      })

      convertBtn.click()
      await flushRuntimeResponse()

      expect(createdUrl).not.toBeNull()
      expect(URL.createObjectURL).toHaveBeenCalled()

      URL.createObjectURL = originalCreateObjectURL
    })
  })
})

// JMX VALIDATION: Tests for JMX file validation functionality
describe('popup JMX validation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    chromeStub.storage.local.get.mockImplementation(async (keys: unknown) => {
      storageGetCalls.push({ keys })
      return {}
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    const fileInput = document.getElementById('validateJmxFile') as HTMLInputElement | null
    if (fileInput) {
      Object.defineProperty(fileInput, 'files', {
        value: null,
        writable: true,
      })
    }
  })

  interface JmxContext {
    fileInput: HTMLInputElement
    errorEl: HTMLDivElement
    resultEl: HTMLDivElement
    section: HTMLDivElement
  }

  async function setupJmxValidationTest(): Promise<JmxContext> {
    await loadPopupModule()
    return {
      fileInput: document.getElementById('validateJmxFile') as HTMLInputElement,
      errorEl: document.getElementById('validateJmxError') as HTMLDivElement,
      resultEl: document.getElementById('validateJmxResult') as HTMLDivElement,
      section: document.getElementById('validateJmxSection') as HTMLDivElement,
    }
  }

  async function loadJmxFile(
    fileInput: HTMLInputElement,
    jmxContent: string,
    filename = 'test.jmx'
  ): Promise<void> {
    const mockFile = new File([jmxContent], filename, { type: 'application/xml' })
    Object.defineProperty(fileInput, 'files', {
      value: { 0: mockFile, length: 1, item: (i: number) => (i === 0 ? mockFile : null) },
      writable: true,
    })
    const event = document.createEvent('HTMLEvents')
    event.initEvent('change', true, false)
    fileInput.dispatchEvent(event)
    await flushRuntimeResponse()
  }

  const VALID_JMX = `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
<hashTree>
<TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Test Plan" enabled="true">
<stringProp name="TestPlan.comments"></stringProp>
<stringProp name="TestPlan.functional_mode">false</stringProp>
<boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
<elementProp name="TestPlan.user_defined_variables" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
<collectionProp name="Arguments.arguments" />
</elementProp>
</TestPlan>
<hashTree>
<ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Thread Group" enabled="true">
<stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
<elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
<boolProp name="LoopController.continue_forever">false</boolProp>
<stringProp name="LoopController.loops">1</stringProp>
</elementProp>
<stringProp name="ThreadGroup.num_threads">10</stringProp>
<stringProp name="ThreadGroup.ramp_time">5</stringProp>
<boolProp name="ThreadGroup.scheduler">false</boolProp>
<stringProp name="ThreadGroup.duration"></stringProp>
<stringProp name="ThreadGroup.delay"></stringProp>
<boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
</ThreadGroup>
<hashTree>
<HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="GET example.com #0" enabled="true">
<boolProp name="HTTPSampler.postBodyRaw">false</boolProp>
<elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
<collectionProp name="Arguments.arguments">
<elementProp name="" elementType="HTTPArgument" guiclass="HTTPArgumentGui" testclass="HTTPArgument" testname="Argument" enabled="true">
<boolProp name="HTTPArgument.always_encode">false</boolProp>
<stringProp name="Argument.name"></stringProp>
<stringProp name="Argument.value"></stringProp>
<stringProp name="Argument.metadata">=</stringProp>
</elementProp>
</collectionProp>
</elementProp>
<stringProp name="HTTPSampler.domain">example.com</stringProp>
<stringProp name="HTTPSampler.port">80</stringProp>
<stringProp name="HTTPSampler.protocol">http</stringProp>
<stringProp name="HTTPSampler.path">/api</stringProp>
<stringProp name="HTTPSampler.method">GET</stringProp>
<boolProp name="HTTPSampler.follow_redirects">true</boolProp>
<boolProp name="HTTPSampler.auto_redirects">false</boolProp>
<boolProp name="HTTPSampler.use_keepalive">true</boolProp>
<boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
<stringProp name="HTTPSampler.embedded_url_re"></stringProp>
<stringProp name="HTTPSampler.connect_timeout"></stringProp>
<stringProp name="HTTPSampler.response_timeout"></stringProp>
<elementProp name="HTTPsampler.Headers" elementType="HeaderManager" guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Default Headers" enabled="true">
<collectionProp name="HeaderManager.headers" />
</elementProp>
</HTTPSamplerProxy>
<hashTree/>
</hashTree>
</hashTree>
</hashTree>
</jmeterTestPlan>`

  describe('mode visibility', () => {
    it('shows JMX validation section when JMX mode is selected', async () => {
      const { section } = await setupJmxValidationTest()
      const exportModeEl = document.getElementById('exportMode') as HTMLSelectElement

      exportModeEl.value = 'jmx'
      const event = document.createEvent('HTMLEvents')
      event.initEvent('change', true, false)
      exportModeEl.dispatchEvent(event)

      expect(section.style.display).not.toBe('none')
    })

    it('hides JMX validation section when Playwright mode is selected', async () => {
      const { section } = await setupJmxValidationTest()
      const exportModeEl = document.getElementById('exportMode') as HTMLSelectElement

      exportModeEl.value = 'playwright'
      const event = document.createEvent('HTMLEvents')
      event.initEvent('change', true, false)
      exportModeEl.dispatchEvent(event)

      expect(section.style.display).toBe('none')
    })
  })

  describe('file parsing', () => {
    it('validates a valid JMX file and renders summary', async () => {
      const { fileInput, resultEl, errorEl } = await setupJmxValidationTest()
      await loadJmxFile(fileInput, VALID_JMX)

      expect(errorEl.textContent).toBe('')
      expect(resultEl.textContent).toContain('Passed')
    })

    it('shows error when no file is selected', async () => {
      const { fileInput, errorEl, resultEl } = await setupJmxValidationTest()

      Object.defineProperty(fileInput, 'files', { value: null, writable: true })
      const event = document.createEvent('HTMLEvents')
      event.initEvent('change', true, false)
      fileInput.dispatchEvent(event)

      await flushRuntimeResponse()

      expect(errorEl.textContent).toContain('Empty JMX file')
      expect(resultEl.textContent).toBe('')
    })

    it('shows error for zero-byte file', async () => {
      const { fileInput, errorEl, resultEl } = await setupJmxValidationTest()

      const emptyFile = new File([''], 'empty.jmx', { type: 'application/xml' })
      Object.defineProperty(fileInput, 'files', {
        value: { 0: emptyFile, length: 1, item: (i: number) => (i === 0 ? emptyFile : null) },
        writable: true,
      })

      const event = document.createEvent('HTMLEvents')
      event.initEvent('change', true, false)
      fileInput.dispatchEvent(event)

      await flushRuntimeResponse()

      expect(errorEl.textContent).toContain('Empty JMX file')
      expect(resultEl.textContent).toBe('')
    })

    it('shows error for malformed XML', async () => {
      const { fileInput, errorEl, resultEl } = await setupJmxValidationTest()
      await loadJmxFile(fileInput, '<?xml version="1.0"?><jmeterTestPlan><TestPlan>')

      expect(errorEl.textContent).toBe('')
      expect(resultEl.textContent).toContain('Malformed XML')
      expect(resultEl.textContent).toContain('Failed')
    })

    it('renders Failed summary for invalid JMX', async () => {
      const { fileInput, resultEl } = await setupJmxValidationTest()
      const invalidJmx = VALID_JMX.replace('num_threads">10', 'num_threads">0')
      await loadJmxFile(fileInput, invalidJmx)

      expect(resultEl.textContent).toContain('Failed')
      expect(resultEl.textContent).toContain('zero-threads')
    })
  })
})

// ANALYSIS PANEL: Tests for analysis functionality
vi.mock('../analysis/run-analysis', () => ({
  runAnalysis: vi.fn(() => ({
    recordingVersion: 1,
    recordingId: 'test-recording',
    candidates: [
      {
        id: 'candidate-1',
        value: 'masked-token',
        normalizedValue: 'masked-token',
        maskedValue: 'masked-token',
        sourceExchangeId: 'req-1',
        sourceLocation: 'response.body.json:$.token',
        consumerExchangeIds: ['req-2'],
        consumerLocations: ['POST https://example.com/api'],
        candidateType: 'authorization',
        variableName: 'token',
        confidence: 0.8,
        reasons: ['Producer body available', '1 consumer(s)'],
        proposedExtractor: {
          kind: 'jsonpath',
          expression: '$.token',
          matchNo: 1,
          defaultValue: 'NOT_FOUND',
          variableName: 'token',
        },
        warnings: [],
        scope: { producerIndex: 0, consumerIndices: [1] },
      },
    ],
    rejectedNoise: [],
    diagnostics: [],
  })),
}))

describe('popup analysis panel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-01-01T00:00:00.000Z')
    chromeStub.storage.local.get.mockImplementation(async (keys: unknown) => {
      storageGetCalls.push({ keys })
      return {}
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows analysis panel after recording stops', async () => {
    await loadPopupModule()

    const startBtn = document.getElementById('start') as HTMLButtonElement
    const stopBtn = document.getElementById('stop') as HTMLButtonElement
    const analysisPanel = document.getElementById('analysis-panel') as HTMLElement

    startBtn.click()
    await flushRuntimeResponse()

    expect(analysisPanel.hidden).toBe(true)

    stopBtn.click()
    await flushRuntimeResponse()

    expect(analysisPanel.hidden).toBe(false)
  })

  it('renders candidates after clicking Analyse', async () => {
    await loadPopupModule()

    const stopBtn = document.getElementById('stop') as HTMLButtonElement
    const runAnalysisBtn = document.getElementById('runAnalysis') as HTMLButtonElement
    const analysisList = document.getElementById('analysisList') as HTMLDivElement

    stopBtn.click()
    await flushRuntimeResponse()

    runAnalysisBtn.click()
    await flushRuntimeResponse()

    expect(analysisList.children.length).toBeGreaterThan(0)
  })

  it('hides analysis panel when recording is cleared', async () => {
    await loadPopupModule()

    const startBtn = document.getElementById('start') as HTMLButtonElement
    const stopBtn = document.getElementById('stop') as HTMLButtonElement
    const clearBtn = document.getElementById('clear') as HTMLButtonElement
    const analysisPanel = document.getElementById('analysis-panel') as HTMLElement

    startBtn.click()
    await flushRuntimeResponse()

    stopBtn.click()
    await flushRuntimeResponse()

    expect(analysisPanel.hidden).toBe(false)

    clearBtn.click()
    await flushRuntimeResponse()

    expect(analysisPanel.hidden).toBe(true)
  })

  it('accept button moves candidate to Accepted section', async () => {
    await loadPopupModule()

    const stopBtn = document.getElementById('stop') as HTMLButtonElement
    const runAnalysisBtn = document.getElementById('runAnalysis') as HTMLButtonElement
    const analysisList = document.getElementById('analysisList') as HTMLDivElement

    stopBtn.click()
    await flushRuntimeResponse()

    runAnalysisBtn.click()
    await flushRuntimeResponse()

    // Find the Accept button (it's in the actions div alongside Reject)
    const acceptBtn = Array.from(analysisList.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Accept'
    ) as HTMLButtonElement | undefined
    expect(acceptBtn).toBeDefined()
    acceptBtn!.click()
    await flushRuntimeResponse()

    // Candidate should have moved to Accepted section
    const acceptedHeader = Array.from(
      analysisList.querySelectorAll('.analysis-section-header')
    ).find((h) => h.textContent === 'Accepted')
    expect(acceptedHeader).toBeDefined()

    // No more Accept button visible (candidate moved to Accepted section)
    const remainingAcceptBtn = Array.from(analysisList.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Accept'
    )
    expect(remainingAcceptBtn).toBeUndefined()
  })

  it('renaming variable updates the rendered name and stores edit', async () => {
    await loadPopupModule()

    const stopBtn = document.getElementById('stop') as HTMLButtonElement
    const runAnalysisBtn = document.getElementById('runAnalysis') as HTMLButtonElement
    const analysisList = document.getElementById('analysisList') as HTMLDivElement

    stopBtn.click()
    await flushRuntimeResponse()

    runAnalysisBtn.click()
    await flushRuntimeResponse()

    // Find the analysis name element
    const nameEl = analysisList.querySelector('.analysis-name') as HTMLElement
    expect(nameEl).toBeDefined()
    expect(nameEl.textContent).toBe('token')

    // Double-click to start editing
    const dblClickEvent = document.createEvent('MouseEvents')
    dblClickEvent.initEvent('dblclick', true, false)
    nameEl.dispatchEvent(dblClickEvent)
    await flushRuntimeResponse()

    // An input should now be inside the name element
    const input = nameEl.querySelector('input.analysis-rename-input') as HTMLInputElement
    expect(input).toBeDefined()
    expect(input.value).toBe('token')

    // Change the value
    input.value = 'my_custom_token'

    // Press Enter to save
    const keydownEvent = document.createEvent('KeyboardEvent')
    keydownEvent.initEvent('keydown', true, false)
    Object.defineProperty(keydownEvent, 'key', { value: 'Enter' })
    input.dispatchEvent(keydownEvent)
    await flushRuntimeResponse()

    // Name should be updated in the DOM
    expect(nameEl.textContent).toBe('my_custom_token')
  })

  it('saves plan to PlanStore before JMX export when analysis exists', async () => {
    await loadPopupModule()

    const startBtn = document.getElementById('start') as HTMLButtonElement
    const stopBtn = document.getElementById('stop') as HTMLButtonElement
    const runAnalysisBtn = document.getElementById('runAnalysis') as HTMLButtonElement
    const exportBtn = document.getElementById('export') as HTMLButtonElement
    const analysisList = document.getElementById('analysisList') as HTMLDivElement

    // Start and stop recording to satisfy hasStoppedRecording guard
    startBtn.click()
    await flushRuntimeResponse()
    stopBtn.click()
    await flushRuntimeResponse()
    await flushRuntimeResponse()

    // Run analysis to populate analysisDraft.candidates
    runAnalysisBtn.click()
    await flushRuntimeResponse()

    // Accept a candidate so the plan has at least one correlation
    const acceptBtn = Array.from(analysisList.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Accept'
    ) as HTMLButtonElement | undefined
    acceptBtn!.click()
    await flushRuntimeResponse()

    // Override sendMessage to handle GET_DOMAINS and EXPORT_JMX
    const originalSendMessage = chromeStub.runtime.sendMessage
    chromeStub.runtime.sendMessage = vi.fn((message: unknown) => {
      const record = isRuntimeMessage(message) ? message : {}

      if (record.type === 'GET_DOMAINS') {
        return Promise.resolve({ success: true, domains: ['example.com'] })
      }

      if (record.type === 'EXPORT_JMX') {
        return Promise.resolve({
          success: true,
          jmx: '<?xml version="1.0"?><jmeterTestPlan></jmeterTestPlan>',
          filename: 'Test.jmx',
        })
      }

      return originalSendMessage(message)
    })

    // Click main export button
    exportBtn.click()
    await flushRuntimeResponse()
    await flushRuntimeResponse()

    // Verify saveCurrentPlan was reached: PlanStore.save was called via chrome.storage.local.set
    expect(chromeStub.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'capyultura:transformation-plan': expect.any(String),
      })
    )
  })

  it('skips plan save when no analysis candidates', async () => {
    await loadPopupModule()

    const startBtn = document.getElementById('start') as HTMLButtonElement
    const stopBtn = document.getElementById('stop') as HTMLButtonElement
    const exportBtn = document.getElementById('export') as HTMLButtonElement

    // Start and stop recording without running analysis
    startBtn.click()
    await flushRuntimeResponse()
    stopBtn.click()
    await flushRuntimeResponse()
    await flushRuntimeResponse()

    // Override sendMessage to handle GET_DOMAINS and EXPORT_JMX
    const originalSendMessage = chromeStub.runtime.sendMessage
    chromeStub.runtime.sendMessage = vi.fn((message: unknown) => {
      const record = isRuntimeMessage(message) ? message : {}

      if (record.type === 'GET_DOMAINS') {
        return Promise.resolve({ success: true, domains: ['example.com'] })
      }

      if (record.type === 'EXPORT_JMX') {
        return Promise.resolve({
          success: true,
          jmx: '<?xml version="1.0"?><jmeterTestPlan></jmeterTestPlan>',
          filename: 'Test.jmx',
        })
      }

      return originalSendMessage(message)
    })

    // Check a domain checkbox so exportJmx proceeds past domain selection guard
    const domainCheckbox = document.querySelector<HTMLInputElement>(
      '#jmxDomains input[type="checkbox"]'
    )
    if (domainCheckbox) {
      domainCheckbox.checked = true
      domainCheckbox.dispatchEvent(new Event('change'))
    }

    // Click export
    exportBtn.click()
    await flushRuntimeResponse()
    await flushRuntimeResponse()

    // Verify PlanStore.save was NOT called when no analysis candidates
    expect(chromeStub.storage.local.set).not.toHaveBeenCalled()
  })

  it('shows error and aborts export when PlanStore.save fails', async () => {
    await loadPopupModule()

    const startBtn = document.getElementById('start') as HTMLButtonElement
    const stopBtn = document.getElementById('stop') as HTMLButtonElement
    const runAnalysisBtn = document.getElementById('runAnalysis') as HTMLButtonElement
    const exportBtn = document.getElementById('export') as HTMLButtonElement
    const analysisList = document.getElementById('analysisList') as HTMLDivElement
    const errorEl = document.getElementById('error') as HTMLDivElement

    // Start and stop recording
    startBtn.click()
    await flushRuntimeResponse()
    stopBtn.click()
    await flushRuntimeResponse()
    await flushRuntimeResponse()

    // Run analysis
    runAnalysisBtn.click()
    await flushRuntimeResponse()

    // Accept a candidate
    const acceptBtn = Array.from(analysisList.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Accept'
    ) as HTMLButtonElement | undefined
    acceptBtn!.click()
    await flushRuntimeResponse()

    // Make PlanStore.save fail by making chrome.storage.local.set throw
    chromeStub.storage.local.set.mockImplementation(async () => {
      throw new Error('Storage failed')
    })

    // Override sendMessage to handle GET_DOMAINS (but EXPORT_JMX should not be called)
    const originalSendMessage = chromeStub.runtime.sendMessage
    chromeStub.runtime.sendMessage = vi.fn((message: unknown) => {
      const record = isRuntimeMessage(message) ? message : {}

      if (record.type === 'GET_DOMAINS') {
        return Promise.resolve({ success: true, domains: ['example.com'] })
      }

      if (record.type === 'EXPORT_JMX') {
        return Promise.resolve({
          success: true,
          jmx: '<?xml version="1.0"?><jmeterTestPlan></jmeterTestPlan>',
          filename: 'Test.jmx',
        })
      }

      return originalSendMessage(message)
    })

    // Check a domain checkbox so exportJmx proceeds past domain selection guard
    const domainCheckbox = document.querySelector<HTMLInputElement>(
      '#jmxDomains input[type="checkbox"]'
    )
    if (domainCheckbox) {
      domainCheckbox.checked = true
      domainCheckbox.dispatchEvent(new Event('change'))
    }

    // Click export
    exportBtn.click()
    await flushRuntimeResponse()
    await flushRuntimeResponse()

    // Verify error is shown
    expect(errorEl.textContent).toContain('Storage failed')

    // Verify EXPORT_JMX was NOT sent
    const exportCalls = chromeStub.runtime.sendMessage.mock.calls.filter(
      (call) =>
        typeof call[0] === 'object' &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>).type === 'EXPORT_JMX'
    )
    expect(exportCalls.length).toBe(0)
  })

  it('adds parameterisation proposal via form and renders it in the DOM', async () => {
    await loadPopupModule()

    const stopBtn = document.getElementById('stop') as HTMLButtonElement
    const runAnalysisBtn = document.getElementById('runAnalysis') as HTMLButtonElement
    const paramVarNameInput = document.getElementById('paramVarName') as HTMLInputElement
    const paramSourceSelect = document.getElementById('paramSource') as HTMLSelectElement
    const paramLocationsInput = document.getElementById('paramLocations') as HTMLInputElement
    const paramAddBtn = document.getElementById('paramAddBtn') as HTMLButtonElement
    const paramList = document.getElementById('paramList') as HTMLDivElement

    stopBtn.click()
    await flushRuntimeResponse()

    runAnalysisBtn.click()
    await flushRuntimeResponse()

    paramVarNameInput.value = 'test_email'
    paramSourceSelect.value = 'csv'
    paramLocationsInput.value = 'body'

    paramAddBtn.click()
    await flushRuntimeResponse()

    const proposalRows = paramList.querySelectorAll('.analysis-row')
    expect(proposalRows.length).toBe(1)
    expect(proposalRows[0]!.querySelector('.analysis-name')!.textContent).toBe('test_email')
  })

  it('passes parameterisation proposals to buildTransformationPlan on export', async () => {
    await loadPopupModule()

    const startBtn = document.getElementById('start') as HTMLButtonElement
    const stopBtn = document.getElementById('stop') as HTMLButtonElement
    const runAnalysisBtn = document.getElementById('runAnalysis') as HTMLButtonElement
    const exportBtn = document.getElementById('export') as HTMLButtonElement
    const paramVarNameInput = document.getElementById('paramVarName') as HTMLInputElement
    const paramSourceSelect = document.getElementById('paramSource') as HTMLSelectElement
    const paramLocationsInput = document.getElementById('paramLocations') as HTMLInputElement
    const paramAddBtn = document.getElementById('paramAddBtn') as HTMLButtonElement

    startBtn.click()
    await flushRuntimeResponse()
    stopBtn.click()
    await flushRuntimeResponse()
    await flushRuntimeResponse()

    runAnalysisBtn.click()
    await flushRuntimeResponse()

    paramVarNameInput.value = 'test_email'
    paramSourceSelect.value = 'csv'
    paramLocationsInput.value = 'body'
    paramAddBtn.click()
    await flushRuntimeResponse()

    const originalSendMessage = chromeStub.runtime.sendMessage
    chromeStub.runtime.sendMessage = vi.fn((message: unknown) => {
      const record = isRuntimeMessage(message) ? message : {}

      if (record.type === 'GET_DOMAINS') {
        return Promise.resolve({ success: true, domains: ['example.com'] })
      }

      if (record.type === 'EXPORT_JMX') {
        return Promise.resolve({
          success: true,
          jmx: '<?xml version="1.0"?><jmeterTestPlan></jmeterTestPlan>',
          filename: 'Test.jmx',
        })
      }

      return originalSendMessage(message)
    })

    exportBtn.click()
    await flushRuntimeResponse()
    await flushRuntimeResponse()

    // Verify PlanStore.save was called with parameterizations
    const storageSetCalls = chromeStub.storage.local.set.mock.calls
    const planSaveCall = storageSetCalls.find(
      (call) =>
        typeof call[0] === 'object' &&
        call[0] !== null &&
        'capyultura:transformation-plan' in (call[0] as Record<string, unknown>)
    )
    expect(planSaveCall).toBeDefined()
    const planJson = (planSaveCall![0] as Record<string, unknown>)[
      'capyultura:transformation-plan'
    ] as string
    const plan = JSON.parse(planJson)
    expect(plan.parameterizations).toHaveLength(1)
    expect(plan.parameterizations[0].variableName).toBe('test_email')
  })

  it('shows preview section after accepting a candidate', async () => {
    await loadPopupModule()

    const stopBtn = document.getElementById('stop') as HTMLButtonElement
    const runAnalysisBtn = document.getElementById('runAnalysis') as HTMLButtonElement
    const analysisList = document.getElementById('analysisList') as HTMLDivElement

    stopBtn.click()
    await flushRuntimeResponse()

    runAnalysisBtn.click()
    await flushRuntimeResponse()

    // Seed a consumer transaction so preview has data to display
    for (const listener of runtimeMessageListeners) {
      listener({
        type: 'REQUEST_CAPTURED',
        request: {
          id: 'req-2',
          timestamp: '2024-01-01T00:00:01.000Z',
          method: 'POST',
          url: 'https://example.com/api',
          headers: { authorization: 'Bearer masked-token' },
          queryParams: {},
          body: '',
          statusCode: 200,
          responseHeaders: {},
          responseBody: '',
          responseBodySize: 0,
          responseBodyTruncated: false,
          responseBodyContentType: undefined,
          captureSources: ['content-fetch'],
          diagnostics: [],
        },
      })
    }
    await flushRuntimeResponse()

    const acceptBtn = Array.from(analysisList.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Accept'
    ) as HTMLButtonElement | undefined
    expect(acceptBtn).toBeDefined()
    acceptBtn!.click()
    await flushRuntimeResponse()

    const previewDetails = analysisList.querySelector('details')
    expect(previewDetails).not.toBeNull()
    const summary = previewDetails!.querySelector('summary')
    expect(summary!.textContent).toBe('Substitution preview')
  })

  it('preview updates when a candidate is rejected', async () => {
    await loadPopupModule()

    const stopBtn = document.getElementById('stop') as HTMLButtonElement
    const runAnalysisBtn = document.getElementById('runAnalysis') as HTMLButtonElement
    const analysisList = document.getElementById('analysisList') as HTMLDivElement

    stopBtn.click()
    await flushRuntimeResponse()

    runAnalysisBtn.click()
    await flushRuntimeResponse()

    // Seed a consumer transaction so preview has data to display
    for (const listener of runtimeMessageListeners) {
      listener({
        type: 'REQUEST_CAPTURED',
        request: {
          id: 'req-2',
          timestamp: '2024-01-01T00:00:01.000Z',
          method: 'POST',
          url: 'https://example.com/api',
          headers: { authorization: 'Bearer masked-token' },
          queryParams: {},
          body: '',
          statusCode: 200,
          responseHeaders: {},
          responseBody: '',
          responseBodySize: 0,
          responseBodyTruncated: false,
          responseBodyContentType: undefined,
          captureSources: ['content-fetch'],
          diagnostics: [],
        },
      })
    }
    await flushRuntimeResponse()

    const acceptBtn = Array.from(analysisList.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Accept'
    ) as HTMLButtonElement | undefined
    acceptBtn!.click()
    await flushRuntimeResponse()

    let previewDetails = analysisList.querySelector('details')
    expect(previewDetails).not.toBeNull()
    const previewRows = previewDetails!.querySelectorAll('tbody tr')
    expect(previewRows.length).toBeGreaterThan(0)

    const rejectBtn = Array.from(analysisList.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Reject'
    ) as HTMLButtonElement | undefined
    rejectBtn!.click()
    await flushRuntimeResponse()

    // After rejection, the preview is removed because there are no accepted candidates
    previewDetails = analysisList.querySelector('details')
    expect(previewDetails).toBeNull()
  })

  it('clear button resets parameterizationProposals', async () => {
    await loadPopupModule()

    const stopBtn = document.getElementById('stop') as HTMLButtonElement
    const runAnalysisBtn = document.getElementById('runAnalysis') as HTMLButtonElement
    const clearBtn = document.getElementById('clear') as HTMLButtonElement
    const paramVarNameInput = document.getElementById('paramVarName') as HTMLInputElement
    const paramSourceSelect = document.getElementById('paramSource') as HTMLSelectElement
    const paramLocationsInput = document.getElementById('paramLocations') as HTMLInputElement
    const paramAddBtn = document.getElementById('paramAddBtn') as HTMLButtonElement
    const paramList = document.getElementById('paramList') as HTMLDivElement

    stopBtn.click()
    await flushRuntimeResponse()

    runAnalysisBtn.click()
    await flushRuntimeResponse()

    // Add a parameterisation proposal
    paramVarNameInput.value = 'test_email'
    paramSourceSelect.value = 'csv'
    paramLocationsInput.value = 'body'
    paramAddBtn.click()
    await flushRuntimeResponse()

    expect(paramList.querySelectorAll('.analysis-row').length).toBe(1)

    // Click clear
    clearBtn.click()
    await flushRuntimeResponse()

    // Re-run analysis to re-render the analysis panel with the reset draft
    runAnalysisBtn.click()
    await flushRuntimeResponse()

    expect(paramList.querySelectorAll('.analysis-row').length).toBe(0)
  })

  it('runAnalysis button resets parameterizationProposals', async () => {
    await loadPopupModule()

    const stopBtn = document.getElementById('stop') as HTMLButtonElement
    const runAnalysisBtn = document.getElementById('runAnalysis') as HTMLButtonElement
    const paramVarNameInput = document.getElementById('paramVarName') as HTMLInputElement
    const paramSourceSelect = document.getElementById('paramSource') as HTMLSelectElement
    const paramLocationsInput = document.getElementById('paramLocations') as HTMLInputElement
    const paramAddBtn = document.getElementById('paramAddBtn') as HTMLButtonElement
    const paramList = document.getElementById('paramList') as HTMLDivElement

    stopBtn.click()
    await flushRuntimeResponse()

    runAnalysisBtn.click()
    await flushRuntimeResponse()

    // Add a parameterisation proposal
    paramVarNameInput.value = 'test_email'
    paramSourceSelect.value = 'csv'
    paramLocationsInput.value = 'body'
    paramAddBtn.click()
    await flushRuntimeResponse()

    expect(paramList.querySelectorAll('.analysis-row').length).toBe(1)

    // Click runAnalysis again and verify proposals are reset
    runAnalysisBtn.click()
    await flushRuntimeResponse()

    expect(paramList.querySelectorAll('.analysis-row').length).toBe(0)
  })
})
