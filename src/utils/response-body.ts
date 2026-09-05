// Shared response-body capture helpers for content-script and background processing.
import { sanitizeForXml } from './xml-sanitizer'

export const MAX_RESPONSE_BODY_BYTES = 1024 * 64
export const FORBIDDEN_RESPONSE_CONTENT_TYPES = [/text\/html/i, /application\/xhtml\+xml/i]

export interface CapturedResponseBody {
  body?: string
  error?: string
  truncated: boolean
  redacted: boolean
  size: number
  capturedAtMs: number
  contentType?: string
}

export interface ResponseBodyCaptureOptions {
  maxBytes?: number
}

export interface MeasuredBody {
  available: 'available' | 'unavailable'
  body?: string
  encoding?: 'utf8' | 'base64' | 'urlencoded' | 'json' | 'unknown'
  size: number
  truncated: boolean
  error?: string
}

export function measureBody(
  body: string,
  maxBytes = MAX_RESPONSE_BODY_BYTES
): CapturedResponseBody {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(body)
  const size = bytes.length
  const truncated = size > maxBytes
  const safeBytes = new Uint8Array(Math.min(size, maxBytes))
  safeBytes.set(bytes.subarray(0, safeBytes.length))
  const decoder = new TextDecoder()
  const truncatedBody = size === 0 ? '' : decoder.decode(safeBytes, { stream: false })
  const sanitized = sanitizeForXml(truncatedBody)

  return {
    body: sanitized,
    truncated,
    redacted: false,
    size,
    capturedAtMs: Date.now(),
  }
}

export function measureBytes(
  input: string | Uint8Array,
  contentType?: string,
  maxBytes = MAX_RESPONSE_BODY_BYTES
): MeasuredBody {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const size = bytes.length

  if (isPlainText(contentType)) {
    const truncated = size > maxBytes
    const safeBytes = new Uint8Array(Math.min(size, maxBytes))
    safeBytes.set(bytes.subarray(0, safeBytes.length))
    const decoder = new TextDecoder()
    const body = size === 0 ? '' : decoder.decode(safeBytes, { stream: false })
    const sanitized = sanitizeForXml(body)

    return {
      available: 'available',
      body: sanitized,
      encoding: 'utf8',
      size,
      truncated,
    }
  }

  if (size > maxBytes) {
    return {
      available: 'unavailable',
      size,
      truncated: false,
      error: `Response body unavailable: binary payload exceeds ${maxBytes} byte cap (${size} bytes)`,
    }
  }

  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!)
  }

  return {
    available: 'available',
    body: btoa(binary),
    encoding: 'base64',
    size,
    truncated: false,
  }
}

export function isPlainText(contentType?: string): boolean {
  if (!contentType) {
    return true
  }

  const lowered = contentType.toLowerCase()
  return (
    lowered.startsWith('text/') ||
    lowered === 'application/json' ||
    lowered === 'application/javascript' ||
    lowered === 'application/xml' ||
    lowered === 'application/xhtml+xml'
  )
}

export function shouldRedact(redactContentTypes: RegExp[], contentType?: string): boolean {
  if (!contentType) {
    return false
  }

  return redactContentTypes.some((regex) => regex.test(contentType.toLowerCase()))
}

export function createResponseBodyCapture(): ResponseBodyCapture {
  return new ResponseBodyCapture()
}

export class ResponseBodyCapture {
  private readonly redactContentTypes: RegExp[] = [/text\/html/, /application\/xhtml\+xml/]

  capture(
    body: string,
    contentType?: string,
    options?: ResponseBodyCaptureOptions
  ): CapturedResponseBody {
    try {
      if (!isPlainText(contentType)) {
        return {
          truncated: false,
          redacted: true,
          size: 0,
          capturedAtMs: Date.now(),
          contentType,
        }
      }

      if (shouldRedact(this.redactContentTypes, contentType)) {
        return {
          truncated: false,
          redacted: true,
          size: 0,
          capturedAtMs: Date.now(),
          contentType,
        }
      }

      return measureBody(body, options?.maxBytes)
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Unable to capture response body',
        truncated: false,
        redacted: false,
        size: 0,
        capturedAtMs: Date.now(),
      }
    }
  }
}

export function buildBodyReason(code: string, details?: Record<string, unknown>): string {
  switch (code) {
    case 'forbidden-content-type':
      return 'Response body unavailable: forbidden content type'
    case 'match-ambiguous':
      return `Response body unavailable: ambiguous match (${typeof details?.candidateCount === 'number' ? details.candidateCount : '?'} candidates)`
    case 'match-expired':
      return 'Response body unavailable: match expired'
    case 'match-zero':
      return 'Response body unavailable: no matching candidate'
    case 'content-script-not-seen':
      return 'Response body unavailable: content-script interception did not observe request'
    case 'bodies-disabled':
      return 'Response body unavailable: response body capture disabled in options'
    case 'binary-over-cap':
      return `Response body unavailable: binary payload exceeds ${typeof details?.max === 'number' ? details.max : MAX_RESPONSE_BODY_BYTES} byte cap (${typeof details?.size === 'number' ? details.size : '?'} bytes)`
    case 'capture-error':
      return 'Response body unavailable: capture failed'
    case 'decode-failed':
      return 'Response body unavailable: decode failed'
    default:
      return `Response body unavailable: ${code}`
  }
}
