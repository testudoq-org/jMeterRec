import { describe, expect, it } from 'vitest'
import { extractHtmlHidden } from './html-hidden'
import type { CapturedRequest } from '../../models/captured-request'

function buildRequest(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    id: 'req-1',
    timestamp: '2024-01-01T00:00:00.000Z',
    method: 'GET',
    url: 'https://example.com/api',
    headers: {},
    queryParams: {},
    statusCode: 200,
    responseHeaders: {},
    responseBodyMeta: {
      available: 'available',
      encoding: 'utf8',
      mimeType: 'text/html',
      size: 100,
      truncated: false,
      source: 'content-fetch',
    },
    responseBodyContentType: 'text/html',
    captureSources: ['content-fetch'],
    diagnostics: [],
    ...overrides,
  }
}

describe('extractHtmlHidden', () => {
  it('returns finds for hidden inputs', () => {
    const request = buildRequest({
      responseBody: '<form><input type="hidden" name="csrf_token" value="ignored" /></form>',
    })

    const finds = extractHtmlHidden(request)

    expect(finds).toHaveLength(1)
    expect(finds[0]!.value).toBe('csrf_token')
    expect(finds[0]!.candidateType).toBe('csrf-token')
    expect(finds[0]!.location).toBe('response.body.html:input[name="csrf_token"]')
  })

  it('returns empty array when response body is unavailable', () => {
    const request = buildRequest({
      responseBodyMeta: { available: 'unavailable', error: 'no body', source: 'webRequest' },
    })

    expect(extractHtmlHidden(request)).toHaveLength(0)
  })

  it('returns empty array for non-HTML content type', () => {
    const request = buildRequest({
      responseBody: '<html></html>',
      responseBodyContentType: 'application/json',
    })

    expect(extractHtmlHidden(request)).toHaveLength(0)
  })

  it('returns empty array when no hidden inputs present', () => {
    const request = buildRequest({
      responseBody: '<html><body>No inputs</body></html>',
    })

    expect(extractHtmlHidden(request)).toHaveLength(0)
  })
})
