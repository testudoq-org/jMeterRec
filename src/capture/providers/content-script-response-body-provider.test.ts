import { describe, expect, it } from 'vitest'
import { ContentScriptResponseBodyProvider } from './content-script-response-body-provider'
import type { ProviderContext } from '../response-body-provider'

function ctx(overrides: Partial<ProviderContext> = {}): ProviderContext {
  return {
    url: 'https://example.com/api',
    method: 'GET',
    contentType: 'application/json',
    body: '{"token":"abc"}',
    options: { bodiesEnabled: true },
    ...overrides,
  }
}

describe('ContentScriptResponseBodyProvider', () => {
  it('reports content-fetch source for fetch provider', async () => {
    const provider = new ContentScriptResponseBodyProvider('content-fetch')
    const result = await provider.capture(ctx())

    expect(result.source).toBe('content-fetch')
  })

  it('reports content-xhr source for xhr provider', async () => {
    const provider = new ContentScriptResponseBodyProvider('content-xhr')
    const result = await provider.capture(ctx())

    expect(result.source).toBe('content-xhr')
  })

  it('canCapture returns true when bodiesEnabled is true', () => {
    const provider = new ContentScriptResponseBodyProvider('content-fetch')
    expect(provider.canCapture(ctx())).toBe(true)
  })

  it('canCapture returns false when bodiesEnabled is false', () => {
    const provider = new ContentScriptResponseBodyProvider('content-fetch')
    expect(provider.canCapture(ctx({ options: { bodiesEnabled: false } }))).toBe(false)
  })

  it('returns not-requested when body is empty', async () => {
    const provider = new ContentScriptResponseBodyProvider('content-fetch')
    const result = await provider.capture(ctx({ body: undefined }))

    expect(result.available).toBe('not-requested')
    expect(result.source).toBe('content-fetch')
  })

  it('returns blocked for forbidden content types', async () => {
    const provider = new ContentScriptResponseBodyProvider('content-fetch')
    const result = await provider.capture(ctx({ contentType: 'text/html' }))

    expect(result.available).toBe('blocked')
    expect(result.source).toBe('content-fetch')
    expect(result.error).toBe('Forbidden content type.')
  })

  it('returns available for JSON body', async () => {
    const provider = new ContentScriptResponseBodyProvider('content-fetch')
    const result = await provider.capture(ctx())

    expect(result.available).toBe('available')
    expect(result.encoding).toBe('utf8')
    expect(result.size).toBeGreaterThan(0)
  })

  it('returns capture-error on unexpected failure', async () => {
    const provider = new ContentScriptResponseBodyProvider('content-fetch')
    const result = await provider.capture({
      ...ctx(),
      body: '\u{FFFE}invalid',
    })

    expect(result.available).toBe('available')
    expect(result.source).toBe('content-fetch')
    expect(result.error).toBeUndefined()
  })
})
