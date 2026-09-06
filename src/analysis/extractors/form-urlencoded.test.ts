import { describe, expect, it } from 'vitest'
import { extractFormUrlencoded } from './form-urlencoded'
import type { CapturedRequest } from '../../models/captured-request'

function buildRequest(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    id: 'req-1',
    timestamp: '2024-01-01T00:00:00.000Z',
    method: 'POST',
    url: 'https://example.com/api',
    headers: {},
    queryParams: {},
    body: 'field1=value1',
    statusCode: 200,
    responseHeaders: {},
    responseBodyMeta: {
      available: 'available',
      encoding: 'utf8',
      mimeType: 'text/html',
      size: 20,
      truncated: false,
      source: 'content-fetch',
    },
    captureSources: ['content-fetch'],
    diagnostics: [],
    ...overrides,
  }
}

describe('extractFormUrlencoded', () => {
  it('returns finds for hidden-field-like keys', () => {
    const request = buildRequest({
      contentType: 'application/x-www-form-urlencoded',
      body: 'username=test&csrf_token=abc123&password=secret',
    })

    const finds = extractFormUrlencoded(request)

    expect(finds).toHaveLength(1)
    expect(finds[0]!.value).toBe('abc123')
    expect(finds[0]!.candidateType).toBe('csrf-token')
    expect(finds[0]!.location).toBe('request.body.form:csrf_token')
  })

  it('returns finds for authenticity_token', () => {
    const request = buildRequest({
      contentType: 'application/x-www-form-urlencoded',
      body: 'authenticity_token=xyz789',
    })

    const finds = extractFormUrlencoded(request)

    expect(finds).toHaveLength(1)
    expect(finds[0]!.candidateType).toBe('csrf-token')
  })

  it('returns empty array for non-form-urlencoded content type', () => {
    const request = buildRequest({
      contentType: 'application/json',
      body: '{"key":"value"}',
    })

    expect(extractFormUrlencoded(request)).toHaveLength(0)
  })

  it('returns empty array when body is empty', () => {
    const request = buildRequest({
      body: '',
    })

    expect(extractFormUrlencoded(request)).toHaveLength(0)
  })

  it('returns empty array when body is missing', () => {
    const request = buildRequest({
      body: undefined,
    })

    expect(extractFormUrlencoded(request)).toHaveLength(0)
  })
})
