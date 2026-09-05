import { describe, expect, it, vi } from 'vitest'
import { ContentScriptResponseBodyProvider } from '../capture/providers/content-script-response-body-provider'
import { UnsupportedResponseBodyProvider } from '../capture/providers/unsupported-response-body-provider'
import { ProviderRegistry } from '../capture/provider-registry'
import type { ProviderContext } from '../capture/response-body-provider'

describe('src/content/response-body-capture.ts', () => {
  it('loads the capture module without runtime errors', async () => {
    const module = await import('./response-body-capture')
    expect(module.responseBodyCapture).toBeDefined()
  })

  it('re-requests page context injection after being disabled and re-enabled', async () => {
    const module = await import('./response-body-capture')
    const capture = module.responseBodyCapture

    const sendMessage = vi.fn().mockResolvedValue({ success: true, injected: true, tabId: 1 })

    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        sendMessage,
      },
      tabs: {
        TAB_ID: 1,
      },
    } as never

    capture.setEnabled(true)
    capture.setEnabled(false)
    capture.setEnabled(true)

    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(sendMessage).toHaveBeenNthCalledWith(1, { type: 'INJECT_PAGE_CONTEXT_SCRIPT' })
    expect(sendMessage).toHaveBeenNthCalledWith(2, { type: 'INJECT_PAGE_CONTEXT_SCRIPT' })
  })

  it('content-fetch provider reports content-fetch source', async () => {
    const provider = new ContentScriptResponseBodyProvider('content-fetch')
    const result = await provider.capture({
      url: 'https://example.com/api',
      method: 'GET',
      contentType: 'application/json',
      body: '{"ok":true}',
      options: { bodiesEnabled: true },
    } as ProviderContext)

    expect(result.source).toBe('content-fetch')
    expect(result.available).toBe('available')
  })

  it('content-xhr provider reports content-xhr source', async () => {
    const provider = new ContentScriptResponseBodyProvider('content-xhr')
    const result = await provider.capture({
      url: 'https://example.com/api',
      method: 'POST',
      contentType: 'application/json',
      body: '{"ok":true}',
      options: { bodiesEnabled: true },
    } as ProviderContext)

    expect(result.source).toBe('content-xhr')
    expect(result.available).toBe('available')
  })

  it('unsupported provider returns not-requested when bodies disabled', async () => {
    const provider = new UnsupportedResponseBodyProvider()
    const result = await provider.capture({
      url: 'https://example.com/api',
      method: 'GET',
      options: { bodiesEnabled: false },
    } as ProviderContext)

    expect(result.available).toBe('not-requested')
    expect(result.source).toBe('none')
  })

  it('registry prefers enabled content-script provider over unsupported', async () => {
    const registry = new ProviderRegistry([
      new ContentScriptResponseBodyProvider('content-fetch'),
      new UnsupportedResponseBodyProvider(),
    ])

    const result = await registry.capture({
      url: 'https://example.com/api',
      method: 'GET',
      contentType: 'text/html',
      body: '<html/>',
      options: { bodiesEnabled: true },
    } as ProviderContext)

    expect(result.source).toBe('content-fetch')
    expect(result.available).toBe('blocked')
  })

  it('registry falls back to unsupported when bodies disabled', async () => {
    const registry = new ProviderRegistry([
      new ContentScriptResponseBodyProvider('content-fetch'),
      new UnsupportedResponseBodyProvider(),
    ])

    const result = await registry.capture({
      url: 'https://example.com/api',
      method: 'GET',
      options: { bodiesEnabled: false },
    } as ProviderContext)

    expect(result.available).toBe('not-requested')
    expect(result.source).toBe('none')
  })
})
