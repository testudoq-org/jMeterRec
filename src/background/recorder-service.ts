import { buildJmx } from '../jmx/serializer'
import { filterRequestsByDomains } from '../jmx/domains'
import { buildPlaywrightResponse } from '../generators/playwright'
import type { BackgroundRequest, BackgroundResponse, RecorderSnapshot } from '../messages'
import type { CapturedRequest, PlanMeta, PlaywrightStep } from '../models/captured-request'
import { RecorderState } from './recorder-state'
import { TrafficCaptureService } from './traffic-capture'

export interface RecorderServiceOptions {
  state?: RecorderState
  trafficCapture?: TrafficCaptureService
}

export class RecorderService {
  private readonly state: RecorderState
  private readonly trafficCapture: TrafficCaptureService
  private initialized = false

  constructor(options: RecorderServiceOptions = {}) {
    this.state = options.state ?? new RecorderState()
    this.trafficCapture = options.trafficCapture ?? new TrafficCaptureService(this.state)
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.state.load()
    this.trafficCapture.start()
    this.initialized = true
  }

  async startRecording(planName: string, tabId?: number): Promise<void> {
    this.state.start(planName, tabId)
    await this.state.save()
    this.broadcastState()
  }

  async stopRecording(): Promise<CapturedRequest[]> {
    const requests = this.state.getRequests()
    this.state.stop()
    await this.state.save()
    this.broadcastState()
    return requests
  }

  async pauseRecording(): Promise<void> {
    this.state.pause()
    await this.state.save()
    this.broadcastState()
  }

  async resumeRecording(): Promise<void> {
    this.state.resume()
    await this.state.save()
    this.broadcastState()
  }

  async clearRequests(): Promise<void> {
    this.state.clearRequests()
    await this.state.save()
    this.broadcastState()
  }

  async reset(): Promise<void> {
    this.state.reset()
    await this.state.save()
    this.broadcastState()
  }

  getSnapshot(): RecorderSnapshot {
    return this.state.getSnapshot()
  }

  getRequests(): CapturedRequest[] {
    return this.state.getRequests()
  }

  getDomains(): string[] {
    return this.state.getDomains()
  }

  async handleMessage(message: BackgroundRequest): Promise<BackgroundResponse> {
    try {
      switch (message.type) {
        case 'START_RECORDING':
          await this.startRecording(message.planName, message.tabId)
          return { success: true, snapshot: this.getSnapshot() }
        case 'STOP_RECORDING': {
          const requestCount = (await this.stopRecording()).length
          return { success: true, requestCount }
        }
        case 'PAUSE_RECORDING':
          await this.pauseRecording()
          return { success: true, snapshot: this.getSnapshot() }
        case 'RESUME_RECORDING':
          await this.resumeRecording()
          return { success: true, snapshot: this.getSnapshot() }
        case 'GET_STATE':
          return { success: true, snapshot: this.getSnapshot() }
        case 'GET_REQUESTS':
          return { success: true, requests: this.getRequests() }
        case 'GET_DOMAINS':
          return { success: true, domains: this.getDomains() }
        case 'CLEAR_REQUESTS':
          await this.clearRequests()
          return { success: true, snapshot: this.getSnapshot() }
        case 'RESET':
          await this.reset()
          return { success: true, snapshot: this.getSnapshot() }
        case 'ADD_ACTION': {
          this.addAction(message)
          await this.state.save()
          return { success: true }
        }
        case 'EXPORT_JMX':
          return this.buildJmxExportResponse(message.includedDomains)
        case 'EXPORT_PLAYWRIGHT':
          return this.buildPlaywrightExportResponse(message)
        default:
          return unreachable(message)
      }
    } catch (err) {
      return { success: false, error: toErrorMessage(err) }
    }
  }

  private addAction(message: Extract<BackgroundRequest, { type: 'ADD_ACTION' }>): void {
    this.state.addAction(message.action)
  }

  private buildJmxExportResponse(includedDomains: string[]): BackgroundResponse {
    if (includedDomains.length === 0) {
      return { success: false, error: 'Select at least one domain before exporting JMX.' }
    }

    const requests = filterRequestsByDomains(this.state.getRequests(), includedDomains)

    if (requests.length === 0) {
      return { success: false, error: 'No requests match the selected domains.' }
    }

    const meta: PlanMeta = {
      name: this.state.getSnapshot().planName,
      threadGroup: { threads: 1, rampUp: 1, loops: 1 },
    }

    return {
      success: true,
      jmx: buildJmx(meta, requests),
      filename: `${safeFilename(this.state.getSnapshot().planName)}.jmx`,
    }
  }

  private buildPlaywrightExportResponse(
    message: Extract<BackgroundRequest, { type: 'EXPORT_PLAYWRIGHT' }>
  ): BackgroundResponse {
    const snapshot = this.state.getSnapshot()
    const meta = {
      testCaseName: message.testCaseName ?? snapshot.planName,
      baseUrl: message.baseUrl,
    }

    const httpSteps: PlaywrightStep[] = this.state.getRequests().map((req) => ({
      ...req,
      stepType: 'http' as const,
    }))

    const actionSteps: PlaywrightStep[] = this.state.getActions()

    const steps: PlaywrightStep[] = [...httpSteps, ...actionSteps]

    const result = buildPlaywrightResponse(meta, steps)
    return {
      success: true,
      playwright: result.playwright,
      filename: result.filename,
    }
  }

  private broadcastState(): void {
    chrome.runtime
      .sendMessage({ type: 'STATE_CHANGED', snapshot: this.state.getSnapshot() })
      .catch((err: unknown) => {
        console.warn('Unable to broadcast recorder state.', err)
      })
  }
}

function safeFilename(value: string): string {
  const filename = value.trim().replace(/[^a-z0-9._-]+/gi, '-')

  return filename.length > 0 ? filename : 'Untitled-Plan'
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unexpected recorder error'
}

function unreachable(value: never): BackgroundResponse {
  return { success: false, error: `Unsupported message type: ${String(value)}` }
}
