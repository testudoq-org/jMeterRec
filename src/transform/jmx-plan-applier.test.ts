import { describe, expect, it } from 'vitest'
import type { ScriptTransformationPlan } from './types'
import {
  applyPlan,
  buildProducerIndexMap,
  buildGroupMappings,
  validateExportReady,
} from './jmx-plan-applier'
import type { AcceptedGroup } from './types'

describe('buildGroupMappings', () => {
  const groups: AcceptedGroup[] = [
    {
      id: 'g1',
      name: 'Login Flow',
      memberExchangeIds: ['a', 'b'],
      controllerKind: 'TransactionController',
      locked: true,
      thinkTimeEnabled: false,
    },
    {
      id: 'g2',
      name: 'Dashboard',
      memberExchangeIds: ['c'],
      controllerKind: 'SimpleController',
      locked: false,
      thinkTimeEnabled: false,
    },
  ]

  it('resolves exchange IDs to request indices', () => {
    const map = new Map([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ])
    const mappings = buildGroupMappings(groups, map)

    expect(mappings).toHaveLength(2)
    expect(mappings[0]!.name).toBe('Login Flow')
    expect(mappings[0]!.requestIndices).toEqual([0, 1])
    expect(mappings[1]!.name).toBe('Dashboard')
    expect(mappings[1]!.requestIndices).toEqual([2])
  })

  it('drops groups whose members do not resolve (filtered out)', () => {
    const map = new Map([['a', 0]])
    const mappings = buildGroupMappings(groups, map)

    expect(mappings).toHaveLength(1)
    expect(mappings[0]!.name).toBe('Login Flow')
    expect(mappings[0]!.requestIndices).toEqual([0])
  })

  it('returns empty array for empty groups', () => {
    expect(buildGroupMappings([], new Map())).toEqual([])
  })
})

describe('applyPlan groups passthrough', () => {
  it('includes groups in the applyPlan return value', () => {
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
          memberExchangeIds: ['a', 'b'],
          controllerKind: 'TransactionController',
          locked: true,
          thinkTimeEnabled: false,
        },
      ],
    }
    const result = applyPlan(plan, [
      { exchangeId: 'a', requestIndex: 0 },
      { exchangeId: 'b', requestIndex: 1 },
    ])

    expect(result.groups).toEqual([{ name: 'Login Flow', requestIndices: [0, 1] }])
  })

  it('returns empty groups when plan has none', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [],
      replacements: [],
      warnings: [],
    }
    const result = applyPlan(plan, [])

    expect(result.groups).toEqual([])
  })
})

describe('buildProducerIndexMap', () => {
  it('maps each request id to its index', () => {
    const result = buildProducerIndexMap([{ id: 'a' }, { id: 'b' }, { id: 'c' }])

    expect(result).toEqual([
      { exchangeId: 'a', requestIndex: 0 },
      { exchangeId: 'b', requestIndex: 1 },
      { exchangeId: 'c', requestIndex: 2 },
    ])
  })
})

describe('validateExportReady (V4.4 confirmation gate)', () => {
  it('returns ready:true when there are no groups', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [],
      replacements: [],
      warnings: [],
    }
    expect(validateExportReady(plan)).toEqual({ ready: true })
  })

  it('V4.4: returns ready:false when all groups are locked:false', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [],
      replacements: [],
      warnings: [],
      groups: [
        {
          id: 'g1',
          name: 'A',
          memberExchangeIds: ['a'],
          controllerKind: 'SimpleController',
          locked: false,
          thinkTimeEnabled: false,
        },
        {
          id: 'g2',
          name: 'B',
          memberExchangeIds: ['b'],
          controllerKind: 'SimpleController',
          locked: false,
          thinkTimeEnabled: false,
        },
      ],
    }
    const result = validateExportReady(plan)

    expect(result.ready).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('returns ready:true when at least one group is locked:true', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [],
      replacements: [],
      warnings: [],
      groups: [
        {
          id: 'g1',
          name: 'A',
          memberExchangeIds: ['a'],
          controllerKind: 'SimpleController',
          locked: false,
          thinkTimeEnabled: false,
        },
        {
          id: 'g2',
          name: 'B',
          memberExchangeIds: ['b'],
          controllerKind: 'SimpleController',
          locked: true,
          thinkTimeEnabled: false,
        },
      ],
    }
    expect(validateExportReady(plan)).toEqual({ ready: true })
  })
})
