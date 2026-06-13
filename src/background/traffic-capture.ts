import type { RecorderState } from './recorder-state'
import {
  createPendingRequest,
  markRequestError,
  mergeBeforeSendHeaders,
  mergeCompleted,
  mergeResponseStarted,
  type PendingRequest,
} from './traffic-normalizer'
import type { BackgroundBroadcast } from '../messages'

export class TrafficCaptureService {
  private readonly pending = new Map<string, PendingRequest>()
  private readonly filter: chrome.webRequest.RequestFilter = { urls: ['<all_urls>'] }
  private listenersRegistered = false

  constructor(private readonly state: RecorderState) {}

  start(): void {
    if (this.listenersRegistered) {
      return
    }

    chrome.webRequest.onBeforeRequest.addListener(this.onBeforeRequest, this.filter, [
      'requestBody',
    ])
    chrome.webRequest.onBeforeSendHeaders.addListener(this.onBeforeSendHeaders, this.filter, [
      'requestHeaders',
      'blocking',
    ])
    chrome.webRequest.onResponseStarted.addListener(this.onResponseStarted, this.filter, [
      'responseHeaders',
    ])
    chrome.webRequest.onCompleted.addListener(this.onCompleted, this.filter, ['responseHeaders'])
    chrome.webRequest.onErrorOccurred.addListener(this.onErrorOccurred, this.filter)

    this.listenersRegistered = true
  }

  private readonly onBeforeRequest = (details: chrome.webRequest.OnBeforeRequestDetails) => {
    if (!this.isCapturing()) {
      return undefined
    }

    this.pending.set(details.requestId, createPendingRequest(details))
    return undefined
  }

  private readonly onBeforeSendHeaders = (
    details: chrome.webRequest.OnBeforeSendHeadersDetails
  ) => {
    if (!this.isCapturing()) {
      return undefined
    }

    const pending = this.pending.get(details.requestId) ?? createPendingRequest(details)
    mergeBeforeSendHeaders(pending, details)
    this.pending.set(details.requestId, pending)
    return undefined
  }

  private readonly onResponseStarted = (details: chrome.webRequest.OnResponseStartedDetails) => {
    if (!this.isCapturing()) {
      return
    }

    const pending = this.pending.get(details.requestId) ?? createPendingRequest(details)
    mergeResponseStarted(pending, details)
    this.pending.set(details.requestId, pending)
  }

  private readonly onCompleted = (details: chrome.webRequest.OnCompletedDetails) => {
    const pending = this.pending.get(details.requestId)

    if (pending === undefined || !this.isCapturing()) {
      return
    }

    mergeCompleted(pending, details)
    this.pending.delete(details.requestId)
    void this.state.addRequest(pending)
    void this.state.save()
    this.broadcast({ type: 'REQUEST_CAPTURED', request: pending })
  }

  private readonly onErrorOccurred = (details: chrome.webRequest.OnErrorOccurredDetails) => {
    const pending = this.pending.get(details.requestId)

    if (pending === undefined || !this.isCapturing()) {
      return
    }

    markRequestError(pending, details)
    this.pending.delete(details.requestId)
    void this.state.addRequest(pending)
    void this.state.save()
    this.broadcast({ type: 'REQUEST_CAPTURED', request: pending })
  }

  private isCapturing(): boolean {
    return this.state.isCapturing()
  }

  private broadcast(message: BackgroundBroadcast): void {
    chrome.runtime.sendMessage(message).catch((err: unknown) => {
      console.warn('Unable to broadcast traffic capture update.', err)
    })
  }
}
