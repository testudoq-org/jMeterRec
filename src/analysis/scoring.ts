import type { ScoringContext } from './types'
import { SCORING_WEIGHTS } from './types'

export function scoreCandidate(_context: ScoringContext): number {
  let score = 0

  if (_context.valueChanges) {
    score += SCORING_WEIGHTS.valueChanges
  }

  if (_context.bodyAvailable) {
    score += SCORING_WEIGHTS.producerBodyAvailable
  }

  const consumerBonus = Math.min(
    _context.consumerCount * SCORING_WEIGHTS.consumerCount,
    SCORING_WEIGHTS.maxConsumerBonus
  )
  score += consumerBonus

  if (_context.structuralLocation) {
    score += SCORING_WEIGHTS.structuralLocation
  }

  if (_context.namedTokenPattern) {
    score += SCORING_WEIGHTS.namedTokenPattern
  }

  if (_context.isManagedCookie) {
    score += SCORING_WEIGHTS.cookieManagedPenalty
  }

  if (_context.hasMissingProducerBody) {
    score += SCORING_WEIGHTS.missingProducerBodyPenalty
  }

  if (_context.consumerCount === 0) {
    score += SCORING_WEIGHTS.noConsumerPenalty
  }

  if (_context.isSingleUseCacheBuster) {
    score += SCORING_WEIGHTS.singleUseCacheBusterPenalty
  }

  if (_context.isHardNoise) {
    score += SCORING_WEIGHTS.timestampAnalyticsPenalty
  }

  return Math.round(Math.max(0, Math.min(1, score)) * 100) / 100
}
