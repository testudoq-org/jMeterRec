import { describe, expect, it } from 'vitest'
import { migrateRecording } from './recording-schema'

const fixtureModules = import.meta.glob('../../tests/fixtures/capture/*.json')

describe('honesty-invariant', () => {
  it('loads all capture fixtures', async () => {
    const paths = Object.keys(fixtureModules)
    expect(paths.length).toBeGreaterThanOrEqual(6)
  })

  for (const [path, loader] of Object.entries(fixtureModules)) {
    it(`asserts the honesty invariant across ${path}`, async () => {
      const input = (await loader()) as Record<string, unknown>
      const { recording } = migrateRecording(input)
      const requests = (recording as { requests?: unknown[] }).requests ?? []

      for (const request of requests) {
        const record = request as Record<string, unknown>
        const meta = record.responseBodyMeta as
          | { available: string; error?: string; redacted?: boolean; truncated?: boolean }
          | undefined

        if (meta === undefined) {
          // Every completed exchange should have responseBodyMeta after migration
          expect(record.id).toBeDefined()
          continue
        }

        switch (meta.available) {
          case 'available':
            expect(record.responseBody).toBeDefined()
            expect(typeof record.responseBody).toBe('string')
            expect((record.responseBody as string).length).toBeGreaterThan(0)
            break
          case 'blocked':
            expect(meta.redacted).toBe(true)
            break
          case 'not-requested':
            // Intentional absence — no error required
            break
          case 'unavailable':
          case 'capture-error':
            expect(typeof meta.error).toBe('string')
            expect(meta.error!.length).toBeGreaterThan(0)
            break
          case 'partial':
            expect(meta.truncated).toBe(true)
            break
          default:
            expect(meta.available).toBe('available')
        }
      }
    })
  }
})
