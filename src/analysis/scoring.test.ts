import { describe, expect, it } from 'vitest'
import { scoreCandidate } from './scoring'
import type { ScoringContext } from './types'

describe('scoreCandidate', () => {
  it('returns 0 for hard noise with no consumers', () => {
    const context: ScoringContext = {
      bodyAvailable: false,
      consumerCount: 0,
      valueChanges: false,
      isManagedCookie: false,
      isHardNoise: true,
      hasMissingProducerBody: true,
      isSingleUseCacheBuster: false,
      structuralLocation: false,
      namedTokenPattern: false,
    }

    expect(scoreCandidate(context)).toBe(0)
  })

  it('applies value changes bonus', () => {
    const context: ScoringContext = {
      bodyAvailable: true,
      consumerCount: 1,
      valueChanges: true,
      isManagedCookie: false,
      isHardNoise: false,
      hasMissingProducerBody: false,
      isSingleUseCacheBuster: false,
      structuralLocation: false,
      namedTokenPattern: false,
    }

    expect(scoreCandidate(context)).toBe(0.3)
  })

  it('applies cookie managed penalty', () => {
    const context: ScoringContext = {
      bodyAvailable: true,
      consumerCount: 3,
      valueChanges: true,
      isManagedCookie: true,
      isHardNoise: false,
      hasMissingProducerBody: false,
      isSingleUseCacheBuster: false,
      structuralLocation: false,
      namedTokenPattern: false,
    }

    // 0.15 + 0.10 + 0.15 (capped consumer) - 0.30 = 0.10
    expect(scoreCandidate(context)).toBe(0.1)
  })

  it('clamps score to [0, 1]', () => {
    const context: ScoringContext = {
      bodyAvailable: false,
      consumerCount: 0,
      valueChanges: false,
      isManagedCookie: false,
      isHardNoise: true,
      hasMissingProducerBody: true,
      isSingleUseCacheBuster: true,
      structuralLocation: false,
      namedTokenPattern: false,
    }

    expect(scoreCandidate(context)).toBe(0)
  })

  it('caps consumer bonus at max', () => {
    const context: ScoringContext = {
      bodyAvailable: true,
      consumerCount: 10,
      valueChanges: false,
      isManagedCookie: false,
      isHardNoise: false,
      hasMissingProducerBody: false,
      isSingleUseCacheBuster: false,
      structuralLocation: false,
      namedTokenPattern: false,
    }

    // 0.10 + 0.15 (capped) = 0.25
    expect(scoreCandidate(context)).toBe(0.25)
  })

  it('applies structuralLocation bonus', () => {
    const context: ScoringContext = {
      bodyAvailable: true,
      consumerCount: 1,
      valueChanges: false,
      isManagedCookie: false,
      isHardNoise: false,
      hasMissingProducerBody: false,
      isSingleUseCacheBuster: false,
      structuralLocation: true,
      namedTokenPattern: false,
    }

    // 0.10 (body) + 0.05 (1 consumer) + 0.10 (structuralLocation) = 0.25
    expect(scoreCandidate(context)).toBe(0.25)
  })

  it('applies namedTokenPattern bonus', () => {
    const context: ScoringContext = {
      bodyAvailable: true,
      consumerCount: 1,
      valueChanges: false,
      isManagedCookie: false,
      isHardNoise: false,
      hasMissingProducerBody: false,
      isSingleUseCacheBuster: false,
      structuralLocation: false,
      namedTokenPattern: true,
    }

    // 0.10 (body) + 0.05 (1 consumer) + 0.10 (namedTokenPattern) = 0.25
    expect(scoreCandidate(context)).toBe(0.25)
  })

  it('applies both structuralLocation and namedTokenPattern bonuses', () => {
    const context: ScoringContext = {
      bodyAvailable: true,
      consumerCount: 1,
      valueChanges: true,
      isManagedCookie: false,
      isHardNoise: false,
      hasMissingProducerBody: false,
      isSingleUseCacheBuster: false,
      structuralLocation: true,
      namedTokenPattern: true,
    }

    // 0.15 (valueChanges) + 0.10 (body) + 0.05 (1 consumer) + 0.10 + 0.10 = 0.50
    expect(scoreCandidate(context)).toBe(0.5)
  })
})
