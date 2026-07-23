import type { CapturedRequest } from './captured-request'

export const PENDING_WEB_REQUESTS_STORAGE_KEY = 'pendingWebRequests'
export const PENDING_WEB_REQUEST_STATE_VERSION = 1
export const DEFAULT_PENDING_REQUEST_MAX_AGE_MS = 10 * 60 * 1000

export interface PendingRequest extends CapturedRequest {
  startedAtMs: number
  updatedAt?: string
}

export interface PendingWebRequestState {
  version: typeof PENDING_WEB_REQUEST_STATE_VERSION
  fragments: Record<string, PendingRequest>
  updatedAt?: string
}

export function isPendingRequest(value: unknown): value is PendingRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    typeof record.id === 'string' &&
    typeof record.timestamp === 'string' &&
    typeof record.method === 'string' &&
    typeof record.url === 'string' &&
    typeof record.headers === 'object' &&
    record.headers !== null &&
    typeof record.queryParams === 'object' &&
    record.queryParams !== null &&
    typeof record.startedAtMs === 'number'
  )
}

export function isPendingWebRequestState(value: unknown): value is PendingWebRequestState {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = value as Record<string, unknown>
  if (record.version !== PENDING_WEB_REQUEST_STATE_VERSION) {
    return false
  }

  const fragments = record.fragments
  if (typeof fragments !== 'object' || fragments === null || Array.isArray(fragments)) {
    return false
  }

  return Object.values(fragments).every(isPendingRequest)
}
