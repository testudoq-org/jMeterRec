import type { JmxExtractor, JmxResponseAssertion, JmxCsvDataSet } from '../jmx/element-model'
import {
  createJSONPostProcessor,
  createRegexExtractor,
  createResponseDataAssertion,
  createCsvDataSet,
} from '../jmx/element-model'
import type {
  ScriptTransformationPlan,
  CorrelationProposal,
  PlanApplyOptions,
  AcceptedGroup,
} from './types'

/**
 * Index of a producer exchange within the exported request sequence.
 * Used to place extractors as children of the correct sampler.
 */
interface ProducerIndexMap {
  exchangeId: string
  requestIndex: number
}

/**
 * A group's name mapped to the request indices its members occupy in the
 * exported request sequence. The serializer uses this to wrap the correct
 * samplers in a TransactionController / SimpleController.
 */
export interface GroupMapping {
  name: string
  requestIndices: number[]
}

/**
 * Convert a ScriptTransformationPlan into applier options that can be
 * passed to buildJmx(). Produces:
 * - perSamplerExtractors: Map<requestIndex, JmxExtractor[]>
 * - consumerSubstitutions: ReplacementOperation[] (reused directly from plan)
 * - groups: GroupMapping[] — name + request indices for controller wrapping
 */
export function applyPlan(
  plan: ScriptTransformationPlan,
  producerIndices: ProducerIndexMap[],
  options?: Pick<PlanApplyOptions, 'responseAssertion'>
): {
  perSamplerExtractors: Map<number, JmxExtractor[]>
  consumerSubstitutions: ScriptTransformationPlan['replacements']
  perSamplerAssertions: Map<number, JmxResponseAssertion[]>
  csvDataSets: JmxCsvDataSet[]
  groups: GroupMapping[]
} {
  const perSamplerExtractors = new Map<number, JmxExtractor[]>()
  const perSamplerAssertions = new Map<number, JmxResponseAssertion[]>()
  const csvDataSets: JmxCsvDataSet[] = []
  const producerIndexMap = new Map(producerIndices.map((p) => [p.exchangeId, p.requestIndex]))

  for (const correlation of plan.correlations) {
    const extractor = buildExtractor(correlation)
    const requestIndex = producerIndexMap.get(correlation.producerExchangeId)

    if (requestIndex === undefined) {
      continue
    }

    const existingExtractors = perSamplerExtractors.get(requestIndex) ?? []
    existingExtractors.push(extractor)
    perSamplerExtractors.set(requestIndex, existingExtractors)

    if (options?.responseAssertion?.enabled) {
      const existingAssertions = perSamplerAssertions.get(requestIndex) ?? []
      existingAssertions.push(createResponseDataAssertion(options.responseAssertion.variableName))
      perSamplerAssertions.set(requestIndex, existingAssertions)
    }
  }

  for (const parameterization of plan.parameterizations) {
    if (parameterization.source === 'csv') {
      csvDataSets.push(
        createCsvDataSet(parameterization.variableName, {
          name: `CSV Data Set - ${parameterization.variableName}`,
        })
      )
    }
  }

  const groups = buildGroupMappings(plan.groups ?? [], producerIndexMap)

  return {
    perSamplerExtractors,
    consumerSubstitutions: plan.replacements,
    perSamplerAssertions,
    csvDataSets,
    groups,
  }
}

/**
 * Build a JmxExtractor from a CorrelationProposal's PlanExtractor.
 */
function buildExtractor(proposal: CorrelationProposal): JmxExtractor {
  if (proposal.extractor.type === 'jsonpath') {
    return createJSONPostProcessor(
      proposal.variableName,
      proposal.extractor.expression,
      proposal.extractor.defaultValue ?? 'NOT_FOUND',
      String(proposal.extractor.matchNo ?? 1)
    )
  }

  // Regex fallback for 'regex' type
  return createRegexExtractor(
    proposal.variableName,
    proposal.extractor.expression,
    proposal.extractor.defaultValue ?? 'NOT_FOUND',
    String(proposal.extractor.matchNo ?? 1),
    '$1$'
  )
}

/**
 * Build a producer index map from a list of requests.
 * Maps each request's exchange ID to its index in the request sequence.
 */
export function buildProducerIndexMap(requests: readonly { id: string }[]): ProducerIndexMap[] {
  return requests.map((req, index) => ({
    exchangeId: req.id,
    requestIndex: index,
  }))
}

/**
 * Translate a plan's `AcceptedGroup[]` into `GroupMapping[]` by resolving
 * each group's `memberExchangeIds` to request indices via the producer map.
 *
 * Exchange IDs that do not resolve to a request index are dropped (they
 * may have been filtered out by domain selection). Groups that end up with
 * no members are omitted entirely.
 */
export function buildGroupMappings(
  groups: readonly AcceptedGroup[],
  producerIndexMap: Map<string, number>
): GroupMapping[] {
  const result: GroupMapping[] = []

  for (const group of groups) {
    const requestIndices: number[] = []
    for (const exchangeId of group.memberExchangeIds) {
      const index = producerIndexMap.get(exchangeId)
      if (index !== undefined) {
        requestIndices.push(index)
      }
    }

    if (requestIndices.length > 0) {
      result.push({ name: group.name, requestIndices })
    }
  }

  return result
}

/**
 * V4.4 confirmation gate: decide whether a plan is export-ready.
 *
 * Returns `{ ready: false }` when ALL groups are `locked: false` (auto-only,
 * no user edits) — the UI must prompt the user to confirm before exporting.
 * Returns `{ ready: true }` when at least one group is `locked: true` (user
 * edited at least one group) or when there are no groups at all.
 */
export function validateExportReady(plan: ScriptTransformationPlan): {
  ready: boolean
  reason?: string
} {
  const groups = plan.groups ?? []
  if (groups.length === 0) {
    return { ready: true }
  }

  const hasLocked = groups.some((group) => group.locked === true)
  if (hasLocked) {
    return { ready: true }
  }

  return {
    ready: false,
    reason:
      'All groups are auto-proposed and unconfirmed. Review and lock at least one group before exporting.',
  }
}
