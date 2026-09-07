import type { CapturedRequest } from '../models/captured-request'

export type CandidateType =
  | 'csrf-token'
  | 'session-id'
  | 'authorization'
  | 'uuid'
  | 'business-id'
  | 'hidden-field'
  | 'cookie'
  | 'header'
  | 'viewstate'
  | 'form-field'
  | 'unknown'

export type ExtractorKind =
  | 'jsonpath'
  | 'regex'
  | 'boundary'
  | 'xpath'
  | 'css'
  | 'header'
  | 'cookie'

export interface AnalysisRecording {
  id: string
  schemaVersion: number
  exchanges: readonly CapturedRequest[]
}

export interface AnalysisInput {
  primary: AnalysisRecording
  baseline?: AnalysisRecording
}

export interface ProposedExtractor {
  kind: ExtractorKind
  expression: string
  matchNo?: number
  defaultValue?: string
  variableName: string
}

export interface RawFind {
  value: string
  location: string
  candidateType: CandidateType
  proposedExtractor: ProposedExtractor
}

export interface ValueCandidate {
  id: string
  value: string
  normalizedValue?: string
  sourceExchangeId: string
  sourceLocation: string
  consumerExchangeIds: string[]
  consumerLocations: string[]
  candidateType: CandidateType
  variableName: string
  confidence: number
  reasons: string[]
  proposedExtractor?: ProposedExtractor
  warnings: string[]
  scope: {
    producerIndex: number
    consumerIndices: number[]
  }
  rejected?: boolean
}

export interface AnalysisResult {
  recordingVersion: number
  recordingId: string
  candidates: ValueCandidate[]
  rejectedNoise: ValueCandidate[]
  diagnostics: string[]
}

/**
 * A proposed grouping of exchange IDs derived by pure heuristics
 * (timestamp gap, URL path prefix, main-frame navigation).
 *
 * The proposal is advisory: the user may rename, merge, split, or
 * reorder members before accepting. Lives in `src/analysis/types.ts`
 * so the pure grouping module in `src/analysis/` has no dependency
 * on `src/transform/`.
 */
export interface ProposedGroup {
  id: string
  name: string
  memberExchangeIds: string[]
  source: 'auto'
  confidence: number
  locked: false
  explanation: string
}

export interface AnalysisOptions {
  correlationWindowMs?: number
  sameTabOnly?: boolean
  matchStepsBy: 'url-method'
}

export interface ReuseEntry {
  normalizedValue: string
  producerIndex: number
  consumerIndices: number[]
}

export type ReuseMap = Map<string, ReuseEntry>

export interface RawCandidate {
  find: RawFind
  exchangeIndex: number
  exchangeId: string
}

export interface ScoringContext {
  bodyAvailable: boolean
  consumerCount: number
  valueChanges: boolean
  isManagedCookie: boolean
  isHardNoise: boolean
  hasMissingProducerBody: boolean
  isSingleUseCacheBuster: boolean
  structuralLocation: boolean
  namedTokenPattern: boolean
}

export const SCORING_WEIGHTS = {
  valueChanges: 0.15,
  producerBodyAvailable: 0.1,
  consumerCount: 0.05,
  maxConsumerBonus: 0.15,
  structuralLocation: 0.1,
  namedTokenPattern: 0.1,
  cookieManagedPenalty: -0.3,
  missingProducerBodyPenalty: -0.25,
  noConsumerPenalty: -0.2,
  singleUseCacheBusterPenalty: -0.15,
  timestampAnalyticsPenalty: -0.3,
} as const

export type ScoringWeights = typeof SCORING_WEIGHTS

export { CapturedRequest }
