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
  it('returns match for a pending request by tab, frame, method, and url', () => {
    const service = new ResponseBodyMatchingService()
    const outcome = service.findMatch(buildPayload(), [pending()], [])

    expect(outcome.kind).toBe('match')
    if (outcome.kind === 'match') {
      expect(outcome.match.requestId).toBe('pending-1')
      expect(outcome.match.pending).toBe(true)
    }
  })

  it('returns match for a completed request when no pending candidate exists', () => {
    const service = new ResponseBodyMatchingService()
    const outcome = service.findMatch(buildPayload(), [], [completed()])

    expect(outcome.kind).toBe('match')
    if (outcome.kind === 'match') {
      expect(outcome.match.requestId).toBe('completed-1')
      expect(outcome.match.pending).toBe(false)
    }
  })

  it('returns zero when status code does not align', () => {
    const service = new ResponseBodyMatchingService()
    const outcome = service.findMatch(
      buildPayload({ status: 200 }),
      [pending({ statusCode: 404 })],
      []
    )

    expect(outcome.kind).toBe('zero')
  })

  it('returns ambiguous when more than one candidate matches', () => {
    const service = new ResponseBodyMatchingService()
    const outcome = service.findMatch(buildPayload(), [pending()], [completed()])

    expect(outcome.kind).toBe('ambiguous')
    if (outcome.kind === 'ambiguous') {
      expect(outcome.candidateCount).toBe(2)
      expect(outcome.requestIds).toEqual(['pending-1', 'completed-1'])
    }
  })

  it('returns expired for completed requests older than maxAgeMs', () => {
    const service = new ResponseBodyMatchingService({ maxAgeMs: 1000 })
    const outcome = service.findMatch(
      buildPayload(),
      [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [completed({ startedAtMs: Date.now() - 2000 } as any)]
    )

    expect(outcome.kind).toBe('expired')
    if (outcome.kind === 'expired') {
      expect(outcome.requestId).toBe('completed-1')
    }
  })
})
