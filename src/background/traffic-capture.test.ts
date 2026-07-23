import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecorderState } from './recorder-state'
import { TrafficCaptureService } from './traffic-capture'
import { PendingWebRequestStore } from './pending-web-request-store'
import type { CapturedRequest } from '../models/captured-request'
import type { AdvancedOptions } from '../options/advanced-options'

class MemoryStorage {
  private values = new Map<string, unknown>()

  async get(keys: string[]): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {}

    for (const key of keys) {
      if (this.values.has(key)) {
        result[key] = this.values.get(key)
      }
    }

    return result
  }

  async set(values: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(values)) {
      this.values.set(key, value)
    }
  }
}

interface CapturedListeners {
  beforeRequest?: (details: chrome.webRequest.OnBeforeRequestDetails) => void
  beforeSendHeaders?: (details: chrome.webRequest.OnBeforeSendHeadersDetails) => void
  responseStarted?: (details: chrome.webRequest.OnResponseStartedDetails) => void
  completed?: (details: chrome.webRequest.OnCompletedDetails) => void
  errorOccurred?: (details: chrome.webRequest.OnErrorOccurredDetails) => void
}

interface ServiceHarness {
  service: TrafficCaptureService
  pendingStore: PendingWebRequestStore
  state: RecorderState
  requests: CapturedRequest[]
  listeners: CapturedListeners
}

function stubChrome(listeners: CapturedListeners): void {
  vi.stubGlobal('chrome', {
    webRequest: {
      onBeforeRequest: {
        addListener: vi.fn(
          (listener: (details: chrome.webRequest.OnBeforeRequestDetails) => void) => {
            listeners.beforeRequest = listener
          }
        ),
      },
      onBeforeSendHeaders: {
        addListener: vi.fn(
          (listener: (details: chrome.webRequest.OnBeforeSendHeadersDetails) => void) => {
            listeners.beforeSendHeaders = listener
          }
        ),
      },
      onResponseStarted: {
        addListener: vi.fn(
          (listener: (details: chrome.webRequest.OnResponseStartedDetails) => void) => {
            listeners.responseStarted = listener
          }
        ),
      },
      onCompleted: {
        addListener: vi.fn((listener: (details: chrome.webRequest.OnCompletedDetails) => void) => {
          listeners.completed = listener
        }),
      },
      onErrorOccurred: {
        addListener: vi.fn(
          (listener: (details: chrome.webRequest.OnErrorOccurredDetails) => void) => {
            listeners.errorOccurred = listener
          }
        ),
      },
    },
    runtime: {
      sendMessage: vi.fn(() => Promise.resolve(undefined)),
    },
  })
}

function createState(isCapturing = true): { state: RecorderState; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = []

  const state = {
    isCapturing: vi.fn(() => isCapturing),
    addRequest: vi.fn((request: CapturedRequest) => requests.push(request)),
    save: vi.fn(async () => undefined),
    getRequests: vi.fn(() => requests),
  } as unknown as RecorderState

  return { state, requests }
}

async function createService(
  storage: MemoryStorage,
  isCapturing = true,
  redirectDedupEnabled = false
): Promise<ServiceHarness> {
  const listeners: CapturedListeners = {}
  stubChrome(listeners)

  const pendingStore = new PendingWebRequestStore(storage)
  const { state, requests } = createState(isCapturing)
  const service = new TrafficCaptureService(state, pendingStore, redirectDedupEnabled)

  await service.start({}, true)

  return { service, pendingStore, state, requests, listeners }
}

async function flushStorageWrites(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve()
  }
}

function requireListener<T>(listener: T | undefined, name: string): T {
  expect(listener, name).toBeDefined()
  return listener as T
}

function beforeRequest(overrides: Partial<chrome.webRequest.OnBeforeRequestDetails> = {}) {
  return {
    documentLifecycle: 'active',
    frameId: 0,
    frameType: 'outermost_frame',
    method: 'POST',
    parentFrameId: -1,
    requestId: 'r-1',
    tabId: 10,
    timeStamp: Date.now(),
    type: 'xmlhttprequest',
    url: 'https://api.example.com/submit?tenant=acme',
    ...overrides,
  } as chrome.webRequest.OnBeforeRequestDetails
}

function responseStarted(
  overrides: Partial<chrome.webRequest.OnResponseStartedDetails> = {}
): chrome.webRequest.OnResponseStartedDetails {
  return {
    fromCache: false,
    frameId: 0,
    ip: '127.0.0.1',
    requestId: 'r-1',
    statusCode: 201,
    statusLine: 'HTTP/1.1 201 Created',
    tabId: 10,
    timeStamp: Date.now() + 100,
    url: 'https://api.example.com/submit?tenant=acme',
    responseHeaders: [{ name: 'content-type', value: 'application/json' }],
    ...overrides,
  } as chrome.webRequest.OnResponseStartedDetails
}

function completed(
  overrides: Partial<chrome.webRequest.OnCompletedDetails> = {}
): chrome.webRequest.OnCompletedDetails {
  return {
    fromCache: false,
    requestId: 'r-1',
    method: 'POST',
    statusCode: 200,
    statusLine: 'HTTP/1.1 200 OK',
    tabId: 10,
    timeStamp: Date.now() + 200,
    url: 'https://api.example.com/submit?tenant=acme',
    responseHeaders: [{ name: 'content-type', value: 'application/json' }],
    ...overrides,
  } as chrome.webRequest.OnCompletedDetails
}

function errorOccurred(
  overrides: Partial<chrome.webRequest.OnErrorOccurredDetails> = {}
): chrome.webRequest.OnErrorOccurredDetails {
  return {
    error: 'net::ERR_FAILED',
    requestId: 'r-1',
    tabId: 10,
    timeStamp: Date.now() + 200,
    url: 'https://api.example.com/submit?tenant=acme',
    ...overrides,
  } as chrome.webRequest.OnErrorOccurredDetails
}

const REQUEST_TIME = '2023-11-14T22:13:20.000Z'

describe('TrafficCaptureService P2 persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(REQUEST_TIME)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('persists pending request fragments for later recovery', async () => {
    const storage = new MemoryStorage()
    const first = await createService(storage)

    requireListener(first.listeners.beforeRequest, 'beforeRequest')(beforeRequest())
    await flushStorageWrites()

    await expect(first.pendingStore.load()).resolves.toEqual({
      '10-r-1': expect.objectContaining({
        id: '10-r-1',
        method: 'POST',
        url: 'https://api.example.com/submit?tenant=acme',
      }),
    })
  })

  it('recovers pending request fragments after a service-worker restart', async () => {
    const storage = new MemoryStorage()
    const first = await createService(storage)

    requireListener(first.listeners.beforeRequest, 'beforeRequest')(beforeRequest())
    await flushStorageWrites()

    const recovered = await first.pendingStore.load()
    const restartedListeners: CapturedListeners = {}
    stubChrome(restartedListeners)
    const { state: restartedState } = createState(true)
    const restartedService = new TrafficCaptureService(restartedState, first.pendingStore)
    await restartedService.start(recovered, true)

    restartedListeners.completed?.(completed())
    await flushStorageWrites()

    expect(restartedState.addRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '10-r-1',
        statusCode: 200,
        completedAt: '2023-11-14T22:13:20.200Z',
      })
    )
    await expect(first.pendingStore.load()).resolves.toEqual({})
  })

  it('merges response-start fragments before completion', async () => {
    const storage = new MemoryStorage()
    const service = await createService(storage)

    service.listeners.beforeRequest?.(beforeRequest())
    requireListener(
      service.listeners.responseStarted,
      'responseStarted'
    )(responseStarted({ statusCode: 202 }))
    await flushStorageWrites()

    requireListener(service.listeners.completed, 'completed')(completed({ statusCode: 202 }))
    await flushStorageWrites()

    expect(service.state.addRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '10-r-1',
        statusCode: 202,
        responseHeaders: { 'content-type': 'application/json' },
      })
    )
  })

  it('finalizes failed requests and clears pending storage', async () => {
    const storage = new MemoryStorage()
    const service = await createService(storage)

    service.listeners.beforeRequest?.(beforeRequest())
    requireListener(service.listeners.errorOccurred, 'errorOccurred')(errorOccurred())
    await flushStorageWrites()

    expect(service.state.addRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '10-r-1',
        method: 'POST',
        error: 'net::ERR_FAILED',
        completedAt: '2023-11-14T22:13:20.200Z',
      })
    )
    await expect(storage.get(['pendingWebRequests'])).resolves.toEqual({
      pendingWebRequests: {
        version: 1,
        fragments: {},
        updatedAt: expect.any(String),
      },
    })
  })

  it('finalizes a completion even when the pending fragment was not found', async () => {
    const storage = new MemoryStorage()
    const service = await createService(storage)

    requireListener(
      service.listeners.completed,
      'completed'
    )(completed({ requestId: 'missing', tabId: 10, method: 'GET' }))
    await flushStorageWrites()

    expect(service.state.addRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '10-missing',
        method: 'GET',
        statusCode: 200,
        completedAt: '2023-11-14T22:13:20.200Z',
      })
    )
  })

  it('does not add the same completed request twice', async () => {
    const storage = new MemoryStorage()
    const service = await createService(storage)

    service.listeners.beforeRequest?.(beforeRequest())
    await flushStorageWrites()

    requireListener(service.listeners.completed, 'completed')(completed())
    await flushStorageWrites()

    service.listeners.completed?.(completed())
    await flushStorageWrites()

    expect(service.state.addRequest).toHaveBeenCalledTimes(2)
    expect(service.state.addRequest).toHaveBeenCalledWith(expect.objectContaining({ id: '10-r-1' }))
  })

  it('clears pending fragments when recording is stopped or reset', async () => {
    const storage = new MemoryStorage()
    const service = await createService(storage)

    service.listeners.beforeRequest?.(beforeRequest())
    await flushStorageWrites()
    await service.service.clearPending()

    await expect(storage.get(['pendingWebRequests'])).resolves.toEqual({
      pendingWebRequests: {
        version: 1,
        fragments: {},
        updatedAt: expect.any(String),
      },
    })
  })

  it('drops recovered pending fragments when recorder state is not active', async () => {
    const storage = new MemoryStorage()
    const pendingStore = new PendingWebRequestStore(storage)
    await pendingStore.upsert(
      {
        id: '10-r-1',
        timestamp: '2023-11-14T22:13:20.000Z',
        method: 'GET',
        url: 'https://api.example.com/ping',
        headers: {},
        queryParams: {},
        startedAtMs: 1_700_000_000_000,
      },
      new Date('2023-11-14T22:13:20.000Z')
    )

    const { state } = createState(false)
    const service: TrafficCaptureService = new TrafficCaptureService(state, pendingStore)
    stubChrome({})
    await service.start(await pendingStore.load(), false)

    await expect(pendingStore.load()).resolves.toEqual({})
  })
})

describe('TrafficCaptureService redirect chains', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(REQUEST_TIME)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('links a redirect chain head to its follow-up request', async () => {
    const storage = new MemoryStorage()
    const service = await createService(storage, true, true)

    const followUpTime = '2023-11-14T22:13:21.000Z'

    service.listeners.beforeRequest?.(
      beforeRequest({
        requestId: 'r-1',
        url: 'https://api.example.com/old',
        method: 'GET',
      })
    )
    await flushStorageWrites()

    requireListener(
      service.listeners.responseStarted,
      'responseStarted'
    )(
      responseStarted({
        requestId: 'r-1',
        tabId: 10,
        url: 'https://api.example.com/old',
        statusCode: 302,
        statusLine: 'HTTP/1.1 302 Found',
        responseHeaders: [{ name: 'location', value: '/new?token=abc' }],
      })
    )
    await flushStorageWrites()

    requireListener(
      service.listeners.completed,
      'completed'
    )(
      completed({
        requestId: 'r-1',
        tabId: 10,
        url: 'https://api.example.com/old',
        method: 'GET',
        statusCode: 302,
        statusLine: 'HTTP/1.1 302 Found',
        responseHeaders: [{ name: 'location', value: '/new?token=abc' }],
      })
    )
    await flushStorageWrites()

    service.listeners.beforeRequest?.(
      beforeRequest({
        requestId: 'r-2',
        url: 'https://api.example.com/new?token=abc',
        method: 'GET',
        timeStamp: new Date(followUpTime).getTime(),
      })
    )
    await flushStorageWrites()

    requireListener(
      service.listeners.responseStarted,
      'responseStarted'
    )(
      responseStarted({
        requestId: 'r-2',
        tabId: 10,
        url: 'https://api.example.com/new?token=abc',
        method: 'GET',
        timeStamp: new Date(followUpTime).getTime(),
        statusCode: 200,
        responseHeaders: [{ name: 'content-type', value: 'text/html' }],
      })
    )
    await flushStorageWrites()

    requireListener(
      service.listeners.completed,
      'completed'
    )(
      completed({
        requestId: 'r-2',
        tabId: 10,
        url: 'https://api.example.com/new?token=abc',
        method: 'GET',
        timeStamp: new Date(followUpTime).getTime() + 100,
        statusCode: 200,
        responseHeaders: [{ name: 'content-type', value: 'text/html' }],
      })
    )
    await flushStorageWrites()

    const captured = service.requests
    const chainHead = captured.find((req: { id?: string }) => req.id === '10-r-1')
    const followUp = captured.find((req: { id?: string }) => req.id === '10-r-2')

    expect(chainHead).toEqual(
      expect.objectContaining({
        id: '10-r-1',
        method: 'GET',
        url: 'https://api.example.com/old',
        statusCode: 302,
        followRedirects: true,
      })
    )

    expect(followUp).toEqual(
      expect.objectContaining({
        id: '10-r-2',
        method: 'GET',
        url: 'https://api.example.com/new?token=abc',
        followRedirects: false,
        path: '/new?token=abc',
        queryParams: { token: 'abc' },
      })
    )
  })
})

describe('TrafficCaptureService advanced filtering', () => {
  const DEFAULT_ADVANCED: AdvancedOptions = {
    filterPattern: 'http://*/*, https://*/*',
    recordCss: true,
    recordJs: true,
    recordImages: true,
    recordRedirects: false,
    recordCookies: true,
    userAgent: 'current',
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(REQUEST_TIME)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function createServiceWithAdvanced(advancedOpts?: AdvancedOptions): ServiceHarness {
    const opts = advancedOpts ?? DEFAULT_ADVANCED
    const storage = new MemoryStorage()
    const listeners: CapturedListeners = {}
    stubChrome(listeners)
    const pendingStore = new PendingWebRequestStore(storage)
    const { state, requests } = createState(true)
    const service = new TrafficCaptureService(state, pendingStore, false, opts)
    service.start({}, true)

    return { service, pendingStore, state, requests, listeners }
  }

  it('filters requests by URL pattern', async () => {
    const harness = createServiceWithAdvanced({
      ...DEFAULT_ADVANCED,
      filterPattern: 'https://api.example.com/*',
    })

    // Request matching pattern
    requireListener(
      harness.listeners.beforeRequest,
      'beforeRequest'
    )(beforeRequest({ url: 'https://api.example.com/users', requestId: 'r-1' }))
    // Request not matching pattern
    requireListener(
      harness.listeners.beforeRequest,
      'beforeRequest'
    )(beforeRequest({ url: 'https://other.example.com/data', requestId: 'r-2' }))
    await flushStorageWrites()

    // Only the matching request should be captured
    const pending = harness.service.getPendingRequests()
    expect(pending.find((r) => r.id === '10-r-1')).toBeDefined()
    expect(pending.find((r) => r.id === '10-r-2')).toBeUndefined()
  })

  it('filters requests by resource type - stylesheet', async () => {
    const harness = createServiceWithAdvanced({
      ...DEFAULT_ADVANCED,
      recordCss: false,
    })

    // Stylesheet request
    requireListener(
      harness.listeners.beforeRequest,
      'beforeRequest'
    )(beforeRequest({ type: 'stylesheet', url: 'https://example.com/style.css', requestId: 'r-1' }))
    // Script request
    requireListener(
      harness.listeners.beforeRequest,
      'beforeRequest'
    )(beforeRequest({ type: 'script', url: 'https://example.com/app.js', requestId: 'r-2' }))
    await flushStorageWrites()

    const pending = harness.service.getPendingRequests()
    expect(pending.find((r) => r.id === '10-r-1')).toBeUndefined()
    expect(pending.find((r) => r.id === '10-r-2')).toBeDefined()
  })

  it('filters requests by resource type - stylesheet with font extension', async () => {
    const harness = createServiceWithAdvanced({
      ...DEFAULT_ADVANCED,
      recordCss: false,
    })

    // Font file request (should be filtered by extension)
    requireListener(
      harness.listeners.beforeRequest,
      'beforeRequest'
    )(beforeRequest({ type: 'image', url: 'https://example.com/font.woff2', requestId: 'r-1' }))
    await flushStorageWrites()

    const pending = harness.service.getPendingRequests()
    expect(pending.find((r) => r.id === '10-r-1')).toBeUndefined()
  })

  it('filters requests by resource type - image', async () => {
    const harness = createServiceWithAdvanced({
      ...DEFAULT_ADVANCED,
      recordImages: false,
    })

    // Image request
    requireListener(
      harness.listeners.beforeRequest,
      'beforeRequest'
    )(beforeRequest({ type: 'image', url: 'https://example.com/photo.png', requestId: 'r-1' }))
    // Script request
    requireListener(
      harness.listeners.beforeRequest,
      'beforeRequest'
    )(beforeRequest({ type: 'script', url: 'https://example.com/app.js', requestId: 'r-2' }))
    await flushStorageWrites()

    const pending = harness.service.getPendingRequests()
    expect(pending.find((r) => r.id === '10-r-1')).toBeUndefined()
    expect(pending.find((r) => r.id === '10-r-2')).toBeDefined()
  })

  it('filters requests by resource type - xmlhttprequest', async () => {
    const harness = createServiceWithAdvanced({
      ...DEFAULT_ADVANCED,
      recordJs: false,
    })

    // XHR request
    requireListener(
      harness.listeners.beforeRequest,
      'beforeRequest'
    )(
      beforeRequest({
        type: 'xmlhttprequest',
        url: 'https://api.example.com/data',
        requestId: 'r-1',
      })
    )
    // Stylesheet request
    requireListener(
      harness.listeners.beforeRequest,
      'beforeRequest'
    )(beforeRequest({ type: 'stylesheet', url: 'https://example.com/style.css', requestId: 'r-2' }))
    await flushStorageWrites()

    const pending = harness.service.getPendingRequests()
    expect(pending.find((r) => r.id === '10-r-1')).toBeUndefined()
    expect(pending.find((r) => r.id === '10-r-2')).toBeDefined()
  })

  it('blocks all requests when all resource types unchecked', async () => {
    const harness = createServiceWithAdvanced({
      ...DEFAULT_ADVANCED,
      recordCss: false,
      recordJs: false,
      recordImages: false,
    })

    // Script request
    requireListener(
      harness.listeners.beforeRequest,
      'beforeRequest'
    )(beforeRequest({ type: 'script', url: 'https://example.com/app.js', requestId: 'r-1' }))
    // Stylesheet request
    requireListener(
      harness.listeners.beforeRequest,
      'beforeRequest'
    )(beforeRequest({ type: 'stylesheet', url: 'https://example.com/style.css', requestId: 'r-2' }))
    // Image request
    requireListener(
      harness.listeners.beforeRequest,
      'beforeRequest'
    )(beforeRequest({ type: 'image', url: 'https://example.com/photo.png', requestId: 'r-3' }))
    await flushStorageWrites()

    const pending = harness.service.getPendingRequests()
    expect(pending.length).toBe(0)
  })

  it('filters redirects when recordRedirects is false', async () => {
    const harness = createServiceWithAdvanced({
      ...DEFAULT_ADVANCED,
      recordRedirects: false,
    })

    // Initial request
    requireListener(
      harness.listeners.beforeRequest,
      'beforeRequest'
    )(beforeRequest({ url: 'https://example.com/redirect', requestId: 'r-1' }))
    // Response is a redirect
    requireListener(
      harness.listeners.responseStarted,
      'responseStarted'
    )(
      responseStarted({
        requestId: 'r-1',
        statusCode: 302,
        responseHeaders: [{ name: 'location', value: '/new' }],
      })
    )
    // Completed redirect response
    requireListener(
      harness.listeners.completed,
      'completed'
    )(
      completed({
        requestId: 'r-1',
        statusCode: 302,
        responseHeaders: [{ name: 'location', value: '/new' }],
      })
    )
    await flushStorageWrites()

    // Redirect response should be filtered
    expect(harness.requests.length).toBe(0)
  })

  it('captures redirects when recordRedirects is true', async () => {
    const harness = createServiceWithAdvanced({
      ...DEFAULT_ADVANCED,
      recordRedirects: true,
    })

    // Initial request
    requireListener(
      harness.listeners.beforeRequest,
      'beforeRequest'
    )(beforeRequest({ url: 'https://example.com/redirect', requestId: 'r-1' }))
    // Response is a redirect
    requireListener(
      harness.listeners.responseStarted,
      'responseStarted'
    )(
      responseStarted({
        requestId: 'r-1',
        statusCode: 302,
        responseHeaders: [{ name: 'location', value: '/new' }],
      })
    )
    // Completed redirect response
    requireListener(
      harness.listeners.completed,
      'completed'
    )(
      completed({
        requestId: 'r-1',
        statusCode: 302,
        responseHeaders: [{ name: 'location', value: '/new' }],
      })
    )
    await flushStorageWrites()

    // Redirect response should be captured
    expect(harness.requests.length).toBe(1)
    expect(harness.requests[0]?.statusCode).toBe(302)
  })
})
