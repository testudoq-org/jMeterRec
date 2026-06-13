import { describe, expect, it, vi } from 'vitest'
import { RecorderState } from './recorder-state'
import type { CapturedRequest } from '../models/captured-request'

class MemoryStorage {
  private values = new Map<string, unknown>()

  async get(): Promise<Record<string, unknown>> {
    return Object.fromEntries(this.values.entries())
  }

  async set(values: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(values)) {
      this.values.set(key, value)
    }
  }
}

function request(id: string): CapturedRequest {
  return {
    id,
    timestamp: '2024-01-01T00:00:00.000Z',
    method: 'GET',
    url: `https://example.com/${id}`,
    headers: {},
    queryParams: {},
  }
}

describe('RecorderState', () => {
  it('starts, pauses, resumes, and stops recording', async () => {
    const storage = new MemoryStorage()
    const state = new RecorderState(storage)

    await state.load()
    state.start('Smoke Plan', 1)

    expect(state.getSnapshot()).toMatchObject({
      status: 'recording',
      planName: 'Smoke Plan',
      tabId: 1,
    })
    expect(state.isCapturing()).toBe(true)

    state.pause()
    expect(state.getSnapshot().status).toBe('paused')
    expect(state.isCapturing()).toBe(false)

    state.resume()
    expect(state.getSnapshot().status).toBe('recording')
    expect(state.isCapturing()).toBe(true)

    state.stop()
    expect(state.getSnapshot().status).toBe('idle')
    expect(state.isCapturing()).toBe(false)
  })

  it('persists requests and restores them after a service-worker restart', async () => {
    const storage = new MemoryStorage()
    const first = new RecorderState(storage)

    await first.load()
    first.start('Restore Plan')
    first.addRequest(request('one'))
    first.addRequest(request('two'))
    await first.save()

    const second = new RecorderState(storage)
    await second.load()

    expect(second.getSnapshot().status).toBe('recording')
    expect(second.getRequests()).toEqual([request('one'), request('two')])
  })

  it('does not add requests while paused or stopped', () => {
    const storage = new MemoryStorage()
    const state = new RecorderState(storage)

    state.addRequest(request('ignored'))
    expect(state.getRequests()).toEqual([])

    state.start('Paused Plan')
    state.pause()
    state.addRequest(request('paused'))
    expect(state.getRequests()).toEqual([])
  })

  it('clears requests and plan metadata on reset', async () => {
    const storage = new MemoryStorage()
    const set = vi.fn(storage.set.bind(storage))
    const state = new RecorderState(storage, set)

    await state.load()
    state.start('Old Plan')
    state.addRequest(request('old'))
    state.reset()
    await state.save()

    expect(state.getSnapshot()).toMatchObject({
      status: 'idle',
      planName: 'Untitled Plan',
      requestCount: 0,
    })
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ requests: [] }))
  })
})
