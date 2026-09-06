import { describe, expect, it } from 'vitest'
import { extractJson } from './json'
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
      mimeType: 'application/json',
      size: 10,
      truncated: false,
      source: 'content-fetch',
    },
    captureSources: ['content-fetch'],
    diagnostics: [],
    ...overrides,
  }
}

describe('extractJson', () => {
  it('returns finds for JSON keys with token-like values', () => {
    const request = buildRequest({
      responseBody: '{"token":"abc123","user":"test","count":5}',
      responseBodyContentType: 'application/json',
    })

    const finds = extractJson(request)

    expect(finds).toHaveLength(2)
    expect(finds[0]!.value).toBe('abc123')
    expect(finds[0]!.candidateType).toBe('authorization')
    expect(finds[0]!.proposedExtractor.kind).toBe('jsonpath')
    expect(finds[0]!.location).toBe('response.body.json:$.token')
    expect(finds[1]!.value).toBe('test')
    expect(finds[1]!.candidateType).toBe('unknown')
  })

  it('returns empty array when body is unavailable', () => {
    const request = buildRequest({
      responseBodyMeta: { available: 'unavailable', error: 'no body', source: 'webRequest' },
    })

    expect(extractJson(request)).toHaveLength(0)
  })

  it('returns empty array when responseBody is empty', () => {
    const request = buildRequest({
      responseBody: '',
      responseBodyContentType: 'application/json',
    })

    expect(extractJson(request)).toHaveLength(0)
  })

  it('returns empty array for non-JSON body', () => {
    const request = buildRequest({
      responseBody: 'not json',
      responseBodyContentType: 'text/plain',
    })

    expect(extractJson(request)).toHaveLength(0)
  })

  it('rejects numeric-only values', () => {
    const request = buildRequest({
      responseBody: '{"id":12345}',
      responseBodyContentType: 'application/json',
    })

    expect(extractJson(request)).toHaveLength(0)
  })
})
