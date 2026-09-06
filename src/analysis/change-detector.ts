import type { CapturedRequest, AnalysisOptions } from './types'

export interface StepMatch {
  primaryIndex: number
  baselineIndex: number
}

function toMs(timestamp: string): number {
  return new Date(timestamp).getTime()
}

export function matchSteps(
  primary: readonly CapturedRequest[],
  baseline: readonly CapturedRequest[],
  options: AnalysisOptions
): StepMatch[] {
  const matches: StepMatch[] = []
  const windowMs = options.correlationWindowMs ?? Number.POSITIVE_INFINITY

  for (let primaryIndex = 0; primaryIndex < primary.length; primaryIndex++) {
    const primaryStep = primary[primaryIndex]!

    for (let baselineIndex = 0; baselineIndex < baseline.length; baselineIndex++) {
      const baselineStep = baseline[baselineIndex]!

      if (primaryStep.method !== baselineStep.method) {
        continue
      }

      if (primaryStep.url !== baselineStep.url) {
        continue
      }

      const primaryMs = toMs(primaryStep.timestamp)
      const baselineMs = toMs(baselineStep.timestamp)
      const delta = Math.abs(primaryMs - baselineMs)

      if (delta > windowMs) {
        continue
      }

      matches.push({ primaryIndex, baselineIndex })
      break
    }
  }

  return matches
}

export function valueChanged(
  primary: readonly CapturedRequest[],
  baseline: readonly CapturedRequest[],
  match: StepMatch
): boolean {
  const primaryStep = primary[match.primaryIndex]
  const baselineStep = baseline[match.baselineIndex]

  if (primaryStep === undefined || baselineStep === undefined) {
    return false
  }

  if (primaryStep.responseBodyMeta?.available !== 'available') {
    return false
  }

  if (baselineStep.responseBodyMeta?.available !== 'available') {
    return false
  }

  const primaryBody = primaryStep.responseBody ?? ''
  const baselineBody = baselineStep.responseBody ?? ''

  return primaryBody !== baselineBody
}
