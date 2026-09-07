import { describe, expect, it } from 'vitest'
import { buildPlanPreview } from './preview'
import type { ScriptTransformationPlan } from './types'
import type { CapturedRequest } from '../analysis/types'

function makeRequest(id: string, method: string, url: string): CapturedRequest {
  return {
    id,
    timestamp: '2024-01-01T00:00:00.000Z',
    method,
    url,
    headers: {},
    queryParams: {},
    body: '',
    statusCode: 200,
    responseHeaders: {},
    responseBody: '',
    responseBodySize: 0,
    responseBodyTruncated: false,
    responseBodyContentType: undefined,
    captureSources: ['content-fetch'],
    diagnostics: [],
  }
}

describe('buildPlanPreview', () => {
  it('produces empty array when plan has no replacements', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [],
      replacements: [],
      warnings: [],
    }

    const previews = buildPlanPreview(plan, [], [])

    expect(previews).toHaveLength(0)
  })

  it('builds preview for header replacement', () => {
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
          maskedOriginalValue: 'abc123',
        },
      ],
      warnings: [],
    }

    const result = buildPlanPreview(
      plan,
      [makeRequest('consumer-1', 'POST', 'https://example.com/api/action')],
      [{ exchangeId: 'consumer-1', requestIndex: 1 }]
    )

    expect(result).toHaveLength(1)
    expect(result[0]!.exchangeId).toBe('consumer-1')
    expect(result[0]!.requestIndex).toBe(1)
    expect(result[0]!.modifications[0]).toMatchObject({
      variableName: 'csrf_token',
      location: 'header',
      path: 'X-CSRF-Token',
      originalValue: 'abc123',
      substitutedValue: '${csrf_token}',
    })
  })

  it('masks secret values in URL', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [],
      replacements: [
        {
          variableName: 'auth_token',
          targetExchangeId: 'consumer-1',
          location: 'header',
          path: 'authorization',
          originalValue: 'Bearer secret-token',
          maskedOriginalValue: 'Bearer ***',
        },
      ],
      warnings: [],
    }

    const result = buildPlanPreview(
      plan,
      [makeRequest('consumer-1', 'GET', 'https://example.com/api/auth?token=secret-token')],
      [{ exchangeId: 'consumer-1', requestIndex: 0 }]
    )

    // URL doesn't have auth: prefix so it won't be masked, but the modification is
    expect(result[0]!.url).toBe('https://example.com/api/auth?token=secret-token')
    // The modification's masked value should be masked
    expect(result[0]!.modifications[0]!.maskedOriginalValue).toBe('Bearer ***')
    expect(result[0]!.modifications[0]!.substitutedValue).toBe('${auth_token}')
  })

  it('sorts previews by request index', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [],
      replacements: [
        {
          variableName: 'token_b',
          targetExchangeId: 'consumer-2',
          location: 'query',
          path: 'token',
          originalValue: 'val-b',
          maskedOriginalValue: 'val-b',
        },
        {
          variableName: 'token_a',
          targetExchangeId: 'consumer-1',
          location: 'header',
          path: 'Authorization',
          originalValue: 'val-a',
          maskedOriginalValue: '***',
        },
      ],
      warnings: [],
    }

    const result = buildPlanPreview(
      plan,
      [
        makeRequest('consumer-1', 'GET', 'https://example.com/b'),
        makeRequest('consumer-2', 'GET', 'https://example.com/a'),
      ],
      [
        { exchangeId: 'consumer-2', requestIndex: 5 },
        { exchangeId: 'consumer-1', requestIndex: 2 },
      ]
    )

    expect(result).toHaveLength(2)
    expect(result[0]!.requestIndex).toBe(2)
    expect(result[1]!.requestIndex).toBe(5)
  })

  it('skips replacements where target exchange not in index map', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [],
      replacements: [
        {
          variableName: 'token',
          targetExchangeId: 'missing-exchange',
          location: 'header',
          path: 'X-Token',
          originalValue: 'val',
          maskedOriginalValue: '***',
        },
      ],
      warnings: [],
    }

    const result = buildPlanPreview(plan, [], [{ exchangeId: 'other', requestIndex: 0 }])

    expect(result).toHaveLength(0)
  })

  it('groups multiple modifications for same exchange', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [],
      replacements: [
        {
          variableName: 'token',
          targetExchangeId: 'consumer-1',
          location: 'header',
          path: 'Authorization',
          originalValue: 'Bearer abc',
          maskedOriginalValue: 'Bearer ***',
        },
        {
          variableName: 'token',
          targetExchangeId: 'consumer-1',
          location: 'query',
          path: 'access_token',
          originalValue: 'abc',
          maskedOriginalValue: '***',
        },
      ],
      warnings: [],
    }

    const result = buildPlanPreview(
      plan,
      [makeRequest('consumer-1', 'GET', 'https://example.com/api')],
      [{ exchangeId: 'consumer-1', requestIndex: 0 }]
    )

    expect(result).toHaveLength(1)
    expect(result[0]!.modifications).toHaveLength(2)
  })
})
