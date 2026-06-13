import type { CapturedRequest } from '../models/captured-request'

export interface PendingRequest extends CapturedRequest {
  startedAtMs: number
}

export function createPendingRequest(
  details: chrome.webRequest.OnBeforeRequestDetails
): PendingRequest {
  const url = parseUrl(details.url)

  return {
    id: createRequestId(details.tabId, details.requestId),
    timestamp: new Date(details.timeStamp).toISOString(),
    method: details.method,
    url: details.url,
    path: url?.path,
    headers: {},
    queryParams: url?.queryParams ?? {},
    body: decodeRequestBody(details.requestBody),
    contentType: undefined,
    tabId: details.tabId,
    frameId: details.frameId,
    type: details.type,
    initiator: details.initiator,
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
