import type { ResponseBodyPayload } from '../messages'

export interface ResponseBodyMatchingServiceOptions {
  readonly maxAgeMs?: number
}

export interface ResponseBodyMatch {
  readonly requestId: string
  readonly pending: boolean
}

export type MatchOutcome =
  | { readonly kind: 'match'; readonly match: ResponseBodyMatch }
  | { readonly kind: 'zero' }
  | { readonly kind: 'ambiguous'; readonly candidateCount: number; readonly requestIds: string[] }
  | { readonly kind: 'expired'; readonly requestId: string }

export class ResponseBodyMatchingService {
  private readonly maxAgeMs: number

  constructor(options?: ResponseBodyMatchingServiceOptions) {
    this.maxAgeMs = options?.maxAgeMs ?? 15 * 60 * 1000
  }

  findMatch(
    payload: import('../messages').ResponseBodyPayload,
    pending: readonly import('../models/pending-web-request').PendingRequest[],
    completed: readonly import('../models/captured-request').CapturedRequest[]
  ): MatchOutcome {
    const pendingCandidates = this.collectCandidates(payload, pending)
    const completedCandidates = this.collectCandidates(payload, completed)
    const candidates = [...pendingCandidates, ...completedCandidates]

    if (candidates.length === 0) {
      return { kind: 'zero' }
    }

    if (candidates.length > 1) {
      return {
        kind: 'ambiguous',
        candidateCount: candidates.length,
        requestIds: candidates.map((candidate) => candidate.id),
      }
    }

    const candidate = candidates[0]!
    const now = Date.now()

    if (this.isExpired(candidate, now)) {
      return { kind: 'expired', requestId: candidate.id }
    }

    return {
      kind: 'match',
      match: {
        requestId: candidate.id,
        pending: pending.some((request) => request.id === candidate.id),
      },
    }
  }

  private collectCandidates<
    T extends {
      readonly id: string
      tabId?: number
      frameId?: number
      method: string
      url: string
      statusCode?: number
      startedAtMs?: number
    },
  >(payload: ResponseBodyPayload, requests: readonly T[]): T[] {
    const method = payload.method.toUpperCase()
    return requests.filter((request) => this.matchesRequest(request, payload, method))
  }

  private matchesRequest(
    request: {
      readonly id: string
      tabId?: number
      frameId?: number
      method: string
      url: string
      statusCode?: number
    },
    payload: ResponseBodyPayload,
    method: string
  ): boolean {
    if (payload.tabId !== 0 && request.tabId !== payload.tabId) {
      return false
    }

    if (request.frameId !== payload.frameId) {
      return false
    }

    if (request.method.toUpperCase() !== method) {
      return false
    }

    if (request.url !== payload.url) {
      return false
    }

    if (
      typeof payload.status === 'number' &&
      typeof request.statusCode === 'number' &&
      payload.status !== request.statusCode
    ) {
      return false
    }

    return true
  }

  private isExpired(request: { readonly id: string; startedAtMs?: number }, now: number): boolean {
    if (typeof request.startedAtMs !== 'number') {
      return false
    }

    return now - request.startedAtMs > this.maxAgeMs
  }
}
