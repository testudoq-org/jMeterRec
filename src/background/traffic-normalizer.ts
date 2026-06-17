import type { PendingRequest } from '../models/pending-web-request'
import type { CapturedRequest } from '../models/captured-request'
import type { ResponseBodyPayload } from '../messages'

export type { PendingRequest } from '../models/pending-web-request'

export function createPendingRequest(
  details: chrome.webRequest.OnBeforeRequestDetails
): PendingRequest {
  return {
    ...createBaseRequest(details),
    method: details.method,
    body: decodeRequestBody(details.requestBody),
    contentType: undefined,
    startedAtMs: details.timeStamp,
  }
}

export function createCompletedRequest(
  details: chrome.webRequest.OnCompletedDetails
): PendingRequest {
  return {
    ...createBaseRequest(details),
    method: 'GET',
    contentType: undefined,
    statusCode: details.statusCode,
    responseHeaders: headersToRecord(details.responseHeaders),
    completedAt: new Date(details.timeStamp).toISOString(),
    startedAtMs: details.timeStamp,
  }
}

export function createErrorRequest(
  details: chrome.webRequest.OnErrorOccurredDetails
): PendingRequest {
  return {
    ...createBaseRequest(details),
    method: 'GET',
    contentType: undefined,
    error: details.error,
    completedAt: new Date(details.timeStamp).toISOString(),
    startedAtMs: details.timeStamp,
  }
}

export function mergeBeforeSendHeaders(
  pending: PendingRequest,
  details: chrome.webRequest.OnBeforeSendHeadersDetails
): void {
  pending.headers = headersToRecord(details.requestHeaders)
  pending.contentType = findHeaderValue(details.requestHeaders, 'content-type')
}

export function mergeResponseStarted(
  pending: PendingRequest,
  details: chrome.webRequest.OnResponseStartedDetails
): void {
  pending.statusCode = details.statusCode
  pending.responseHeaders = headersToRecord(details.responseHeaders)
}

export function mergeCompleted(
  pending: PendingRequest,
  details: chrome.webRequest.OnCompletedDetails
): void {
  pending.statusCode = details.statusCode
  pending.responseHeaders = headersToRecord(details.responseHeaders)
  pending.completedAt = new Date(details.timeStamp).toISOString()
}

export function markRequestError(
  pending: PendingRequest,
  details: chrome.webRequest.OnErrorOccurredDetails
): void {
  pending.error = details.error
  pending.completedAt = new Date(details.timeStamp).toISOString()
}

export function applyCapturedResponseBody(
  request: PendingRequest | CapturedRequest,
  payload: ResponseBodyPayload
): void {
  if (request.responseBody !== undefined) {
    return
  }

  if (payload.body === undefined && payload.error === undefined) {
    return
  }

  if (payload.redacted) {
    request.responseBody = '[REDACTED]'
    request.responseBodyRedacted = true
    request.responseBodySize = payload.size
    return
  }

  if (payload.error !== undefined && payload.body === undefined) {
    request.responseBody = undefined
    request.responseBodyTruncated = false
    request.responseBodyRedacted = false
    request.responseBodySize = 0
    request.responseBodyCapturedAt = new Date(payload.capturedAtMs).toISOString()
    return
  }

  request.responseBody = payload.body
  request.responseBodyTruncated = payload.truncated
  request.responseBodyRedacted = false
  request.responseBodySize = payload.size
  request.responseBodyCapturedAt = new Date(payload.capturedAtMs).toISOString()
  request.responseBodyContentType = payload.contentType
}

export function isResponseBodyCandidate(request: PendingRequest): boolean {
  const method = request.method.toUpperCase()

  return (
    (method === 'GET' ||
      method === 'POST' ||
      method === 'PUT' ||
      method === 'PATCH' ||
      method === 'DELETE') &&
    typeof request.statusCode === 'number' &&
    request.statusCode >= 200 &&
    request.statusCode < 400 &&
    (!request.responseBodyTruncated || request.responseBody !== undefined)
  )
}

export function createRequestId(tabId: number, requestId: string): string {
  return `${tabId}-${requestId}`
}

export function headersToRecord(headers?: chrome.webRequest.HttpHeader[]): Record<string, string> {
  const record: Record<string, string> = {}

  for (const header of headers ?? []) {
    record[header.name] = header.value ?? decodeHeader(header.binaryValue)
  }

  return record
}

export function findHeaderValue(
  headers: chrome.webRequest.HttpHeader[] | undefined,
  name: string
): string | undefined {
  const wanted = name.toLowerCase()

  for (const header of headers ?? []) {
    if (header.name.toLowerCase() === wanted) {
      return header.value ?? decodeHeader(header.binaryValue)
    }
  }

  return undefined
}

function decodeRequestBody(
  body: chrome.webRequest.OnBeforeRequestDetails['requestBody']
): string | undefined {
  const raw = body?.raw?.[0]

  if (raw?.bytes !== undefined) {
    return decodeBytes(raw.bytes)
  }

  if (raw?.file !== undefined) {
    return raw.file
  }

  return undefined
}

function decodeHeader(value: ArrayBuffer | undefined): string {
  return value === undefined ? '' : decodeBytes(value)
}

function decodeBytes(bytes: ArrayBuffer): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

type BasePendingRequest = Omit<PendingRequest, 'method'>

type BaseRequestDetails = {
  requestId: string
  tabId: number
  timeStamp: number
  url: string
  frameId?: number
  type?: string
  initiator?: string
}

function createBaseRequest(details: BaseRequestDetails): BasePendingRequest {
  const url = parseUrl(details.url)

  return {
    id: createRequestId(details.tabId, details.requestId),
    timestamp: new Date(details.timeStamp).toISOString(),
    url: details.url,
    path: url?.path,
    headers: {},
    queryParams: url?.queryParams ?? {},
    tabId: details.tabId,
    frameId: details.frameId,
    type: details.type,
    initiator: details.initiator,
    startedAtMs: details.timeStamp,
  }
}

function parseUrl(
  rawUrl: string
): { path: string; queryParams: Record<string, string> } | undefined {
  try {
    const url = new URL(rawUrl)
    const queryParams: Record<string, string> = {}

    for (const [key, value] of url.searchParams) {
      queryParams[key] = value
    }

    return {
      path: `${url.pathname}${url.search}`,
      queryParams,
    }
  } catch {
    return undefined
  }
}
