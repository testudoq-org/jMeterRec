import type { JmxExtractor, JmxResponseAssertion, JmxCsvDataSet } from '../jmx/element-model'
import {
  createJSONPostProcessor,
  createRegexExtractor,
  createResponseDataAssertion,
  createCsvDataSet,
} from '../jmx/element-model'
import type { ScriptTransformationPlan, CorrelationProposal, PlanApplyOptions } from './types'

/**
 * Index of a producer exchange within the exported request sequence.
 * Used to place extractors as children of the correct sampler.
 */
interface ProducerIndexMap {
  exchangeId: string
  requestIndex: number
}

/**
 * Convert a ScriptTransformationPlan into applier options that can be
 * passed to buildJmx(). Produces:
 * - perSamplerExtractors: Map<requestIndex, JmxExtractor[]>
 * - consumerSubstitutions: ReplacementOperation[] (reused directly from plan)
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

  return {
    perSamplerExtractors,
    consumerSubstitutions: plan.replacements,
    perSamplerAssertions,
    csvDataSets,
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
