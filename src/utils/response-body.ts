// Shared response-body capture helpers for content-script and background processing.
import { sanitizeForXml } from './xml-sanitizer'

export const MAX_RESPONSE_BODY_BYTES = 1024 * 64

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
