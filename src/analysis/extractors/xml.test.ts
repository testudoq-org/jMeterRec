import { describe, expect, it } from 'vitest'
import { extractXml } from './xml'
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
      mimeType: 'application/xml',
      size: 100,
      truncated: false,
      source: 'content-fetch',
    },
    responseBodyContentType: 'application/xml',
    captureSources: ['content-fetch'],
    diagnostics: [],
    ...overrides,
  }
}

describe('extractXml', () => {
  it('returns finds for known XML nodes', () => {
    const request = buildRequest({
      responseBody: '<root><token>abc123</token><name>test</name></root>',
    })

    const finds = extractXml(request)

    expect(finds).toHaveLength(1)
    expect(finds[0]!.value).toBe('abc123')
    expect(finds[0]!.candidateType).toBe('authorization')
    expect(finds[0]!.proposedExtractor.kind).toBe('xpath')
    expect(finds[0]!.location).toBe('response.body.xml://token')
  })

  it('returns empty array when response body is unavailable', () => {
    const request = buildRequest({
      responseBodyMeta: { available: 'unavailable', error: 'no body', source: 'webRequest' },
    })

    expect(extractXml(request)).toHaveLength(0)
  })

  it('returns empty array for non-XML content type', () => {
    const request = buildRequest({
      responseBody: '<root></root>',
      responseBodyContentType: 'text/html',
    })

    expect(extractXml(request)).toHaveLength(0)
  })

  it('returns empty array when no known XML nodes present', () => {
    const request = buildRequest({
      responseBody: '<root><unknown>value</unknown></root>',
    })

    expect(extractXml(request)).toHaveLength(0)
  })
})
