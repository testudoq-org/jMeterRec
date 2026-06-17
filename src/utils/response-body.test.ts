import { describe, expect, it } from 'vitest'
import { measureBody, isPlainText, shouldRedact, MAX_RESPONSE_BODY_BYTES, ResponseBodyCapture } from './response-body'

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
