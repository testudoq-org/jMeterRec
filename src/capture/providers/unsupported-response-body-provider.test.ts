import { describe, expect, it } from 'vitest'
import { UnsupportedResponseBodyProvider } from './unsupported-response-body-provider'
import type { ProviderContext } from '../response-body-provider'

function ctx(overrides: Partial<ProviderContext> = {}): ProviderContext {
  return {
    url: 'https://example.com/api',
    method: 'GET',
    options: { bodiesEnabled: false },
    ...overrides,
  }
}

describe('UnsupportedResponseBodyProvider', () => {
  const provider = new UnsupportedResponseBodyProvider()

  it('reports id unsupported', () => {
    expect(provider.id).toBe('unsupported')
  })

  it('canCapture returns true when bodies are disabled', () => {
    expect(provider.canCapture(ctx())).toBe(true)
  })

  it('canCapture returns false when bodies are enabled', () => {
    expect(provider.canCapture(ctx({ options: { bodiesEnabled: true } }))).toBe(false)
  })

  it('capture returns not-requested and never throws', async () => {
    const result = await provider.capture(ctx())

    expect(result.available).toBe('not-requested')
    expect(result.source).toBe('none')
    expect(result.error).toBeUndefined()
  })
})
