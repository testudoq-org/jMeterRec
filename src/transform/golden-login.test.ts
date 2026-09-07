import { describe, expect, it } from 'vitest'
import { buildTransformationPlan } from './plan-builder'
import type { AnalysisDraftState } from './plan-builder'
import { applyPlan, buildProducerIndexMap } from './jmx-plan-applier'
import { buildJmx } from '../jmx/serializer'
import type { ValueCandidate, CapturedRequest } from '../analysis/types'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function normalizeJmx(contents: string): string {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trimStart())
    .join('\n')
    .trimEnd()
}

describe('golden login-csrf-token fixture', () => {
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
      captureSources: ['content-fetch'],
      diagnostics: [],
    }
  }

  function makeDraft(ids: string[]): AnalysisDraftState {
    return { acceptedIds: new Set(ids), edits: new Map() }
  }

  it('matches the golden login-csrf-token JMX fixture', () => {
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
      {
        perSamplerExtractors,
        consumerSubstitutions,
        thinkTime: { enabled: false, randomize: false, rangePercent: 20 },
      }
    )

    const goldenPath = fileURLToPath(
      new URL('../../tests/fixtures/golden/golden-20-correlated-login.jmx', import.meta.url)
    )
    const goldenContents = readFileSync(goldenPath, 'utf8')

    expect(normalizeJmx(jmx)).toBe(normalizeJmx(goldenContents))
  })
})
