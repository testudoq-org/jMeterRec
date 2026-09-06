import type { CapturedRequest } from '../../models/captured-request'
import type { RawFind, ProposedExtractor } from '../types'
import { matchNamedPattern } from './named-patterns'

const SESSION_COOKIE_FRAGMENTS = [
  'jsessionid',
  'phpsessid',
  'connect.sid',
  'sessionid',
  'session_id',
]

function isSessionCookie(name: string): boolean {
  const lower = name.toLowerCase()
  return SESSION_COOKIE_FRAGMENTS.some((fragment) => lower.includes(fragment))
}

function cookieNameFromHeader(headerValue: string): string {
  const parts = headerValue.split(';')
  return parts[0]?.trim() ?? headerValue
}

function cookieValueFromHeader(headerValue: string): string {
  const name = cookieNameFromHeader(headerValue)
  const equalsIndex = name.indexOf('=')
  if (equalsIndex >= 0) {
    return name.slice(equalsIndex + 1)
  }
  return name
}

export function extractRedirectLocation(request: CapturedRequest): RawFind[] {
  const finds: RawFind[] = []

  const statusCode = request.statusCode
  if (statusCode === undefined || statusCode < 300 || statusCode >= 400) {
    return finds
  }

  const location = request.responseHeaders?.location
  if (location === undefined || location.trim().length === 0) {
    return finds
  }

  finds.push({
    value: location.trim(),
    location: 'response.header:location',
    candidateType: 'business-id',
    proposedExtractor: {
      kind: 'header',
      expression: 'response.header:location',
      matchNo: 1,
      defaultValue: 'NOT_FOUND',
      variableName: '',
    },
  })

  return finds
}

export function extractHeadersCookies(request: CapturedRequest): RawFind[] {
  const finds: RawFind[] = []

  const responseHeaders = request.responseHeaders ?? {}
  for (const [name, value] of Object.entries(responseHeaders)) {
    const lowerName = name.toLowerCase()

    if (lowerName === 'set-cookie') {
      const cookieName = cookieNameFromHeader(value)
      const cookieValue = cookieValueFromHeader(value)
      const isManaged = isSessionCookie(cookieName)
      const namedPattern = matchNamedPattern(cookieName)
      const candidateType = isManaged ? 'session-id' : (namedPattern?.candidateType ?? 'cookie')
      const extractorKind = isManaged ? 'cookie' : (namedPattern?.extractorKind ?? 'cookie')

      const proposedExtractor: ProposedExtractor = {
        kind: extractorKind,
        expression: `response.header:${name}`,
        matchNo: 1,
        defaultValue: 'NOT_FOUND',
        variableName: '',
      }

      finds.push({
        value: cookieValue,
        location: `response.header:${name}`,
        candidateType,
        proposedExtractor,
      })
      continue
    }

    const namedPattern = matchNamedPattern(name)
    if (namedPattern === undefined) {
      continue
    }

    const proposedExtractor: ProposedExtractor = {
      kind: namedPattern.extractorKind,
      expression: `response.header:${name}`,
      matchNo: 1,
      defaultValue: 'NOT_FOUND',
      variableName: '',
    }

    finds.push({
      value,
      location: `response.header:${name}`,
      candidateType: namedPattern.candidateType,
      proposedExtractor,
    })
  }

  const requestHeaders = request.headers ?? {}
  for (const [name, value] of Object.entries(requestHeaders)) {
    const namedPattern = matchNamedPattern(name)
    if (namedPattern === undefined) {
      continue
    }

    const proposedExtractor: ProposedExtractor = {
      kind: namedPattern.extractorKind,
      expression: `request.header:${name}`,
      matchNo: 1,
      defaultValue: 'NOT_FOUND',
      variableName: '',
    }

    finds.push({
      value,
      location: `request.header:${name}`,
      candidateType: namedPattern.candidateType,
      proposedExtractor,
    })
  }

  return finds
}
