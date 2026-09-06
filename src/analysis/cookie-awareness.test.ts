import { describe, expect, it } from 'vitest'
import { isManagedSessionCookie, cookieManagerPenalty } from './cookie-awareness'

describe('cookie awareness', () => {
  describe('isManagedSessionCookie', () => {
    it('detects JSESSIONID', () => {
      expect(isManagedSessionCookie('JSESSIONID=abc123')).toBe(true)
    })

    it('detects PHPSESSID', () => {
      expect(isManagedSessionCookie('PHPSESSID=xyz789')).toBe(true)
    })

    it('detects connect.sid', () => {
      expect(isManagedSessionCookie('connect.sid=sid123')).toBe(true)
    })

    it('rejects non-session cookies', () => {
      expect(isManagedSessionCookie('trackingId=xyz')).toBe(false)
    })
  })

  describe('cookieManagerPenalty', () => {
    it('returns -0.30 for managed cookies', () => {
      expect(cookieManagerPenalty('JSESSIONID')).toBe(-0.3)
    })
  })
})
