import type { CapturedRequest } from '../models/captured-request'

export interface HARLog {
  version: string
  creator: HARCreator
  entries: HAREntry[]
}

export interface HARCreator {
  name: string
  version: string
}

export interface HAREntry {
  startedDateTime: string
  time: number
  request: HARRequest
  response: HARResponse
  cache: Record<string, never>
  timings: HARTimings
}

export interface HARRequest {
  method: string
  url: string
  httpVersion: string
  headers: HARHeader[]
  queryString: HARQueryParam[]
  postData?: HARPostData
  headersSize: number
  bodySize: number
}

export interface HARResponse {
  status: number
  statusText: string
  httpVersion: string
  headers: HARHeader[]
  cookies: HARCookie[]
  content: HARContent
  redirectURL: string
  headersSize: number
  bodySize: number
}

export interface HARHeader {
  name: string
  value: string
}

export interface HARQueryParam {
  name: string
  value: string
}

export interface HARPostData {
  mimeType: string
  text?: string
}

export interface HARCookie {
  name: string
  value: string
}

export interface HARContent {
  size: number
  compression?: number
  mimeType: string
  text?: string
  encoding?: string
}

export interface HARTimings {
  blocked?: number
  dns?: number
  connect?: number
  send: number
  wait: number
  receive: number
  ssl?: number
}

export interface HAR {
  log: HARLog
}

export function buildHar(requests: CapturedRequest[]): HAR {
  const now = new Date().toISOString()
  const entries: HAREntry[] = requests.map((req) => {
    const query: HARQueryParam[] = Object.entries(req.queryParams).map(([name, value]) => ({
      name,
      value,
    }))
    const body = req.body ?? req.responseBody ?? ''
    const status = req.statusCode ?? 0
    const statusText = status === 0 ? '' : String(status)

    return {
      startedDateTime: req.timestamp ?? now,
      time: 0,
      request: {
        method: req.method,
        url: req.url,
        httpVersion: 'HTTP/1.1',
        headers: Object.entries(req.headers).map(([name, value]) => ({ name, value })),
        queryString: query,
        postData: body
          ? { mimeType: req.contentType ?? 'application/octet-stream', text: body }
          : undefined,
        headersSize: -1,
        bodySize: body.length,
      },
      response: {
        status,
        statusText,
        httpVersion: 'HTTP/1.1',
        headers: Object.entries(req.responseHeaders ?? {}).map(([name, value]) => ({
          name,
          value,
        })),
        cookies: [],
        content: {
          size: body.length,
          mimeType: req.contentType ?? 'application/octet-stream',
          text: body ? body : undefined,
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: body.length,
      },
      cache: {},
      timings: {
        send: 0,
        wait: 0,
        receive: 0,
      },
    }
  })

  return {
    log: {
      version: '1.2',
      creator: { name: 'Capultura', version: '0.1.0' },
      entries,
    },
  }
}
