import type { CandidateType } from './types'
import { maskSecretHeaders } from '../utils/diagnostics'

const SENSITIVE_CANDIDATE_TYPES: readonly CandidateType[] = [
  'session-id',
  'authorization',
  'csrf-token',
]

export function maskCandidateValue(value: string, candidateType: CandidateType): string {
  if (SENSITIVE_CANDIDATE_TYPES.includes(candidateType)) {
    return maskSecretHeaders(value)
  }

  if (value.length <= 8) {
    return value
  }

  const visiblePrefix = value.slice(0, 4)
  const visibleSuffix = value.slice(-4)
  const maskedMiddle = '*'.repeat(value.length - 8)

  return `${visiblePrefix}${maskedMiddle}${visibleSuffix}`
}
