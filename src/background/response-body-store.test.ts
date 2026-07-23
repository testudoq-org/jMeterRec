import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResponseBodyStorage, RecordedResponseBody } from './response-body-store'
import { ResponseBodyStore } from './response-body-store'

const createStorage = (
  seed: Record<string, unknown> = {}
): {
  storage: ResponseBodyStorage
  setter: (values: Record<string, unknown>) => Promise<void>
} => {
  const state = { current: { ...seed } }

  const storage: ResponseBodyStorage = {
    get: vi.fn(async (keys: string[]) => {
      const result: Record<string, unknown> = {}
      keys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(state.current, key)) {
          result[key] = state.current[key]
        }
      })
      return result
    }),
    set: vi.fn(async (values: Record<string, unknown>) => {
      state.current = { ...state.current, ...values }
    }),
  }

  return { storage, setter: storage.set }
}

const buildPayload = (
  requestId = 'req-1',
  capturedAtMs = Date.now()
): RecordedResponseBody['payload'] => ({
  requestId,
  tabId: 1,
  frameId: 0,
  url: 'https://example.com/api',
  method: 'GET',
  status: 200,
  responseHeaders: {},
  body: 'hello',
  error: undefined,
  truncated: false,
  redacted: false,
  size: 5,
  capturedAtMs,
  contentType: 'application/json',
})

describe('ResponseBodyStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns an empty array when nothing is stored', async () => {
    const { storage, setter } = createStorage()
    const store = new ResponseBodyStore(storage, setter)

    const loaded = await store.load()
    expect(loaded).toEqual([])
  })

  it('survives an empty persistence read', async () => {
    const { storage, setter } = createStorage()
    const store = new ResponseBodyStore(storage, setter)

    const loaded = await store.load()
    expect(loaded).toEqual([])
  })

  it('clears all stored entries', async () => {
    const { storage, setter } = createStorage()
    const store = new ResponseBodyStore(storage, setter)

    const payload = buildPayload()
    await store.store(payload)
    await store.clear()
    const loaded = await store.load()
    expect(loaded).toEqual([])
  })

  it('discards known-bad persisted payloads', async () => {
    const { storage, setter } = createStorage({
      responseBodies: { bad: { payload: null, insertedAt: 'not-a-number' } },
    })
    const store = new ResponseBodyStore(storage, setter)

    const loaded = await store.load()
    expect(loaded).toEqual([])
  })
})
