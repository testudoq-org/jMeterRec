import { describe, expect, it } from 'vitest'
import { isHostForbidden } from '../background/forbidden-domains'

describe('isHostForbidden', () => {
  it('blocks testudo root domain', () => {
    expect(isHostForbidden('https://www.testudo.co.nz/api')).toBe(true)
    expect(isHostForbidden('https://testudo.co.nz/account')).toBe(true)
  })

  it('blocks subdomains of forbidden hosts', () => {
    expect(isHostForbidden('https://app.testudo.co.nz/jobs')).toBe(true)
    expect(isHostForbidden('https://api.attestify-us.com/v1')).toBe(true)
  })

  it('blocks attestify-us root and subdomains', () => {
    expect(isHostForbidden('https://www.attestify-us.com/')).toBe(true)
    expect(isHostForbidden('https://app.attestify-us.com/report')).toBe(true)
  })

  it('blocks extension-internal URLs', () => {
    expect(isHostForbidden('chrome-extension://abc123/options.html')).toBe(true)
    expect(isHostForbidden('chrome-extension://abc123/background.js')).toBe(true)
    expect(isHostForbidden('about:blank')).toBe(true)
    expect(isHostForbidden('edge://settings')).toBe(true)
    expect(isHostForbidden('brave://flags')).toBe(true)
  })

  it('permits non-forbidden hosts', () => {
    expect(isHostForbidden('https://example.com/api')).toBe(false)
    expect(isHostForbidden('https://app.example.com/health')).toBe(false)
    expect(isHostForbidden('https://example.com.br/api')).toBe(false)
  })

  it('does not falsely exclude a domain that merely contains a forbidden substring', () => {
    expect(isHostForbidden('https://example.com')).toBe(false)
  })
})
