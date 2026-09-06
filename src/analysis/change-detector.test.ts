import { describe, expect, it } from 'vitest'
import { matchSteps, valueChanged } from './change-detector'
import type { CapturedRequest, AnalysisOptions } from './types'

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

describe('change detector', () => {
  describe('matchSteps', () => {
    it('matches steps by url + method', () => {
      const primary: CapturedRequest[] = [
        buildRequest({
          id: 'p1',
          method: 'GET',
          url: 'https://example.com/api',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]
      const baseline: CapturedRequest[] = [
        buildRequest({
          id: 'b1',
          method: 'GET',
          url: 'https://example.com/api',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]

      const options: AnalysisOptions = { matchStepsBy: 'url-method' }
      const matches = matchSteps(primary, baseline, options)

      expect(matches).toHaveLength(1)
      expect(matches[0]!.primaryIndex).toBe(0)
      expect(matches[0]!.baselineIndex).toBe(0)
    })

    it('does not match different methods', () => {
      const primary: CapturedRequest[] = [
        buildRequest({
          id: 'p1',
          method: 'GET',
          url: 'https://example.com/api',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]
      const baseline: CapturedRequest[] = [
        buildRequest({
          id: 'b1',
          method: 'POST',
          url: 'https://example.com/api',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]

      const options: AnalysisOptions = { matchStepsBy: 'url-method' }
      const matches = matchSteps(primary, baseline, options)

      expect(matches).toHaveLength(0)
    })

    it('does not match out-of-window steps', () => {
      const primary: CapturedRequest[] = [
        buildRequest({
          id: 'p1',
          method: 'GET',
          url: 'https://example.com/api',
          timestamp: '2024-01-02T00:00:00.000Z',
        }),
      ]
      const baseline: CapturedRequest[] = [
        buildRequest({
          id: 'b1',
          method: 'GET',
          url: 'https://example.com/api',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]

      const options: AnalysisOptions = { correlationWindowMs: 1000, matchStepsBy: 'url-method' }
      const matches = matchSteps(primary, baseline, options)

      expect(matches).toHaveLength(0)
    })
  })

  describe('valueChanged', () => {
    it('returns true when response body differs', () => {
      const primary: CapturedRequest[] = [
        buildRequest({
          id: 'p1',
          responseBody: '{"token":"new"}',
          responseBodyContentType: 'application/json',
        }),
      ]
      const baseline: CapturedRequest[] = [
        buildRequest({
          id: 'b1',
          responseBody: '{"token":"old"}',
          responseBodyContentType: 'application/json',
        }),
      ]

      const match = { primaryIndex: 0, baselineIndex: 0 }
      expect(valueChanged(primary, baseline, match)).toBe(true)
    })

    it('returns false when response body is identical', () => {
      const primary: CapturedRequest[] = [
        buildRequest({
          id: 'p1',
          responseBody: '{"token":"same"}',
          responseBodyContentType: 'application/json',
        }),
      ]
      const baseline: CapturedRequest[] = [
        buildRequest({
          id: 'b1',
          responseBody: '{"token":"same"}',
          responseBodyContentType: 'application/json',
        }),
      ]

      const match = { primaryIndex: 0, baselineIndex: 0 }
      expect(valueChanged(primary, baseline, match)).toBe(false)
    })

    it('returns false when producer body is unavailable', () => {
      const primary: CapturedRequest[] = [
        buildRequest({
          id: 'p1',
          responseBodyMeta: { available: 'unavailable', error: 'no body', source: 'webRequest' },
        }),
      ]
      const baseline: CapturedRequest[] = [
        buildRequest({
          id: 'b1',
          responseBody: '{"token":"old"}',
          responseBodyContentType: 'application/json',
        }),
      ]

      const match = { primaryIndex: 0, baselineIndex: 0 }
      expect(valueChanged(primary, baseline, match)).toBe(false)
    })
  })
})
