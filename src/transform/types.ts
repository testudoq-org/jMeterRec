import type { ExtractorKind } from '../analysis/types'
import type { JmxExtractor, JmxCsvDataSet } from '../jmx/element-model'

/**
 * Subset of Feature 19 ExtractorKind values that the current JMX serializer
 * supports as standalone elements. Unsupported kinds fall back to RegexExtractor.
 */
export type SupportedExtractorType = 'jsonpath' | 'regex'

/**
 * Maps Feature 19 ExtractorKind to the supported subset used in the plan.
 * boundary, xpath, css, header, cookie all fall back to 'regex'.
 */
export function mapExtractorKindToSupported(kind: ExtractorKind): SupportedExtractorType {
  if (kind === 'jsonpath') return 'jsonpath'
  return 'regex'
}

/**
 * Describes an extractor configuration to emit in JMX.
 * Maps directly to either JmxJSONPostProcessor or JmxRegexExtractor.
 */
export interface PlanExtractor {
  type: SupportedExtractorType
  expression: string
  matchNo?: number
  defaultValue?: string
}

/**
 * Describes where a variable should be injected in a consumer request.
 */
export interface ReplacementOperation {
  variableName: string
  targetExchangeId: string
  location: 'url' | 'query' | 'header' | 'cookie' | 'body'
  path?: string // e.g. header name, query param name
  originalValue: string
  maskedOriginalValue: string // for preview display
}

/**
 * A correlation proposal derived from an accepted Feature 19 ValueCandidate.
 * Honour edits from analysisDraft.edits (variableName overrides).
 */
export interface CorrelationProposal {
  id: string
  variableName: string
  confidence: number
  producerExchangeId: string
  consumerExchangeIds: string[]
  extractor: PlanExtractor
  replacements: {
    location: ReplacementOperation['location']
    path?: string
    originalValue: string
  }[]
  explanation: string
  accepted?: boolean
}

/**
 * A parameterisation proposal for independent test data (CSV, UDV, functions).
 * Does NOT emit extractors — stays separate from correlation.
 */
export interface ParameterizationProposal {
  variableName: string
  source: 'csv' | 'generated' | 'environment' | 'jmeter-function' | 'manual'
  requestLocations: string[]
  originalValue?: string
  confidence: number
  explanation: string
  csvColumn?: string
  accepted?: boolean
}

/**
 * The transformation plan: a serialisable, user-accepted set of operations
 * that converts a recording into correlated/parameterised JMX.
 */
export interface ScriptTransformationPlan {
  version: number
  correlations: CorrelationProposal[]
  parameterizations: ParameterizationProposal[]
  replacements: ReplacementOperation[]
  warnings: string[]
  /**
   * User-editable groups of HTTP exchanges that export to JMeter
   * TransactionController / SimpleController elements.
   *
   * Additive field: plans serialized without `groups` (pre-Feature-21)
   * load transparently with `groups === undefined`; callers normalise
   * to `[]` via `plan.groups ?? []`.
   */
  groups?: AcceptedGroup[]
  /**
   * User edits applied to proposed groups before acceptance.
   *
   * Additive field mirroring `groups`: pre-Feature-21 plans load with
   * `groupDrafts === undefined`; callers normalise to `[]` via
   * `plan.groupDrafts ?? []`.
   */
  groupDrafts?: GroupEditDrafts
}

/**
 * The JMeter controller kind assigned to an accepted group.
 */
export type ControllerKind = 'TransactionController' | 'SimpleController'

/**
 * A user edit applied to a proposal before acceptance.
 *
 * Only the fields the user actually changed are present; absent fields
 * fall back to the proposal's value.
 */
export interface GroupEditDraft {
  groupId: string
  name?: string
  memberExchangeIds?: string[]
  locked?: boolean
}

/**
 * User edits applied to proposed groups before acceptance. Stored on the
 * plan as an additive field; pre-Feature-21 plans load with
 * `groupDrafts === []` via the `PlanStore.load()` fallback.
 */
export type GroupEditDrafts = GroupEditDraft[]

/**
 * An accepted group ready for JMX emission.
 *
 * `controllerKind` is assigned by `applyGroupEdits`:
 * - `TransactionController` for groups with multiple members (timing tracked)
 * - `SimpleController` for single-member groups
 */
export interface AcceptedGroup {
  id: string
  name: string
  memberExchangeIds: string[]
  controllerKind: ControllerKind
  locked: boolean
  thinkTimeEnabled: boolean
}

/**
 * A group's name mapped to the request indices its members occupy in the
 * exported request sequence. Produced by `buildGroupMappings` in
 * `jmx-plan-applier.ts` and consumed by the serializer to wrap the correct
 * samplers in a TransactionController / SimpleController.
 */
export interface GroupMapping {
  name: string
  requestIndices: number[]
}

/**
 * Extension to JmxSerializerOptions for per-sampler extractors and consumer
 * variable substitutions. The existing ThreadGroup-level `extractors` field
 * remains for backward compatibility with manual configuration.
 */
export interface PlanApplyOptions {
  /**
   * Per-sampler extractors keyed by request index (producer index within the
   * exported request sequence). Each entry is a list of extractors to place as
   * children of that specific sampler's hashTree.
   */
  perSamplerExtractors?: Map<number, JmxExtractor[]>
  /**
   * Consumer substitutions applied during sampler creation — variable names
   * referencing `${varName}` patterns replacing original values in URL, query,
   * headers, and body.
   */
  consumerSubstitutions?: ReplacementOperation[]
  /**
   * Optional response assertion configuration. When enabled, a per-sampler
   * ResponseAssertion is added for each producer sampler that has extractors,
   * checking that the response data contains the extracted variable value.
   */
  responseAssertion?: { enabled: boolean; variableName: string }
  /**
   * CSV Data Set Config elements to emit in the ThreadGroup before samplers.
   * Derived from ParameterizationProposal entries with source === 'csv'.
   */
  csvDataSets?: JmxCsvDataSet[]
  /**
   * Accepted user groups to wrap in JMeter controllers during sampler
   * sequence emission. Each group's `memberExchangeIds` are matched to
   * request indices by the serializer; members are wrapped inside a
   * TransactionController (multi-member) or SimpleController (single-member).
   */
  groups?: AcceptedGroup[]
}
