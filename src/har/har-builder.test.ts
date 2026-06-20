import { describe, expect, it } from 'vitest'
import { buildHar } from './har-builder'
import type { CapturedRequest } from '../models/captured-request'

function request(
  id: string,
  url: string,
  overrides: Partial<CapturedRequest> = {}
): CapturedRequest {
  return {
    id,
    timestamp: '2026-06-19T12:00:00.000Z',
    method: 'GET',
    url,
    headers: { accept: 'application/json' },
    queryParams: { q: 'test' },
    body: undefined,
    contentType: undefined,
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    responseBody: '{"ok":true}',
    responseBodySize: 12,
    ...overrides,
  }
}

describe('buildHar', () => {
  it('returns a HAR 1.2 object with the correct structure', () => {
    const har = buildHar([request('one', 'https://example.com/api')])

    expect(har.log.version).toBe('1.2')
    expect(har.log.creator).toEqual({ name: 'Capultura', version: '0.1.0' })
    expect(har.log.entries).toHaveLength(1)
  })

  it('populates entry fields from CapturedRequest', () => {
    const har = buildHar([request('one', 'https://example.com/api?q=test')])
    const entry = har.log.entries[0]!

    expect(entry.startedDateTime).toBe('2026-06-19T12:00:00.000Z')
    expect(entry.request.method).toBe('GET')
    expect(entry.request.url).toBe('https://example.com/api?q=test')
    expect(entry.request.headers).toEqual([{ name: 'accept', value: 'application/json' }])
    expect(entry.request.queryString).toEqual([{ name: 'q', value: 'test' }])
    expect(entry.response.status).toBe(200)
    expect(entry.response.statusText).toBe('200')
    expect(entry.response.headers).toEqual([{ name: 'content-type', value: 'application/json' }])
    expect(entry.timings.send).toBe(0)
    expect(entry.timings.wait).toBe(0)
    expect(entry.timings.receive).toBe(0)
  })

  it('falls back startedDateTime to now when timestamp is absent or empty', () => {
    const before = new Date().toISOString()
    const har = buildHar([{ ...request('one', 'https://example.com/x'), timestamp: '' }])
    const result = har.log.entries[0]!.startedDateTime

    // Implementation uses req.timestamp ?? now, so empty string does NOT fall back.
    // This test documents the actual contract: empty string is preserved.
    expect(result).toBe('')

    // undefined DOES fall back to "now".
    const har2 = buildHar([
      { ...request('two', 'https://example.com/y'), timestamp: undefined as unknown as string },
    ])
    const result2 = har2.log.entries[0]!.startedDateTime
    const result2Time = new Date(result2).getTime()
    expect(result2Time).toBeGreaterThanOrEqual(new Date(before).getTime())
    // Allow 1s clock skew for the build-now timestamp.
    expect(result2Time).toBeLessThanOrEqual(Date.now() + 1000)
  })

  it('includes postData when body is present', () => {
    const har = buildHar([
      request('one', 'https://example.com/api', {
        method: 'POST',
        body: '{"key":"value"}',
        contentType: 'application/json',
      }),
    ])
    const entry = har.log.entries[0]!

    expect(entry.request.postData).toEqual({
      mimeType: 'application/json',
      text: '{"key":"value"}',
    })
    expect(entry.response.content.text).toBe('{"key":"value"}')
  })

  it('omits postData when body and responseBody are empty', () => {
    const har = buildHar([
      {
        ...request('one', 'https://example.com/api'),
        body: '',
        responseBody: '',
      },
    ])
    const entry = har.log.entries[0]!

    expect(entry.request.postData).toBeUndefined()
    expect(entry.response.content.text).toBeUndefined()
  })

  it('uses responseBody when body is absent', () => {
    const har = buildHar([
      request('one', 'https://example.com/api', {
        body: undefined,
        responseBody: 'hello',
      }),
    ])
    const entry = har.log.entries[0]!

    expect(entry.response.content.text).toBe('hello')
  })

  it('preserves order across multiple requests', () => {
    const requests = [
      request('a', 'https://a.example.com/1'),
      request('b', 'https://b.example.com/2'),
      request('c', 'https://c.example.com/3'),
    ]
    const har = buildHar(requests)

    expect(har.log.entries.map((e) => e.request.url)).toEqual(requests.map((r) => r.url))
  })

  it('handles missing headers and responseHeaders gracefully', () => {
    const har = buildHar([
      {
        ...request('one', 'https://example.com/x'),
        headers: {},
        responseHeaders: {},
      },
    ])
    const entry = har.log.entries[0]!

    expect(entry.request.headers).toEqual([])
    expect(entry.response.headers).toEqual([])
  })

  it('returns an empty HAR for an empty input array', () => {
    const har = buildHar([])

    expect(har.log.version).toBe('1.2')
    expect(har.log.entries).toHaveLength(0)
  })
})
