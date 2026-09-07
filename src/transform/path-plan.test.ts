import { describe, expect, it } from 'vitest'
import type { ProposedGroup } from '../analysis/types'
import { applyGroupEdits, buildGroupMemberIndexMap } from './path-plan'
import type { GroupEditDraft, AcceptedGroup } from './types'

function makeProposal(id: string, name: string, memberExchangeIds: string[]): ProposedGroup {
  return {
    id,
    name,
    memberExchangeIds,
    source: 'auto',
    confidence: 1.0,
    locked: false,
    explanation: 'test proposal',
  }
}

describe('applyGroupEdits', () => {
  it('V4.2: rename proposal is reflected in the accepted group', () => {
    const proposals = [makeProposal('g1', 'Navigation 1', ['a', 'b'])]
    const drafts: GroupEditDraft[] = [{ groupId: 'g1', name: 'Login Flow' }]

    const accepted = applyGroupEdits(proposals, drafts)

    expect(accepted).toHaveLength(1)
    expect(accepted[0]!.name).toBe('Login Flow')
    expect(accepted[0]!.memberExchangeIds).toEqual(['a', 'b'])
    expect(accepted[0]!.locked).toBe(true)
    expect(accepted[0]!.controllerKind).toBe('TransactionController')
  })

  it('merge: two proposals combined into one group', () => {
    const proposals = [
      makeProposal('g1', 'Nav 1', ['a', 'b']),
      makeProposal('g2', 'Nav 2', ['c', 'd']),
    ]
    // Merge draft on g1 pulls in g2's members; g2 is then skipped.
    const drafts: GroupEditDraft[] = [{ groupId: 'g1', memberExchangeIds: ['a', 'b', 'c', 'd'] }]

    const accepted = applyGroupEdits(proposals, drafts)

    expect(accepted).toHaveLength(1)
    expect(accepted[0]!.memberExchangeIds).toEqual(['a', 'b', 'c', 'd'])
    expect(accepted[0]!.controllerKind).toBe('TransactionController')
  })

  it('split: one proposal split into two groups', () => {
    const proposals = [makeProposal('g1', 'Nav 1', ['a', 'b', 'c'])]
    const drafts: GroupEditDraft[] = [{ groupId: 'g1', memberExchangeIds: ['a'] }]

    const accepted = applyGroupEdits(proposals, drafts)

    expect(accepted).toHaveLength(2)
    expect(accepted[0]!.memberExchangeIds).toEqual(['a'])
    expect(accepted[1]!.memberExchangeIds).toEqual(['b', 'c'])
  })

  it('reorder: memberExchangeIds order changed in output', () => {
    const proposals = [makeProposal('g1', 'Nav 1', ['a', 'b', 'c'])]
    const drafts: GroupEditDraft[] = [{ groupId: 'g1', memberExchangeIds: ['c', 'b', 'a'] }]

    const accepted = applyGroupEdits(proposals, drafts)

    expect(accepted).toHaveLength(1)
    expect(accepted[0]!.memberExchangeIds).toEqual(['c', 'b', 'a'])
  })

  it('no drafts: all groups locked:false, names from proposals', () => {
    const proposals = [makeProposal('g1', 'Nav 1', ['a']), makeProposal('g2', 'Nav 2', ['b', 'c'])]

    const accepted = applyGroupEdits(proposals, [])

    expect(accepted).toHaveLength(2)
    expect(accepted[0]!.locked).toBe(false)
    expect(accepted[1]!.locked).toBe(false)
    expect(accepted[0]!.name).toBe('Nav 1')
    expect(accepted[1]!.name).toBe('Nav 2')
  })

  it('V4.4: all groups locked:false triggers confirmation gate', () => {
    const proposals = [makeProposal('g1', 'Nav 1', ['a'])]
    const accepted = applyGroupEdits(proposals, [])

    expect(accepted.every((g) => g.locked === false)).toBe(true)
  })

  it('single-member group uses SimpleController', () => {
    const proposals = [makeProposal('g1', 'Nav 1', ['a'])]
    const accepted = applyGroupEdits(proposals, [])

    expect(accepted[0]!.controllerKind).toBe('SimpleController')
  })

  it('multi-member group uses TransactionController', () => {
    const proposals = [makeProposal('g1', 'Nav 1', ['a', 'b'])]
    const accepted = applyGroupEdits(proposals, [])

    expect(accepted[0]!.controllerKind).toBe('TransactionController')
  })

  it('empty proposals produces empty accepted groups', () => {
    expect(applyGroupEdits([], [])).toEqual([])
  })

  it('thinkTimeEnabled option is propagated', () => {
    const proposals = [makeProposal('g1', 'Nav 1', ['a', 'b'])]
    const accepted = applyGroupEdits(proposals, [], { thinkTimeEnabled: true })

    expect(accepted[0]!.thinkTimeEnabled).toBe(true)
  })

  it('explicit locked:false overrides auto-lock', () => {
    const proposals = [makeProposal('g1', 'Nav 1', ['a', 'b'])]
    const drafts: GroupEditDraft[] = [{ groupId: 'g1', name: 'Renamed', locked: false }]
    const accepted = applyGroupEdits(proposals, drafts)

    expect(accepted[0]!.locked).toBe(false)
    expect(accepted[0]!.name).toBe('Renamed')
  })
})

describe('buildGroupMemberIndexMap', () => {
  it('maps exchange IDs to their group index', () => {
    const groups: AcceptedGroup[] = [
      {
        id: 'g1',
        name: 'A',
        memberExchangeIds: ['a', 'b'],
        controllerKind: 'TransactionController',
        locked: false,
        thinkTimeEnabled: false,
      },
      {
        id: 'g2',
        name: 'B',
        memberExchangeIds: ['c'],
        controllerKind: 'SimpleController',
        locked: false,
        thinkTimeEnabled: false,
      },
    ]
    const map = buildGroupMemberIndexMap(groups)

    expect(map.get('a')).toBe(0)
    expect(map.get('b')).toBe(0)
    expect(map.get('c')).toBe(1)
  })

  it('first group wins on collision', () => {
    const groups: AcceptedGroup[] = [
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
        memberExchangeIds: ['a'],
        controllerKind: 'SimpleController',
        locked: false,
        thinkTimeEnabled: false,
      },
    ]
    const map = buildGroupMemberIndexMap(groups)

    expect(map.get('a')).toBe(0)
  })

  it('returns empty map for empty groups', () => {
    expect(buildGroupMemberIndexMap([]).size).toBe(0)
  })
})
