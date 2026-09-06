import type { CapturedRequest } from '../../models/captured-request'
import type { RawFind, ProposedExtractor } from '../types'
import { matchNamedPattern } from './named-patterns'

function parseJsonSafe(body: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(body) as Record<string, unknown>
  } catch {
    return undefined
  }
}

function jsonPathForKey(key: string): string {
  return `$.${key}`
}

function isTokenLikeValue(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false
  }

  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 256) {
    return false
  }

  // Reject obvious timestamps and numeric-only values.
  if (/^\d+$/.test(trimmed)) {
    return false
  }

  return true
}

export function extractJson(request: CapturedRequest): RawFind[] {
  const finds: RawFind[] = []

  if (request.responseBodyMeta?.available !== 'available') {
    return finds
  }

  const body = request.responseBody
  if (body === undefined || body.trim().length === 0) {
    return finds
  }

  const parsed = parseJsonSafe(body)
  if (parsed === undefined) {
    return finds
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (!isTokenLikeValue(value)) {
      continue
    }

    const stringValue = String(value).trim()
    const namedPattern = matchNamedPattern(key)

    const candidateType = namedPattern?.candidateType ?? 'unknown'
    const extractorKind = namedPattern?.extractorKind ?? 'jsonpath'

    const proposedExtractor: ProposedExtractor = {
      kind: extractorKind,
      expression: jsonPathForKey(key),
      matchNo: 1,
      defaultValue: 'NOT_FOUND',
      variableName: '',
    }

    finds.push({
      value: stringValue,
      location: `response.body.json:${jsonPathForKey(key)}`,
      candidateType,
      proposedExtractor,
    })
  }

  return finds
}
