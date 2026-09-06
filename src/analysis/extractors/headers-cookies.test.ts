import { describe, expect, it } from 'vitest'
import { extractHeadersCookies, extractRedirectLocation } from './headers-cookies'
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

describe('extractHeadersCookies', () => {
  it('returns finds for set-cookie headers', () => {
    const request = buildRequest({
      responseHeaders: {
        'set-cookie': 'JSESSIONID=abc123; Path=/; HttpOnly',
      },
    })

    const finds = extractHeadersCookies(request)

    expect(finds).toHaveLength(1)
    expect(finds[0]!.value).toBe('abc123')
    expect(finds[0]!.candidateType).toBe('session-id')
    expect(finds[0]!.proposedExtractor.kind).toBe('cookie')
    expect(finds[0]!.location).toBe('response.header:set-cookie')
  })

  it('returns finds for known header names', () => {
    const request = buildRequest({
      headers: {
        authorization: 'Bearer token123',
      },
    })

    const finds = extractHeadersCookies(request)

    expect(finds).toHaveLength(1)
    expect(finds[0]!.candidateType).toBe('authorization')
    expect(finds[0]!.location).toBe('request.header:authorization')
  })

  it('skips unknown header names', () => {
    const request = buildRequest({
      responseHeaders: {
        'content-type': 'application/json',
      },
    })

    expect(extractHeadersCookies(request)).toHaveLength(0)
  })
})

describe('extractRedirectLocation', () => {
  it('returns a find for 3xx response with location header', () => {
    const request = buildRequest({
      statusCode: 302,
      responseHeaders: {
        location: 'https://example.com/redirected',
      },
    })

    const finds = extractRedirectLocation(request)

    expect(finds).toHaveLength(1)
    expect(finds[0]!.value).toBe('https://example.com/redirected')
    expect(finds[0]!.location).toBe('response.header:location')
    expect(finds[0]!.candidateType).toBe('business-id')
    expect(finds[0]!.proposedExtractor.kind).toBe('header')
    expect(finds[0]!.proposedExtractor.expression).toBe('response.header:location')
  })

  it('returns empty for non-3xx responses', () => {
    const request = buildRequest({
      statusCode: 200,
      responseHeaders: {
        location: 'https://example.com/should-not-extract',
      },
    })

    expect(extractRedirectLocation(request)).toHaveLength(0)
  })

  it('returns empty for 3xx without location header', () => {
    const request = buildRequest({
      statusCode: 301,
      responseHeaders: {},
    })

    expect(extractRedirectLocation(request)).toHaveLength(0)
  })

  it('returns empty when statusCode is undefined', () => {
    const request = buildRequest({
      responseHeaders: {
        location: 'https://example.com/redirected',
      },
    })

    // statusCode not set in buildRequest defaults — need to explicitly remove it
    const { statusCode: _omit, ...noStatus } = request
    void _omit
    expect(extractRedirectLocation(noStatus)).toHaveLength(0)
  })

  it('returns empty for empty location header', () => {
    const request = buildRequest({
      statusCode: 302,
      responseHeaders: {
        location: '',
      },
    })

    expect(extractRedirectLocation(request)).toHaveLength(0)
  })
})
