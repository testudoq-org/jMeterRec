import type { CapturedRequest } from '../../models/captured-request'
import type { RawFind, ProposedExtractor } from '../types'
import { matchNamedPattern } from './named-patterns'
import { sanitizeForXml } from '../../utils/xml-sanitizer'

const XML_NODE_REGEX = /<([A-Za-z_][\w.-]*)[^>]*>([^<]*)<\/\1>/g

function xpathForKey(key: string): string {
  return `//${key}`
}

export function extractXml(request: CapturedRequest): RawFind[] {
  const finds: RawFind[] = []

  if (request.responseBodyMeta?.available !== 'available') {
    return finds
  }

  const body = request.responseBody
  if (body === undefined || body.trim().length === 0) {
    return finds
  }

  const contentType = (request.responseBodyContentType ?? '').toLowerCase()
  if (!contentType.includes('xml') && !contentType.includes('text/html')) {
    return finds
  }

  const sanitized = sanitizeForXml(body)
  let match: RegExpExecArray | null

  while ((match = XML_NODE_REGEX.exec(sanitized)) !== null) {
    const key = match[1] ?? ''
    const value = sanitizeForXml(match[2] ?? '')
    const namedPattern = matchNamedPattern(key)

    if (namedPattern === undefined) {
      continue
    }

    const proposedExtractor: ProposedExtractor = {
      kind: 'xpath',
      expression: xpathForKey(key),
      matchNo: 1,
      defaultValue: 'NOT_FOUND',
      variableName: '',
    }

    finds.push({
      value,
      location: `response.body.xml:${xpathForKey(key)}`,
      candidateType: namedPattern.candidateType,
      proposedExtractor,
    })
  }

  return finds
}
