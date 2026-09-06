import { describe, expect, it } from 'vitest'
import { detectReuse } from './reuse-detector'
import type { AnalysisOptions } from './types'
import type { CapturedRequest } from '../models/captured-request'

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

describe('detectReuse', () => {
  it('returns producer and consumer for reused value', () => {
    const exchanges: CapturedRequest[] = [
      buildRequest({
        id: 'producer',
        responseBody: '{"token":"abc123"}',
        responseBodyContentType: 'application/json',
      }),
      buildRequest({
        id: 'consumer',
        headers: { authorization: 'abc123' },
      }),
    ]

    const options: AnalysisOptions = { matchStepsBy: 'url-method' }
    const reuseMap = detectReuse(exchanges, options)

    const entry = reuseMap.get('abc123')
    expect(entry).toBeDefined()
    expect(entry!.producerIndex).toBe(0)
    expect(entry!.consumerIndices).toEqual([1])
  })

  it('returns entries with no consumers when values do not match', () => {
    const exchanges: CapturedRequest[] = [
      buildRequest({
        id: 'req-1',
        responseBody: '{"token":"abc123"}',
        responseBodyContentType: 'application/json',
      }),
      buildRequest({
        id: 'req-2',
        headers: { authorization: 'xyz789' },
      }),
    ]

    const options: AnalysisOptions = { matchStepsBy: 'url-method' }
    const reuseMap = detectReuse(exchanges, options)

    expect(reuseMap.size).toBe(2)
    expect(reuseMap.get('abc123')!.consumerIndices).toEqual([])
    expect(reuseMap.get('xyz789')!.consumerIndices).toEqual([])
  })

  it('skips cross-tab consumers when sameTabOnly is true', () => {
    const exchanges: CapturedRequest[] = [
      buildRequest({
        id: 'producer',
        tabId: 1,
        responseBody: '{"token":"abc123"}',
        responseBodyContentType: 'application/json',
      }),
      buildRequest({ id: 'consumer', tabId: 2, headers: { authorization: 'abc123' } }),
    ]

    const options: AnalysisOptions = { sameTabOnly: true, matchStepsBy: 'url-method' }
    const reuseMap = detectReuse(exchanges, options)

    expect(reuseMap.size).toBe(1)
    expect(reuseMap.get('abc123')!.consumerIndices).toEqual([])
  })

  it('ranks producer by body availability then extractor kind', () => {
    const sharedValue = 'abc123'
    const exchanges: CapturedRequest[] = [
      // Exchange 0: value in a response header (kind=header, rank 0), body available
      buildRequest({
        id: 'header-producer',
        responseHeaders: { 'x-token': sharedValue },
      }),
      // Exchange 1: value in JSON body (kind=jsonpath, rank 3), body available
      buildRequest({
        id: 'json-producer',
        responseBody: `{"token":"${sharedValue}"}`,
        responseBodyContentType: 'application/json',
        responseBodyMeta: {
          available: 'available',
          encoding: 'utf8',
          mimeType: 'application/json',
          size: 10,
          truncated: false,
          source: 'content-fetch',
        },
      }),
      // Exchange 2: value in a request header (kind=header, rank 0), body available
      buildRequest({
        id: 'header-consumer',
        headers: { 'x-token': sharedValue },
        responseBodyMeta: {
          available: 'available',
          encoding: 'utf8',
          mimeType: 'application/json',
          size: 0,
          truncated: false,
          source: 'content-fetch',
        },
      }),
    ]

    const options: AnalysisOptions = { matchStepsBy: 'url-method' }
    const reuseMap = detectReuse(exchanges, options)

    const entry = reuseMap.get(sharedValue)
    expect(entry).toBeDefined()
    expect(entry!.producerIndex).toBe(1)
    expect(entry!.consumerIndices).toEqual([0, 2])
  })
})
