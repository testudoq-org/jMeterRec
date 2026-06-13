/* eslint-disable @typescript-eslint/no-explicit-any */

/// <reference types="chrome" />

import type { CapturedRequest } from '../models/captured-request'

class RecorderState {
  private recording = false
  private requests: CapturedRequest[] = []
  private planName = 'Untitled Plan'

  async load(): Promise<void> {
    const state = await chrome.storage.local.get(['recording', 'requests', 'planName'])
    this.recording = Boolean(state.recording)
    this.requests = Array.isArray(state.requests) ? state.requests : []
    this.planName = String(state.planName ?? 'Untitled Plan')
  }

  async save(): Promise<void> {
    await chrome.storage.local.set({
      recording: this.recording,
      requests: this.requests,
      planName: this.planName,
    })
  }

  start(name: string): void {
    this.recording = true
    this.planName = name
    this.requests = []
  }

  stop(): void {
    this.recording = false
  }

  addRequest(req: CapturedRequest): void {
    if (this.recording) {
      this.requests.push(req)
    }
  }

  getRequests(): CapturedRequest[] {
    return [...this.requests]
  }

  isRecording(): boolean {
    return this.recording
  }

  getPlanName(): string {
    return this.planName
  }
}

type WebRequestDetails = {
  tabId: number
  requestId: string
  url: string
  requestMethod: string
  requestHeaders?: Array<{ name: string; value: string }>
  requestBody?: { raw?: Array<{ bytes?: string }> }
  frameId?: number
  initiator?: string
}

export class RecorderService {
  private state = new RecorderState()

  async initialize(): Promise<void> {
    await this.state.load()
    this.setupWebRequestListener()
  }

  private setupWebRequestListener(): void {
    const listener = (details: WebRequestDetails) => {
      if (!this.state.isRecording()) return {}
      const req = this.normalizeWebRequest(details)
      this.state.addRequest(req)
      return {}
    }

    ;(chrome.webRequest.onBeforeRequest as any).addListener(listener, { urls: ['<all_urls>'] }, [
      'requestBody',
    ])
  }

  private normalizeWebRequest(details: WebRequestDetails): CapturedRequest {
    const urlObj = new URL(details.url)
    return {
      id: `${details.tabId}-${details.requestId}`,
      timestamp: new Date().toISOString(),
      method: details.requestMethod,
      url: details.url,
      headers: this.extractHeaders(details),
      queryParams: this.extractQueryParams(urlObj),
      body: details.requestBody?.raw?.[0]?.bytes,
      contentType: details.requestHeaders?.find((h) => h.name.toLowerCase() === 'content-type')
        ?.value,
      tabId: details.tabId,
      frameId: details.frameId,
      initiator: details.initiator,
    }
  }

  private extractHeaders(details: WebRequestDetails): Record<string, string> {
    const headers: Record<string, string> = {}
    for (const h of details.requestHeaders ?? []) {
      headers[h.name] = h.value ?? ''
    }
    return headers
  }

  private extractQueryParams(url: URL): Record<string, string> {
    const params: Record<string, string> = {}
    for (const [key, value] of url.searchParams) {
      params[key] = value
    }
    return params
  }

  async startRecording(name: string, tabId?: number): Promise<void> {
    this.state.start(name)
    await this.state.save()
    chrome.runtime.sendMessage({ type: 'RECORDING_STARTED', planName: name, tabId })
  }

  async stopRecording(): Promise<CapturedRequest[]> {
    this.state.stop()
    const requests = this.state.getRequests()
    await this.state.save()
    chrome.runtime.sendMessage({ type: 'RECORDING_STOPPED' })
    return requests
  }

  async handleMessage(message: unknown): Promise<unknown> {
    if (typeof message !== 'object' && message === null) return
    const msg = message as Record<string, unknown>

    switch (msg.type) {
      case 'START_RECORDING':
        await this.startRecording(String(msg.planName), msg.tabId as number | undefined)
        return { success: true }
      case 'STOP_RECORDING': {
        const requests = await this.stopRecording()
        return { success: true, requestCount: requests.length }
      }
      case 'GET_STATE':
        return { recording: this.state.isRecording(), planName: this.state.getPlanName() }
      default:
        return { error: 'Unknown message type' }
    }
  }
}

const service = new RecorderService()
service.initialize()

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void service.handleMessage(message).then(sendResponse)
  return true
})

chrome.runtime.onInstalled.addListener(() => {
  console.log('BM JMX Recorder installed')
})
