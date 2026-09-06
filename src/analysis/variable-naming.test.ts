import { describe, expect, it } from 'vitest'
import { sanitizeVariableName, deduplicateVariableName } from './variable-naming'

describe('variable naming', () => {
  describe('sanitizeVariableName', () => {
    it('keeps valid names unchanged', () => {
      expect(sanitizeVariableName('csrf_token')).toBe('csrf_token')
      expect(sanitizeVariableName('_token')).toBe('_token')
      expect(sanitizeVariableName('Token123')).toBe('Token123')
    })

    it('replaces invalid characters with underscores', () => {
      expect(sanitizeVariableName('csrf-token')).toBe('csrf_token')
      expect(sanitizeVariableName('token.name')).toBe('token_name')
      expect(sanitizeVariableName('token@123')).toBe('token_123')
    })

    it('prepends underscore when name starts with digit', () => {
      expect(sanitizeVariableName('123token')).toBe('_123token')
    })

    it('returns underscore for empty or invalid names', () => {
      expect(sanitizeVariableName('')).toBe('_')
      expect(sanitizeVariableName('---')).toBe('_')
    })
  })

  describe('deduplicateVariableName', () => {
    it('returns original name when unused', () => {
      const used = new Set<string>()
      expect(deduplicateVariableName('token', used)).toBe('token')
      expect(used.has('token')).toBe(true)
    })

    it('appends suffix for collisions', () => {
      const used = new Set<string>(['token'])
      expect(deduplicateVariableName('token', used)).toBe('token_1')
      expect(deduplicateVariableName('token', used)).toBe('token_2')
    })
  })
})
