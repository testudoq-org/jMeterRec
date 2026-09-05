import { describe, expect, it } from 'vitest'
import type { ProviderContext, ResponseBodyProvider } from './response-body-provider'

describe('response-body-provider', () => {
  it('allows a provider to declare canCapture and capture', async () => {
    const provider: ResponseBodyProvider = {
      id: 'test',
      canCapture: () => true,
      capture: async () => ({ available: 'available' }),
    }

    const ctx: ProviderContext = { url: 'https://example.com', method: 'GET' }

    expect(provider.canCapture(ctx)).toBe(true)
    const result = await provider.capture(ctx)
    expect(result.available).toBe('available')
  })
})
