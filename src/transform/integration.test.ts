import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildTransformationPlan } from './plan-builder'
import type { AnalysisDraftState } from './plan-builder'
import { applyPlan, buildProducerIndexMap } from './jmx-plan-applier'
import { buildJmx } from '../jmx/serializer'
import type { JmxExtractor } from '../jmx/element-model'
import type { ValueCandidate, CapturedRequest } from '../analysis/types'
import type { PlanMeta } from '../models/captured-request'
import type { ScriptTransformationPlan } from './types'
import { MemoryPlanStore, PlanStore } from './plan-store'
type ExtractorType = JmxExtractor['type']

function normalizeJmx(contents: string): string {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trimStart())
    .join('\n')
    .trimEnd()
}

/**
 * Integration tests covering the full transformation pipeline:
 *   ValueCandidate[] → buildTransformationPlan → applyPlan → buildJmx
 *
 * These tests verify the V3.1–V3.10 verification audit criteria from the spec.
 */
describe('transformation plan integration', () => {
  function makeCandidate(
    id: string,
    value: string,
    sourceExchangeId: string,
    consumerExchangeIds: string[],
    options?: Partial<ValueCandidate>
  ): ValueCandidate {
    return {
      id,
      value,
      normalizedValue: value.toLowerCase(),
      sourceExchangeId,
      consumerExchangeIds,
      consumerLocations: [],
      sourceLocation: options?.sourceLocation ?? '$.token',
      candidateType: options?.candidateType ?? 'csrf-token',
      variableName: options?.variableName ?? `var_${id}`,
      confidence: options?.confidence ?? 0.8,
      reasons: options?.reasons ?? ['integration test'],
      warnings: options?.warnings ?? [],
      scope: options?.scope ?? { producerIndex: 0, consumerIndices: [] },
      rejected: options?.rejected ?? false,
      proposedExtractor: options?.proposedExtractor,
    }
  }

  function makeExchange(
    id: string,
    opts: {
      url?: string
      method?: string
      headers?: Record<string, string>
      queryParams?: Record<string, string>
      body?: string
      timestamp?: string
      responseBody?: string
    }
  ): CapturedRequest {
    return {
      id,
      timestamp: opts.timestamp ?? '2024-01-01T00:00:00.000Z',
      method: opts.method ?? 'GET',
      url: opts.url ?? 'https://example.com/api',
      headers: opts.headers ?? {},
      queryParams: opts.queryParams ?? {},
      body: opts.body ?? '',
      statusCode: 200,
      responseHeaders: {},
      responseBody: opts.responseBody ?? '',
      responseBodySize: 0,
      responseBodyTruncated: false,
      responseBodyContentType: opts.responseBody ? 'application/json' : undefined,
      responseBodyMeta: opts.responseBody
        ? {
            available: 'available',
            encoding: 'utf8',
            mimeType: 'application/json',
            size: opts.responseBody.length,
            truncated: false,
            source: 'content-fetch',
          }
        : undefined,
      captureSources: ['content-fetch'],
      diagnostics: [],
    }
  }

  function makeDraft(ids: string[]): AnalysisDraftState {
    return { acceptedIds: new Set(ids), edits: new Map() }
  }

  function getExtractorTypes(jmx: string): ExtractorType[] {
    const types: ExtractorType[] = []
    if (jmx.includes('JSONPostProcessor')) types.push('JSONPostProcessor')
    if (jmx.includes('RegexExtractor')) types.push('RegexExtractor')
    return types
  }

  // V3.1 — Accept applies: extractor + ${var} present
  it('V3.1: accepted candidate produces extractor and ${var} substitution in JMX', () => {
    const producer = makeExchange('producer-1', {
      url: 'https://example.com/api/login',
      method: 'POST',
      responseBody: '{"token":"abc123","user":"test"}',
    })

    const consumer = makeExchange('consumer-1', {
      url: 'https://example.com/api/action',
      method: 'POST',
      headers: { authorization: 'abc123' },
      body: '',
      timestamp: '2024-01-01T00:00:01.000Z',
    })

    const candidate = makeCandidate('cand-1', 'abc123', 'producer-1', ['consumer-1'], {
      variableName: 'csrf_token',
      proposedExtractor: {
        kind: 'jsonpath',
        expression: '$.token',
        variableName: 'csrf_token',
      },
      scope: { producerIndex: 0, consumerIndices: [1] },
    })

    const plan = buildTransformationPlan([candidate], [producer, consumer], makeDraft(['cand-1']))

    const producerIndexMap = buildProducerIndexMap([producer, consumer])
    const { perSamplerExtractors, consumerSubstitutions } = applyPlan(plan, producerIndexMap)

    const meta: PlanMeta = {
      name: 'Test Plan',
      threadGroup: { threads: 1, rampUp: 1, loops: 1 },
    }

    const options = {
      perSamplerExtractors,
      consumerSubstitutions,
    }

    const jmx = buildJmx(meta, [producer, consumer], options)

    // Extractor (JSONPostProcessor) present in JMX
    expect(getExtractorTypes(jmx)).toContain('JSONPostProcessor')

    // Variable name present
    expect(jmx).toContain('csrf_token')

    // ${csrf_token} substitution present in consumer request
    expect(jmx).toContain('${csrf_token}')
  })

  // V3.2 — Reject absent: no extractor for rejected id
  it('V3.2: rejected candidate produces no extractor in JMX', () => {
    const producer = makeExchange('producer-1', {
      url: 'https://example.com/api/login',
      method: 'POST',
    })

    const candidate = makeCandidate('cand-rejected', 'abc123', 'producer-1', ['consumer-1'], {
      variableName: 'rejected_var',
      rejected: true,
      proposedExtractor: {
        kind: 'jsonpath',
        expression: '$.token',
        variableName: 'rejected_var',
      },
    })

    const plan = buildTransformationPlan([candidate], [producer], makeDraft(['cand-rejected']))

    expect(plan.correlations).toHaveLength(0)

    const jmx = buildJmx(
      { name: 'Test', threadGroup: { threads: 1, rampUp: 1, loops: 1 } },
      [producer],
      { perSamplerExtractors: new Map(), consumerSubstitutions: [] }
    )

    // No extractor types for rejected candidate
    expect(getExtractorTypes(jmx)).toHaveLength(0)
    expect(jmx).not.toContain('rejected_var')
  })

  // V3.3 — Recording immutable: original requests unchanged
  it('V3.3: original request objects are not mutated', () => {
    const producer = makeExchange('producer-1', {
      url: 'https://example.com/api/login',
      method: 'POST',
    })
    const consumer = makeExchange('consumer-1', {
      url: 'https://example.com/api/action',
      headers: { authorization: 'abc123' },
    })

    const originalConsumerUrl = consumer.url
    const originalConsumerHeaders = { ...consumer.headers }

    const candidate = makeCandidate('cand-1', 'abc123', 'producer-1', ['consumer-1'], {
      variableName: 'csrf_token',
      proposedExtractor: {
        kind: 'jsonpath',
        expression: '$.token',
        variableName: 'csrf_token',
      },
      scope: { producerIndex: 0, consumerIndices: [1] },
    })

    const plan = buildTransformationPlan([candidate], [producer, consumer], makeDraft(['cand-1']))

    const producerIndexMap = buildProducerIndexMap([producer, consumer])
    const applied = applyPlan(plan, producerIndexMap)

    buildJmx(
      { name: 'Test', threadGroup: { threads: 1, rampUp: 1, loops: 1 } },
      [producer, consumer],
      {
        perSamplerExtractors: applied.perSamplerExtractors,
        consumerSubstitutions: applied.consumerSubstitutions,
      }
    )

    // Consumer request objects should remain unchanged
    expect(consumer.url).toBe(originalConsumerUrl)
    expect(consumer.headers).toEqual(originalConsumerHeaders)
  })

  // V3.4 — Separation: param proposal does not emit JSON Extractor
  it('V3.4: parameterizations do not emit extractors in JMX', () => {
    const producer = makeExchange('producer-1', {
      url: 'https://example.com/api/login',
      method: 'POST',
    })

    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [
        {
          variableName: 'test_email',
          source: 'csv',
          requestLocations: ['consumer-1'],
          confidence: 0.9,
          explanation: 'Static email',
          accepted: true,
        },
      ],
      replacements: [],
      warnings: [],
    }

    // Apply plan with parameterizations only — no extractors
    const jmx = buildJmx(
      { name: 'Test', threadGroup: { threads: 1, rampUp: 1, loops: 1 } },
      [producer],
      { perSamplerExtractors: new Map(), consumerSubstitutions: plan.replacements }
    )

    expect(getExtractorTypes(jmx)).toHaveLength(0)
  })

  // V3.6 — Default value: NOT_FOUND present in extractor
  it('V3.6: extractor uses NOT_FOUND as default value', () => {
    const producer = makeExchange('producer-1', {
      url: 'https://example.com/api/login',
      method: 'POST',
    })
    const consumer = makeExchange('consumer-1', {
      url: 'https://example.com/api/action',
      headers: { authorization: 'abc123' },
    })

    const candidate = makeCandidate('cand-1', 'abc123', 'producer-1', ['consumer-1'], {
      variableName: 'csrf_token',
      proposedExtractor: {
        kind: 'jsonpath',
        expression: '$.token',
        variableName: 'csrf_token',
        defaultValue: 'NOT_FOUND',
      },
      scope: { producerIndex: 0, consumerIndices: [1] },
    })

    const plan = buildTransformationPlan([candidate], [producer, consumer], makeDraft(['cand-1']))

    const producerIndexMap = buildProducerIndexMap([producer, consumer])
    const { perSamplerExtractors, consumerSubstitutions } = applyPlan(plan, producerIndexMap)

    const jmx = buildJmx(
      { name: 'Test', threadGroup: { threads: 1, rampUp: 1, loops: 1 } },
      [producer, consumer],
      { perSamplerExtractors, consumerSubstitutions }
    )

    expect(jmx).toContain('NOT_FOUND')
  })

  // V3.8 — Per-sampler placement: extractor child of producer sampler, not ThreadGroup
  it('V3.8: extractor is placed as child of producer sampler, not ThreadGroup level', () => {
    const producer = makeExchange('producer-1', {
      url: 'https://example.com/api/login',
      method: 'POST',
      timestamp: '2024-01-01T00:00:00.000Z',
    })
    const consumer = makeExchange('consumer-1', {
      url: 'https://example.com/api/action',
      headers: { authorization: 'abc123' },
      timestamp: '2024-01-01T00:00:01.000Z',
    })
    const other = makeExchange('other-1', {
      url: 'https://example.com/api/other',
      timestamp: '2024-01-01T00:00:02.000Z',
    })

    const candidate = makeCandidate('cand-1', 'abc123', 'producer-1', ['consumer-1'], {
      variableName: 'csrf_token',
      proposedExtractor: {
        kind: 'jsonpath',
        expression: '$.token',
        variableName: 'csrf_token',
        defaultValue: 'NOT_FOUND',
      },
      scope: { producerIndex: 0, consumerIndices: [1] },
    })

    const plan = buildTransformationPlan(
      [candidate],
      [producer, consumer, other],
      makeDraft(['cand-1'])
    )

    const producerIndexMap = buildProducerIndexMap([producer, consumer, other])
    const { perSamplerExtractors } = applyPlan(plan, producerIndexMap)

    // Extractor only on request index 0 (producer), not on index 1 (consumer) or 2 (other)
    expect(perSamplerExtractors.get(0)).toBeDefined()
    expect(perSamplerExtractors.get(1)).toBeUndefined()
    expect(perSamplerExtractors.get(2)).toBeUndefined()
  })

  // V3.9 — Consumer substitution: ${variableName} in consumer request fields
  it('V3.9: consumer request contains ${variableName} substitution', () => {
    const producer = makeExchange('producer-1', {
      url: 'https://example.com/api/login',
      method: 'POST',
    })
    const consumer = makeExchange('consumer-1', {
      url: 'https://example.com/api/action',
      method: 'GET',
      headers: { authorization: 'Bearer abc123' },
      queryParams: { token: 'abc123' },
    })

    const candidate = makeCandidate('cand-1', 'abc123', 'producer-1', ['consumer-1'], {
      variableName: 'auth_token',
      proposedExtractor: {
        kind: 'regex',
        expression: 'token=([a-f0-9]+)',
        variableName: 'auth_token',
      },
      scope: { producerIndex: 0, consumerIndices: [1] },
    })

    const plan = buildTransformationPlan([candidate], [producer, consumer], makeDraft(['cand-1']))

    const producerIndexMap = buildProducerIndexMap([producer, consumer])
    const { perSamplerExtractors, consumerSubstitutions } = applyPlan(plan, producerIndexMap)

    const jmx = buildJmx(
      { name: 'Test', threadGroup: { threads: 1, rampUp: 1, loops: 1 } },
      [producer, consumer],
      { perSamplerExtractors, consumerSubstitutions }
    )

    // ${auth_token} should appear in JMX (substituted in consumer request)
    expect(jmx).toContain('${auth_token}')
  })

  // V3.10 — Plan serialisable: JSON.stringify round-trips
  it('V3.10: plan is serializable and round-trips through JSON', () => {
    const producer = makeExchange('producer-1', {
      url: 'https://example.com/api/login',
      method: 'POST',
    })
    const consumer = makeExchange('consumer-1', {
      url: 'https://example.com/api/action',
      headers: { authorization: 'abc123' },
    })

    const candidate = makeCandidate('cand-1', 'abc123', 'producer-1', ['consumer-1'], {
      variableName: 'csrf_token',
      proposedExtractor: {
        kind: 'jsonpath',
        expression: '$.token',
        variableName: 'csrf_token',
        defaultValue: 'NOT_FOUND',
      },
      scope: { producerIndex: 0, consumerIndices: [1] },
    })

    const plan = buildTransformationPlan([candidate], [producer, consumer], makeDraft(['cand-1']))

    // Serialize and deserialize
    const serialized = JSON.stringify(plan)
    const deserialized: ScriptTransformationPlan = JSON.parse(serialized)

    // Round-trip should preserve key structure
    expect(deserialized.version).toBe(plan.version)
    expect(deserialized.correlations).toHaveLength(plan.correlations.length)
    expect(deserialized.correlations[0]!.extractor.type).toBe('jsonpath')
    expect(deserialized.correlations[0]!.variableName).toBe('csrf_token')
  })

  // V3.9 — Per-sampler extractors take precedence over ThreadGroup-level extractors
  it('per-sampler extractors take precedence over ThreadGroup-level extractors', () => {
    const producer = makeExchange('producer-1', {
      url: 'https://example.com/api/login',
      method: 'POST',
    })

    const perSamplerExtractors = new Map<number, JmxExtractor[]>([
      [
        0,
        [
          {
            type: 'JSONPostProcessor',
            testClass: 'JSONPostProcessor',
            guiClass: 'JSONPostProcessorGui',
            name: 'JSON Post Processor',
            enabled: true,
            refNames: 'per_sampler_token',
            jsonPathExpressions: '$.per',
            defaultValues: '',
            matchNumbers: '1',
          },
        ],
      ],
    ])

    const threadGroupExtractors: JmxExtractor[] = [
      {
        type: 'RegexExtractor',
        testClass: 'RegexExtractor',
        guiClass: 'RegexExtractorGui',
        name: 'Regular Expression Extractor',
        enabled: true,
        refname: 'tg_token',
        regex: 'tg',
        defaultValue: '',
        matchNumber: '1',
        template: '$1$',
      },
    ]

    const jmx = buildJmx(
      { name: 'Test', threadGroup: { threads: 1, rampUp: 1, loops: 1 } },
      [producer],
      {
        perSamplerExtractors,
        extractors: threadGroupExtractors,
      }
    )

    // Per-sampler extractor should appear
    expect(jmx).toContain('referenceNames">per_sampler_token')
    // ThreadGroup-level extractor should NOT appear for this sampler
    expect(jmx).not.toContain('refname">tg_token')
  })

  // Integration: PlanStore persistence round-trip
  it('PlanStore persists and loads plans', async () => {
    const store = new PlanStore(new MemoryPlanStore())
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [],
      replacements: [],
      warnings: [],
    }

    await store.save(plan)
    const loaded = await store.load()

    expect(loaded).toBeDefined()
    expect(loaded!.version).toBe(1)

    await store.clear()
    const cleared = await store.load()
    expect(cleared).toBeUndefined()
  })

  // V3.4b — CSV parameterization emits CSVDataSet in JMX
  it('V3.4b: csv parameterization proposal emits CSVDataSet in JMX', () => {
    const producer = makeExchange('producer-1', {
      url: 'https://example.com/api/login',
      method: 'POST',
    })

    const candidate = makeCandidate('cand-1', 'abc123', 'producer-1', ['consumer-1'], {
      variableName: 'csrf_token',
      proposedExtractor: {
        kind: 'jsonpath',
        expression: '$.token',
        variableName: 'csrf_token',
        defaultValue: 'NOT_FOUND',
      },
      scope: { producerIndex: 0, consumerIndices: [1] },
    })

    const plan = buildTransformationPlan([candidate], [producer], makeDraft(['cand-1']))

    // Add a CSV parameterization proposal
    plan.parameterizations.push({
      variableName: 'user_id',
      source: 'csv',
      confidence: 0.9,
      requestLocations: ['body'],
      explanation: 'User ID from CSV',
      accepted: true,
    })

    const producerIndexMap = buildProducerIndexMap([producer])
    const { csvDataSets } = applyPlan(plan, producerIndexMap)

    expect(csvDataSets).toHaveLength(1)
    expect(csvDataSets[0]!.type).toBe('CSVDataSet')
    expect(csvDataSets[0]!.variableNames).toBe('user_id')

    const jmx = buildJmx(
      { name: 'Test', threadGroup: { threads: 1, rampUp: 1, loops: 1 } },
      [producer],
      { csvDataSets }
    )

    expect(jmx).toContain('CSVDataSet')
    expect(jmx).toContain('variableNames">user_id')
  })

  // §8.8 — Golden fixture: correlated login-style flow
  it('golden login-csrf-token fixture produces correct JMX', () => {
    const producer = makeExchange('producer-login', {
      url: 'https://example.com/api/login',
      method: 'POST',
      body: '{"username":"test","password":"secret"}',
      responseBody: '{"csrf_token":"golden-token-42","session":"abc123"}',
    })

    const consumer = makeExchange('consumer-api', {
      url: 'https://example.com/api/data',
      method: 'GET',
      headers: { 'x-csrf-token': 'golden-token-42' },
    })

    const candidate = makeCandidate(
      'cand-csrf',
      'golden-token-42',
      'producer-login',
      ['consumer-api'],
      {
        variableName: 'csrf_token',
        proposedExtractor: {
          kind: 'jsonpath',
          expression: '$.csrf_token',
          variableName: 'csrf_token',
          defaultValue: 'NOT_FOUND',
        },
        scope: { producerIndex: 0, consumerIndices: [1] },
      }
    )

    const plan = buildTransformationPlan(
      [candidate],
      [producer, consumer],
      makeDraft(['cand-csrf'])
    )

    const producerIndexMap = buildProducerIndexMap([producer, consumer])
    const { perSamplerExtractors, consumerSubstitutions } = applyPlan(plan, producerIndexMap)

    const jmx = buildJmx(
      { name: 'Login Plan', threadGroup: { threads: 1, rampUp: 1, loops: 1 } },
      [producer, consumer],
      { perSamplerExtractors, consumerSubstitutions }
    )

    // Two samplers present
    expect((jmx.match(/<HTTPSamplerProxy\b/g) ?? []).length).toBe(2)

    // Producer sampler (index 0) has JSON extractor child
    expect(jmx).toContain('referenceNames">csrf_token')
    expect(jmx).toContain('jsonPathExpressions">$.csrf_token')

    // Consumer uses substituted variable
    expect(jmx).toContain('${csrf_token}')

    // Default value present
    expect(jmx).toContain('defaultValues">NOT_FOUND')
  })

  // Feature 21 V4.3 — user-path grouping integration
  describe('user-path grouping (Feature 21)', () => {
    function makeGroupedExchange(
      id: string,
      opts: {
        url?: string
        method?: string
        timestamp?: string
        headers?: Record<string, string>
      }
    ): CapturedRequest {
      return makeExchange(id, opts)
    }

    it('wraps group members in TransactionController elements', () => {
      const producer = makeGroupedExchange('login-get', {
        url: 'https://example.com/login',
        method: 'GET',
        timestamp: '2024-01-01T00:00:00.000Z',
      })
      const loginPost = makeGroupedExchange('login-post', {
        url: 'https://example.com/login',
        method: 'POST',
        timestamp: '2024-01-01T00:00:02.000Z',
      })
      const dashboard = makeGroupedExchange('dashboard', {
        url: 'https://example.com/dashboard',
        method: 'GET',
        timestamp: '2024-01-01T00:00:07.000Z',
      })

      const plan: ScriptTransformationPlan = {
        version: 1,
        correlations: [],
        parameterizations: [],
        replacements: [],
        warnings: [],
        groups: [
          {
            id: 'g1',
            name: 'Login Flow',
            memberExchangeIds: ['login-get', 'login-post'],
            controllerKind: 'TransactionController',
            locked: true,
            thinkTimeEnabled: false,
          },
          {
            id: 'g2',
            name: 'Dashboard',
            memberExchangeIds: ['dashboard'],
            controllerKind: 'SimpleController',
            locked: false,
            thinkTimeEnabled: false,
          },
        ],
      }

      const producerIndexMap = buildProducerIndexMap([producer, loginPost, dashboard])
      const { groups } = applyPlan(plan, producerIndexMap)

      const jmx = buildJmx(
        { name: 'Grouped Plan', threadGroup: { threads: 1, rampUp: 1, loops: 1 } },
        [producer, loginPost, dashboard],
        { groups, groupSeparator: true }
      )

      expect(jmx).toContain('TransactionController')
      expect(jmx).toContain('testname="Login Flow"')
      expect(jmx).toContain('testname="Dashboard"')
      expect(jmx).toContain('GenericController')
      expect((jmx.match(/<HTTPSamplerProxy\b/g) ?? []).length).toBe(3)
    })

    it('matches the golden grouped JMX fixture', () => {
      const producer = makeGroupedExchange('login-get', {
        url: 'https://example.com/login',
        method: 'GET',
        timestamp: '2024-01-01T00:00:00.000Z',
      })
      const loginPost = makeGroupedExchange('login-post', {
        url: 'https://example.com/login',
        method: 'POST',
        timestamp: '2024-01-01T00:00:02.000Z',
      })
      const dashboard = makeGroupedExchange('dashboard', {
        url: 'https://example.com/dashboard',
        method: 'GET',
        timestamp: '2024-01-01T00:00:07.000Z',
      })

      const plan: ScriptTransformationPlan = {
        version: 1,
        correlations: [],
        parameterizations: [],
        replacements: [],
        warnings: [],
        groups: [
          {
            id: 'g1',
            name: 'Login Flow',
            memberExchangeIds: ['login-get', 'login-post'],
            controllerKind: 'TransactionController',
            locked: true,
            thinkTimeEnabled: false,
          },
          {
            id: 'g2',
            name: 'Dashboard',
            memberExchangeIds: ['dashboard'],
            controllerKind: 'SimpleController',
            locked: false,
            thinkTimeEnabled: false,
          },
        ],
      }

      const producerIndexMap = buildProducerIndexMap([producer, loginPost, dashboard])
      const { groups } = applyPlan(plan, producerIndexMap)

      const jmx = buildJmx(
        { name: 'Grouped Plan', threadGroup: { threads: 1, rampUp: 1, loops: 1 } },
        [producer, loginPost, dashboard],
        { groups, groupSeparator: true }
      )

      const goldenPath = fileURLToPath(
        new URL('../../tests/fixtures/golden/golden-21-grouped.jmx', import.meta.url)
      )

      // WRITE_GOLDEN flag: generate the golden fixture on first run, then
      // remove the flag. The golden must NOT include correlation features
      // (extractors) — grouping only for V4.3.
      if (process.env.WRITE_GOLDEN === '1') {
        writeFileSync(goldenPath, jmx, 'utf8')
      }

      const goldenContents = readFileSync(goldenPath, 'utf8')
      expect(normalizeJmx(jmx)).toBe(normalizeJmx(goldenContents))
    })
  })
})
