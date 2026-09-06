import type { CapturedRequest } from '../../models/captured-request'
import type { RawFind, ProposedExtractor } from '../types'
import { matchNamedPattern } from './named-patterns'

const HIDDEN_INPUT_REGEX = /<input[^>]+type=["']hidden["'][^>]*name=["']([^"']+)["'][^>]*>/gi

function cssSelectorForName(name: string): string {
  return `input[name="${name}"]`
}

export function extractHtmlHidden(request: CapturedRequest): RawFind[] {
  const finds: RawFind[] = []

  if (request.responseBodyMeta?.available !== 'available') {
    return finds
  }

  const body = request.responseBody
  if (body === undefined || body.trim().length === 0) {
    return finds
  }

  const contentType = (request.responseBodyContentType ?? '').toLowerCase()
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    return finds
  }

  let match: RegExpExecArray | null
  while ((match = HIDDEN_INPUT_REGEX.exec(body)) !== null) {
    const name = match[1] ?? ''
    const namedPattern = matchNamedPattern(name)
    const candidateType = namedPattern?.candidateType ?? 'hidden-field'
    const extractorKind = namedPattern?.extractorKind ?? 'css'

    const proposedExtractor: ProposedExtractor = {
      kind: extractorKind,
      expression: cssSelectorForName(name),
      matchNo: 1,
      defaultValue: 'NOT_FOUND',
      variableName: '',
    }

    finds.push({
      value: name,
      location: `response.body.html:${cssSelectorForName(name)}`,
      candidateType,
      proposedExtractor,
    })
  }

  return finds
}
