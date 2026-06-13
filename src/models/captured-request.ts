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
