import { describe, expect, it } from 'vitest'
import {
  validateFilterPattern,
  validateResourceTypes,
  validateCustomUserAgent,
  normalizeAdvancedOptions,
  DEFAULT_ADVANCED_OPTIONS,
  parseUrlPatterns,
  matchesUrlPattern,
  shouldCaptureResourceType,
} from './advanced-options'

describe('validateFilterPattern', () => {
  it('accepts empty string as valid (defaults to *)', () => {
    const result = validateFilterPattern('')
    expect(result.valid).toBe(true)
  })

  it('accepts * as valid (record everything)', () => {
    const result = validateFilterPattern('*')
    expect(result.valid).toBe(true)
  })

  it('accepts http://*/* as valid', () => {
    const result = validateFilterPattern('http://*/*')
    expect(result.valid).toBe(true)
  })

  it('accepts https://*/* as valid', () => {
    const result = validateFilterPattern('https://*/*')
    expect(result.valid).toBe(true)
  })

  it('accepts comma-separated patterns as valid', () => {
    const result = validateFilterPattern('http://*/*, https://*/*')
    expect(result.valid).toBe(true)
  })

  it('accepts domain-specific patterns as valid', () => {
    const result = validateFilterPattern('https://api.example.com/*')
    expect(result.valid).toBe(true)
  })

  it('accepts scheme wildcards as valid', () => {
    const result = validateFilterPattern('*://*.cdn.example.com/*')
    expect(result.valid).toBe(true)
  })

  it('rejects invalid pattern syntax', () => {
    const result = validateFilterPattern('not-a-url')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Enter a valid URL pattern or *')
  })

  it('rejects pattern without scheme', () => {
    const result = validateFilterPattern('example.com/*')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Enter a valid URL pattern or *')
  })

  it('rejects completely invalid patterns', () => {
    const result = validateFilterPattern('://invalid')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Enter a valid URL pattern or *')
  })
})

describe('validateResourceTypes', () => {
  it('accepts at least one resource type checked', () => {
    const result = validateResourceTypes({
      recordCss: false,
      recordJs: true,
      recordImages: false,
    })
    expect(result.valid).toBe(true)
  })

  it('accepts all resource types checked', () => {
    const result = validateResourceTypes({
      recordCss: true,
      recordJs: true,
      recordImages: true,
    })
    expect(result.valid).toBe(true)
  })

  it('rejects when all three resource types are unchecked', () => {
    const result = validateResourceTypes({
      recordCss: false,
      recordJs: false,
      recordImages: false,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toBe('At least one resource type must be selected')
  })

  it('accepts recordJs=true and recordCss/recordImages false', () => {
    const result = validateResourceTypes({
      recordCss: false,
      recordJs: true,
      recordImages: false,
    })
    expect(result.valid).toBe(true)
  })
})

import type { UserAgentSelection } from './advanced-options'

describe('validateCustomUserAgent', () => {
  it('rejects when selection is not custom', () => {
    const result = validateCustomUserAgent('chrome-win' as UserAgentSelection, 'Custom string')
    expect(result.valid).toBe(true)
  })

  it('rejects empty custom user agent', () => {
    const result = validateCustomUserAgent('custom' as UserAgentSelection, '')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Custom User-Agent string cannot be empty')
  })

  it('rejects custom user agent with only whitespace', () => {
    const result = validateCustomUserAgent('custom' as UserAgentSelection, '   ')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Custom User-Agent string cannot be empty')
  })

  it('accepts valid custom user agent', () => {
    const result = validateCustomUserAgent(
      'custom' as UserAgentSelection,
      'Mozilla/5.0 (Custom Browser) MyBrowser/1.0'
    )
    expect(result.valid).toBe(true)
  })

  it('rejects custom user agent with line breaks', () => {
    const result = validateCustomUserAgent(
      'custom' as UserAgentSelection,
      'Mozilla/5.0\nCustom Browser'
    )
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Custom User-Agent string cannot contain line breaks')
  })

  it('rejects custom user agent >= 512 characters', () => {
    const longUa = 'Mozilla/5.0 '.repeat(50)
    const result = validateCustomUserAgent('custom' as UserAgentSelection, longUa)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Custom User-Agent string must be less than 512 characters')
  })

  it('accepts custom user agent exactly at 511 characters', () => {
    const ua = 'a'.repeat(511)
    const result = validateCustomUserAgent('custom' as UserAgentSelection, ua)
    expect(result.valid).toBe(true)
  })
})

describe('normalizeAdvancedOptions', () => {
  it('applies defaults for empty input', () => {
    expect(normalizeAdvancedOptions({})).toEqual(DEFAULT_ADVANCED_OPTIONS)
  })

  it('applies defaults for null input', () => {
    expect(normalizeAdvancedOptions(null)).toEqual(DEFAULT_ADVANCED_OPTIONS)
  })

  it('preserves valid stored options', () => {
    const input = {
      filterPattern: 'https://api.example.com/*',
      recordCss: false,
      recordJs: true,
      recordImages: false,
      recordRedirects: true,
      recordCookies: false,
      userAgent: 'firefox-win' as const,
    }
    expect(normalizeAdvancedOptions(input)).toEqual(input)
  })

  it('normalizes userAgent to current for invalid selection', () => {
    const result = normalizeAdvancedOptions({
      userAgent: 'invalid-browser' as unknown as string,
    })
    expect(result.userAgent).toBe('current')
  })

  it('trims whitespace from custom user agent', () => {
    const result = normalizeAdvancedOptions({
      userAgent: 'custom:  Mozilla/5.0 Custom  ' as unknown as string,
    })
    expect(result.userAgent).toBe('custom:Mozilla/5.0 Custom')
  })
})

describe('parseUrlPatterns', () => {
  it('returns default patterns for empty input', () => {
    expect(parseUrlPatterns('')).toEqual(['<all_urls>'])
  })

  it('returns default patterns for undefined input', () => {
    expect(parseUrlPatterns(undefined)).toEqual(['<all_urls>'])
  })

  it('handles single pattern', () => {
    expect(parseUrlPatterns('https://example.com/*')).toEqual(['https://example.com/*'])
  })

  it('handles comma-separated patterns', () => {
    const result = parseUrlPatterns('http://*/*, https://*/*')
    expect(result).toEqual(['http://*/*', 'https://*/*'])
  })

  it('trims whitespace from patterns', () => {
    const result = parseUrlPatterns('  http://*/*  ,  https://*/*  ')
    expect(result).toEqual(['http://*/*', 'https://*/*'])
  })

  it('filters empty patterns', () => {
    const result = parseUrlPatterns('http://*/*, , https://*/*')
    expect(result).toEqual(['http://*/*', 'https://*/*'])
  })

  it('expands * to <all_urls>', () => {
    expect(parseUrlPatterns('*')).toEqual(['<all_urls>'])
  })
})

describe('matchesUrlPattern', () => {
  it('matches when URL matches any pattern', () => {
    expect(matchesUrlPattern('https://example.com/api', ['https://example.com/*'])).toBe(true)
  })

  it('does not match when URL does not match any pattern', () => {
    expect(matchesUrlPattern('https://other.com/api', ['https://example.com/*'])).toBe(false)
  })

  it('matches with <all_urls> pattern', () => {
    expect(matchesUrlPattern('https://any.com/path', ['<all_urls>'])).toBe(true)
  })

  it('handles multiple patterns', () => {
    const patterns = ['https://api.example.com/*', 'https://cdn.example.com/*']
    expect(matchesUrlPattern('https://api.example.com/users', patterns)).toBe(true)
    expect(matchesUrlPattern('https://cdn.example.com/assets', patterns)).toBe(true)
    expect(matchesUrlPattern('https://other.com/path', patterns)).toBe(false)
  })
})

describe('shouldCaptureResourceType', () => {
  it('excludes stylesheet when recordCss is false', () => {
    const options = { ...DEFAULT_ADVANCED_OPTIONS, recordCss: false }
    expect(shouldCaptureResourceType(options, 'stylesheet')).toBe(false)
  })

  it('includes stylesheet when recordCss is true', () => {
    const options = { ...DEFAULT_ADVANCED_OPTIONS, recordCss: true }
    expect(shouldCaptureResourceType(options, 'stylesheet')).toBe(true)
  })

  it('excludes script when recordJs is false', () => {
    const options = { ...DEFAULT_ADVANCED_OPTIONS, recordJs: false }
    expect(shouldCaptureResourceType(options, 'script')).toBe(false)
  })

  it('includes script when recordJs is true', () => {
    const options = { ...DEFAULT_ADVANCED_OPTIONS, recordJs: true }
    expect(shouldCaptureResourceType(options, 'script')).toBe(true)
  })

  it('excludes image when recordImages is false', () => {
    const options = { ...DEFAULT_ADVANCED_OPTIONS, recordImages: false }
    expect(shouldCaptureResourceType(options, 'image')).toBe(false)
  })

  it('includes image when recordImages is true', () => {
    const options = { ...DEFAULT_ADVANCED_OPTIONS, recordImages: true }
    expect(shouldCaptureResourceType(options, 'image')).toBe(true)
  })

  it('excludes font extensions when recordCss is false', () => {
    const options = { ...DEFAULT_ADVANCED_OPTIONS, recordCss: false }
    expect(shouldCaptureResourceType(options, 'font', 'https://example.com/font.woff2')).toBe(false)
    expect(shouldCaptureResourceType(options, 'font', 'https://example.com/font.ttf')).toBe(false)
    expect(shouldCaptureResourceType(options, 'image', 'https://example.com/font.woff')).toBe(false)
  })

  it('includes font extensions when recordCss is true', () => {
    const options = { ...DEFAULT_ADVANCED_OPTIONS, recordCss: true }
    expect(shouldCaptureResourceType(options, 'image', 'https://example.com/font.woff2')).toBe(true)
  })

  it('excludes image extensions when recordImages is false', () => {
    const options = { ...DEFAULT_ADVANCED_OPTIONS, recordImages: false }
    expect(shouldCaptureResourceType(options, 'image', 'https://example.com/photo.png')).toBe(false)
    expect(shouldCaptureResourceType(options, 'image', 'https://example.com/photo.jpg')).toBe(false)
    expect(shouldCaptureResourceType(options, 'image', 'https://example.com/photo.svg')).toBe(false)
  })

  it('includes image extensions when recordImages is true', () => {
    const options = { ...DEFAULT_ADVANCED_OPTIONS, recordImages: true }
    expect(shouldCaptureResourceType(options, 'image', 'https://example.com/photo.png')).toBe(true)
    expect(shouldCaptureResourceType(options, 'other', 'https://example.com/photo.jpg')).toBe(true)
  })

  it('includes xmlhttprequest when recordJs is true', () => {
    const options = { ...DEFAULT_ADVANCED_OPTIONS, recordJs: true }
    expect(shouldCaptureResourceType(options, 'xmlhttprequest')).toBe(true)
  })

  it('excludes xmlhttprequest when recordJs is false', () => {
    const options = { ...DEFAULT_ADVANCED_OPTIONS, recordJs: false }
    expect(shouldCaptureResourceType(options, 'xmlhttprequest')).toBe(false)
  })

  it('includes fetch when recordJs is true', () => {
    const options = { ...DEFAULT_ADVANCED_OPTIONS, recordJs: true }
    expect(shouldCaptureResourceType(options, 'fetch')).toBe(true)
  })

  it('includes main_frame when recordJs is true', () => {
    const options = { ...DEFAULT_ADVANCED_OPTIONS, recordJs: true }
    expect(shouldCaptureResourceType(options, 'main_frame')).toBe(true)
  })

  it('includes sub_frame when recordJs is true', () => {
    const options = { ...DEFAULT_ADVANCED_OPTIONS, recordJs: true }
    expect(shouldCaptureResourceType(options, 'sub_frame')).toBe(true)
  })
})
