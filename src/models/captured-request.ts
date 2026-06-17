/// <reference types="chrome" />

export interface CapturedRequest {
  id: string
  timestamp: string
  method: string
  url: string
  path?: string
  headers: Record<string, string>
  queryParams: Record<string, string>
  body?: string
  contentType?: string
  tabId?: number
  frameId?: number
  type?: string
  initiator?: string
  statusCode?: number
  responseHeaders?: Record<string, string>
  error?: string
  completedAt?: string
  transactionKey?: string
  responseBody?: string
  responseBodyTruncated?: boolean
  responseBodyRedacted?: boolean
  responseBodySize?: number
  responseBodyCapturedAt?: string
  responseBodyContentType?: string
}

export interface ActionStep {
  type: 'action'
  command: string
  target: string
  value?: string
  transactionKey?: string
}

export type HttpStep = CapturedRequest & { stepType?: 'http' }
export type PlaywrightStep = HttpStep | ActionStep

export function isPlaywrightHttpStep(step: PlaywrightStep): step is HttpStep {
  return (step as ActionStep).type !== 'action'
}

export interface PlanMeta {
  name: string
  threadGroup: {
    threads: number
    rampUp: number
    loops: number
  }
}

export interface JmxSampler {
  name: string
  path: string
  method: string
  headers: Record<string, string>
  body?: string
}
