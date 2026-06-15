import type { CapturedRequest, ActionStep } from '../models/captured-request'
import type { RecorderSnapshot, RecorderStatus } from '../messages'
import { getCapturedRequestDomains } from '../jmx/domains'

export interface RecorderStorage {
  get(keys: string[]): Promise<Record<string, unknown>>
  set(values: Record<string, unknown>): Promise<void>
}

export class RecorderState {
  private status: RecorderStatus = 'idle'
  private requests: CapturedRequest[] = []
  private actions: ActionStep[] = []
  private planName = 'Untitled Plan'
  private tabId: number | undefined
  private startedAt: string | undefined

  constructor(
    private readonly storage: RecorderStorage = chrome.storage.local,
    private readonly setStorage = storage.set.bind(storage)
  ) {}

  async load(): Promise<void> {
    const state = await this.storage.get([
      'status',
      'recording',
      'requests',
      'actions',
      'planName',
      'tabId',
      'startedAt',
    ])

    this.status = this.readStatus(state.status, state.recording)
    this.requests = this.readRequests(state.requests)
    this.actions = this.readActions(state.actions)
    this.planName =
      typeof state.planName === 'string' && state.planName.length > 0
        ? state.planName
        : 'Untitled Plan'
    this.tabId = typeof state.tabId === 'number' ? state.tabId : undefined
    this.startedAt = typeof state.startedAt === 'string' ? state.startedAt : undefined
  }

  async save(): Promise<void> {
    await this.setStorage({
      status: this.status,
      recording: this.status === 'recording' || this.status === 'paused',
      requests: this.requests,
      actions: this.actions,
      planName: this.planName,
      tabId: this.tabId,
      startedAt: this.startedAt,
    })
  }

  start(planName: string, tabId?: number): void {
    this.status = 'recording'
    this.planName = planName.trim().length > 0 ? planName : 'Untitled Plan'
    this.tabId = tabId
    this.startedAt = new Date().toISOString()
    this.requests = []
    this.actions = []
  }

  stop(): void {
    this.status = 'idle'
    this.startedAt = undefined
  }

  pause(): void {
    if (this.status === 'recording') {
      this.status = 'paused'
    }
  }

  resume(): void {
    if (this.status === 'paused') {
      this.status = 'recording'
    }
  }

  reset(): void {
    this.status = 'idle'
    this.requests = []
    this.actions = []
    this.planName = 'Untitled Plan'
    this.tabId = undefined
    this.startedAt = undefined
  }

  addRequest(request: CapturedRequest): void {
    if (this.status === 'recording') {
      this.requests.push(request)
    }
  }

  addAction(action: ActionStep): void {
    if (this.status === 'recording') {
      this.actions.push(action)
    }
  }

  getRequests(): CapturedRequest[] {
    return [...this.requests]
  }

  getDomains(): string[] {
    return getCapturedRequestDomains(this.requests)
  }

  getActions(): ActionStep[] {
    return [...this.actions]
  }

  clearRequests(): void {
    this.requests = []
  }

  getSnapshot(): RecorderSnapshot {
    return {
      status: this.status,
      recording: this.status === 'recording' || this.status === 'paused',
      planName: this.planName,
      requestCount: this.requests.length,
      tabId: this.tabId,
      startedAt: this.startedAt,
    }
  }

  isCapturing(): boolean {
    return this.status === 'recording'
  }

  private readStatus(status: unknown, recording: unknown): RecorderStatus {
    if (status === 'recording' || status === 'paused') {
      return status
    }

    if (status === 'idle') {
      return 'idle'
    }

    return recording === true ? 'recording' : 'idle'
  }

  private readRequests(value: unknown): CapturedRequest[] {
    if (!Array.isArray(value)) {
      return []
    }

    return value.filter(this.isCapturedRequest)
  }

  private readActions(value: unknown): ActionStep[] {
    if (!Array.isArray(value)) {
      return []
    }

    return value.filter(this.isActionStep)
  }

  private isCapturedRequest(value: unknown): value is CapturedRequest {
    if (typeof value !== 'object' || value === null) {
      return false
    }

    const record = value as Record<string, unknown>
    return (
      typeof record.id === 'string' &&
      typeof record.timestamp === 'string' &&
      typeof record.method === 'string' &&
      typeof record.url === 'string' &&
      typeof record.headers === 'object' &&
      record.headers !== null &&
      typeof record.queryParams === 'object' &&
      record.queryParams !== null
    )
  }

  private isActionStep(value: unknown): value is ActionStep {
    if (typeof value !== 'object' || value === null) {
      return false
    }

    const record = value as Record<string, unknown>
    return (
      record.type === 'action' &&
      typeof record.command === 'string' &&
      typeof record.target === 'string'
    )
  }
}
