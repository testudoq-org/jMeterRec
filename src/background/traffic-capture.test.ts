import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecorderState } from './recorder-state'
import { TrafficCaptureService } from './traffic-capture'
import { PendingWebRequestStore } from './pending-web-request-store'
import type { CapturedRequest } from '../models/captured-request'

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
  } as unknown as RecorderState

  return { state, requests }
}

async function createService(storage: MemoryStorage, isCapturing = true): Promise<ServiceHarness> {
  const listeners: CapturedListeners = {}
  stubChrome(listeners)

  const pendingStore = new PendingWebRequestStore(storage)
  const { state, requests } = createState(isCapturing)
  const service = new TrafficCaptureService(state, pendingStore)

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

function completed(overrides: Partial<chrome.webRequest.OnCompletedDetails> = {}): chrome.webRequest.OnCompletedDetails {
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

function errorOccurred(overrides: Partial<chrome.webRequest.OnErrorOccurredDetails> = {}): chrome.webRequest.OnErrorOccurredDetails {
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
