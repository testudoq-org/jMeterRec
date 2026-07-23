import { RESPONSE_BODY_CAPTURED, type ResponseBodyPayload } from '../messages'
import { createResponseBodyCapture } from '../utils/response-body'

const FORBIDDEN_RESPONSE_CONTENT_TYPES = [/text\/html/i, /application\/xhtml\+xml/i]

type FetchListener = (response: Response, request: Request) => Promise<void>

class ResponseBodyCapture {
  private readonly capture = createResponseBodyCapture()
  private fetchListener: FetchListener | undefined
  private xhrHandler: ((this: XMLHttpRequest, ev: Event) => void) | undefined
  private enabled = false

  constructor() {
    this.fetchListener = this.createFetchListener()
    this.xhrHandler = this.createXhrHandler()
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return
    }

    this.enabled = enabled
    this.applyWrappers()
  }

  private applyWrappers(): void {
    if (this.enabled) {
      this.wrapFetch()
      this.wrapXhr()
    } else {
      this.unwrapFetch()
      this.unwrapXhr()
    }
  }

  private wrapFetch(): void {
    const nativeFetch = window.fetch.bind(window)
    const listener = this.fetchListener

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const response = await nativeFetch(input, init)

      if (listener !== undefined) {
        ;(async () => {
          try {
            const request = input instanceof Request ? input : new Request(input, init)
            await listener(response.clone(), request)
          } catch {
            // Swallow capture errors so page fetch behavior is never blocked.
          }
        })()
      }

      return response
    }
  }

  private unwrapFetch(): void {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'fetch')
      const original = descriptor?.value

      if (typeof original === 'function' && original !== this.fetchListener) {
        window.fetch = original
      }
    } catch {
      // Best-effort unwrap only.
    }
  }

  private wrapXhr(): void {
    const nativeSend = XMLHttpRequest.prototype.send.bind(XMLHttpRequest.prototype)
    const handler = this.xhrHandler

    XMLHttpRequest.prototype.send = function (
      this: XMLHttpRequest,
      body: Document | XMLHttpRequestBodyInit | null | undefined
    ) {
      if (handler !== undefined) {
        this.addEventListener('load', handler, { once: true })
      }

      return nativeSend.call(this, body)
    }
  }

  private unwrapXhr(): void {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'send')
      const original = descriptor?.value

      if (typeof original === 'function' && original !== this.xhrHandler) {
        XMLHttpRequest.prototype.send = original
      }
    } catch {
      // Best-effort unwrap only.
    }
  }

  private createFetchListener(): FetchListener {
    return async (response: Response, _request: Request): Promise<void> => {
      const url = this.resolveUrl(response.url)
      const method = _request.method.toUpperCase()
      const contentType = response.headers.get('content-type') ?? undefined
      const status = response.status

      if (this.isForbiddenContentType(contentType)) {
        this.send({
          url,
          method,
          status,
          contentType,
          error: 'Forbidden content type.',
          body: undefined,
        })
        return
      }

      try {
        const text = await response.clone().text()
        const captured = this.capture.capture(text, contentType)
        this.send({
          url,
          method,
          status,
          contentType,
          body: captured.body,
          error: captured.error,
          truncated: captured.truncated,
          redacted: captured.redacted,
          size: captured.size,
          capturedAtMs: captured.capturedAtMs,
        })
      } catch (err) {
        this.send({
          url,
          method,
          status,
          error: err instanceof Error ? err.message : 'Unable to read fetch response body.',
        })
      }
    }
  }

  private createXhrHandler(): (this: XMLHttpRequest, ev: Event) => void {
    return function (this: XMLHttpRequest, _ev: Event): void {
      const url = responseBodyCapture.resolveUrl(this.responseURL)
      const method = responseBodyCapture.readMethod(this)
      const status = this.status
      const contentType = this.getResponseHeader('content-type') ?? undefined

      if (responseBodyCapture.isForbiddenContentType(contentType)) {
        responseBodyCapture.send({
          url,
          method,
          status,
          contentType,
          error: 'Forbidden content type.',
          body: undefined,
        })
        return
      }

      try {
        const text = typeof this.responseText === 'string' ? this.responseText : ''
        const captured = responseBodyCapture.capture.capture(text, contentType)
        responseBodyCapture.send({
          url,
          method,
          status,
          contentType,
          body: captured.body,
          error: captured.error,
          truncated: captured.truncated,
          redacted: captured.redacted,
          size: captured.size,
          capturedAtMs: captured.capturedAtMs,
        })
      } catch (err) {
        responseBodyCapture.send({
          url,
          method,
          status,
          error: err instanceof Error ? err.message : 'Unable to read XHR response body.',
        })
      }
    }
  }

  private dispatch(payload: {
    url: string
    method: string
    status?: number
    contentType?: string
    body?: string
    error?: string
    truncated?: boolean
    redacted?: boolean
    size?: number
    capturedAtMs?: number
  }): void {
    if (!this.enabled) {
      return
    }

    const captured =
      payload.body !== undefined
        ? this.capture.capture(payload.body, payload.contentType)
        : undefined
    const body = captured?.body
    const size = captured?.size ?? 0
    const capturedAtMs = captured?.capturedAtMs ?? Date.now()

    const message: { type: typeof RESPONSE_BODY_CAPTURED; payload: ResponseBodyPayload } = {
      type: RESPONSE_BODY_CAPTURED,
      payload: {
        requestId: this.generateRequestId(payload.url, payload.method, payload.status),
        tabId: this.readTabId(),
        frameId: 0,
        url: payload.url,
        method: payload.method,
        status: payload.status,
        responseHeaders: {},
        body,
        error: payload.error ?? captured?.error,
        truncated: captured ? captured.truncated : false,
        redacted: captured ? captured.redacted : false,
        size,
        capturedAtMs,
        contentType: payload.contentType,
      },
    }

    try {
      chrome.runtime.sendMessage(message).catch(() => {
        // Background may be unavailable during capture; ignore.
      })
    } catch {
      // Ignore runtime messaging failures.
    }
  }

  private send(payload: {
    url: string
    method: string
    status?: number
    contentType?: string
    body?: string
    error?: string
    truncated?: boolean
    redacted?: boolean
    size?: number
    capturedAtMs?: number
  }): void {
    this.dispatch(payload)
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
      return (window as { chrome?: { tabs?: { TAB_ID?: number } } }).chrome?.tabs?.TAB_ID ?? 0
    } catch {
      return 0
    }
  }

  private resolveUrl(raw: string): string {
    try {
      return new URL(raw, document.baseURI ?? location.href).toString()
    } catch {
      return raw
    }
  }

  private readMethod(xhr: XMLHttpRequest): string {
    const extended = xhr as XMLHttpRequest & { _capulturaMethod?: string }
    return extended._capulturaMethod ?? 'GET'
  }

  private isForbiddenContentType(contentType?: string): boolean {
    if (!contentType) {
      return false
    }

    return FORBIDDEN_RESPONSE_CONTENT_TYPES.some((regex) => regex.test(contentType))
  }
}

export const responseBodyCapture = new ResponseBodyCapture()
