import { describe, expect, it } from 'vitest'
import {
  measureBody,
  measureBytes,
  isPlainText,
  shouldRedact,
  MAX_RESPONSE_BODY_BYTES,
  ResponseBodyCapture,
  buildBodyReason,
} from './response-body'

describe('measureBody', () => {
  const body = 'Hello World! 🌍'

  it('returns the body unchanged when within the size limit', () => {
    const result = measureBody(body)

    expect(result.body).toBe(body)
    expect(result.truncated).toBe(false)
    expect(result.redacted).toBe(false)
    expect(result.size).toBe(new TextEncoder().encode(body).length)
    expect(result.capturedAtMs).toBeGreaterThan(0)
  })

  it('truncates the body and marks truncated when exceeding the default limit', () => {
    const large = 'x'.repeat(MAX_RESPONSE_BODY_BYTES + 10)
    const result = measureBody(large)

    expect(result.body!.length).toBeLessThanOrEqual(MAX_RESPONSE_BODY_BYTES)
    expect(result.truncated).toBe(true)
    expect(result.size).toBe(new TextEncoder().encode(large).length)
  })

  it('truncates using a custom maxBytes limit', () => {
    const result = measureBody('abcdef', 3)

    expect(result.body).toBe('abc')
    expect(result.truncated).toBe(true)
  })

  it('returns an empty string for an empty body', () => {
    const result = measureBody('')

    expect(result.body).toBe('')
    expect(result.truncated).toBe(false)
    expect(result.size).toBe(0)
  })

  it('strips XML illegal characters from captured response bodies', () => {
    const result = measureBody('hello\x00world\x01')

    expect(result.body).toBe('helloworld')
    expect(result.size).toBeGreaterThan(0)
  })
})

describe('isPlainText', () => {
  it('returns true when contentType is missing', () => {
    expect(isPlainText(undefined)).toBe(true)
  })

  it('is case-insensitive for text/* types', () => {
    expect(isPlainText('TEXT/PLAIN')).toBe(true)
  })

  it('returns true for application/json', () => {
    expect(isPlainText('application/json')).toBe(true)
  })

  it('returns true for application/javascript', () => {
    expect(isPlainText('application/javascript')).toBe(true)
  })

  it('returns true for application/xml', () => {
    expect(isPlainText('application/xml')).toBe(true)
  })

  it('returns true for application/xhtml+xml', () => {
    expect(isPlainText('application/xhtml+xml')).toBe(true)
  })

  it('returns false for binary and image types', () => {
    expect(isPlainText('image/png')).toBe(false)
    expect(isPlainText('application/octet-stream')).toBe(false)
  })
})

describe('shouldRedact', () => {
  const rules = [/text\/html/, /application\/xhtml\+xml/]

  it('returns false when contentType is missing', () => {
    expect(shouldRedact(rules)).toBe(false)
  })

  it('returns true when any rule matches', () => {
    expect(shouldRedact(rules, 'text/html')).toBe(true)
    expect(shouldRedact(rules, 'application/xhtml+xml')).toBe(true)
  })

  it('returns false when no rule matches', () => {
    expect(shouldRedact(rules, 'application/json')).toBe(false)
  })
})

describe('ResponseBodyCapture.capture', () => {
  const capture = new ResponseBodyCapture()

  it('captures plain text responses', () => {
    const result = capture.capture('hello', 'text/plain')

    expect(result.body).toBe('hello')
    expect(result.truncated).toBe(false)
    expect(result.redacted).toBe(false)
    expect(result.size).toBeGreaterThan(0)
  })

  it('redacts HTML responses and omits the body', () => {
    const result = capture.capture('<html>secret</html>', 'text/html')

    expect(result.redacted).toBe(true)
    expect(result.body).toBeUndefined()
  })

  it('redacts XHTML responses', () => {
    const result = capture.capture('<xhtml/>', 'application/xhtml+xml')

    expect(result.redacted).toBe(true)
    expect(result.body).toBeUndefined()
  })

  it('marks non-plain-text responses as redacted without a body', () => {
    const result = capture.capture('binary', 'application/octet-stream')

    expect(result.redacted).toBe(true)
    expect(result.body).toBeUndefined()
  })

  it('returns an error result on invalid input', () => {
    const result = capture.capture('ok', 'application/json')

    expect(result.error).toBeUndefined()
    expect(result.truncated).toBe(false)
    expect(result.redacted).toBe(false)
  })
})

describe('buildBodyReason', () => {
  it('returns a stable reason for each known code', () => {
    expect(buildBodyReason('forbidden-content-type')).toBe(
      'Response body unavailable: forbidden content type'
    )
    expect(buildBodyReason('match-ambiguous', { candidateCount: 3 })).toBe(
      'Response body unavailable: ambiguous match (3 candidates)'
    )
    expect(buildBodyReason('match-expired')).toBe('Response body unavailable: match expired')
    expect(buildBodyReason('match-zero')).toBe('Response body unavailable: no matching candidate')
    expect(buildBodyReason('content-script-not-seen')).toBe(
      'Response body unavailable: content-script interception did not observe request'
    )
    expect(buildBodyReason('bodies-disabled')).toBe(
      'Response body unavailable: response body capture disabled in options'
    )
    expect(buildBodyReason('binary-over-cap', { size: 70000, max: 65536 })).toBe(
      'Response body unavailable: binary payload exceeds 65536 byte cap (70000 bytes)'
    )
    expect(buildBodyReason('capture-error')).toBe('Response body unavailable: capture failed')
    expect(buildBodyReason('decode-failed')).toBe('Response body unavailable: decode failed')
  })

  it('falls back to the code name for unknown codes', () => {
    expect(buildBodyReason('unknown-code')).toBe('Response body unavailable: unknown-code')
  })
})

describe('measureBytes', () => {
  it('returns utf8 body for plain text within cap', () => {
    const result = measureBytes('hello', 'text/plain')

    expect(result.available).toBe('available')
    expect(result.body).toBe('hello')
    expect(result.encoding).toBe('utf8')
    expect(result.truncated).toBe(false)
    expect(result.size).toBeGreaterThan(0)
  })

  it('truncates plain text at the byte cap', () => {
    const large = 'x'.repeat(MAX_RESPONSE_BODY_BYTES + 10)
    const result = measureBytes(large, 'text/plain')

    expect(result.available).toBe('available')
    expect(result.truncated).toBe(true)
    expect(result.body!.length).toBeLessThanOrEqual(MAX_RESPONSE_BODY_BYTES)
    expect(result.size).toBe(new TextEncoder().encode(large).length)
  })

  it('returns base64 body for non-text within cap', () => {
    const binary = new Uint8Array([0, 255, 128])
    const result = measureBytes(binary, 'application/octet-stream')

    expect(result.available).toBe('available')
    expect(result.encoding).toBe('base64')
    expect(result.size).toBe(3)
    expect(result.truncated).toBe(false)
  })

  it('returns unavailable for non-text exceeding cap', () => {
    const large = new Uint8Array(MAX_RESPONSE_BODY_BYTES + 1)
    const result = measureBytes(large, 'application/octet-stream')

    expect(result.available).toBe('unavailable')
    expect(result.body).toBeUndefined()
    expect(result.encoding).toBeUndefined()
    expect(result.size).toBe(MAX_RESPONSE_BODY_BYTES + 1)
    expect(result.truncated).toBe(false)
    expect(result.error).toContain('binary payload exceeds')
  })

  it('accepts string input for plain text', () => {
    const result = measureBytes('plain', 'text/plain')

    expect(result.available).toBe('available')
    expect(result.encoding).toBe('utf8')
  })

  it('accepts Uint8Array input for binary', () => {
    const result = measureBytes(new Uint8Array([1, 2, 3]), 'application/octet-stream')

    expect(result.available).toBe('available')
    expect(result.encoding).toBe('base64')
  })
})
