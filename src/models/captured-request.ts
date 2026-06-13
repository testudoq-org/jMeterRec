/// <reference types="chrome" />

export interface CapturedRequest {
  id: string
  timestamp: string
  method: string
  url: string
  headers: Record<string, string>
  queryParams: Record<string, string>
  body?: string | ArrayBuffer
  contentType?: string
  tabId?: number
  frameId?: number
  initiator?: string
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
