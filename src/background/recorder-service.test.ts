import { describe, expect, it, vi } from 'vitest'
import { RecorderService } from './recorder-service'
import type { RecorderState } from './recorder-state'
import type { TrafficCaptureService } from './traffic-capture'
import type { ActionStep, CapturedRequest } from '../models/captured-request'
import type { JmxOptionsStore } from '../options/jmx-options'
import { DEFAULT_JMX_OPTIONS } from '../options/jmx-options'

const createMockState = (): RecorderState => {
  const actions: ActionStep[] = []
  const requests: CapturedRequest[] = []

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
    getDomains: vi.fn(() =>
      [
        ...new Set(
          requests
            .map((requestValue) => {
              try {
                return new URL(requestValue.url).hostname.toLowerCase()
              } catch {
                return undefined
              }
            })
            .filter((domain): domain is string => domain !== undefined)
        ),
      ].sort()
    ),
    getActions: vi.fn(() => [...actions]),
    save: vi.fn(),
    load: vi.fn(),
    isCapturing: vi.fn(() => false),
    reset: vi.fn(),
  } as unknown as RecorderState
}

const createMockTrafficCapture = (): TrafficCaptureService => {
  return {
    start: vi.fn(async () => undefined),
    clearPending: vi.fn(async () => undefined),
  } as unknown as TrafficCaptureService
}

const createMockJmxOptionsStore = (options = DEFAULT_JMX_OPTIONS): JmxOptionsStore => {
  return {
    load: vi.fn(async () => ({ ...options })),
  } as unknown as JmxOptionsStore
}

function request(id: string, url: string): CapturedRequest {
  return {
    id,
    timestamp: '2024-01-01T00:00:00.000Z',
    method: 'GET',
    url,
    headers: {},
    queryParams: {},
  }
}

describe('RecorderService', () => {
  it('handles ADD_ACTION message and saves state', async () => {
    const mockState = createMockState()
    const service = new RecorderService({
      state: mockState,
      trafficCapture: createMockTrafficCapture(),
      jmxOptionsStore: createMockJmxOptionsStore(),
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

  it('returns sorted domains for GET_DOMAINS', async () => {
    const mockState = createMockState()
    const service = new RecorderService({
      state: mockState,
      trafficCapture: createMockTrafficCapture(),
      jmxOptionsStore: createMockJmxOptionsStore(),
    })

    const response = await service.handleMessage({ type: 'GET_DOMAINS' })

    expect(response).toEqual({ success: true, domains: [] })
    expect(mockState.getDomains).toHaveBeenCalled()
  })

  it('exports JMX for selected domains only', async () => {
    const mockState = createMockState()
    const googleRequest = request('google', 'https://www.google.com/search?q=scotland+worldcup')
    const exampleRequest = request('example', 'https://example.com/api')
    const requests: CapturedRequest[] = [googleRequest, exampleRequest]

    mockState.getRequests = vi.fn(() => [...requests])
    mockState.getDomains = vi.fn(() => ['example.com', 'www.google.com'])
    mockState.getSnapshot = vi.fn(() => ({
      status: 'idle' as const,
      recording: false,
      planName: 'Selected Domains Plan',
      requestCount: requests.length,
    }))

    const service = new RecorderService({
      state: mockState,
      trafficCapture: createMockTrafficCapture(),
      jmxOptionsStore: createMockJmxOptionsStore(),
    })

    const response = await service.handleMessage({
      type: 'EXPORT_JMX',
      includedDomains: ['example.com'],
    })

    expect(response.success).toBe(true)
    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        filename: 'Selected-Domains-Plan.jmx',
      })
    )

    if (!response.success || !('jmx' in response)) {
      throw new Error('Expected successful JMX export response')
    }

    expect(response.jmx).toContain('example.com')
    expect(response.jmx).not.toContain('www.google.com')
  })

  it('uses saved JMX options for export metadata', async () => {
    const mockState = createMockState()
    const requests = [request('example', 'https://example.com/api')]

    mockState.getRequests = vi.fn(() => [...requests])
    mockState.getSnapshot = vi.fn(() => ({
      status: 'idle' as const,
      recording: false,
      planName: 'Untitled Plan',
      requestCount: requests.length,
    }))

    const service = new RecorderService({
      state: mockState,
      trafficCapture: createMockTrafficCapture(),
      jmxOptionsStore: createMockJmxOptionsStore({
        name: 'Saved Load Plan',
        threads: 4,
        rampUp: 5,
        loops: 6,
        thinkTimeEnabled: false,
        thinkTimeRandomize: false,
        thinkTimeRangePercent: 20,
        assertionsEnabled: false,
        assertionExpectStatus: 200,
        redirectDedupEnabled: false,
      }),
    })

    const response = await service.handleMessage({
      type: 'EXPORT_JMX',
      includedDomains: ['example.com'],
    })

    expect(response.success).toBe(true)

    if (!response.success || !('jmx' in response)) {
      throw new Error('Expected successful JMX export response')
    }

    expect(response.filename).toBe('Saved-Load-Plan.jmx')
    expect(response.jmx).toContain('testname="Saved Load Plan"')
    expect(response.jmx).toContain('<stringProp name="ThreadGroup.num_threads">4</stringProp>')
    expect(response.jmx).toContain('<stringProp name="ThreadGroup.ramp_time">5</stringProp>')
    expect(response.jmx).toContain('<stringProp name="LoopController.loops">6</stringProp>')
  })

  it('rejects JMX export when no domains are selected', async () => {
    const mockState = createMockState()
    const service = new RecorderService({
      state: mockState,
      trafficCapture: createMockTrafficCapture(),
      jmxOptionsStore: createMockJmxOptionsStore(),
    })

    const response = await service.handleMessage({
      type: 'EXPORT_JMX',
      includedDomains: [],
    })

    expect(response).toEqual({
      success: false,
      error: 'Select at least one domain before exporting JMX.',
    })
  })

  it('returns an error when selected domains match no captured requests', async () => {
    const mockState = createMockState()
    const service = new RecorderService({
      state: mockState,
      trafficCapture: createMockTrafficCapture(),
      jmxOptionsStore: createMockJmxOptionsStore(),
    })

    mockState.getRequests = vi.fn(() => [request('empty', 'https://example.com/only')])
    mockState.getSnapshot = vi.fn(() => ({
      status: 'idle' as const,
      recording: false,
      planName: 'Test Plan',
      requestCount: 1,
    }))

    const response = await service.handleMessage({
      type: 'EXPORT_JMX',
      includedDomains: ['nonexistent.example'],
    })

    expect(response).toEqual({
      success: false,
      error: 'No requests match the selected domains.',
    })
  })
})



