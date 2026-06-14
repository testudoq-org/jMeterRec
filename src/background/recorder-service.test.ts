import { describe, expect, it, vi } from 'vitest'
import { RecorderService } from './recorder-service'
import type { RecorderState } from './recorder-state'
import type { TrafficCaptureService } from './traffic-capture'
import type { ActionStep } from '../models/captured-request'

const createMockState = (): RecorderState => {
  const actions: ActionStep[] = []
  const requests: unknown[] = []

  return {
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    addAction: vi.fn((action: ActionStep) => actions.push(action)),
    addRequest: vi.fn(),
    clearRequests: vi.fn(),
    getSnapshot: vi.fn(() => ({
      status: 'idle' as const,
      recording: false,
      planName: 'Test Plan',
      requestCount: 0,
    })),
    getRequests: vi.fn(() => [...requests]),
    getActions: vi.fn(() => [...actions]),
    save: vi.fn(),
    load: vi.fn(),
    isCapturing: vi.fn(() => false),
    reset: vi.fn(),
  } as unknown as RecorderState
}

const createMockTrafficCapture = (): TrafficCaptureService => {
  return {
    start: vi.fn(),
  } as unknown as TrafficCaptureService
}

describe('RecorderService', () => {
  it('handles ADD_ACTION message and saves state', async () => {
    const mockState = createMockState()
    const service = new RecorderService({
      state: mockState,
      trafficCapture: createMockTrafficCapture(),
    })

    const actionStep: ActionStep = {
      type: 'action',
      command: 'click',
      target: '#button',
    }

    const response = await service.handleMessage({
      type: 'ADD_ACTION',
      action: actionStep,
    })

    expect(response.success).toBe(true)
    expect(mockState.addAction).toHaveBeenCalledWith(actionStep)
    expect(mockState.save).toHaveBeenCalled()
  })
})
