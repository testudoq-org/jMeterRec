import { describe, expect, it } from 'vitest'
import type { CapturedRequest } from '../models/captured-request'
import {
  createPendingRequest,
  mergeBeforeSendHeaders,
  mergeCompleted,
  mergeResponseStarted,
} from './traffic-normalizer'

function beforeRequest(overrides: Partial<chrome.webRequest.OnBeforeRequestDetails> = {}) {
  return {
    documentLifecycle: 'active',
    frameId: 0,
    frameType: 'outermost_frame',
    method: 'POST',
    parentFrameId: -1,
    requestId: 'r-1',
    tabId: 10,
    timeStamp: 1_700_000_000_000,
    type: 'xmlhttprequest',
    url: 'https://api.example.com/submit?tenant=acme',
    ...overrides,
  } satisfies chrome.webRequest.OnBeforeRequestDetails
}

function headers(name: string, value: string): chrome.webRequest.HttpHeader[] {
  return [{ name, value }]
}

describe('traffic-normalizer', () => {
  it('creates a pending request from onBeforeRequest details', () => {
    const pending = createPendingRequest(beforeRequest())

    expect(pending.id).toBe('10-r-1')
    expect(pending.timestamp).toBe('2023-11-14T22:13:20.000Z')
    expect(pending.method).toBe('POST')
    expect(pending.url).toBe('https://api.example.com/submit?tenant=acme')
    expect(pending.queryParams).toEqual({ tenant: 'acme' })
    expect(pending.tabId).toBe(10)
    expect(pending.frameId).toBe(0)
    expect(pending.type).toBe('xmlhttprequest')
  })

  it('decodes raw request body bytes and content-type headers', () => {
    const pending = createPendingRequest(
      beforeRequest({
        requestBody: { raw: [{ bytes: new TextEncoder().encode('{"name":"Ada"}').buffer }] },
      })
    )

    expect(pending.body).toBe('{"name":"Ada"}')
    expect(pending.contentType).toBeUndefined()

    mergeBeforeSendHeaders(pending, {
      ...beforeRequest(),
      requestHeaders: headers('content-type', 'application/json'),
    })

    expect(pending.contentType).toBe('application/json')
  })

  it('merges response status and response headers', () => {
    const pending = createPendingRequest(beforeRequest())

    mergeBeforeSendHeaders(pending, {
      ...beforeRequest(),
      requestHeaders: headers('accept', 'application/json'),
    })
    mergeResponseStarted(pending, {
      ...beforeRequest(),
      fromCache: false,
      statusCode: 201,
      statusLine: 'HTTP/1.1 201 Created',
      responseHeaders: headers('content-type', 'application/json'),
    })

    expect(pending.headers).toEqual({ accept: 'application/json' })
    expect(pending.statusCode).toBe(201)
    expect(pending.responseHeaders).toEqual({ 'content-type': 'application/json' })
  })

  it('finalizes completed requests without throwing on invalid URLs', () => {
    const pending = createPendingRequest(beforeRequest({ url: 'not-a-url' }))
    mergeCompleted(pending, {
      ...beforeRequest({ url: 'not-a-url' }),
      fromCache: false,
      statusCode: 200,
      statusLine: 'HTTP/1.1 200 OK',
      responseHeaders: [],
    })

    const request = pending as CapturedRequest

    expect(request.path).toBeUndefined()
    expect(request.statusCode).toBe(200)
  })
})
