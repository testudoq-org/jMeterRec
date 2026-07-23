import { describe, expect, it, vi } from 'vitest'
import { RecorderState } from './recorder-state'
import type { CapturedRequest, ActionStep } from '../models/captured-request'

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

  it('adds action steps while recording', async () => {
    const storage = new MemoryStorage()
    const state = new RecorderState(storage)

    await state.load()
    state.start('Action Plan')

    const action: ActionStep = {
      type: 'action',
      command: 'click',
      target: '#submit-button',
    }

    state.addAction(action)
    expect(state.getActions()).toHaveLength(1)
    expect(state.getActions()[0]).toEqual(action)
  })

  it('does not add actions while paused or stopped', () => {
    const storage = new MemoryStorage()
    const state = new RecorderState(storage)

    const action: ActionStep = {
      type: 'action',
      command: 'click',
      target: '#submit-button',
    }

    state.addAction(action)
    expect(state.getActions()).toHaveLength(0)

    state.start('Paused Action Plan')
    state.pause()
    state.addAction(action)
    expect(state.getActions()).toHaveLength(0)
  })

  it('clears actions on reset', async () => {
    const storage = new MemoryStorage()
    const set = vi.fn(storage.set.bind(storage))
    const state = new RecorderState(storage, set)

    await state.load()
    state.start('Old Action Plan')
    state.addAction({ type: 'action', command: 'click', target: '#btn' })
    state.reset()
    await state.save()

    expect(state.getActions()).toEqual([])
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ actions: [] }))
  })

  // Hardening audit tests: state transition edge cases
  it('handles start → reset transition correctly', async () => {
    const storage = new MemoryStorage()
    const state = new RecorderState(storage)

    await state.load()
    state.start('Reset Plan', 5)
    state.addRequest(request('one'))

    expect(state.getSnapshot().status).toBe('recording')

    state.reset()
    await state.save()

    expect(state.getSnapshot()).toMatchObject({
      status: 'idle',
      planName: 'Untitled Plan',
      requestCount: 0,
    })
    expect(state.getRequests()).toEqual([])
  })

  it('handles stop → reset transition correctly', async () => {
    const storage = new MemoryStorage()
    const state = new RecorderState(storage)

    await state.load()
    state.start('Stop-Reset Plan')
    state.addRequest(request('captured'))
    await state.save()

    state.stop()
    await state.save()

    expect(state.getSnapshot().status).toBe('idle')
    expect(state.getRequests()).toEqual([request('captured')])

    state.reset()
    await state.save()

    expect(state.getRequests()).toEqual([])
  })

  it('ignores pause when already idle', () => {
    const storage = new MemoryStorage()
    const state = new RecorderState(storage)

    state.pause()
    expect(state.getSnapshot().status).toBe('idle')
  })

  it('ignores resume when already recording', async () => {
    const storage = new MemoryStorage()
    const state = new RecorderState(storage)

    await state.load()
    state.start('Resume Test')
    state.resume()
    expect(state.getSnapshot().status).toBe('recording')
  })

  // Invalid payload handling tests
  it('rejects requests with missing required fields on load', async () => {
    const storage = new MemoryStorage()
    await storage.set({
      status: 'recording',
      requests: [
        { id: '1', timestamp: '2024-01-01T00:00:00Z' }, // Missing method and url
        { id: '2', method: 'GET', url: 'https://valid.com' }, // Missing timestamp
      ],
    })

    const state = new RecorderState(storage)
    await state.load()

    // Invalid requests should be filtered out
    expect(state.getRequests()).toEqual([])
  })

  it('rejects actions with invalid structure on load', async () => {
    const storage = new MemoryStorage()
    await storage.set({
      status: 'recording',
      actions: [
        { type: 'action', command: 'click' }, // Missing target
        { type: 'invalid', command: 'click', target: '#btn' }, // Wrong type
      ],
    })

    const state = new RecorderState(storage)
    await state.load()

    // Invalid actions should be filtered out
    expect(state.getActions()).toEqual([])
  })
})
