import { describe, expect, it } from 'vitest'
import type { PendingRequest } from '../models/pending-web-request'
import type { CapturedRequest } from '../models/captured-request'
import type { ResponseBodyPayload } from '../messages'
import { ResponseBodyMatchingService } from './response-body-matching-service'

const buildPayload = (overrides: Partial<ResponseBodyPayload> = {}): ResponseBodyPayload => ({
  requestId: 'content-1',
  tabId: 1,
  frameId: 0,
  url: 'https://example.com/api',
  method: 'GET',
  status: 200,
  responseHeaders: {},
  body: 'ok',
  error: undefined,
  truncated: false,
  redacted: false,
  size: 2,
  capturedAtMs: Date.now(),
  contentType: 'application/json',
  ...overrides,
})

const pending = (overrides: Partial<PendingRequest> = {}): PendingRequest => ({
  id: 'pending-1',
  timestamp: new Date().toISOString(),
  method: 'GET',
  url: 'https://example.com/api',
  headers: {},
  queryParams: {},
  startedAtMs: Date.now(),
  tabId: 1,
  frameId: 0,
  ...overrides,
})

const completed = (overrides: Partial<CapturedRequest> = {}): CapturedRequest => ({
  id: 'completed-1',
  timestamp: new Date().toISOString(),
  method: 'GET',
  url: 'https://example.com/api',
  headers: {},
  queryParams: {},
  tabId: 1,
  frameId: 0,
  statusCode: 200,
  ...overrides,
})

describe('ResponseBodyMatchingService', () => {
  it('matches a pending request by tab, frame, method, and url', () => {
    const service = new ResponseBodyMatchingService()
    const match = service.findMatch(buildPayload(), [pending()], [])

    expect(match).toEqual({ requestId: 'pending-1', pending: true })
  })

  it('matches a completed request when no pending candidate exists', () => {
    const service = new ResponseBodyMatchingService()
    const match = service.findMatch(buildPayload(), [], [completed()])

    expect(match).toEqual({ requestId: 'completed-1', pending: false })
  })

  it('rejects when status code does not align', () => {
    const service = new ResponseBodyMatchingService()
    const match = service.findMatch(buildPayload({ status: 200 }), [pending({ statusCode: 404 })], [])

    expect(match).toBeUndefined()
  })

  it('returns undefined when more than one candidate matches', () => {
    const service = new ResponseBodyMatchingService()
    const match = service.findMatch(buildPayload(), [pending()], [completed()])

    expect(match).toBeUndefined()
  })

  it('rejects expired completed requests after maxAgeMs', () => {
    const service = new ResponseBodyMatchingService({ maxAgeMs: 1000 })
    const match = service.findMatch(
      buildPayload(),
      [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [completed({ startedAtMs: Date.now() - 2000 } as any)]
    )

    expect(match).toBeUndefined()
  })
})
