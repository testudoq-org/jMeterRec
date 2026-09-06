import { describe, expect, it } from 'vitest'
import { runAnalysis } from './run-analysis'
import type { AnalysisInput } from './types'

describe('immutability', () => {
  it('does not mutate the input recording', () => {
    const input: AnalysisInput = {
      primary: {
        id: 'recording-1',
        schemaVersion: 1,
        exchanges: [
          {
            id: 'req-1',
            timestamp: '2024-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://example.com/api',
            headers: { accept: 'application/json' },
            queryParams: {},
            statusCode: 200,
            responseHeaders: { 'content-type': 'application/json' },
            responseBody: '{"token":"abc123"}',
            responseBodySize: 20,
            responseBodyTruncated: false,
            responseBodyContentType: 'application/json',
            responseBodyMeta: {
              available: 'available',
              encoding: 'utf8',
              mimeType: 'application/json',
              size: 20,
              truncated: false,
              source: 'content-fetch',
            },
            captureSources: ['content-fetch'],
            diagnostics: ['original diagnostic'],
          },
        ],
      },
    }

    const primarySnapshot = JSON.stringify(input.primary)
    const exchangesSnapshot = JSON.stringify(input.primary.exchanges)
    const firstExchangeSnapshot = JSON.stringify(input.primary.exchanges[0])

    runAnalysis(input)

    expect(JSON.stringify(input.primary)).toBe(primarySnapshot)
    expect(JSON.stringify(input.primary.exchanges)).toBe(exchangesSnapshot)
    expect(JSON.stringify(input.primary.exchanges[0])).toBe(firstExchangeSnapshot)
  })
})
