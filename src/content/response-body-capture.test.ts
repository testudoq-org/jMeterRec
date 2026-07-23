import { describe, expect, it } from 'vitest'

describe('src/content/response-body-capture.ts', () => {
  it('loads the capture module without runtime errors', async () => {
    const module = await import('./response-body-capture')
    expect(module.responseBodyCapture).toBeDefined()
  })
})
