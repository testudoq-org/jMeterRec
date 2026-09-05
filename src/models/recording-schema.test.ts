import { describe, expect, it } from 'vitest'
import {
  migrateRecording,
  CURRENT_SCHEMA_VERSION,
  MIN_KNOWN_SCHEMA_VERSION,
} from './recording-schema'

describe('recording-schema', () => {
  describe('migrateRecording', () => {
    it('adds schemaVersion 1 to a legacy recording with no schemaVersion', () => {
      const input = {
        requests: [
          { id: '1', method: 'GET', url: 'https://example.com', headers: {}, queryParams: {} },
        ],
      }

      const result = migrateRecording(input)
      const recording = result.recording as {
        schemaVersion: number
        requests: Record<string, unknown>[]
      }

      expect(recording.schemaVersion).toBe(1)
      expect(result.warnings).toHaveLength(0)
      expect(recording.requests[0]!.responseBodyMeta).toEqual({ available: 'not-requested' })
      expect(recording.requests[0]!.captureSources).toEqual([])
      expect(recording.requests[0]!.diagnostics).toEqual([])
    })

    it('preserves an existing known schemaVersion and does not warn', () => {
      const input = {
        schemaVersion: 1,
        requests: [],
      }

      const result = migrateRecording(input)

      expect(result.recording.schemaVersion).toBe(1)
      expect(result.warnings).toHaveLength(0)
    })

    it('warns on newer-than-known schemaVersion and loads with defaults', () => {
      const input = {
        schemaVersion: 999,
        requests: [
          { id: '1', method: 'GET', url: 'https://example.com', headers: {}, queryParams: {} },
        ],
      }

      const result = migrateRecording(input)
      const newerRecording = result.recording as {
        schemaVersion: number
        requests: Record<string, unknown>[]
      }

      expect(newerRecording.schemaVersion).toBe(1)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('newer than supported')
      expect(newerRecording.requests[0]!.responseBodyMeta).toEqual({ available: 'not-requested' })
    })

    it('populates available meta for requests that already have a response body', () => {
      const input = {
        requests: [
          {
            id: '1',
            method: 'GET',
            url: 'https://example.com',
            headers: {},
            queryParams: {},
            responseBody: 'hello',
            responseBodySize: 5,
            responseBodyTruncated: false,
            responseBodyContentType: 'text/plain',
          },
        ],
      }

      const result = migrateRecording(input)
      const bodyRecording = result.recording as {
        requests: Record<string, unknown>[]
      }

      expect(bodyRecording.requests[0]!.responseBodyMeta).toEqual({
        available: 'available',
        size: 5,
        truncated: false,
        contentType: 'text/plain',
      })
    })

    it('round-trips legacy recording with all new fields present', () => {
      const legacy = {
        requests: [
          { id: '1', method: 'GET', url: 'https://example.com', headers: {}, queryParams: {} },
        ],
      }

      const first = migrateRecording(legacy)
      const second = migrateRecording(first.recording)
      const roundTripRecording = second.recording as {
        schemaVersion: number
        requests: Record<string, unknown>[]
      }

      expect(roundTripRecording.schemaVersion).toBe(1)
      expect(roundTripRecording.requests[0]!.responseBodyMeta).toEqual({
        available: 'not-requested',
      })
      expect(second.warnings).toHaveLength(0)
    })

    it('handles empty or invalid input gracefully', () => {
      expect(migrateRecording(null).recording.schemaVersion).toBe(1)
      expect(migrateRecording('not-an-object').recording.schemaVersion).toBe(1)
      expect(migrateRecording({ requests: 'not-an-array' }).recording.requests).toEqual(
        'not-an-array'
      )
    })
  })

  describe('constants', () => {
    it('exposes CURRENT_SCHEMA_VERSION as 1', () => {
      expect(CURRENT_SCHEMA_VERSION).toBe(1)
    })

    it('exposes MIN_KNOWN_SCHEMA_VERSION as 1', () => {
      expect(MIN_KNOWN_SCHEMA_VERSION).toBe(1)
    })
  })
})
