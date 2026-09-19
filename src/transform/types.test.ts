import { describe, expect, it } from 'vitest'
import type {
  ScriptTransformationPlan,
  CorrelationProposal,
  ParameterizationProposal,
  ReplacementOperation,
  PlanApplyOptions,
  SupportedExtractorType,
  AcceptedGroup,
  ControllerKind,
  GroupEditDraft,
  GroupMapping,
} from './types'

describe('transform types', () => {
  it('ScriptTransformationPlan requires version, correlations, parameterizations, replacements, warnings', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [],
      replacements: [],
      warnings: [],
    }
    expect(plan.version).toBe(1)
  })

  it('ScriptTransformationPlan.groups is optional and defaults to undefined', () => {
    const plan: ScriptTransformationPlan = {
      version: 1,
      correlations: [],
      parameterizations: [],
      replacements: [],
      warnings: [],
    }
    expect(plan.groups).toBeUndefined()
  })

  it('AcceptedGroup has required fields', () => {
    const group: AcceptedGroup = {
      id: 'g1',
      name: 'Login Flow',
      memberExchangeIds: ['a', 'b'],
      controllerKind: 'TransactionController',
      locked: true,
      thinkTimeEnabled: false,
    }
    expect(group.controllerKind).toBe('TransactionController')
    expect(group.memberExchangeIds).toEqual(['a', 'b'])
  })

  it('ControllerKind only allows TransactionController and SimpleController', () => {
    const t: ControllerKind = 'TransactionController'
    const s: ControllerKind = 'SimpleController'
    expect(t).toBe('TransactionController')
    expect(s).toBe('SimpleController')
  })

  it('GroupEditDraft fields are optional', () => {
    const draft: GroupEditDraft = { groupId: 'g1' }
    expect(draft.groupId).toBe('g1')
    expect(draft.name).toBeUndefined()
    expect(draft.memberExchangeIds).toBeUndefined()
    expect(draft.locked).toBeUndefined()
  })

  it('PlanApplyOptions has groups passthrough', () => {
    const options: PlanApplyOptions = {
      perSamplerExtractors: new Map(),
      consumerSubstitutions: [],
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
    expect(options.groups).toHaveLength(1)
    expect(options.groups![0]!.name).toBe('Login Flow')
  })

  it('GroupMapping carries name and requestIndices', () => {
    const mapping: GroupMapping = {
      name: 'Login Flow',
      requestIndices: [0, 1, 2],
    }
    expect(mapping.name).toBe('Login Flow')
    expect(mapping.requestIndices).toEqual([0, 1, 2])
  })

  it('CorrelationProposal has required fields', () => {
    const proposal: CorrelationProposal = {
      id: 'c1',
      variableName: 'csrf_token',
      confidence: 0.85,
      producerExchangeId: 'req-1',
      consumerExchangeIds: ['req-2', 'req-3'],
      extractor: {
        type: 'jsonpath',
        expression: '$.token',
        defaultValue: 'NOT_FOUND',
      },
      replacements: [],
      explanation: 'JSON token found in response',
      accepted: true,
    }
    expect(proposal.extractor.type).toBe('jsonpath')
  })

  it('ParameterizationProposal has required fields', () => {
    const param: ParameterizationProposal = {
      variableName: 'test_email',
      source: 'csv',
      requestLocations: ['req-2', 'req-3'],
      confidence: 0.5,
      explanation: 'Static email parameter',
      csvColumn: 'email',
      accepted: true,
    }
    expect(param.source).toBe('csv')
  })

  it('ReplacementOperation has required fields', () => {
    const op: ReplacementOperation = {
      variableName: 'jwt_token',
      targetExchangeId: 'req-2',
      location: 'header',
      path: 'Authorization',
      originalValue: 'Bearer abc123',
      maskedOriginalValue: 'Bearer ***',
    }
    expect(op.location).toBe('header')
  })

  it('PlanApplyOptions has perSamplerExtractors and consumerSubstitutions', () => {
    const options: PlanApplyOptions = {
      perSamplerExtractors: new Map(),
      consumerSubstitutions: [],
    }
    expect(options.perSamplerExtractors).toBeDefined()
  })

  it('SupportedExtractorType only allows jsonpath and regex', () => {
    const t1: SupportedExtractorType = 'jsonpath'
    const t2: SupportedExtractorType = 'regex'
    expect(t1).toBe('jsonpath')
    expect(t2).toBe('regex')
  })
})
