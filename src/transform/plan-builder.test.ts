import { describe, expect, it } from 'vitest'
import { buildTransformationPlan } from './plan-builder'
import type { AnalysisDraftState } from './plan-builder'
import type { ValueCandidate, CapturedRequest } from '../analysis/types'

function makeCandidate(
  overrides: Partial<ValueCandidate> &
    Pick<
      ValueCandidate,
      | 'id'
      | 'value'
      | 'sourceExchangeId'
      | 'variableName'
      | 'confidence'
      | 'sourceLocation'
      | 'candidateType'
      | 'consumerLocations'
      | 'consumerExchangeIds'
      | 'reasons'
      | 'warnings'
      | 'scope'
    >
): ValueCandidate {
  return {
    normalizedValue: overrides.value.toLowerCase(),
    proposedExtractor: undefined,
    rejected: false,
    ...overrides,
  }
}

function makeExchange(
  overrides: Partial<CapturedRequest> &
    Pick<CapturedRequest, 'id' | 'timestamp' | 'method' | 'url' | 'headers' | 'queryParams'>
): CapturedRequest {
  return {
    body: '',
    statusCode: 200,
    ...overrides,
  }
}

function makeDraft(
  acceptedIds: string[],
  edits: Map<string, { variableName?: string }> = new Map()
): AnalysisDraftState {
  return { acceptedIds: new Set(acceptedIds), edits }
}

describe('buildTransformationPlan', () => {
  it('produces empty plan when no candidates', () => {
    const plan = buildTransformationPlan([], [], makeDraft([]))

    expect(plan.version).toBe(1)
    expect(plan.correlations).toHaveLength(0)
    expect(plan.parameterizations).toHaveLength(0)
    expect(plan.replacements).toHaveLength(0)
  })

  it('maps single-use JSON candidate to regex extractor', () => {
    const candidates: ValueCandidate[] = [
      makeCandidate({
        id: 'cand-1',
        value: 'abc123',
        confidence: 0.8,
        sourceExchangeId: 'producer-1',
        consumerExchangeIds: ['consumer-1'],
        sourceLocation: '$.token',
        candidateType: 'csrf-token',
        variableName: 'csrf_token',
        consumerLocations: [],
        reasons: ['JSON token found in response'],
        warnings: [],
        scope: { producerIndex: 0, consumerIndices: [1] },
        proposedExtractor: {
          kind: 'jsonpath',
          expression: '$.token',
          variableName: 'csrf_token',
        },
      }),
    ]

    const plan = buildTransformationPlan(candidates, [], makeDraft(['cand-1']))

    expect(plan.correlations).toHaveLength(1)
    const corr = plan.correlations[0]
    expect(corr!.extractor.type).toBe('jsonpath')
    expect(corr!.extractor.expression).toBe('$.token')
  })

  it('skips candidates not in draft.acceptedIds', () => {
    const candidates: ValueCandidate[] = [
      makeCandidate({
        id: 'cand-1',
        value: 'abc123',
        confidence: 0.8,
        sourceExchangeId: 'producer-1',
        consumerExchangeIds: [],
        sourceLocation: '$.token',
        candidateType: 'csrf-token',
        variableName: 'csrf_token',
        consumerLocations: [],
        reasons: ['test'],
        warnings: [],
        scope: { producerIndex: 0, consumerIndices: [] },
      }),
    ]

    const plan = buildTransformationPlan(candidates, [], makeDraft([]))

    expect(plan.correlations).toHaveLength(0)
  })

  it('skips rejected candidates', () => {
    const candidates: ValueCandidate[] = [
      makeCandidate({
        id: 'cand-1',
        value: 'abc123',
        confidence: 0.8,
        sourceExchangeId: 'producer-1',
        consumerExchangeIds: [],
        sourceLocation: '$.token',
        candidateType: 'csrf-token',
        variableName: 'csrf_token',
        consumerLocations: [],
        reasons: ['test'],
        warnings: [],
        scope: { producerIndex: 0, consumerIndices: [] },
        rejected: true,
      }),
    ]

    const plan = buildTransformationPlan(candidates, [], makeDraft(['cand-1']))

    expect(plan.correlations).toHaveLength(0)
  })

  it('honors edits from draft for variable names', () => {
    const candidates: ValueCandidate[] = [
      makeCandidate({
        id: 'cand-1',
        value: 'abc123',
        confidence: 0.8,
        sourceExchangeId: 'producer-1',
        consumerExchangeIds: [],
        sourceLocation: '$.token',
        candidateType: 'csrf-token',
        variableName: 'csrf_token',
        consumerLocations: [],
        reasons: ['test'],
        warnings: [],
        scope: { producerIndex: 0, consumerIndices: [] },
      }),
    ]

    const plan = buildTransformationPlan(
      candidates,
      [],
      makeDraft(['cand-1'], new Map([['cand-1', { variableName: 'custom_name' }]]))
    )

    expect(plan.correlations[0]!.variableName).toBe('custom_name')
  })

  it('creates replacement operations for each consumer found', () => {
    const candidates: ValueCandidate[] = [
      makeCandidate({
        id: 'cand-1',
        value: 'abc123',
        confidence: 0.8,
        sourceExchangeId: 'producer-1',
        consumerExchangeIds: ['consumer-1', 'consumer-2'],
        sourceLocation: '$.token',
        candidateType: 'csrf-token',
        variableName: 'csrf_token',
        consumerLocations: [],
        reasons: ['test'],
        warnings: [],
        scope: { producerIndex: 0, consumerIndices: [1, 2] },
      }),
    ]

    const exchanges: CapturedRequest[] = [
      makeExchange({
        id: 'consumer-1',
        timestamp: '2024-01-01T00:00:01.000Z',
        method: 'GET',
        url: 'https://example.com/api',
        headers: { authorization: 'Bearer abc123' },
        queryParams: {},
      }),
      makeExchange({
        id: 'consumer-2',
        timestamp: '2024-01-01T00:00:02.000Z',
        method: 'GET',
        url: 'https://example.com/api',
        headers: { authorization: 'Bearer abc123' },
        queryParams: {},
      }),
    ]

    const plan = buildTransformationPlan(candidates, exchanges, makeDraft(['cand-1']))

    expect(plan.replacements).toHaveLength(2)
    expect(plan.replacements.map((r) => r.targetExchangeId)).toEqual(
      expect.arrayContaining(['consumer-1', 'consumer-2'])
    )
  })

  it('finds values in consumer headers', () => {
    const candidates: ValueCandidate[] = [
      makeCandidate({
        id: 'cand-1',
        value: 'abc123',
        confidence: 0.8,
        sourceExchangeId: 'producer-1',
        consumerExchangeIds: ['consumer-1'],
        sourceLocation: '$.token',
        candidateType: 'csrf-token',
        variableName: 'csrf_token',
        consumerLocations: [],
        reasons: ['test'],
        warnings: [],
        scope: { producerIndex: 0, consumerIndices: [1] },
      }),
    ]

    const exchanges: CapturedRequest[] = [
      makeExchange({
        id: 'consumer-1',
        timestamp: '2024-01-01T00:00:01.000Z',
        method: 'POST',
        url: 'https://example.com/api/action',
        headers: { authorization: 'Bearer abc123' },
        queryParams: {},
      }),
    ]

    const plan = buildTransformationPlan(candidates, exchanges, makeDraft(['cand-1']))

    expect(plan.replacements).toHaveLength(1)
    expect(plan.replacements[0]!.location).toBe('header')
    expect(plan.replacements[0]!.path).toBe('authorization')
  })

  it('finds values in consumer query params', () => {
    const candidates: ValueCandidate[] = [
      makeCandidate({
        id: 'cand-1',
        value: 'tok-xyz',
        confidence: 0.8,
        sourceExchangeId: 'producer-1',
        consumerExchangeIds: ['consumer-1'],
        sourceLocation: '$.token',
        candidateType: 'csrf-token',
        variableName: 'csrf_token',
        consumerLocations: [],
        reasons: ['test'],
        warnings: [],
        scope: { producerIndex: 0, consumerIndices: [1] },
      }),
    ]

    const exchanges: CapturedRequest[] = [
      makeExchange({
        id: 'consumer-1',
        timestamp: '2024-01-01T00:00:01.000Z',
        method: 'GET',
        url: 'https://example.com/api',
        headers: {},
        queryParams: { token: 'tok-xyz' },
      }),
    ]

    const plan = buildTransformationPlan(candidates, exchanges, makeDraft(['cand-1']))

    expect(plan.replacements).toHaveLength(1)
    expect(plan.replacements[0]!.location).toBe('query')
    expect(plan.replacements[0]!.path).toBe('token')
  })

  it('generates warnings when consumer not found in exchange map', () => {
    const candidates: ValueCandidate[] = [
      makeCandidate({
        id: 'cand-1',
        value: 'abc123',
        confidence: 0.8,
        sourceExchangeId: 'producer-1',
        consumerExchangeIds: ['missing-consumer'],
        sourceLocation: '$.token',
        candidateType: 'csrf-token',
        variableName: 'csrf_token',
        consumerLocations: [],
        reasons: ['test'],
        warnings: [],
        scope: { producerIndex: 0, consumerIndices: [1] },
      }),
    ]

    const plan = buildTransformationPlan(candidates, [], makeDraft(['cand-1']))

    expect(plan.replacements).toHaveLength(0)
    expect(plan.warnings.length).toBeGreaterThan(0)
  })

  it('warns on potentially double-encoded URL values', () => {
    const candidates: ValueCandidate[] = [
      makeCandidate({
        id: 'cand-1',
        value: 'abc%20123',
        confidence: 0.8,
        sourceExchangeId: 'producer-1',
        consumerExchangeIds: ['consumer-1'],
        sourceLocation: '$.token',
        candidateType: 'csrf-token',
        variableName: 'csrf_token',
        consumerLocations: [],
        reasons: ['test'],
        warnings: [],
        scope: { producerIndex: 0, consumerIndices: [1] },
      }),
    ]

    const exchanges: CapturedRequest[] = [
      makeExchange({
        id: 'consumer-1',
        timestamp: '2024-01-01T00:00:01.000Z',
        method: 'GET',
        url: 'https://example.com/api?token=abc%20123',
        headers: {},
        queryParams: {},
      }),
    ]

    const plan = buildTransformationPlan(candidates, exchanges, makeDraft(['cand-1']))

    expect(plan.warnings.some((w) => w.includes('double-encoded'))).toBe(true)
  })

  it('produces warning for non-jsonpath extractor kind falling back to RegexExtractor', () => {
    const candidates: ValueCandidate[] = [
      makeCandidate({
        id: 'cand-1',
        value: 'abc123',
        confidence: 0.8,
        sourceExchangeId: 'producer-1',
        consumerExchangeIds: ['consumer-1'],
        sourceLocation: 'response.body',
        candidateType: 'unknown',
        variableName: 'boundary_token',
        consumerLocations: [],
        reasons: ['test'],
        warnings: [],
        scope: { producerIndex: 0, consumerIndices: [1] },
        proposedExtractor: {
          kind: 'boundary',
          expression: 'abc123',
          variableName: 'boundary_token',
        },
      }),
    ]

    const plan = buildTransformationPlan(candidates, [], makeDraft(['cand-1']))

    expect(plan.warnings.some((w) => w.includes('falling back to RegexExtractor'))).toBe(true)
  })

  it('skips cookie headers in replacement search', () => {
    const candidates: ValueCandidate[] = [
      makeCandidate({
        id: 'cand-1',
        value: 'session=abc',
        confidence: 0.8,
        sourceExchangeId: 'producer-1',
        consumerExchangeIds: ['consumer-1'],
        sourceLocation: 'response.header:set-cookie',
        candidateType: 'cookie',
        variableName: 'session',
        consumerLocations: [],
        reasons: ['test'],
        warnings: [],
        scope: { producerIndex: 0, consumerIndices: [1] },
      }),
    ]

    const exchanges: CapturedRequest[] = [
      makeExchange({
        id: 'consumer-1',
        timestamp: '2024-01-01T00:00:01.000Z',
        method: 'GET',
        url: 'https://example.com/api',
        headers: { cookie: 'session=abc' },
        queryParams: {},
      }),
    ]

    const plan = buildTransformationPlan(candidates, exchanges, makeDraft(['cand-1']))

    expect(plan.replacements).toHaveLength(0)
  })

  it('masks secret header values with header name prefix', () => {
    const candidates: ValueCandidate[] = [
      makeCandidate({
        id: 'cand-1',
        value: 'secret-token',
        confidence: 0.8,
        sourceExchangeId: 'producer-1',
        consumerExchangeIds: ['consumer-1'],
        sourceLocation: 'response.header:authorization',
        candidateType: 'authorization',
        variableName: 'auth_token',
        consumerLocations: [],
        reasons: ['test'],
        warnings: [],
        scope: { producerIndex: 0, consumerIndices: [1] },
      }),
    ]

    const exchanges: CapturedRequest[] = [
      makeExchange({
        id: 'consumer-1',
        timestamp: '2024-01-01T00:00:01.000Z',
        method: 'GET',
        url: 'https://example.com/api',
        headers: { authorization: 'Bearer secret-token' },
        queryParams: {},
      }),
    ]

    const plan = buildTransformationPlan(candidates, exchanges, makeDraft(['cand-1']))

    expect(plan.replacements).toHaveLength(1)
    expect(plan.replacements[0]!.maskedOriginalValue).toBe('authorization: ***')
  })
})
