import { describe, expect, it } from 'vitest'
import { createPendingRequest } from './traffic-normalizer'
import { PendingWebRequestStore, PENDING_FRAGMENT_MAX_AGE_MS } from './pending-web-request-store'
import { isPendingWebRequestState } from '../models/pending-web-request'

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

  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.values.entries())
  }
}

const NOW = new Date('2024-01-01T00:00:00.000Z')
const NOW_MS = NOW.getTime()

function beforeRequest(overrides: Partial<chrome.webRequest.OnBeforeRequestDetails> = {}) {
  return {
    documentLifecycle: 'active',
    frameId: 0,
    frameType: 'outermost_frame',
    method: 'POST',
    parentFrameId: -1,
    requestId: 'r-1',
    tabId: 10,
    timeStamp: NOW_MS,
    type: 'xmlhttprequest',
    url: 'https://api.example.com/submit?tenant=acme',
    ...overrides,
  } as chrome.webRequest.OnBeforeRequestDetails
}

describe('PendingWebRequestStore', () => {
  it('loads an empty state when no pending requests have been persisted', async () => {
    const storage = new MemoryStorage()
    const store = new PendingWebRequestStore(storage)

    await expect(store.load(NOW)).resolves.toEqual({})
  })

  it('persists and recovers pending request fragments', async () => {
    const storage = new MemoryStorage()
    const store = new PendingWebRequestStore(storage)
    const pending = createPendingRequest(beforeRequest())

    await store.upsert(pending, new Date('2024-01-01T00:00:00.000Z'))

    await expect(store.load(NOW)).resolves.toEqual({
      [pending.id]: {
        ...pending,
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    })
    expect(storage.snapshot()).toHaveProperty('pendingWebRequests')
  })

  it('removes a pending request fragment', async () => {
    const storage = new MemoryStorage()
    const store = new PendingWebRequestStore(storage)
    const pending = createPendingRequest(beforeRequest())

    await store.upsert(pending)
    await store.remove(pending.id)

    await expect(store.load(NOW)).resolves.toEqual({})
  })

  it('clears all pending request fragments', async () => {
    const storage = new MemoryStorage()
    const store = new PendingWebRequestStore(storage)
    const pending = createPendingRequest(beforeRequest())

    await store.upsert(pending)
    await store.clear()

    await expect(store.load(NOW)).resolves.toEqual({})
    expect(storage.snapshot()).toEqual({
      pendingWebRequests: {
        version: 1,
        fragments: {},
        updatedAt: expect.any(String),
      },
    })
  })

  it('prunes stale pending request fragments older than 5 minutes', async () => {
    const storage = new MemoryStorage()
    const store = new PendingWebRequestStore(storage)
    const fresh = createPendingRequest(beforeRequest({ requestId: 'fresh' }))
    // Stale timestamp: more than 5 minutes (PENDING_FRAGMENT_MAX_AGE_MS) in the past
    const staleTimestamp = NOW_MS - PENDING_FRAGMENT_MAX_AGE_MS - 10_000
    const stale = createPendingRequest(
      beforeRequest({ requestId: 'stale', timeStamp: staleTimestamp })
    )

    await store.upsert(fresh, NOW)
    await store.upsert(stale, NOW)

    await expect(store.load(NOW)).resolves.toEqual({
      [fresh.id]: {
        ...fresh,
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    })
  })

  it('evicts fragments for closed tabs when using loadExcludingClosedTabs', async () => {
    const storage = new MemoryStorage()
    const store = new PendingWebRequestStore(storage)
    const tab10 = createPendingRequest(beforeRequest({ requestId: 'tab-10', tabId: 10 }))
    const tab20 = createPendingRequest(beforeRequest({ requestId: 'tab-20', tabId: 20 }))

    await store.upsert(tab10, NOW)
    await store.upsert(tab20, NOW)

    // Only tab 10 is open; tab 20's fragment should be evicted
    await expect(store.loadExcludingClosedTabs([10], NOW)).resolves.toEqual({
      [tab10.id]: {
        ...tab10,
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    })
  })

  it('evicts stale fragments even when all tabs are open', async () => {
    const storage = new MemoryStorage()
    const store = new PendingWebRequestStore(storage)
    const fresh = createPendingRequest(beforeRequest({ requestId: 'fresh', tabId: 10 }))
    const staleTimestamp = NOW_MS - PENDING_FRAGMENT_MAX_AGE_MS - 10_000
    const stale = createPendingRequest(
      beforeRequest({ requestId: 'stale', tabId: 10, timeStamp: staleTimestamp })
    )

    await store.upsert(fresh, NOW)
    await store.upsert(stale, NOW)

    // Both tabs open, but stale should still be evicted
    await expect(store.loadExcludingClosedTabs([10], NOW)).resolves.toEqual({
      [fresh.id]: {
        ...fresh,
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    })
  })

  it('validates pending web request state shape', () => {
    const pending = createPendingRequest(beforeRequest())

    expect(isPendingWebRequestState({ version: 1, fragments: { [pending.id]: pending } })).toBe(
      true
    )
    expect(
      isPendingWebRequestState({ version: 1, fragments: { invalid: { id: 'invalid' } } })
    ).toBe(false)
    expect(isPendingWebRequestState({ version: 2, fragments: {} })).toBe(false)
  })

  it('ignores invalid persisted state', async () => {
    const storage = new MemoryStorage()
    await storage.set({
      pendingWebRequests: {
        version: 1,
        fragments: {
          invalid: { id: 'invalid' },
        },
      },
    })
    const store = new PendingWebRequestStore(storage)

    await expect(store.load(NOW)).resolves.toEqual({})
  })
})
