import { describe, expect, it } from 'vitest'
import { applyPlan, buildProducerIndexMap } from './jmx-plan-applier'
import type { ScriptTransformationPlan } from './types'

describe('applyPlan', () => {
  it('converts jsonpath proposal to JSONPostProcessor extractor', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [
        {
          id: 'c1',
          variableName: 'csrf_token',
          confidence: 0.9,
          producerExchangeId: 'producer-1',
          consumerExchangeIds: ['consumer-1'],
          extractor: {
            type: 'jsonpath',
            expression: '$.token',
            defaultValue: 'NOT_FOUND',
          },
          replacements: [],
          explanation: 'JSON token',
          accepted: true,
        },
      ],
      parameterizations: [],
      replacements: [],
      warnings: [],
    }

    const result = applyPlan(plan, [{ exchangeId: 'producer-1', requestIndex: 0 }])

    const extractors = result.perSamplerExtractors.get(0)
    expect(extractors).toBeDefined()
    expect(extractors).toHaveLength(1)
    expect(extractors![0]!.type).toBe('JSONPostProcessor')
  })

  it('converts regex proposal to RegexExtractor', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [
        {
          id: 'c1',
          variableName: 'token_val',
          confidence: 0.8,
          producerExchangeId: 'producer-1',
          consumerExchangeIds: ['consumer-1'],
          extractor: {
            type: 'regex',
            expression: 'token=([a-f0-9]+)',
            defaultValue: 'NOT_FOUND',
          },
          replacements: [],
          explanation: 'Regex match',
          accepted: true,
        },
      ],
      parameterizations: [],
      replacements: [],
      warnings: [],
    }

    const result = applyPlan(plan, [{ exchangeId: 'producer-1', requestIndex: 0 }])

    const extractors = result.perSamplerExtractors.get(0)
    expect(extractors![0]!.type).toBe('RegexExtractor')
  })

  it('places extractors at correct producer index', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [
        {
          id: 'c1',
          variableName: 'token_a',
          confidence: 0.9,
          producerExchangeId: 'producer-1',
          consumerExchangeIds: ['consumer-1'],
          extractor: { type: 'jsonpath', expression: '$.a', defaultValue: 'NOT_FOUND' },
          replacements: [],
          explanation: '',
          accepted: true,
        },
        {
          id: 'c2',
          variableName: 'token_b',
          confidence: 0.9,
          producerExchangeId: 'producer-2',
          consumerExchangeIds: ['consumer-2'],
          extractor: { type: 'jsonpath', expression: '$.b', defaultValue: 'NOT_FOUND' },
          replacements: [],
          explanation: '',
          accepted: true,
        },
      ],
      parameterizations: [],
      replacements: [],
      warnings: [],
    }

    const result = applyPlan(plan, [
      { exchangeId: 'producer-1', requestIndex: 0 },
      { exchangeId: 'producer-2', requestIndex: 3 },
    ])

    expect(result.perSamplerExtractors.get(0)).toBeDefined()
    expect(result.perSamplerExtractors.get(3)).toBeDefined()
    expect(result.perSamplerExtractors.has(1)).toBe(false)
  })

  it('skips correlations whose producer is not in the index map', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [
        {
          id: 'c1',
          variableName: 'token_a',
          confidence: 0.9,
          producerExchangeId: 'producer-missing',
          consumerExchangeIds: [],
          extractor: { type: 'jsonpath', expression: '$.a', defaultValue: 'NOT_FOUND' },
          replacements: [],
          explanation: '',
          accepted: true,
        },
      ],
      parameterizations: [],
      replacements: [],
      warnings: [],
    }

    const result = applyPlan(plan, [{ exchangeId: 'producer-1', requestIndex: 0 }])

    expect(result.perSamplerExtractors.size).toBe(0)
  })

  it('passes through consumerSubstitutions from plan', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [],
      replacements: [
        {
          variableName: 'csrf_token',
          targetExchangeId: 'consumer-1',
          location: 'header',
          path: 'X-CSRF-Token',
          originalValue: 'abc123',
          maskedOriginalValue: '***',
        },
      ],
      warnings: [],
    }

    const result = applyPlan(plan, [])

    expect(result.consumerSubstitutions).toHaveLength(1)
    expect(result.consumerSubstitutions[0]!.targetExchangeId).toBe('consumer-1')
  })

  it('adds ResponseAssertion when enabled', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [
        {
          id: 'c1',
          variableName: 'csrf_token',
          confidence: 0.9,
          producerExchangeId: 'producer-1',
          consumerExchangeIds: ['consumer-1'],
          extractor: { type: 'jsonpath', expression: '$.token', defaultValue: 'NOT_FOUND' },
          replacements: [],
          explanation: 'JSON token',
          accepted: true,
        },
      ],
      parameterizations: [],
      replacements: [],
      warnings: [],
    }

    const result = applyPlan(plan, [{ exchangeId: 'producer-1', requestIndex: 0 }], {
      responseAssertion: { enabled: true, variableName: 'csrf_token' },
    })

    const assertions = result.perSamplerAssertions.get(0)
    expect(assertions).toBeDefined()
    expect(assertions).toHaveLength(1)
    expect(assertions![0]!.type).toBe('ResponseAssertion')
    expect(assertions![0]!.testField).toBe('Assertion.response_data')
  })
})

describe('buildProducerIndexMap', () => {
  it('maps request IDs to their indices', () => {
    const requests = [{ id: 'req-a' }, { id: 'req-b' }, { id: 'req-c' }]

    const map = buildProducerIndexMap(requests)

    expect(map).toEqual([
      { exchangeId: 'req-a', requestIndex: 0 },
      { exchangeId: 'req-b', requestIndex: 1 },
      { exchangeId: 'req-c', requestIndex: 2 },
    ])
  })

  it('returns empty array for no requests', () => {
    const map = buildProducerIndexMap([])
    expect(map).toHaveLength(0)
  })
})
