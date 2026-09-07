import type { ValueCandidate, CapturedRequest } from '../analysis/types'
import type {
  ScriptTransformationPlan,
  CorrelationProposal,
  ReplacementOperation,
  SupportedExtractorType,
  ParameterizationProposal,
} from './types'
import { mapExtractorKindToSupported } from './types'
import { maskSecretHeaders } from '../utils/diagnostics'

const COOKIE_HEADER_NAMES = new Set(['cookie', 'cookie2'])

/**
 * Input draft state from the popup analysis panel.
 */
export interface AnalysisDraftState {
  acceptedIds: Set<string>
  edits: Map<string, { variableName?: string }>
}

const DEFAULT_NOT_FOUND = 'NOT_FOUND'

/**
 * Build a ScriptTransformationPlan from accepted Feature 19 candidates.
 *
 * Only candidates whose id is in acceptedIds enter the plan.
 * Variable name edits from analysisDraft.edits override the candidate's variableName.
 *
 * Consumer replacement locations are determined by searching each consumer
 * request's headers, query params, body, and URL for the candidate's normalizedValue.
 */
export function buildTransformationPlan(
  candidates: ValueCandidate[],
  exchanges: readonly CapturedRequest[],
  draft: AnalysisDraftState,
  parameterizationProposals: ParameterizationProposal[] = []
): ScriptTransformationPlan {
  const exchangeMap = buildExchangeMap(exchanges)
  const warnings: string[] = []
  const correlations: CorrelationProposal[] = []
  const replacements: ReplacementOperation[] = []

  for (const candidate of candidates) {
    if (candidate.rejected === true) {
      continue
    }

    if (!draft.acceptedIds.has(candidate.id)) {
      continue
    }

    const variableName = resolveVariableName(candidate, draft)
    const proposal = buildCorrelationProposal(candidate, variableName, warnings)
    correlations.push(proposal)

    const consumerReplacements = buildConsumerReplacements(
      candidate,
      exchangeMap,
      variableName,
      warnings
    )
    replacements.push(...consumerReplacements)
  }

  const parameterizations = parameterizationProposals.filter(
    (proposal) => proposal.accepted !== false
  )

  return {
    version: 1,
    correlations,
    parameterizations,
    replacements,
    warnings,
  }
}

/**
 * Resolve the variable name: honour edits from analysisDraft.edits,
 * fall back to the candidate's variableName.
 */
function resolveVariableName(candidate: ValueCandidate, draft: AnalysisDraftState): string {
  const edit = draft.edits.get(candidate.id)
  return edit?.variableName ?? candidate.variableName
}

/**
 * Build a CorrelationProposal from a ValueCandidate.
 * Maps proposedExtractor.kind to SupportedExtractorType.
 */
function buildCorrelationProposal(
  candidate: ValueCandidate,
  variableName: string,
  warnings: string[]
): CorrelationProposal {
  const originalKind = candidate.proposedExtractor?.kind ?? 'regex'
  const extractor = candidate.proposedExtractor
    ? {
        type: mapExtractorKindToSupported(
          candidate.proposedExtractor.kind
        ) as SupportedExtractorType,
        expression: candidate.proposedExtractor.expression,
        matchNo: candidate.proposedExtractor.matchNo,
        defaultValue: candidate.proposedExtractor.defaultValue ?? DEFAULT_NOT_FOUND,
      }
    : {
        type: 'regex' as const,
        expression: '',
        defaultValue: DEFAULT_NOT_FOUND,
      }

  if (originalKind !== 'jsonpath') {
    warnings.push(
      `Candidate ${candidate.id}: extractor kind '${originalKind}' not yet supported, falling back to RegexExtractor`
    )
  }

  return {
    id: candidate.id,
    variableName,
    confidence: candidate.confidence,
    producerExchangeId: candidate.sourceExchangeId,
    consumerExchangeIds: candidate.consumerExchangeIds,
    extractor,
    replacements: [],
    explanation: candidate.reasons.join('; '),
    accepted: true,
  }
}

/**
 * Build ReplacementOperation[] by searching consumer requests for the candidate's value.
 */
function buildConsumerReplacements(
  candidate: ValueCandidate,
  exchangeMap: Map<string, CapturedRequest>,
  variableName: string,
  warnings: string[]
): ReplacementOperation[] {
  const result: ReplacementOperation[] = []
  const normalizedValue = candidate.normalizedValue ?? ''

  if (!normalizedValue) {
    warnings.push(
      `Candidate ${candidate.id}: no normalizedValue, skipping consumer substitution search`
    )
    return result
  }

  for (const exchangeId of candidate.consumerExchangeIds) {
    const exchange = exchangeMap.get(exchangeId)
    if (exchange === undefined) {
      warnings.push(
        `Candidate ${candidate.id}: consumer exchange ${exchangeId} not found, skipping`
      )
      continue
    }

    const matches = findValueLocations(exchange, normalizedValue)
    for (const match of matches) {
      if (
        (match.location === 'url' || match.location === 'query') &&
        /%[0-9A-Fa-f]{2}/.test(match.originalValue)
      ) {
        warnings.push(
          `Candidate ${candidate.id}: replacement for ${match.location}${match.path ? ` "${match.path}"` : ''} may be double-encoded because originalValue contains URL-encoded characters`
        )
      }

      result.push({
        variableName,
        targetExchangeId: exchangeId,
        location: match.location,
        path: match.path,
        originalValue: match.originalValue,
        maskedOriginalValue:
          match.location === 'header'
            ? maskSecretHeaders(`${match.path}: ${match.originalValue}`)
            : maskSecretHeaders(match.originalValue),
      })
    }

    if (matches.length === 0) {
      warnings.push(`Candidate ${candidate.id}: value not found in consumer ${exchangeId}`)
    }
  }

  return result
}

/**
 * Search a consumer request for the normalized value in headers, query params,
 * body, and URL. Returns all matches with their location and original value.
 */
interface ValueMatch {
  location: ReplacementOperation['location']
  path?: string
  originalValue: string
}

function findValueLocations(exchange: CapturedRequest, normalizedValue: string): ValueMatch[] {
  const matches: ValueMatch[] = []

  // Search headers
  for (const [headerName, headerValue] of Object.entries(exchange.headers)) {
    const lowerName = headerName.toLowerCase()
    if (COOKIE_HEADER_NAMES.has(lowerName)) {
      continue
    }

    if (containsNormalizedValue(headerValue, normalizedValue)) {
      matches.push({
        location: 'header',
        path: headerName,
        originalValue: headerValue,
      })
    }
  }

  // Search query params
  for (const [paramName, paramValue] of Object.entries(exchange.queryParams)) {
    if (containsNormalizedValue(paramValue, normalizedValue)) {
      matches.push({
        location: 'query',
        path: paramName,
        originalValue: paramValue,
      })
    }
  }

  // Search body
  if (exchange.body !== undefined && containsNormalizedValue(exchange.body, normalizedValue)) {
    matches.push({
      location: 'body',
      originalValue: exchange.body,
    })
  }

  // Search URL
  if (containsNormalizedValue(exchange.url, normalizedValue)) {
    matches.push({
      location: 'url',
      originalValue: exchange.url,
    })
  }

  return matches
}

/**
 * Case-insensitive search for the normalized value within a string.
 * Returns true if the value is found as a substring.
 */
function containsNormalizedValue(haystack: string, needle: string): boolean {
  if (needle.length === 0) {
    return false
  }
  const haystackLower = haystack.toLowerCase()
  return haystackLower.includes(needle)
}

/**
 * Build a map from exchange ID to CapturedRequest for fast lookup.
 */
function buildExchangeMap(exchanges: readonly CapturedRequest[]): Map<string, CapturedRequest> {
  const map = new Map<string, CapturedRequest>()
  for (const exchange of exchanges) {
    map.set(exchange.id, exchange)
  }
  return map
}
