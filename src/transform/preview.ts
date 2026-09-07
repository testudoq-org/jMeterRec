import type { CapturedRequest } from '../models/captured-request'
import type { ReplacementOperation, ScriptTransformationPlan } from './types'
import { maskSecretHeaders } from '../utils/diagnostics'

/**
 * A preview of a single request showing original (masked) vs modified values.
 */
export interface RequestPreview {
  exchangeId: string
  requestIndex: number
  method: string
  url: string
  modifications: ModificationPreview[]
}

/**
 * A single substitution preview for one field of a request.
 */
export interface ModificationPreview {
  variableName: string
  location: ReplacementOperation['location']
  path?: string
  originalValue: string
  /** The masked original value for display (secrets redacted) */
  maskedOriginalValue: string
  /** The substituted value: `${variableName}` */
  substitutedValue: string
}

/**
 * Build a preview for all consumer requests affected by the plan.
 * Shows the original (masked) value and the `${variableName}` substitution
 * for each ReplacementOperation.
 */
export function buildPlanPreview(
  plan: ScriptTransformationPlan,
  requests: readonly CapturedRequest[],
  requestIndexMap: readonly { exchangeId: string; requestIndex: number }[]
): RequestPreview[] {
  const exchangeToIndex = new Map(requestIndexMap.map((m) => [m.exchangeId, m.requestIndex]))

  const previewsByExchange = new Map<string, Map<string, ModificationPreview>>()

  for (const replacement of plan.replacements) {
    const requestIndex = exchangeToIndex.get(replacement.targetExchangeId)
    if (requestIndex === undefined) {
      continue
    }

    const key = `${replacement.targetExchangeId}:${replacement.variableName}:${replacement.path ?? ''}`
    const exchangePreviews = previewsByExchange.get(replacement.targetExchangeId) ?? new Map()
    exchangePreviews.set(key, {
      variableName: replacement.variableName,
      location: replacement.location,
      path: replacement.path,
      originalValue: replacement.originalValue,
      maskedOriginalValue: replacement.maskedOriginalValue,
      substitutedValue: `\${${replacement.variableName}}`,
    })
    previewsByExchange.set(replacement.targetExchangeId, exchangePreviews)
  }

  const result: RequestPreview[] = []

  for (const [exchangeId, mods] of previewsByExchange) {
    const requestIndex = exchangeToIndex.get(exchangeId)
    const request = requests.find((r) => r.id === exchangeId)
    if (requestIndex === undefined || request === undefined) {
      continue
    }

    result.push({
      exchangeId,
      requestIndex,
      method: request.method,
      url: maskSecretHeaders(request.url),
      modifications: Array.from(mods.values()),
    })
  }

  return result.sort((a, b) => a.requestIndex - b.requestIndex)
}
