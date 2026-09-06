import { describe, expect, it } from 'vitest'
import type { AnalysisInput, AnalysisResult, ValueCandidate } from './types'
import type { CapturedRequest } from '../models/captured-request'

describe('analysis types', () => {
  it('accepts readonly CapturedRequest[] for AnalysisInput.primary.exchanges', () => {
    const exchanges: readonly CapturedRequest[] = []
    const input: AnalysisInput = {
      primary: {
        id: 'recording-1',
        schemaVersion: 1,
        exchanges,
      },
    }

    expect(input.primary.exchanges).toBe(exchanges)
  })

  it('requires variableName on ValueCandidate', () => {
    const candidate: ValueCandidate = {
      id: 'candidate-1',
      value: 'abc',
      sourceExchangeId: 'req-1',
      sourceLocation: 'response.body.json:$.token',
      consumerExchangeIds: ['req-2'],
      consumerLocations: ['request.header:Authorization'],
      candidateType: 'csrf-token',
      variableName: 'csrf_token',
      confidence: 0.5,
      reasons: ['test'],
      warnings: [],
      scope: {
        producerIndex: 0,
        consumerIndices: [1],
      },
    }

    expect(candidate.variableName).toBe('csrf_token')
  })

  it('requires recordingVersion on AnalysisResult', () => {
    const result: AnalysisResult = {
      recordingVersion: 1,
      recordingId: 'recording-1',
      candidates: [],
      rejectedNoise: [],
      diagnostics: [],
    }

    expect(result.recordingVersion).toBe(1)
    expect(result.recordingId).toBe('recording-1')
  })
})
