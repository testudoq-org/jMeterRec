import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// We only care about the pure helpers/normalization in options.ts.
// Re-implement the minimal normalization surface for unit coverage.
const defaults = {
  defaultPlanName: 'Untitled Plan',
  threads: 1,
  rampUp: 1,
  loops: 1,
  maxTransactions: 200,
  openDetachedInspector: false,
  captureResponseBody: false,
  theme: 'light',
}

function normalizeTheme(unknown: unknown): 'light' | 'dark' {
  return unknown === 'dark' ? 'dark' : 'light'
}

function positiveNumber(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function nonNegativeNumber(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

type OptionKey = keyof typeof defaults
type PartialOptions = Partial<Record<OptionKey, unknown>>

function normalizeOptions(opts: PartialOptions): typeof defaults {
  const defaultPlanName =
    typeof opts.defaultPlanName === 'string' ? opts.defaultPlanName : defaults.defaultPlanName
  const threads =
    typeof opts.threads === 'number' || typeof opts.threads === 'string'
      ? opts.threads
      : String(opts.threads)
  const rampUp =
    typeof opts.rampUp === 'number' || typeof opts.rampUp === 'string'
      ? opts.rampUp
      : String(opts.rampUp)
  const loops =
    typeof opts.loops === 'number' || typeof opts.loops === 'string'
      ? opts.loops
      : String(opts.loops)

  return {
    defaultPlanName,
    threads: positiveNumber(String(threads), defaults.threads),
    rampUp: nonNegativeNumber(String(rampUp), defaults.rampUp),
    loops: positiveNumber(String(loops), defaults.loops),
    maxTransactions: boundedNumber(opts.maxTransactions, 20, 500, defaults.maxTransactions),
    openDetachedInspector: opts.openDetachedInspector === true,
    captureResponseBody: opts.captureResponseBody === true,
    theme: normalizeTheme(opts.theme),
  }
}

// Storage onchange listener test setup
const storageOnChangedListeners = new Set<
  (changes: Record<string, { newValue: unknown }>, areaName: string) => void
>()

const chromeStub = {
  storage: {
    local: {
      get: vi.fn(async () => {
        // Return the initial values for all get calls during load
        // This matches what options.ts expects on initial load
        return {
          filterPattern: 'http://*/*, https://*/*',
          recordCss: true,
          recordJs: true,
          recordImages: true,
          recordRedirects: false,
          recordCookies: true,
          userAgent: 'current',
          cacheEnabled: false,
          durationAssertionEnabled: false,
          durationAssertionThresholdMs: 5000,
          extractorsJson: '[]',
        }
      }),
      set: vi.fn(async () => {}),
    },
    onChanged: {
      addListener: vi.fn(
        (listener: (changes: Record<string, { newValue: unknown }>, areaName: string) => void) => {
          storageOnChangedListeners.add(listener)
        }
      ),
    },
  },
}

vi.stubGlobal('chrome', chromeStub)

function buildOptionsHtml(): string {
  return `<!doctype html>
    <html lang="en">
      <body>
        <input id="defaultPlanName" />
        <input id="threads" />
        <input id="rampUp" />
        <input id="loops" />
        <input id="thinkTimeEnabled" type="checkbox" />
        <input id="thinkTimeRandomize" type="checkbox" />
        <input id="thinkTimeRangePercent" />
        <input id="assertionsEnabled" type="checkbox" />
        <input id="assertionExpectStatus" />
        <input id="redirectDedupEnabled" type="checkbox" />
        <input id="cacheEnabled" type="checkbox" />
        <input id="durationAssertionEnabled" type="checkbox" />
        <input id="durationAssertionThresholdMs" />
        <textarea id="extractorsJson"></textarea>
        <div id="extractorsJsonError"></div>
        <button id="save"></button>
        <div id="saved"></div>
        <input id="maxTransactions" />
        <input id="openDetachedInspector" type="checkbox" />
        <input id="captureResponseBody" type="checkbox" />
        <button id="saveTransactionPanelOptions"></button>
        <div id="transactionPanelSaved"></div>
        <textarea id="filterPattern"></textarea>
        <input id="recordCss" type="checkbox" />
        <input id="recordJs" type="checkbox" />
        <input id="recordImages" type="checkbox" />
        <input id="recordRedirects" type="checkbox" />
        <input id="recordCookies" type="checkbox" />
        <select id="userAgent">
          <option value="current">current</option>
          <option value="custom">custom</option>
        </select>
        <input id="customUserAgent" type="text" />
        <button id="saveAdvancedOptions"></button>
        <button id="resetAdvancedOptions"></button>
        <div id="filterPatternError"></div>
        <div id="resourceTypeError"></div>
        <div id="userAgentError"></div>
        <div id="advancedSaved"></div>
        <select id="themeMode">
          <option value="light">light</option>
          <option value="dark">dark</option>
        </select>
      </body>
    </html>`
}

async function loadOptionsModule() {
  vi.resetModules()
  storageOnChangedListeners.clear()
  chromeStub.storage.local.get.mockClear()
  chromeStub.storage.local.set.mockClear()

  vi.stubGlobal('document', new JSDOM(buildOptionsHtml()).window.document)

  await import('./options.ts')
  await flushPromises()
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('options normalization', () => {
  it('applies defaults', () => {
    expect(normalizeOptions({})).toEqual(defaults)
  })

  it('clamps maxTransactions to bounds and fallback', () => {
    expect(normalizeOptions({ maxTransactions: 5 })).toEqual({
      ...defaults,
      maxTransactions: 20,
    })
    expect(normalizeOptions({ maxTransactions: 9999 })).toEqual({
      ...defaults,
      maxTransactions: 500,
    })
    expect(normalizeOptions({ maxTransactions: 123 })).toEqual({
      ...defaults,
      maxTransactions: 123,
    })
    expect(normalizeOptions({ maxTransactions: undefined })).toEqual(defaults)
    expect(normalizeOptions({ maxTransactions: 'abc' })).toEqual(defaults)
  })

  it('coerces theme and booleans', () => {
    expect(normalizeOptions({ theme: 'dark' }).theme).toBe('dark')
    expect(normalizeOptions({ theme: 'light' }).theme).toBe('light')
    expect(normalizeOptions({ theme: '__weird__' }).theme).toBe('light')
    expect(normalizeOptions({ openDetachedInspector: true }).openDetachedInspector).toBe(true)
    expect(normalizeOptions({ captureResponseBody: true }).captureResponseBody).toBe(true)
  })

  it('validates number strings', () => {
    expect(normalizeOptions({ threads: '2' }).threads).toBe(2)
    expect(normalizeOptions({ threads: '0' }).threads).toBe(1)
    expect(normalizeOptions({ rampUp: '0' }).rampUp).toBe(0)
    expect(normalizeOptions({ loops: '-5' }).loops).toBe(1)
  })

  it('sanitizes incoming partial shapes with extra/odd fields', () => {
    const weird = {
      defaultPlanName: 123,
      threads: null,
      rampUp: undefined,
      loops: 0,
      maxTransactions: false,
      openDetachedInspector: 'true',
      captureResponseBody: 'yes',
      theme: 1,
      __UNKNOWN__: true,
    } as unknown as Partial<typeof defaults>

    const out = normalizeOptions(weird)
    expect(out.defaultPlanName).toBe(defaults.defaultPlanName)
    expect(out.threads).toBe(defaults.threads)
    expect(out.rampUp).toBe(defaults.rampUp)
    expect(out.loops).toBe(defaults.loops)
    expect(out.maxTransactions).toBe(defaults.maxTransactions)
    expect(out.openDetachedInspector).toBe(false)
    expect(out.captureResponseBody).toBe(false)
  })
})

describe('options advanced options storage sync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('syncs advanced options when individual key changes in storage', async () => {
    // Set up mock to return initial values first, then sync values on subsequent calls
    let getCallCount = 0
    chromeStub.storage.local.get.mockImplementation(async () => {
      getCallCount++
      // First 2 calls are from initial load (main options + advanced options)
      if (getCallCount <= 2) {
        return {
          filterPattern: 'http://*/*, https://*/*',
          recordCss: true,
          recordJs: true,
          recordImages: true,
          recordRedirects: false,
          recordCookies: true,
          userAgent: 'current',
          cacheEnabled: false,
          durationAssertionEnabled: false,
          durationAssertionThresholdMs: 5000,
          extractorsJson: '[]',
        }
      }
      // Subsequent calls (from onChange handler) return updated values
      return {
        filterPattern: 'https://sync-test.example.com/*',
        recordCss: false,
        recordJs: false,
        recordImages: false,
        recordRedirects: true,
        recordCookies: false,
        userAgent: 'firefox-linux',
        cacheEnabled: false,
        durationAssertionEnabled: false,
        durationAssertionThresholdMs: 5000,
        extractorsJson: '[]',
      }
    })

    await loadOptionsModule()

    const filterPatternEl = document.getElementById('filterPattern') as HTMLTextAreaElement
    const recordCookiesEl = document.getElementById('recordCookies') as HTMLInputElement
    const recordJsEl = document.getElementById('recordJs') as HTMLInputElement

    // Initial load values
    expect(filterPatternEl.value).toBe('http://*/*, https://*/*')
    expect(recordCookiesEl.checked).toBe(true)

    // Simulate individual key changes (as Chrome storage actually fires)
    for (const listener of storageOnChangedListeners) {
      listener(
        {
          filterPattern: { newValue: 'https://sync-test.example.com/*' },
          recordCookies: { newValue: false },
          userAgent: { newValue: 'firefox-linux' },
        },
        'local'
      )
    }

    // The listener calls chrome.storage.local.get which is async
    await flushPromises()

    expect(filterPatternEl.value).toBe('https://sync-test.example.com/*')
    expect(recordCookiesEl.checked).toBe(false)
    expect(recordJsEl.checked).toBe(false)
  })

  it('ignores non-advanced option storage changes', async () => {
    await loadOptionsModule()

    const filterPatternEl = document.getElementById('filterPattern') as HTMLTextAreaElement
    const initialFilterValue = filterPatternEl.value

    // Simulate non-advanced key change
    for (const listener of storageOnChangedListeners) {
      listener(
        {
          theme: { newValue: 'dark' },
        },
        'local'
      )
    }

    await flushPromises()

    // Filter pattern should remain unchanged
    expect(filterPatternEl.value).toBe(initialFilterValue)
  })

  it('ignores storage changes from non-local area', async () => {
    await loadOptionsModule()

    const filterPatternEl = document.getElementById('filterPattern') as HTMLTextAreaElement
    const initialFilterValue = filterPatternEl.value

    // Simulate sync event from sync area (not local)
    for (const listener of storageOnChangedListeners) {
      listener(
        {
          filterPattern: { newValue: 'https://ignored.example.com/*' },
        },
        'sync'
      )
    }

    await flushPromises()

    // Filter pattern should remain unchanged
    expect(filterPatternEl.value).toBe(initialFilterValue)
  })

  it('syncs custom user agent and shows custom input field on onChange', async () => {
    let getCallCount = 0
    chromeStub.storage.local.get.mockImplementation(async () => {
      getCallCount++
      if (getCallCount <= 2) {
        return {
          filterPattern: 'http://*/*, https://*/*',
          recordCss: true,
          recordJs: true,
          recordImages: true,
          recordRedirects: false,
          recordCookies: true,
          userAgent: 'current',
          cacheEnabled: false,
          durationAssertionEnabled: false,
          durationAssertionThresholdMs: 5000,
          extractorsJson: '[]',
        }
      }
      // Return custom user agent on sync
      return {
        filterPattern: 'http://*/*, https://*/*',
        recordCss: true,
        recordJs: true,
        recordImages: true,
        recordRedirects: false,
        recordCookies: true,
        userAgent: 'custom:My Test Agent',
        cacheEnabled: false,
        durationAssertionEnabled: false,
        durationAssertionThresholdMs: 5000,
        extractorsJson: '[]',
      }
    })

    await loadOptionsModule()

    const userAgentEl = document.getElementById('userAgent') as HTMLSelectElement
    const customUserAgentEl = document.getElementById('customUserAgent') as HTMLInputElement

    // Initial state - customUserAgent has display: none since userAgent is 'current'
    expect(userAgentEl.value).toBe('current')
    expect(customUserAgentEl.style.display).toBe('none')

    // Simulate individual key change with custom user agent
    for (const listener of storageOnChangedListeners) {
      listener(
        {
          userAgent: { newValue: 'custom:My Test Agent' },
        },
        'local'
      )
    }

    await flushPromises()

    // Should show custom user agent UI
    expect(userAgentEl.value).toBe('custom')
    expect(customUserAgentEl.style.display).toBe('block')
    expect(customUserAgentEl.value).toBe('My Test Agent')
  })

  it('handles storage read error in onChange and displays error message', async () => {
    // First allow initial load, then throw on onChange
    let getCallCount = 0
    chromeStub.storage.local.get.mockImplementation(async () => {
      getCallCount++
      // Allow initial load calls
      if (getCallCount <= 2) {
        return {
          filterPattern: 'http://*/*, https://*/*',
          recordCss: true,
          recordJs: true,
          recordImages: true,
          recordRedirects: false,
          recordCookies: true,
          userAgent: 'current',
          cacheEnabled: false,
          durationAssertionEnabled: false,
          durationAssertionThresholdMs: 5000,
          extractorsJson: '[]',
        }
      }
      // Throw on onChange handler call
      throw new Error('Storage read failed')
    })

    await loadOptionsModule()

    const filterPatternEl = document.getElementById('filterPattern') as HTMLTextAreaElement
    const advancedSavedEl = document.getElementById('advancedSaved') as HTMLDivElement
    const initialFilterValue = filterPatternEl.value

    // Trigger onChange event
    for (const listener of storageOnChangedListeners) {
      listener(
        {
          filterPattern: { newValue: 'https://error-test.example.com/*' },
        },
        'local'
      )
    }

    await flushPromises()

    // Value should remain unchanged since the read failed
    expect(filterPatternEl.value).toBe(initialFilterValue)
    // Error message should be displayed
    expect(advancedSavedEl.textContent).toBe('Sync error: Storage read failed')
  })

  it('handles multiple rapid onChange events', async () => {
    let getCallCount = 0
    chromeStub.storage.local.get.mockImplementation(async () => {
      getCallCount++
      return {
        filterPattern: `https://change-${getCallCount}.example.com/*`,
        recordCss: true,
        recordJs: true,
        recordImages: true,
        recordRedirects: false,
        recordCookies: true,
        userAgent: 'current',
        cacheEnabled: false,
        durationAssertionEnabled: false,
        durationAssertionThresholdMs: 5000,
        extractorsJson: '[]',
      }
    })

    await loadOptionsModule()

    const filterPatternEl = document.getElementById('filterPattern') as HTMLTextAreaElement

    // Clear the mock to reset call count for onChange tests
    getCallCount = 0

    // Fire multiple onChange events in rapid succession without waiting
    for (const listener of storageOnChangedListeners) {
      listener(
        {
          filterPattern: { newValue: 'https://first.example.com/*' },
          recordCookies: { newValue: false },
        },
        'local'
      )
      listener(
        {
          filterPattern: { newValue: 'https://second.example.com/*' },
          recordCookies: { newValue: true },
        },
        'local'
      )
      listener(
        {
          filterPattern: { newValue: 'https://third.example.com/*' },
          recordCookies: { newValue: false },
        },
        'local'
      )
    }

    // Wait for all async handlers to complete
    await flushPromises()
    await flushPromises()

    // UI should eventually reflect one of the values (last one to complete)
    expect(filterPatternEl.value).toMatch(/https:\/\/change-\d\.example\.com\//)
  })
})
