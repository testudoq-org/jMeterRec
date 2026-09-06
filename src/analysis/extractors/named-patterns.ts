import type { CandidateType, ExtractorKind } from '../types'

export interface NamedPattern {
  fragments: string[]
  candidateType: CandidateType
  extractorKind: ExtractorKind
}

export const NAMED_PATTERNS: NamedPattern[] = [
  {
    fragments: ['x-csrf-token', '_csrf', 'authenticity_token', 'authenticity', 'csrf'],
    candidateType: 'csrf-token',
    extractorKind: 'jsonpath',
  },
  {
    fragments: ['__viewstate', 'viewstate'],
    candidateType: 'viewstate',
    extractorKind: 'boundary',
  },
  {
    fragments: ['jsessionid'],
    candidateType: 'session-id',
    extractorKind: 'cookie',
  },
  {
    fragments: ['phpsessid'],
    candidateType: 'session-id',
    extractorKind: 'cookie',
  },
  {
    fragments: ['connect.sid'],
    candidateType: 'session-id',
    extractorKind: 'cookie',
  },
  {
    fragments: ['accesstoken', 'access_token', 'id_token'],
    candidateType: 'authorization',
    extractorKind: 'jsonpath',
  },
  {
    fragments: ['authorization'],
    candidateType: 'authorization',
    extractorKind: 'header',
  },
  {
    fragments: ['sessionid', 'session_id'],
    candidateType: 'session-id',
    extractorKind: 'regex',
  },
  {
    fragments: ['token'],
    candidateType: 'authorization',
    extractorKind: 'jsonpath',
  },
  {
    fragments: ['session'],
    candidateType: 'session-id',
    extractorKind: 'regex',
  },
  {
    fragments: ['uuid', 'guid', 'correlationid'],
    candidateType: 'uuid',
    extractorKind: 'regex',
  },
  {
    fragments: ['businessid', 'business_id', 'reference', 'id'],
    candidateType: 'business-id',
    extractorKind: 'regex',
  },
]

export function matchNamedPattern(name: string): NamedPattern | undefined {
  const lower = name.toLowerCase()
  return NAMED_PATTERNS.find((pattern) =>
    pattern.fragments.some((fragment) => lower.includes(fragment))
  )
}
