/// <reference types="chrome" />

/* eslint-disable @typescript-eslint/no-explicit-any */

function interceptFetch(): void {
  const originalFetch = window.fetch.bind(window)
  ;(window as any).fetch = async (input: RequestInfo, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url
    const method = init?.method ?? 'GET'

    const headers = init?.headers as Record<string, string> | undefined
    const contentType = headers?.['content-type'] ?? headers?.['Content-Type']

    void chrome.runtime
      .sendMessage({
        type: 'CAPTURE_FETCH',
        url,
        method: String(method),
        body: init?.body,
        contentType,
      })
      .catch(() => {})

    return originalFetch(input, init)
  }
}

function interceptXHR(): void {
  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send

  // Override open with proper signature
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _async?: boolean,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _username?: string | null | undefined,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _password?: string | null | undefined
  ): void {
    ;(this as any)._url = String(url)
    ;(this as any)._method = method
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    ;(originalOpen as any).call(this, method, url)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  XMLHttpRequest.prototype.send = function (body?: any): void {
    void chrome.runtime
      .sendMessage({
        type: 'CAPTURE_XHR',
        url: (this as any)._url,
        method: (this as any)._method,
        body,
      })
      .catch(() => {})
    return originalSend.call(this, body)
  }
}

interceptFetch()
interceptXHR()

console.log('BM JMX Recorder content script loaded')
