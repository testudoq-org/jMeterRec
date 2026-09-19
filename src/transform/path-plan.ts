import type { ProposedGroup } from '../analysis/types'
import type { AcceptedGroup, ControllerKind, GroupEditDraft } from './types'

/**
 * Apply user edits to proposed groups and produce accepted groups ready
 * for JMX emission.
 *
 * Edit semantics (per `GroupEditDraft`):
 * - `name` overrides the proposal's display name.
 * - `memberExchangeIds` replaces the proposal's member list, enabling
 *   reordering, merge (list contains exchange IDs from multiple proposals),
 *   and split (list is a proper subset of the proposal's members).
 * - A group with any name/member edit is `locked: true` unless the draft
 *   explicitly sets `locked: false`.
 *
 * Controller kind assignment:
 * - `TransactionController` for groups with multiple members (timing tracked).
 * - `SimpleController` for single-member groups.
 */
export function applyGroupEdits(
  proposals: readonly ProposedGroup[],
  drafts: readonly GroupEditDraft[],
  options: { thinkTimeEnabled?: boolean } = {}
): AcceptedGroup[] {
  const draftMap = new Map(drafts.map((d) => [d.groupId, d]))
  const consumedByMerge = new Set<string>()
  const result: AcceptedGroup[] = []

  for (const proposal of proposals) {
    const draft = draftMap.get(proposal.id)

    // Skip proposals whose members were fully consumed by an earlier merge draft.
    if (draft === undefined && proposal.memberExchangeIds.every((id) => consumedByMerge.has(id))) {
      continue
    }

    const memberIds = draft?.memberExchangeIds ?? proposal.memberExchangeIds

    // Track foreign exchange IDs pulled in by a merge draft so their source
    // proposals are skipped when we reach them.
    if (draft?.memberExchangeIds !== undefined) {
      for (const id of memberIds) {
        if (!proposal.memberExchangeIds.includes(id)) {
          consumedByMerge.add(id)
        }
      }
    }

    const hasEdit =
      draft !== undefined && (draft.name !== undefined || draft.memberExchangeIds !== undefined)
    const locked = draft?.locked ?? hasEdit
    const name = draft?.name ?? proposal.name
    const controllerKind: ControllerKind =
      memberIds.length > 1 ? 'TransactionController' : 'SimpleController'

    result.push(buildAccepted(proposal.id, name, memberIds, controllerKind, locked, options))

    // Split detection: draft members are a proper subset of the proposal's members.
    // Emit a remainder group for the members not present in the draft.
    if (
      draft?.memberExchangeIds !== undefined &&
      memberIds.length < proposal.memberExchangeIds.length
    ) {
      const remainder = proposal.memberExchangeIds.filter(
        (id) => !draft.memberExchangeIds!.includes(id)
      )
      if (remainder.length > 0) {
        result.push(
          buildAccepted(
            `${proposal.id}-split-${result.length}`,
            `${name} (split)`,
            remainder,
            remainder.length > 1 ? 'TransactionController' : 'SimpleController',
            locked,
            options
          )
        )
      }
    }
  }

  return result
}

function buildAccepted(
  id: string,
  name: string,
  memberExchangeIds: string[],
  controllerKind: ControllerKind,
  locked: boolean,
  options: { thinkTimeEnabled?: boolean }
): AcceptedGroup {
  return {
    id,
    name,
    memberExchangeIds,
    controllerKind,
    locked,
    thinkTimeEnabled: options.thinkTimeEnabled ?? false,
  }
}

/**
 * Build a map from exchange ID to the group index that owns it.
 *
 * Used by the applier to translate a plan's `AcceptedGroup[]` into
 * per-request group membership, which the serializer then uses to
 * wrap samplers in controllers.
 *
 * Exchange IDs that appear in no group are absent from the map.
 */
export function buildGroupMemberIndexMap(groups: readonly AcceptedGroup[]): Map<string, number> {
  const map = new Map<string, number>()
  groups.forEach((group, index) => {
    for (const exchangeId of group.memberExchangeIds) {
      // First group wins on collision so that a merge draft's foreign IDs
      // are attributed to the merged group, not their source proposal.
      if (!map.has(exchangeId)) {
        map.set(exchangeId, index)
      }
    }
  })
  return map
}
