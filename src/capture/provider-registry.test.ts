import { describe, expect, it } from 'vitest'
import { ProviderRegistry } from './provider-registry'
import type {
  ProviderContext,
  ResponseBodyProvider,
  ResponseBodyCaptureResult,
} from './response-body-provider'

function buildProvider(
  id: string,
  canCapture: boolean,
  result: ResponseBodyCaptureResult
): ResponseBodyProvider {
  return {
    id,
    canCapture: () => canCapture,
    capture: async () => result,
  }
}

describe('ProviderRegistry', () => {
  it('returns the first provider that canCapture', async () => {
    const registry = new ProviderRegistry([
      buildProvider('first', false, { available: 'available', source: 'first' }),
      buildProvider('second', true, { available: 'available', source: 'second' }),
    ])

    const result = await registry.capture({
      url: 'https://example.com',
      method: 'GET',
    } as ProviderContext)
    expect(result.source).toBe('second')
  })

  it('falls back to not-requested when no provider canCapture', async () => {
    const registry = new ProviderRegistry([
      buildProvider('first', false, { available: 'available', source: 'first' }),
    ])

    const result = await registry.capture({
      url: 'https://example.com',
      method: 'GET',
    } as ProviderContext)
    expect(result.available).toBe('not-requested')
    expect(result.source).toBe('none')
  })
})
