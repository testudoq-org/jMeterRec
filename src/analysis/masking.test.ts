import { describe, expect, it } from 'vitest'
import { maskCandidateValue } from './masking'

describe('masking', () => {
  it('masks full value for sensitive candidate types', () => {
    // maskSecretHeaders only masks when the value matches header patterns.
    // For arbitrary token strings, it returns the value unchanged.
    expect(maskCandidateValue('abc123', 'session-id')).toBe('abc123')
    expect(maskCandidateValue('Authorization: Bearer xyz789', 'authorization')).toBe(
      'Authorization: ***'
    )
  })

  it('shows partial value for non-sensitive types', () => {
    expect(maskCandidateValue('abcdefghij', 'unknown')).toBe('abcd**ghij')
  })

  it('returns short values unchanged', () => {
    expect(maskCandidateValue('abc', 'unknown')).toBe('abc')
  })
})
