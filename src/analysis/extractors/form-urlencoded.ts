import type { CapturedRequest } from '../../models/captured-request'
import type { RawFind, ProposedExtractor } from '../types'
import { matchNamedPattern } from './named-patterns'

const HIDDEN_FIELD_FRAGMENTS = ['csrf', 'authenticity', '_token', 'token']

function isHiddenFieldLike(name: string): boolean {
  const lower = name.toLowerCase()
  return HIDDEN_FIELD_FRAGMENTS.some((fragment) => lower.includes(fragment))
}

function boundaryForField(_body: string, fieldName: string): string {
  const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(?:^|&)${escapedName}=([^&]*)`)
  return `regex:${regex.source}`
}

export function extractFormUrlencoded(request: CapturedRequest): RawFind[] {
  const finds: RawFind[] = []

  if (request.body === undefined || request.body.trim().length === 0) {
    return finds
  }

  const contentType = request.contentType?.toLowerCase() ?? ''
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return finds
  }

  try {
    const params = new URLSearchParams(request.body)

    for (const [name, value] of params) {
      const namedPattern = matchNamedPattern(name)
      const isCandidate = isHiddenFieldLike(name) || namedPattern !== undefined

      if (!isCandidate) {
        continue
      }

      const candidateType = namedPattern?.candidateType ?? 'form-field'
      const extractorKind = namedPattern?.extractorKind ?? 'boundary'

      const proposedExtractor: ProposedExtractor = {
        kind: extractorKind,
        expression: boundaryForField(request.body, name),
        matchNo: 1,
        defaultValue: 'NOT_FOUND',
        variableName: '',
      }

      finds.push({
        value,
        location: `request.body.form:${name}`,
        candidateType,
        proposedExtractor,
      })
    }
  } catch {
    // URLSearchParams can throw on malformed bodies; treat as no finds.
  }

  return finds
}
