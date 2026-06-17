import { describe, expect, it } from 'vitest'
import { createPendingRequest } from './traffic-normalizer'
import { PendingWebRequestStore } from './pending-web-request-store'
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

  it('prunes stale pending request fragments', async () => {
    const storage = new MemoryStorage()
    const store = new PendingWebRequestStore(storage)
    const fresh = createPendingRequest(beforeRequest({ requestId: 'fresh' }))
    const stale = createPendingRequest(
      beforeRequest({ requestId: 'stale', timeStamp: 1_000_000_000_000 })
    )

    await store.upsert(fresh, new Date('2024-01-01T00:00:00.000Z'))
    await store.upsert(stale, new Date('2023-01-01T00:00:00.000Z'))
    await store.prune(10 * 60 * 1000, new Date('2024-01-01T00:00:00.000Z'))

    await expect(store.load(new Date('2024-01-01T00:00:00.000Z'))).resolves.toEqual({
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
