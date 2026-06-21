import { isHostForbidden } from './forbidden-domains'
import type { RecorderState } from './recorder-state'
import { PendingWebRequestStore } from './pending-web-request-store'
import {
  createPendingRequest,
  createCompletedRequest,
  createErrorRequest,
  createRedirectFollowUp,
  createRequestId,
  findHeaderValue,
  markRequestError,
  mergeBeforeSendHeaders,
  mergeCompleted,
  mergeResponseStarted,
  type PendingRequest,
} from './traffic-normalizer'
import type { BackgroundBroadcast } from '../messages'

export class TrafficCaptureService {
  private pending = new Map<string, PendingRequest>()
  private readonly redirectChainHeads = new Map<string, PendingRequest>()
  private readonly maxRedirectChainHeads = 256
  private readonly finalizing = new Set<string>()
  private readonly filter: chrome.webRequest.RequestFilter = { urls: ['<all_urls>'] }
  private listenersRegistered = false

  constructor(
    private readonly state: RecorderState,
    private readonly pendingStore = new PendingWebRequestStore(),
    private redirectDedupEnabled = false
  ) {}

  async start(
    recoveredFragments: Record<string, PendingRequest> = {},
    recoveryMode = true
  ): Promise<void> {
    if (this.listenersRegistered) {
      return
    }

    this.pending = new Map(Object.entries(recoveryMode ? recoveredFragments : {}))

    if (!recoveryMode && Object.keys(recoveredFragments).length > 0) {
      await this.pendingStore.clear()
    }

    chrome.webRequest.onBeforeRequest.addListener(this.onBeforeRequest, this.filter, [
      'requestBody',
    ])
    chrome.webRequest.onBeforeSendHeaders.addListener(this.onBeforeSendHeaders, this.filter, [
      'requestHeaders',
    ])
    chrome.webRequest.onResponseStarted.addListener(this.onResponseStarted, this.filter, [
      'responseHeaders',
    ])
    chrome.webRequest.onCompleted.addListener(this.onCompleted, this.filter, ['responseHeaders'])
    chrome.webRequest.onErrorOccurred.addListener(this.onErrorOccurred, this.filter)

    this.listenersRegistered = true
  }

  async clearPending(): Promise<void> {
    this.pending.clear()
    await this.pendingStore.clear()
  }

  getPendingRequests(): PendingRequest[] {
    return Array.from(this.pending.values())
  }

  private readonly onBeforeRequest = (details: chrome.webRequest.OnBeforeRequestDetails) => {
    if (!this.isCapturing()) {
      return undefined
    }

    if (this.isForbiddenUrl(details.url)) {
      return undefined
    }

    this.runSafely(
      this.persistPending(this.createPendingRequestForBeforeRequest(details)),
      'Unable to persist pending request.'
    )
    return undefined
  }

  private readonly onBeforeSendHeaders = (
    details: chrome.webRequest.OnBeforeSendHeadersDetails
  ) => {
    if (!this.isCapturing()) {
      return undefined
    }

    if (this.isForbiddenUrl(details.url)) {
      return undefined
    }

    this.runSafely(this.handleBeforeSendHeaders(details), 'Unable to persist request headers.')
    return undefined
  }

  private readonly onResponseStarted = (details: chrome.webRequest.OnResponseStartedDetails) => {
    if (!this.isCapturing()) {
      return
    }

    if (this.isForbiddenUrl(details.url)) {
      return
    }

    this.runSafely(this.handleResponseStarted(details), 'Unable to persist response start.')
  }

  private readonly onCompleted = (details: chrome.webRequest.OnCompletedDetails) => {
    if (this.isForbiddenUrl(details.url)) {
      return
    }

    this.runSafely(this.handleCompleted(details), 'Unable to finalize completed request.')
  }

  private readonly onErrorOccurred = (details: chrome.webRequest.OnErrorOccurredDetails) => {
    if (this.isForbiddenUrl(details.url)) {
      return
    }

    this.runSafely(this.handleErrorOccurred(details), 'Unable to finalize failed request.')
  }

  private async handleBeforeSendHeaders(
    details: chrome.webRequest.OnBeforeSendHeadersDetails
  ): Promise<void> {
    const id = createRequestId(details.tabId, details.requestId)
    const pending = (await this.loadPending(id)) ?? createPendingRequest(details)

    mergeBeforeSendHeaders(pending, details)
    await this.persistPending(pending)
  }

  private async handleResponseStarted(
    details: chrome.webRequest.OnResponseStartedDetails
  ): Promise<void> {
    const id = createRequestId(details.tabId, details.requestId)
    const pending = (await this.loadPending(id)) ?? createPendingRequest(details)

    mergeResponseStarted(pending, details)
    this.registerRedirectChainHead(pending, details)
    await this.persistPending(pending)
  }

  private async handleCompleted(details: chrome.webRequest.OnCompletedDetails): Promise<void> {
    const id = createRequestId(details.tabId, details.requestId)

    if (this.finalizing.has(id)) {
      return
    }

    this.finalizing.add(id)

    if (!this.isCapturing()) {
      return
    }

    try {
      const pending = await this.loadPending(id)
      const request = pending ?? createCompletedRequest(details)
      if (pending !== undefined) {
        mergeCompleted(request, details)
      }

      this.registerRedirectChainHead(request, details)

      await this.removePending(id)
      this.addCompletedRequest(request)
    } finally {
      this.finalizing.delete(id)
    }
  }

  private async handleErrorOccurred(
    details: chrome.webRequest.OnErrorOccurredDetails
  ): Promise<void> {
    const id = createRequestId(details.tabId, details.requestId)

    if (this.finalizing.has(id)) {
      return
    }

    this.finalizing.add(id)

    if (!this.isCapturing()) {
      return
    }

    try {
      const pending = await this.loadPending(id)
      const fallbackMethod = pending?.method
      const request = pending ?? createErrorRequest(details, fallbackMethod)
      if (pending !== undefined) {
        markRequestError(request, details)
      }

      await this.removePending(id)
      this.addCompletedRequest(request)
    } finally {
      this.finalizing.delete(id)
    }
  }

  private async loadPending(id: string): Promise<PendingRequest | undefined> {
    return this.pending.get(id) ?? (await this.pendingStore.loadFragment(id))
  }

  private async persistPending(pending: PendingRequest): Promise<void> {
    this.pending.set(pending.id, pending)
    await this.pendingStore.upsert(pending)
  }

  private async removePending(id: string): Promise<void> {
    this.pending.delete(id)
    await this.pendingStore.remove(id)
  }

  private addCompletedRequest(request: PendingRequest): void {
    if (this.isForbiddenUrl(request.url)) {
      return
    }

    this.state.addRequest(request)
    this.state.save().catch((err: unknown) => {
      console.warn('Unable to save completed request.', err)
    })
    this.broadcast({ type: 'REQUEST_CAPTURED', request })
  }

  private runSafely(operation: Promise<void>, message: string): void {
    operation.catch((err: unknown) => {
      console.warn(message, err)
    })
  }

  private createPendingRequestForBeforeRequest(
    details: chrome.webRequest.OnBeforeRequestDetails
  ): PendingRequest {
    if (!this.redirectDedupEnabled) {
      return createPendingRequest(details)
    }

    const source = this.findRedirectSource(details.tabId, details.url)

    if (source === undefined) {
      return createPendingRequest(details)
    }

    return createRedirectFollowUp(source, details)
  }

  private registerRedirectChainHead(
    request: PendingRequest,
    details: {
      statusCode: number
      responseHeaders?: chrome.webRequest.HttpHeader[]
      url: string
    }
  ): void {
    if (!this.redirectDedupEnabled) {
      return
    }

    if (!isRedirectStatus(details.statusCode)) {
      return
    }

    const location = this.findLocationHeader(details.responseHeaders)
    if (location === undefined) {
      return
    }

    if (request.tabId === undefined) {
      return
    }

    const targetUrl = resolveRedirectUrl(request.url, location)
    const key = targetUrl === undefined ? undefined : this.redirectKey(request.tabId, targetUrl)

    if (key === undefined) {
      return
    }

    this.evictOldestRedirectChainHeadIfNeeded()

    request.followRedirects = true
    this.redirectChainHeads.set(key, request)
  }

  private findRedirectSource(tabId: number, url: string): PendingRequest | undefined {
    const key = this.redirectKey(tabId, url)

    if (key === undefined) {
      return undefined
    }

    const source = this.redirectChainHeads.get(key)

    if (source === undefined) {
      return undefined
    }

    this.redirectChainHeads.delete(key)
    return source
  }

  private findLocationHeader(
    headers: chrome.webRequest.HttpHeader[] | undefined
  ): string | undefined {
    const location = findHeaderValue(headers, 'location')?.trim()

    return location?.length === 0 ? undefined : location
  }

  private redirectKey(tabId: number, url: string): string | undefined {
    const normalizedUrl = normalizeRedirectUrl(url)

    if (normalizedUrl === undefined) {
      return undefined
    }

    return `${tabId}:${normalizedUrl}`
  }

  setRedirectDedupEnabled(enabled: boolean): void {
    this.redirectDedupEnabled = enabled
  }

  private isCapturing(): boolean {
    return this.state.isCapturing()
  }

  private isForbiddenUrl(url: string): boolean {
    return isHostForbidden(url)
  }

  private broadcast(message: BackgroundBroadcast): void {
    chrome.runtime.sendMessage(message).catch((err: unknown) => {
      console.warn('Unable to broadcast traffic capture update.', err)
    })
  }

  private evictOldestRedirectChainHeadIfNeeded(): void {
    if (this.redirectChainHeads.size < this.maxRedirectChainHeads) {
      return
    }

    const firstKey = this.redirectChainHeads.keys().next().value
    if (firstKey !== undefined) {
      this.redirectChainHeads.delete(firstKey)
    }
  }
}

function isRedirectStatus(statusCode: number): boolean {
  return statusCode >= 300 && statusCode < 400
}

function resolveRedirectUrl(baseUrl: string, location: string): string | undefined {
  try {
    const absoluteUrl = new URL(location, baseUrl)

    if (absoluteUrl.protocol !== 'http:' && absoluteUrl.protocol !== 'https:') {
      return undefined
    }

    return normalizeRedirectUrl(absoluteUrl.toString())
  } catch {
    return undefined
  }
}

function normalizeRedirectUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url)

    parsed.hash = ''
    return parsed.toString()
  } catch {
    return undefined
  }
}
