import { buildJmx } from '../jmx/serializer'
import { filterRequestsByDomains } from '../jmx/domains'
import { buildPlaywrightResponse } from '../generators/playwright'
import { JmxOptionsStore } from '../options/jmx-options'
import type { JmxOptions } from '../options/jmx-options'
import { normalizeBackendUploadConfig } from '../options/backend-upload-options'
import { safeFilename } from '../utils/filename'
import type { BackgroundRequest, BackgroundResponse, RecorderSnapshot } from '../messages'
import { PendingWebRequestStore } from './pending-web-request-store'
import { ResponseBodyMatchingService } from './response-body-matching-service'
import { applyCapturedResponseBody } from './traffic-normalizer'
import type { PendingRequest } from './traffic-normalizer'
import type { CapturedRequest, PlanMeta, PlaywrightStep } from '../models/captured-request'
import { RecorderState } from './recorder-state'
import { TrafficCaptureService } from './traffic-capture'
import { BackendUploadService } from './backend-upload-service'

type MessageHandler = (message: BackgroundRequest) => Promise<BackgroundResponse>
type ContentRecorderMessage =
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING' }
  | { type: 'PAUSE_RECORDING' }
  | { type: 'RESUME_RECORDING' }
  | { type: 'RESET' }

export interface RecorderServiceOptions {
  state?: RecorderState
  trafficCapture?: TrafficCaptureService
  pendingStore?: PendingWebRequestStore
  jmxOptionsStore?: JmxOptionsStore
}

export class RecorderService {
  private readonly state: RecorderState
  private readonly trafficCapture: TrafficCaptureService
  private readonly handlers: Record<BackgroundRequest['type'], MessageHandler>
  private pendingStore: PendingWebRequestStore | undefined
  private jmxOptionsStore: JmxOptionsStore | undefined
  private responseBodyMatchingService = new ResponseBodyMatchingService()
  private initialized = false

  constructor(options: RecorderServiceOptions = {}) {
    this.state = options.state ?? new RecorderState()
    this.trafficCapture = options.trafficCapture ?? new TrafficCaptureService(this.state)
    this.pendingStore = options.pendingStore
    this.jmxOptionsStore = options.jmxOptionsStore
    this.handlers = {
      START_RECORDING: (message) =>
        this.handleStartRecordingMessage(
          message as Extract<BackgroundRequest, { type: 'START_RECORDING' }>
        ),
      STOP_RECORDING: () => this.handleStopRecordingMessage(),
      PAUSE_RECORDING: (message) =>
        this.handlePauseRecordingMessage(
          message as Extract<BackgroundRequest, { type: 'PAUSE_RECORDING' }>
        ),
      RESUME_RECORDING: (message) =>
        this.handleResumeRecordingMessage(
          message as Extract<BackgroundRequest, { type: 'RESUME_RECORDING' }>
        ),
      GET_STATE: () => this.handleGetStateMessage(),
      GET_REQUESTS: () => this.handleGetRequestsMessage(),
      GET_DOMAINS: () => this.handleGetDomainsMessage(),
      CLEAR_REQUESTS: (message) =>
        this.handleClearRequestsMessage(
          message as Extract<BackgroundRequest, { type: 'CLEAR_REQUESTS' }>
        ),
      RESET: (message) =>
        this.handleResetMessage(message as Extract<BackgroundRequest, { type: 'RESET' }>),
      ADD_ACTION: (message) =>
        this.handleAddActionMessage(message as Extract<BackgroundRequest, { type: 'ADD_ACTION' }>),
      EXPORT_JMX: (message) =>
        this.handleExportJmxMessage(message as Extract<BackgroundRequest, { type: 'EXPORT_JMX' }>),
      UPLOAD_JMX: (message) =>
        this.handleUploadJmxMessage(message as Extract<BackgroundRequest, { type: 'UPLOAD_JMX' }>),
      EXPORT_PLAYWRIGHT: (message) =>
        this.handleExportPlaywrightMessage(
          message as Extract<BackgroundRequest, { type: 'EXPORT_PLAYWRIGHT' }>
        ),
      RESPONSE_BODY_CAPTURED: (message) =>
        this.handleResponseBodyCapturedMessage(
          message as Extract<BackgroundRequest, { type: 'RESPONSE_BODY_CAPTURED' }>
        ),
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.state.load()
    const pendingStore = this.getPendingStore()
    const pendingFragments = await pendingStore.load()
    await this.trafficCapture.start(pendingFragments, this.state.isCapturing())
    this.initialized = true
  }

  async startRecording(planName: string, tabId?: number): Promise<void> {
    await this.getPendingStore().clear()
    this.state.start(planName, tabId)
    await this.state.save()
    this.broadcastState()
    this.broadcastRecorderMessage({ type: 'START_RECORDING' })
  }

  async stopRecording(): Promise<CapturedRequest[]> {
    const requests = this.state.getRequests()
    this.state.stop()
    await this.state.save()
    await this.getPendingStore().clear()
    this.broadcastState()
    this.broadcastRecorderMessage({ type: 'STOP_RECORDING' })
    return requests
  }

  async pauseRecording(): Promise<void> {
    this.state.pause()
    await this.state.save()
    this.broadcastState()
    this.broadcastRecorderMessage({ type: 'PAUSE_RECORDING' })
  }

  async resumeRecording(): Promise<void> {
    this.state.resume()
    await this.state.save()
    this.broadcastState()
    this.broadcastRecorderMessage({ type: 'RESUME_RECORDING' })
  }

  async clearRequests(): Promise<void> {
    this.state.clearRequests()
    await this.state.save()
    await this.getPendingStore().clear()
    this.broadcastState()
  }

  async reset(): Promise<void> {
    this.state.reset()
    await this.state.save()
    await this.getPendingStore().clear()
    this.broadcastState()
    this.broadcastRecorderMessage({ type: 'RESET' })
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

  private getPendingStore(): PendingWebRequestStore {
    if (this.pendingStore === undefined) {
      this.pendingStore = new PendingWebRequestStore()
    }

    return this.pendingStore
  }

  private getJmxOptionsStore(): JmxOptionsStore {
    if (this.jmxOptionsStore === undefined) {
      this.jmxOptionsStore = new JmxOptionsStore()
    }

    return this.jmxOptionsStore
  }

  private planNameForExport(options: JmxOptions): string {
    const snapshotPlanName = this.state.getSnapshot().planName

    return snapshotPlanName === 'Untitled Plan' ? options.name : snapshotPlanName
  }

  async handleMessage(message: BackgroundRequest): Promise<BackgroundResponse> {
    try {
      const handler = this.handlers[message.type]

      if (handler === undefined) {
        return unreachable(message as never)
      }

      return handler(message)
    } catch (err) {
      return { success: false, error: toErrorMessage(err) }
    }
  }

  private handleStartRecordingMessage(
    message: Extract<BackgroundRequest, { type: 'START_RECORDING' }>
  ): Promise<BackgroundResponse> {
    return this.startRecording(message.planName, message.tabId).then(() => ({
      success: true,
      snapshot: this.getSnapshot(),
    }))
  }

  private handleStopRecordingMessage(): Promise<BackgroundResponse> {
    return this.stopRecording().then((requests) => ({
      success: true,
      requestCount: requests.length,
    }))
  }

  private handlePauseRecordingMessage(
    _message: Extract<BackgroundRequest, { type: 'PAUSE_RECORDING' }>
  ): Promise<BackgroundResponse> {
    return this.pauseRecording().then(() => ({ success: true, snapshot: this.getSnapshot() }))
  }

  private handleResumeRecordingMessage(
    _message: Extract<BackgroundRequest, { type: 'RESUME_RECORDING' }>
  ): Promise<BackgroundResponse> {
    return this.resumeRecording().then(() => ({ success: true, snapshot: this.getSnapshot() }))
  }

  private handleGetStateMessage(): Promise<BackgroundResponse> {
    return Promise.resolve({ success: true, snapshot: this.getSnapshot() })
  }

  private handleGetRequestsMessage(): Promise<BackgroundResponse> {
    return Promise.resolve({ success: true, requests: this.getRequests() })
  }

  private handleGetDomainsMessage(): Promise<BackgroundResponse> {
    return Promise.resolve({ success: true, domains: this.getDomains() })
  }

  private handleClearRequestsMessage(
    _message: Extract<BackgroundRequest, { type: 'CLEAR_REQUESTS' }>
  ): Promise<BackgroundResponse> {
    return this.clearRequests().then(() => ({ success: true, snapshot: this.getSnapshot() }))
  }

  private handleResetMessage(
    _message: Extract<BackgroundRequest, { type: 'RESET' }>
  ): Promise<BackgroundResponse> {
    return this.reset().then(() => ({ success: true, snapshot: this.getSnapshot() }))
  }

  private async handleAddActionMessage(
    message: Extract<BackgroundRequest, { type: 'ADD_ACTION' }>
  ): Promise<BackgroundResponse> {
    this.addAction(message)
    await this.state.save()
    return { success: true }
  }

  private handleExportJmxMessage(
    message: Extract<BackgroundRequest, { type: 'EXPORT_JMX' }>
  ): Promise<BackgroundResponse> {
    return this.buildJmxExportResponse(message.includedDomains)
  }

  private handleUploadJmxMessage(
    message: Extract<BackgroundRequest, { type: 'UPLOAD_JMX' }>
  ): Promise<BackgroundResponse> {
    const config = normalizeBackendUploadConfig({
      enabled: true,
      converterUrl: message.payload.converterUrl,
      authToken: message.payload.authToken,
      timeoutMs: message.payload.timeoutMs,
      includeDomains: message.payload.includedDomains,
      exportFilename: message.payload.exportFilename,
    })

    const uploadService = new BackendUploadService()
    return uploadService.uploadAndDownload(config, this.state.getRequests())
  }

  private handleExportPlaywrightMessage(
    message: Extract<BackgroundRequest, { type: 'EXPORT_PLAYWRIGHT' }>
  ): Promise<BackgroundResponse> {
    return Promise.resolve(this.buildPlaywrightExportResponse(message))
  }

  private async handleResponseBodyCapturedMessage(
    message: Extract<BackgroundRequest, { type: 'RESPONSE_BODY_CAPTURED' }>
  ): Promise<BackgroundResponse> {
    const payload = message.payload
    const pending = this.trafficCapture.getPendingRequests()
    const completed = this.state.getRequests()
    const match = this.responseBodyMatchingService.findMatch(payload, pending, completed)

    if (match === undefined) {
      return { success: true }
    }

    const target = this.findRequestById(match.requestId, pending, completed)

    if (target === undefined) {
      return { success: true }
    }

    applyCapturedResponseBody(target, payload)

    if (!match.pending) {
      this.state.save().catch(() => undefined)
    }

    return { success: true }
  }

  private findRequestById(
    requestId: string,
    pending: PendingRequest[],
    completed: CapturedRequest[]
  ): PendingRequest | CapturedRequest | undefined {
    return (
      pending.find((item) => item.id === requestId) ??
      completed.find((item) => item.id === requestId)
    )
  }

  private addAction(message: Extract<BackgroundRequest, { type: 'ADD_ACTION' }>): void {
    this.state.addAction(message.action)
  }

  private async buildJmxExportResponse(includedDomains: string[]): Promise<BackgroundResponse> {
    if (includedDomains.length === 0) {
      return { success: false, error: 'Select at least one domain before exporting JMX.' }
    }

    const requests = filterRequestsByDomains(this.state.getRequests(), includedDomains)

    if (requests.length === 0) {
      return { success: false, error: 'No requests match the selected domains.' }
    }

    const options = await this.getJmxOptionsStore().load()
    const meta: PlanMeta = {
      name: this.planNameForExport(options),
      threadGroup: {
        threads: options.threads,
        rampUp: options.rampUp,
        loops: options.loops,
      },
    }

    return {
      success: true,
      jmx: buildJmx(meta, requests),
      filename: `${safeFilename(meta.name)}.jmx`,
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

  private broadcastRecorderMessage(message: ContentRecorderMessage): void {
    if (typeof chrome === 'undefined' || chrome.tabs === undefined) {
      return
    }

    void chrome.tabs
      .query({})
      .then((tabs) => {
        for (const tab of tabs) {
          if (tab.id === undefined) {
            continue
          }

          chrome.tabs.sendMessage(tab.id, message).catch((err: unknown) => {
            console.warn('Unable to broadcast recorder message to tab.', err)
          })
        }
      })
      .catch((err: unknown) => {
        console.warn('Unable to query tabs for recorder broadcast.', err)
      })
  }

  private broadcastState(): void {
    const snapshot = this.state.getSnapshot()

    chrome.runtime.sendMessage({ type: 'STATE_CHANGED', snapshot }).catch((err: unknown) => {
      console.warn('Unable to broadcast recorder state.', err)
    })

    this.broadcastStateToTabs(snapshot)
  }

  private broadcastStateToTabs(snapshot: RecorderSnapshot): void {
    if (typeof chrome === 'undefined' || chrome.tabs === undefined) {
      return
    }

    void chrome.tabs
      .query({})
      .then((tabs) => {
        for (const tab of tabs) {
          if (tab.id === undefined) {
            continue
          }

          chrome.tabs
            .sendMessage(tab.id, { type: 'STATE_CHANGED', snapshot })
            .catch((err: unknown) => {
              console.warn('Unable to broadcast recorder state to tab.', err)
            })
        }
      })
      .catch((err: unknown) => {
        console.warn('Unable to query tabs for state broadcast.', err)
      })
  }
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unexpected recorder error'
}

function unreachable(value: never): BackgroundResponse {
  return { success: false, error: `Unsupported message type: ${String(value)}` }
}
