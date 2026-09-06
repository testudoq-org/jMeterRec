import { describe, expect, it } from 'vitest'
import { runAnalysis } from './run-analysis'
import type { AnalysisInput } from './types'

describe('runAnalysis', () => {
  it('returns empty result for empty recording', () => {
    const input: AnalysisInput = {
      primary: {
        id: 'recording-1',
        schemaVersion: 1,
        exchanges: [],
      },
    }

    const result = runAnalysis(input)

    expect(result.recordingVersion).toBe(1)
    expect(result.recordingId).toBe('recording-1')
    expect(result.candidates).toHaveLength(0)
    expect(result.rejectedNoise).toHaveLength(0)
  })

  it('produces candidate for JSON token reuse', () => {
    const input: AnalysisInput = {
      primary: {
        id: 'recording-1',
        schemaVersion: 1,
        exchanges: [
          {
            id: 'producer',
            timestamp: '2024-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://example.com/api/token',
            headers: {},
            queryParams: {},
            statusCode: 200,
            responseHeaders: {},
            responseBody: '{"token":"abc123","user":"test"}',
            responseBodySize: 32,
            responseBodyTruncated: false,
            responseBodyContentType: 'application/json',
            responseBodyMeta: {
              available: 'available',
              encoding: 'utf8',
              mimeType: 'application/json',
              size: 32,
              truncated: false,
              source: 'content-fetch',
            },
            captureSources: ['content-fetch'],
            diagnostics: [],
          },
          {
            id: 'consumer',
            timestamp: '2024-01-01T00:00:01.000Z',
            method: 'POST',
            url: 'https://example.com/api/action',
            headers: {
              authorization: 'abc123',
            },
            queryParams: {},
            body: '{"action":"do"}',
            statusCode: 200,
            responseHeaders: {},
            responseBody: '{"status":"ok"}',
            responseBodySize: 16,
            responseBodyTruncated: false,
            responseBodyContentType: 'application/json',
            responseBodyMeta: {
              available: 'available',
              encoding: 'utf8',
              mimeType: 'application/json',
              size: 16,
              truncated: false,
              source: 'content-fetch',
            },
            captureSources: ['content-fetch'],
            diagnostics: [],
          },
        ],
      },
    }

    const result = runAnalysis(input)

    expect(result.candidates.length).toBeGreaterThan(0)
    const tokenCandidate = result.candidates.find((c) => c.sourceLocation.includes('$.token'))
    expect(tokenCandidate).toBeDefined()
    expect(tokenCandidate!.consumerExchangeIds).toContain('consumer')
    expect(tokenCandidate!.confidence).toBeGreaterThan(0)
  })

  it('flags managed session cookie with penalty', () => {
    const input: AnalysisInput = {
      primary: {
        id: 'recording-1',
        schemaVersion: 1,
        exchanges: [
          {
            id: 'session-get',
            timestamp: '2024-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://example.com/api/session',
            headers: {},
            queryParams: {},
            statusCode: 200,
            responseHeaders: {
              'set-cookie': 'JSESSIONID=abc123; Path=/; HttpOnly',
            },
            responseBody: '{"status":"ok"}',
            responseBodySize: 16,
            responseBodyTruncated: false,
            responseBodyContentType: 'application/json',
            responseBodyMeta: {
              available: 'available',
              encoding: 'utf8',
              mimeType: 'application/json',
              size: 16,
              truncated: false,
              source: 'content-fetch',
            },
            captureSources: ['content-fetch'],
            diagnostics: [],
          },
        ],
      },
    }

    const result = runAnalysis(input)

    const sessionCandidate = result.candidates.find((c) => c.candidateType === 'session-id')
    expect(sessionCandidate).toBeDefined()
    expect(sessionCandidate!.reasons).toContain('Managed by JMeter CookieManager')
  })

  it('rejects timestamp values as noise', () => {
    const input: AnalysisInput = {
      primary: {
        id: 'recording-1',
        schemaVersion: 1,
        exchanges: [
          {
            id: 'ts-req',
            timestamp: '2024-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://example.com/api',
            headers: {},
            queryParams: {},
            statusCode: 200,
            responseHeaders: {},
            responseBody: '{"timestamp":"2024-01-01T00:00:00.000Z"}',
            responseBodySize: 40,
            responseBodyTruncated: false,
            responseBodyContentType: 'application/json',
            responseBodyMeta: {
              available: 'available',
              encoding: 'utf8',
              mimeType: 'application/json',
              size: 40,
              truncated: false,
              source: 'content-fetch',
            },
            captureSources: ['content-fetch'],
            diagnostics: [],
          },
        ],
      },
    }

    const result = runAnalysis(input)

    expect(result.rejectedNoise.length).toBeGreaterThan(0)
    expect(result.rejectedNoise.some((c) => c.rejected === true)).toBe(true)
  })

  it('applies value-changes bonus with baseline', () => {
    const input: AnalysisInput = {
      primary: {
        id: 'recording-1',
        schemaVersion: 1,
        exchanges: [
          {
            id: 'primary-producer',
            timestamp: '2024-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://example.com/api/token',
            headers: {},
            queryParams: {},
            statusCode: 200,
            responseHeaders: {},
            responseBody: '{"token":"primary-token-123"}',
            responseBodySize: 30,
            responseBodyTruncated: false,
            responseBodyContentType: 'application/json',
            responseBodyMeta: {
              available: 'available',
              encoding: 'utf8',
              mimeType: 'application/json',
              size: 30,
              truncated: false,
              source: 'content-fetch',
            },
            captureSources: ['content-fetch'],
            diagnostics: [],
          },
          {
            id: 'primary-consumer',
            timestamp: '2024-01-01T00:00:01.000Z',
            method: 'POST',
            url: 'https://example.com/api/action',
            headers: { authorization: 'Bearer primary-token-123' },
            queryParams: {},
            body: '{"action":"do"}',
            statusCode: 200,
            responseHeaders: {},
            responseBody: '{"status":"ok"}',
            responseBodySize: 16,
            responseBodyTruncated: false,
            responseBodyContentType: 'application/json',
            responseBodyMeta: {
              available: 'available',
              encoding: 'utf8',
              mimeType: 'application/json',
              size: 16,
              truncated: false,
              source: 'content-fetch',
            },
            captureSources: ['content-fetch'],
            diagnostics: [],
          },
        ],
      },
      baseline: {
        id: 'recording-2',
        schemaVersion: 1,
        exchanges: [
          {
            id: 'baseline-producer',
            timestamp: '2024-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://example.com/api/token',
            headers: {},
            queryParams: {},
            statusCode: 200,
            responseHeaders: {},
            responseBody: '{"token":"baseline-token-456"}',
            responseBodySize: 32,
            responseBodyTruncated: false,
            responseBodyContentType: 'application/json',
            responseBodyMeta: {
              available: 'available',
              encoding: 'utf8',
              mimeType: 'application/json',
              size: 32,
              truncated: false,
              source: 'content-fetch',
            },
            captureSources: ['content-fetch'],
            diagnostics: [],
          },
          {
            id: 'baseline-consumer',
            timestamp: '2024-01-01T00:00:01.000Z',
            method: 'POST',
            url: 'https://example.com/api/action',
            headers: { authorization: 'Bearer baseline-token-456' },
            queryParams: {},
            body: '{"action":"do"}',
            statusCode: 200,
            responseHeaders: {},
            responseBody: '{"status":"ok"}',
            responseBodySize: 16,
            responseBodyTruncated: false,
            responseBodyContentType: 'application/json',
            responseBodyMeta: {
              available: 'available',
              encoding: 'utf8',
              mimeType: 'application/json',
              size: 16,
              truncated: false,
              source: 'content-fetch',
            },
            captureSources: ['content-fetch'],
            diagnostics: [],
          },
        ],
      },
    }

    const result = runAnalysis(input)

    const tokenCandidate = result.candidates.find((c) => c.sourceLocation.includes('$.token'))
    expect(tokenCandidate).toBeDefined()
    expect(tokenCandidate!.reasons).toContain('Value changed between recordings')
  })

  it('JSON token with named pattern and structural location gets confidence >= 0.3', () => {
    const input: AnalysisInput = {
      primary: {
        id: 'recording-1',
        schemaVersion: 1,
        exchanges: [
          {
            id: 'producer',
            timestamp: '2024-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://example.com/api/token',
            headers: {},
            queryParams: {},
            statusCode: 200,
            responseHeaders: {},
            responseBody: '{"token":"abc123token","data":"hello"}',
            responseBodySize: 35,
            responseBodyTruncated: false,
            responseBodyContentType: 'application/json',
            responseBodyMeta: {
              available: 'available',
              encoding: 'utf8',
              mimeType: 'application/json',
              size: 35,
              truncated: false,
              source: 'content-fetch',
            },
            captureSources: ['content-fetch'],
            diagnostics: [],
          },
          {
            id: 'consumer',
            timestamp: '2024-01-01T00:00:01.000Z',
            method: 'POST',
            url: 'https://example.com/api/action',
            headers: { 'x-token': 'abc123token' },
            queryParams: {},
            body: '{"action":"do"}',
            statusCode: 200,
            responseHeaders: {},
            responseBody: '{"status":"ok"}',
            responseBodySize: 16,
            responseBodyTruncated: false,
            responseBodyContentType: 'application/json',
            responseBodyMeta: {
              available: 'available',
              encoding: 'utf8',
              mimeType: 'application/json',
              size: 16,
              truncated: false,
              source: 'content-fetch',
            },
            captureSources: ['content-fetch'],
            diagnostics: [],
          },
        ],
      },
    }

    const result = runAnalysis(input)

    const tokenCandidate = result.candidates.find((c) => c.candidateType === 'authorization')
    expect(tokenCandidate).toBeDefined()
    // 0.10 (body) + 0.05 (1 consumer) + 0.10 (structuralLocation) + 0.10 (namedTokenPattern) = 0.35
    expect(tokenCandidate!.confidence).toBeGreaterThanOrEqual(0.3)
  })

  it('rejects single-use cache buster values as noise', () => {
    const cacheBusterValue = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'
    const input: AnalysisInput = {
      primary: {
        id: 'recording-1',
        schemaVersion: 1,
        exchanges: [
          {
            id: 'producer',
            timestamp: '2024-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://example.com/api/data',
            headers: {},
            queryParams: {},
            statusCode: 200,
            responseHeaders: {},
            responseBody: `{"_cb":"${cacheBusterValue}","data":"hello"}`,
            responseBodySize: 55,
            responseBodyTruncated: false,
            responseBodyContentType: 'application/json',
            responseBodyMeta: {
              available: 'available',
              encoding: 'utf8',
              mimeType: 'application/json',
              size: 55,
              truncated: false,
              source: 'content-fetch',
            },
            captureSources: ['content-fetch'],
            diagnostics: [],
          },
        ],
      },
    }

    const result = runAnalysis(input)

    const cacheBusterCandidate = result.rejectedNoise.find(
      (c) => c.normalizedValue === cacheBusterValue
    )
    expect(cacheBusterCandidate).toBeDefined()
    expect(cacheBusterCandidate!.confidence).toBe(0)
    expect(cacheBusterCandidate!.reasons).toContain('Hard noise heuristic matched')
  })
})
