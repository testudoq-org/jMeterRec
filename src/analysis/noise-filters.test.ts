import { describe, expect, it } from 'vitest'
import { isTimestamp, isCacheBuster, isAnalyticsId, isHardNoise } from './noise-filters'

describe('noise filters', () => {
  describe('isTimestamp', () => {
    it('detects ISO timestamps', () => {
      expect(isTimestamp('2024-01-01T00:00:00.000Z')).toBe(true)
      expect(isTimestamp('2024-01-01T00:00:00Z')).toBe(true)
      expect(isTimestamp('2024-01-01 00:00:00')).toBe(true)
    })

    it('rejects non-timestamps', () => {
      expect(isTimestamp('abc123')).toBe(false)
      expect(isTimestamp('')).toBe(false)
    })
  })

  describe('isCacheBuster', () => {
    it('detects numeric cache busters', () => {
      expect(isCacheBuster('1704067200000')).toBe(true)
    })

    it('detects hex cache busters', () => {
      expect(isCacheBuster('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')).toBe(true)
    })

    it('rejects normal values', () => {
      expect(isCacheBuster('my-token-value')).toBe(false)
    })
  })

  describe('isAnalyticsId', () => {
    it('detects UA- ids', () => {
      expect(isAnalyticsId('UA-123456-1')).toBe(true)
    })

    it('rejects normal values', () => {
      expect(isAnalyticsId('my-token')).toBe(false)
    })
  })

  describe('isHardNoise', () => {
    it('flags timestamps by value', () => {
      expect(isHardNoise('2024-01-01T00:00:00.000Z', 'some_field')).toBe(true)
    })

    it('flags cache busters by name', () => {
      expect(isHardNoise('abc123', 'cache_buster')).toBe(true)
    })

    it('does not flag normal tokens', () => {
      expect(isHardNoise('my-token-123', 'csrf_token')).toBe(false)
    })
  })
})
