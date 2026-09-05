import { RESPONSE_BODY_CAPTURED, type ResponseBodyPayload } from '../messages'
import { ContentScriptResponseBodyProvider } from '../capture/providers/content-script-response-body-provider'
import { UnsupportedResponseBodyProvider } from '../capture/providers/unsupported-response-body-provider'
import { ProviderRegistry } from '../capture/provider-registry'
import type { ProviderContext, ResponseBodyCaptureResult } from '../capture/response-body-provider'

const PAGE_CONTEXT_MESSAGE_TYPE = '__capitura_capture'

class ResponseBodyCapture {
  private readonly registry: ProviderRegistry
  private enabled = false
  private pageContextListener: ((event: MessageEvent) => void) | undefined
  private injectRequested = false
  private tabId = 0

  constructor(registry?: ProviderRegistry) {
    this.registry =
      registry ??
      new ProviderRegistry([
        new ContentScriptResponseBodyProvider('content-fetch'),
        new ContentScriptResponseBodyProvider('content-xhr'),
        new UnsupportedResponseBodyProvider(),
      ])
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return
    }

    this.enabled = enabled

    if (enabled) {
      this.requestPageContextInjection()
      this.attachPageContextListener()
    } else {
      this.detachPageContextListener()
      this.injectRequested = false
    }
  }

  private requestPageContextInjection(): void {
    if (this.injectRequested) {
      return
    }

    this.injectRequested = true
    console.log('[Capitura] requesting page context injection')

    chrome.runtime
      .sendMessage({ type: 'INJECT_PAGE_CONTEXT_SCRIPT' })
      .then((response) => {
        console.log('[Capitura] injection response:', response)
        if (typeof response?.tabId === 'number') {
          this.tabId = response.tabId
        }
      })
      .catch((err) => {
        console.error('[Capitura] injection failed:', err)
      })
  }

  private attachPageContextListener(): void {
    if (this.pageContextListener !== undefined) {
      return
    }

    this.pageContextListener = (event: MessageEvent) => {
      if (!this.enabled) {
        return
      }

      const data = event.data
      console.log('[Capitura] page context message received:', data?.type)
      if (
        typeof data !== 'object' ||
        data === null ||
        data.type !== PAGE_CONTEXT_MESSAGE_TYPE ||
        typeof data.payload !== 'object' ||
        data.payload === null
      ) {
        return
      }

      const payload = data.payload as Record<string, unknown>

      if (payload.injected === true) {
        return
      }

      console.log('[Capitura] page context payload:', JSON.stringify(payload))

      this.dispatch({
        url: typeof payload.url === 'string' ? payload.url : '',
        method: typeof payload.method === 'string' ? payload.method : 'GET',
        status: typeof payload.status === 'number' ? payload.status : undefined,
        contentType: typeof payload.contentType === 'string' ? payload.contentType : undefined,
        body: typeof payload.body === 'string' ? payload.body : undefined,
        error: typeof payload.error === 'string' ? payload.error : undefined,
        source: payload.source === 'content-xhr' ? 'content-xhr' : 'content-fetch',
      })
    }

    window.addEventListener('message', this.pageContextListener)
  }

  private detachPageContextListener(): void {
    if (this.pageContextListener !== undefined) {
      window.removeEventListener('message', this.pageContextListener)
      this.pageContextListener = undefined
    }
  }

  private async dispatch(payload: {
    url: string
    method: string
    status?: number
    contentType?: string
    body?: string
    error?: string
    source: 'content-fetch' | 'content-xhr'
  }): Promise<void> {
    const ctx: ProviderContext = {
      url: payload.url,
      method: payload.method,
      status: payload.status,
      contentType: payload.contentType,
      body: payload.body,
      options: {
        bodiesEnabled: this.enabled,
      },
    }

    const result = await this.registry.capture(ctx)
    const message = this.buildMessage(payload, result)
    console.log('[Capitura] dispatch', message.type, payload.url, result.available)

    try {
      chrome.runtime.sendMessage(message).catch(() => {
        // Background may be unavailable during capture; ignore.
      })
    } catch {
      // Ignore runtime messaging failures.
    }
  }

  private buildMessage(
    payload: {
      url: string
      method: string
      status?: number
      contentType?: string
      body?: string
      error?: string
      source: 'content-fetch' | 'content-xhr'
    },
    result: ResponseBodyCaptureResult
  ): { type: typeof RESPONSE_BODY_CAPTURED; payload: ResponseBodyPayload } {
    return {
      type: RESPONSE_BODY_CAPTURED,
      payload: {
        requestId: this.generateRequestId(payload.url, payload.method, payload.status),
        tabId: this.readTabId(),
        frameId: 0,
        url: payload.url,
        method: payload.method,
        status: payload.status,
        responseHeaders: {},
        body: result.available === 'available' ? result.body : undefined,
        error: result.error ?? payload.error,
        truncated: result.truncated ?? false,
        redacted: result.redacted ?? false,
        size: result.size ?? 0,
        capturedAtMs: Date.now(),
        contentType: payload.contentType,
        source: result.source,
        encoding: result.encoding,
        available: result.available,
      },
    }
  }

  private generateRequestId(url: string, method: string, status?: number): string {
    const source = `${method}-${url}-${status ?? 0}`
    let hash = 0

    for (let index = 0; index < source.length; index += 1) {
      hash = (hash << 5) - hash + source.charCodeAt(index)
      hash |= 0
    }

    return `content-${Math.abs(hash)}`
  }

  private readTabId(): number {
    try {
      const dataAttr = document.documentElement.dataset.capituraTabId
      if (dataAttr) {
        const parsed = Number.parseInt(dataAttr, 10)
        if (!Number.isNaN(parsed)) {
          return parsed
        }
      }
    } catch {
      // ignore
    }

    if (this.tabId !== 0) {
      return this.tabId
    }

    try {
      return (window as { chrome?: { tabs?: { TAB_ID?: number } } }).chrome?.tabs?.TAB_ID ?? 0
    } catch {
      return 0
    }
  }
}

export const responseBodyCapture = new ResponseBodyCapture()
