import type { ActionStep } from './models/captured-request'

export type RecorderStatus = 'idle' | 'recording' | 'paused'

export interface RecorderSnapshot {
  status: RecorderStatus
  recording: boolean
  planName: string
  requestCount: number
  tabId?: number
  startedAt?: string
}

export type BackgroundRequest =
  | { type: 'START_RECORDING'; planName: string; tabId?: number }
  | { type: 'STOP_RECORDING' }
  | { type: 'PAUSE_RECORDING' }
  | { type: 'RESUME_RECORDING' }
  | { type: 'GET_STATE' }
  | { type: 'GET_REQUESTS' }
  | { type: 'CLEAR_REQUESTS' }
  | { type: 'RESET' }
  | { type: 'ADD_ACTION'; action: ActionStep }
  | { type: 'GET_DOMAINS' }
  | { type: 'EXPORT_JMX'; includedDomains: string[] }
  | { type: 'EXPORT_PLAYWRIGHT'; baseUrl?: string; suiteName?: string; testCaseName?: string }
  | { type: 'RESPONSE_BODY_CAPTURED'; payload: ResponseBodyPayload }

export type BackgroundResponse =
  | { success: true; snapshot?: RecorderSnapshot; requests?: unknown[] }
  | { success: true; requestCount: number }
  | { success: true; domains: string[] }
  | { success: true; jmx: string; filename: string }
  | { success: true; playwright: string; filename: string }
  | { success: true; downloadUrl: string }
  | { success: false; error: string }

export type BackgroundBroadcast =
  | { type: 'STATE_CHANGED'; snapshot: RecorderSnapshot }
  | { type: 'REQUEST_CAPTURED'; request: unknown }
  | { type: 'RESPONSE_BODY_CAPTURED'; payload: ResponseBodyPayload }

export interface ResponseBodyPayload {
  requestId: string
  tabId: number
  frameId: number
  url: string
  method: string
  status?: number
  requestHeaders?: Record<string, string>
  responseHeaders?: Record<string, string>
  body?: string
  error?: string
  truncated: boolean
  redacted: boolean
  size: number
  capturedAtMs: number
  contentType?: string
}

export const RESPONSE_BODY_CAPTURED = 'RESPONSE_BODY_CAPTURED' as const

export interface ResponseBodyCapturedMessage {
  type: typeof RESPONSE_BODY_CAPTURED
  payload: ResponseBodyPayload
}
