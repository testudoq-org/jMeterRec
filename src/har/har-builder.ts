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
  /**
   * Capultura extension block carrying request metadata that standard HAR
   * has no field for: `type` (main_frame / sub_frame / ...), `tabId`,
   * `frameId`, and `transactionKey`. Optional and additive — entries
   * produced without it (e.g. external HAR imports) round-trip with the
   * four fields undefined, exactly as before this extension existed.
   */
  capultura?: HARCapultura
}

/**
 * Capultura extension metadata stored on a HAR entry.
 *
 * All fields are optional because the extension is additive: a HAR entry
 * that predates this block or was produced by another tool carries
 * `undefined` for every field, and reconstruction yields a
 * `CapturedRequest` with those fields undefined — identical to current
 * behaviour.
 */
export interface HARCapultura {
  type?: string
  tabId?: number
  frameId?: number
  transactionKey?: string
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
      // Capultura extension: carry type/tabId/frameId/transactionKey through
      // the HAR round-trip. Omitted entirely when none are present, so
      // entries that predate this block round-trip byte-identically.
      ...(hasCapulturaFields(req) ? { capultura: buildCapultura(req) } : {}),
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

/**
 * Whether a request carries any of the four Capultura extension fields.
 * When none are present the entry is emitted without the `capultura` block,
 * so external HAR imports and pre-existing fixtures round-trip
 * byte-identically.
 */
function hasCapulturaFields(req: CapturedRequest): boolean {
  return (
    req.type !== undefined ||
    req.tabId !== undefined ||
    req.frameId !== undefined ||
    req.transactionKey !== undefined
  )
}

function buildCapultura(req: CapturedRequest): HARCapultura {
  const block: HARCapultura = {}
  if (req.type !== undefined) {
    block.type = req.type
  }
  if (req.tabId !== undefined) {
    block.tabId = req.tabId
  }
  if (req.frameId !== undefined) {
    block.frameId = req.frameId
  }
  if (req.transactionKey !== undefined) {
    block.transactionKey = req.transactionKey
  }
  return block
}
