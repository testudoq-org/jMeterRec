import { describe, expect, it } from 'vitest'
import { matchNamedPattern, NAMED_PATTERNS } from './named-patterns'

describe('named-patterns', () => {
  it('returns pattern for csrf', () => {
    const pattern = matchNamedPattern('csrf_token')
    expect(pattern).toBeDefined()
    expect(pattern!.candidateType).toBe('csrf-token')
    expect(pattern!.extractorKind).toBe('jsonpath')
  })

  it('returns pattern for viewstate', () => {
    const pattern = matchNamedPattern('__VIEWSTATE')
    expect(pattern).toBeDefined()
    expect(pattern!.candidateType).toBe('viewstate')
    expect(pattern!.extractorKind).toBe('boundary')
  })

  it('returns pattern for token', () => {
    const pattern = matchNamedPattern('access_token')
    expect(pattern).toBeDefined()
    expect(pattern!.candidateType).toBe('authorization')
    expect(pattern!.extractorKind).toBe('jsonpath')
  })

  it('returns pattern for session cookies', () => {
    const pattern = matchNamedPattern('JSESSIONID')
    expect(pattern).toBeDefined()
    expect(pattern!.candidateType).toBe('session-id')
    expect(pattern!.extractorKind).toBe('cookie')
  })

  it('returns undefined for unknown names', () => {
    expect(matchNamedPattern('random_field')).toBeUndefined()
  })

  it('contains expected pattern count', () => {
    expect(NAMED_PATTERNS.length).toBeGreaterThanOrEqual(7)
  })
})
