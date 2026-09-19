import { describe, expect, it } from 'vitest'
import { applyGroupEdits } from './path-plan'
import { applyPlan, buildProducerIndexMap, validateExportReady } from './jmx-plan-applier'
import { buildJmx } from '../jmx/serializer'
import type { CapturedRequest } from '../models/captured-request'
import type { ScriptTransformationPlan } from './types'
import { proposeGroups } from '../analysis/path-grouping'

function makeExchange(
  id: string,
  opts: {
    url?: string
    method?: string
    timestamp?: string
    headers?: Record<string, string>
  } = {}
): CapturedRequest {
  return {
    id,
    timestamp: opts.timestamp ?? '2024-01-01T00:00:00.000Z',
    method: opts.method ?? 'GET',
    url: opts.url ?? 'https://example.com/api',
    headers: opts.headers ?? {},
    queryParams: {},
  }
}

describe('Feature 21 integration pipeline', () => {
  const requests = [
    makeExchange('login-get', {
      url: 'https://example.com/login',
      method: 'GET',
      timestamp: '2024-01-01T00:00:00.000Z',
    }),
    makeExchange('login-post', {
      url: 'https://example.com/login',
      method: 'POST',
      timestamp: '2024-01-01T00:00:02.000Z',
    }),
    makeExchange('dashboard', {
      url: 'https://example.com/dashboard',
      method: 'GET',
      timestamp: '2024-01-01T00:00:07.000Z',
    }),
  ]

  it('V4.1: proposeGroups produces non-empty groups on the 3-request fixture', () => {
    const proposals = proposeGroups(requests)

    expect(proposals.length).toBeGreaterThan(0)
    expect(proposals[0]!.memberExchangeIds.length).toBeGreaterThan(0)
  })

  it('V4.2: rename draft is reflected in AcceptedGroup.name and in JMX testname', () => {
    const proposals = proposeGroups(requests)
    const drafts = [{ groupId: proposals[0]!.id, name: 'Login Flow' }]
    const accepted = applyGroupEdits(proposals, drafts)

    expect(accepted[0]!.name).toBe('Login Flow')

    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [],
      replacements: [],
      warnings: [],
      groups: accepted,
    }
    const producerIndexMap = buildProducerIndexMap(requests)
    const { groups } = applyPlan(plan, producerIndexMap)

    const jmx = buildJmx(
      { name: 'Grouped Plan', threadGroup: { threads: 1, rampUp: 1, loops: 1 } },
      requests,
      { groups, groupSeparator: true }
    )

    expect(jmx).toContain('testname="Login Flow"')
  })

  it('V4.3: AcceptedGroups produce TransactionController elements with matching testnames', () => {
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
    const producerIndexMap = buildProducerIndexMap(requests)
    const { groups } = applyPlan(plan, producerIndexMap)

    const jmx = buildJmx(
      { name: 'Grouped Plan', threadGroup: { threads: 1, rampUp: 1, loops: 1 } },
      requests,
      { groups, groupSeparator: true }
    )

    expect(jmx).toContain('TransactionController')
    expect(jmx).toContain('testname="Login Flow"')
    expect(jmx).toContain('testname="Dashboard"')
    expect(jmx).toContain('GenericController')
    expect((jmx.match(/<HTTPSamplerProxy\b/g) ?? []).length).toBe(3)
  })

  it('V4.4: all-locked-false plan fails validateExportReady', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [],
      replacements: [],
      warnings: [],
      groups: [
        {
          id: 'g1',
          name: 'Group 1',
          memberExchangeIds: ['login-get'],
          controllerKind: 'SimpleController',
          locked: false,
          thinkTimeEnabled: false,
        },
        {
          id: 'g2',
          name: 'Group 2',
          memberExchangeIds: ['login-post'],
          controllerKind: 'SimpleController',
          locked: false,
          thinkTimeEnabled: false,
        },
      ],
    }

    expect(validateExportReady(plan).ready).toBe(false)
  })

  it('V4.4: plan with at least one locked group passes validateExportReady', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [],
      replacements: [],
      warnings: [],
      groups: [
        {
          id: 'g1',
          name: 'Group 1',
          memberExchangeIds: ['login-get'],
          controllerKind: 'SimpleController',
          locked: false,
          thinkTimeEnabled: false,
        },
        {
          id: 'g2',
          name: 'Group 2',
          memberExchangeIds: ['login-post'],
          controllerKind: 'SimpleController',
          locked: true,
          thinkTimeEnabled: false,
        },
      ],
    }

    expect(validateExportReady(plan).ready).toBe(true)
  })

  it('V4.4: plan with no groups passes validateExportReady', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [],
      replacements: [],
      warnings: [],
    }

    expect(validateExportReady(plan).ready).toBe(true)
  })
})
