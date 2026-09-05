import { describe, expect, it } from 'vitest'
import { appendDiagnostic, capDiagnostics, toDisplay, appendMatchDiagnostic } from './diagnostics'

describe('diagnostics', () => {
  describe('appendDiagnostic', () => {
    it('appends a new entry to an empty array', () => {
      const arr: string[] = []
      appendDiagnostic(arr, 'hello')

      expect(arr).toEqual(['hello'])
    })

    it('truncates entries longer than 240 characters', () => {
      const arr: string[] = []
      const long = 'x'.repeat(300)
      appendDiagnostic(arr, long)

      expect(arr[0]).toHaveLength(240)
      expect(arr[0]).toMatch(/\.\.\.$/)
    })

    it('drops the oldest entry when over 20 entries', () => {
      const arr: string[] = []
      for (let i = 0; i < 21; i += 1) {
        appendDiagnostic(arr, `msg-${i}`)
      }

      expect(arr).toHaveLength(20)
      expect(arr[0]).toBe('msg-1')
      expect(arr[19]).toBe('msg-20')
    })
  })

  describe('capDiagnostics', () => {
    it('returns a capped copy without mutating the original', () => {
      const arr = Array.from({ length: 25 }, (_, i) => `msg-${i}`)
      const capped = capDiagnostics(arr)

      expect(capped).toHaveLength(20)
      expect(arr).toHaveLength(25)
      expect(capped[0]).toBe('msg-5')
    })

    it('truncates long entries in the returned copy', () => {
      const arr = ['short', 'x'.repeat(300)]
      const capped = capDiagnostics(arr)

      expect(capped[1]).toHaveLength(240)
    })
  })

  describe('toDisplay', () => {
    it('masks Authorization header values', () => {
      const arr = ['Authorization: Bearer ey-test-token']
      const display = toDisplay(arr)

      expect(display[0]).toBe('Authorization: ***')
    })

    it('masks Set-Cookie header values', () => {
      const arr = ['Set-Cookie: sessionId=live-session']
      const display = toDisplay(arr)

      expect(display[0]).toBe('Set-Cookie: ***')
    })

    it('masks Cookie header values', () => {
      const arr = ['Cookie: sessionId=live-session']
      const display = toDisplay(arr)

      expect(display[0]).toBe('Cookie: ***')
    })

    it('masks Proxy-Authorization header values', () => {
      const arr = ['Proxy-Authorization: Basic abc']
      const display = toDisplay(arr)

      expect(display[0]).toBe('Proxy-Authorization: ***')
    })

    it('passes through entries without secret headers', () => {
      const arr = ['Normal diagnostic message about request']
      const display = toDisplay(arr)

      expect(display[0]).toBe('Normal diagnostic message about request')
    })
  })

  describe('appendMatchDiagnostic', () => {
    it('appends zero-match diagnostic', () => {
      const arr: string[] = []
      appendMatchDiagnostic(arr, 'req-1', 'zero')

      expect(arr).toEqual(['Response body unavailable: no matching candidate for req-1'])
    })

    it('appends ambiguous-match diagnostic with count', () => {
      const arr: string[] = []
      appendMatchDiagnostic(arr, 'req-2', 'ambiguous', 3)

      expect(arr).toEqual(['Response body unavailable: ambiguous match (3 candidates) for req-2'])
    })

    it('appends expired-match diagnostic', () => {
      const arr: string[] = []
      appendMatchDiagnostic(arr, 'req-3', 'expired')

      expect(arr).toEqual(['Response body unavailable: match expired for req-3'])
    })
  })
})
