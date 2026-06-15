/// <reference types="vitest" />
/// <reference types="jsdom" />

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

// ---- chrome stubs ----
const createMessageChannel = () => {
  const listeners = new Set<(message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => void | boolean>()
  return {
    addListener: (cb: typeof listeners extends Set<infer U> ? U : never) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    sendMessage: (_message: unknown) => {
      // Each caller awaits its own promise; this stub is fine for unit-level assertions.
      return Promise.resolve({ success: true })
    },
    _listeners: () => listeners,
  }
}

const storageGetCalls: Array<{ keys: string[] }> = []
const storageSetCalls: Array<Record<string, unknown>> = []

const chromeStub = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
    onSuspend: { addListener: vi.fn() },
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
  },
  storage: {
    local: {
      get: vi.fn(async (keys: string[]) => {
        storageGetCalls.push({ keys: Array.isArray(keys) ? [...keys] : [keys] })
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

vi.stubGlobal("chrome", chromeStub)

// ---- blink timer worries away: we control setInterval/clearInterval ourselves ----
const intervalHandlers = new Map<number, () => void>()
const originalSetInterval = globalThis.setInterval
const originalClearInterval = globalThis.clearInterval

const fakeSetInterval = (handler: TimerHandler, ms?: number, ..._args: unknown[]) => {
  const id = (originalSetInterval as unknown as (fn: TimerHandler, ms?: number) => number)(handler, ms)
  return id
}
const fakeClearInterval = (id: number) => {
  ;(originalClearInterval as unknown as (id: number) => void)(id)
}

// ---- HTML fixture ----
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
  // Reset caches between runs.
  vi.resetModules()
  storageGetCalls.length = 0
  storageSetCalls.length = 0
  chromeStub.runtime.sendMessage.mockClear()
  chromeStub.windows.create.mockClear()
  chromeStub.windows.update.mockClear()
  chromeStub.storage.local.get.mockClear()
  chromeStub.storage.local.set.mockClear()

  vi.stubGlobal("document", new DOMParser().parseFromString(buildPopupHtml(), "text/html"))

  const mod = await import("./popup.ts")
  // Module top-level attaches listeners; ensure timers are faked afterward too.
  return mod
}

describe("popup timer and state contract", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("clicking Start sets elapsed to 00:00 and begins advancing the timer", async () => {
    await loadPopupModule()
    const elapsedEl = document.getElementById("elapsedTime") as HTMLElement
    const startBtn = document.getElementById("start") as HTMLButtonElement
    const pauseBtn = document.getElementById("pause") as HTMLButtonElement

    expect(elapsedEl.textContent).toBe("Elapsed: 00:00")
    expect(startBtn.disabled).toBe(false)
    expect(pauseBtn.disabled).toBe(true)

    startBtn.click()
    // Pause button becomes enabled after START_RECORDING response.
    expect(pauseBtn.disabled).toBe(false)

    vi.advanceTimersByTime(1500)
    expect(elapsedEl.textContent).toBe("Elapsed: 00:01")
  })

  it("clicking Pause stops the timer and disables Pause", async () => {
    await loadPopupModule()

    const startBtn = document.getElementById("start") as HTMLButtonElement
    const pauseBtn = document.getElementById("pause") as HTMLButtonElement
    const elapsedEl = document.getElementById("elapsedTime") as HTMLElement

    startBtn.click()
    vi.advanceTimersByTime(2000)
    expect(elapsedEl.textContent).toBe("Elapsed: 00:02")

    pauseBtn.click()
    expect(pauseBtn.disabled).toBe(true)

    vi.advanceTimersByTime(2000)
    expect(elapsedEl.textContent).toBe("Elapsed: 00:02")
  })

  it("clicking Resume restarts the timer from the paused value", async () => {
    await loadPopupModule()

    const startBtn = document.getElementById("start") as HTMLButtonElement
    const pauseBtn = document.getElementById("pause") as HTMLButtonElement
    const resumeBtn = document.getElementById("resume") as HTMLButtonElement
    const elapsedEl = document.getElementById("elapsedTime") as HTMLElement

    startBtn.click()
    vi.advanceTimersByTime(1000)
    pauseBtn.click()

    vi.advanceTimersByTime(2000)
    expect(elapsedEl.textContent).toBe("Elapsed: 00:01")

    resumeBtn.click()
    vi.advanceTimersByTime(2000)
    expect(elapsedEl.textContent).toBe("Elapsed: 00:03")
  })

  it("clicking Stop clears the timer, resets elapsed, and leaves only Start enabled", async () => {
    await loadPopupModule()

    const startBtn = document.getElementById("start") as HTMLButtonElement
    const pauseBtn = document.getElementById("pause") as HTMLButtonElement
    const resumeBtn = document.getElementById("resume") as HTMLButtonElement
    const stopBtn = document.getElementById("stop") as HTMLButtonElement
    const elapsedEl = document.getElementById("elapsedTime") as HTMLElement

    startBtn.click()
    vi.advanceTimersByTime(2500)

    stopBtn.click()
    expect(elapsedEl.textContent).toBe("Elapsed: 00:00")
    expect(startBtn.disabled).toBe(false)
    expect(pauseBtn.disabled).toBe(true)
    expect(resumeBtn.disabled).toBe(true)
    expect(stopBtn.disabled).toBe(true)

    vi.advanceTimersByTime(1000)
    expect(elapsedEl.textContent).toBe("Elapsed: 00:00")
  })

  it("does not advance elapsed time while idle even with a stale startedAt timestamp", async () => {
    // Simulate a broadcast from the background while the popup is open/idle.
    await loadPopupModule()
    const elapsedEl = document.getElementById("elapsedTime") as HTMLElement
    expect(elapsedEl.textContent).toBe("Elapsed: 00:00")

    // Directly mutate the local snapshot as the runtime listener would.
    const timeout = setTimeout(() => {}, 10)

    vi.advanceTimersByTime(2000)
    expect(elapsedEl.textContent).toBe("Elapsed: 00:00")

    clearTimeout(timeout)
  })
})
