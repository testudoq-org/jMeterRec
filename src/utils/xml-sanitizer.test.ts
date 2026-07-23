import { describe, expect, it } from 'vitest'
import { sanitizeForXml } from './xml-sanitizer'

describe('sanitizeForXml', () => {
  it('preserves printable ASCII', () => {
    expect(sanitizeForXml('Hello World!')).toBe('Hello World!')
  })

  it('preserves tab, LF, and CR', () => {
    expect(sanitizeForXml('col1\tcol2\ncol3\rcol4')).toBe('col1\tcol2\ncol3\rcol4')
  })

  it('strips NUL byte', () => {
    expect(sanitizeForXml('a\x00b')).toBe('ab')
  })

  it('strips all C0 control characters except TAB LF CR', () => {
    const controls = String.fromCharCode(...Array.from({ length: 0x20 }, (_, i) => i))
    const expected = '\t\n\r'
    expect(sanitizeForXml(controls)).toBe(expected)
  })

  it('strips DEL (0x7F) and C1 controls (0x80-0x9F)', () => {
    // These are valid in XML 1.0 Char production but are rejected by strict
    // validators like BlazeMeter, so they must be stripped for compatibility.
    expect(sanitizeForXml('a\x7Fb')).toBe('ab')
    expect(sanitizeForXml('a\x80\x9Fb')).toBe('ab')
  })

  it('preserves valid Unicode beyond BMP', () => {
    const input = 'hello \uD83D\uDCA1 world' // 🜁
    expect(sanitizeForXml(input)).toBe(input)
  })

  it('strips lone surrogates', () => {
    const input = 'a\uD800b' // lone high surrogate
    expect(sanitizeForXml(input)).toBe('ab')
  })

  it('strips low surrogate without high surrogate', () => {
    const input = 'a\uDC00b'
    expect(sanitizeForXml(input)).toBe('ab')
  })

  it('returns empty string for empty input', () => {
    expect(sanitizeForXml('')).toBe('')
  })

  it('strips mixed binary payload from the reported BlazeMeter failure', () => {
    const binaryBody = String.fromCharCode(...Array.from({ length: 256 }, (_, i) => i))
    const sanitized = sanitizeForXml(binaryBody)
    // eslint-disable-next-line no-control-regex
    expect(sanitized).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F]/)
  })

  it('does not strip valid XML entity characters', () => {
    const input = 'a & b < c > d "e"'
    expect(sanitizeForXml(input)).toBe(input)
  })

  it('is a no-op for clean text (backward compatibility)', () => {
    const clean = 'GET https://example.com/api HTTP/1.1'
    expect(sanitizeForXml(clean)).toBe(clean)
  })
})
