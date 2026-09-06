const MAX_DIAGNOSTICS = 20
const MAX_DIAGNOSTIC_LENGTH = 240

const SECRET_HEADER_PATTERN = /^(authorization|set-cookie|cookie|proxy-authorization):\s*.+$/i

import type { CapturedRequest } from '../models/captured-request'

export function appendDiagnostic(arr: string[], msg: string): void {
  const entry = truncateDiagnostic(msg)
  arr.push(entry)
  const capped = capDiagnostics(arr)
  arr.length = 0
  arr.push(...capped)
}

export function appendMatchDiagnostic(
  arr: string[],
  target: string,
  kind: 'zero' | 'ambiguous' | 'expired',
  count?: number
): void {
  switch (kind) {
    case 'zero':
      appendDiagnostic(arr, `Response body unavailable: no matching candidate for ${target}`)
      break
    case 'ambiguous':
      appendDiagnostic(
        arr,
        `Response body unavailable: ambiguous match (${typeof count === 'number' ? count : '?'} candidates) for ${target}`
      )
      break
    case 'expired':
      appendDiagnostic(arr, `Response body unavailable: match expired for ${target}`)
      break
  }
}

export function capDiagnostics(arr: string[]): string[] {
  const capped = arr.slice(-MAX_DIAGNOSTICS)
  return capped.map((entry) => truncateDiagnostic(entry))
}

export function toDisplay(arr: string[]): string[] {
  return arr.map((entry) => maskSecretHeaders(truncateDiagnostic(entry)))
}

export function toExportView(request: CapturedRequest): CapturedRequest {
  const { diagnostics: _diagnostics, captureSources: _captureSources, ...rest } = request
  return rest as CapturedRequest
}

function truncateDiagnostic(msg: string): string {
  return msg.length > MAX_DIAGNOSTIC_LENGTH ? `${msg.slice(0, MAX_DIAGNOSTIC_LENGTH - 3)}...` : msg
}

export function maskSecretHeaders(entry: string): string {
  return entry.replace(SECRET_HEADER_PATTERN, (match) => {
    const colonIndex = match.indexOf(':')
    return `${match.slice(0, colonIndex + 1)} ***`
  })
}
