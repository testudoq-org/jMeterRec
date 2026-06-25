import type { CapturedRequest, PlanMeta } from '../models/captured-request'
import { buildJmx, type JmxSerializerOptions } from '../jmx/serializer'

export interface TrafficModel {
  entries: TrafficEntry[]
  metadata: TrafficMetadata
}

export interface TrafficEntry {
  id: string
  sequence: number
  request: {
    method: string
    url: string
    domain: string
    path: string
    port: number
    protocol: string
    headers: Record<string, string>
    queryString: Record<string, string>
    body?: string
    bodyType?: 'json' | 'form' | 'text' | 'xml' | 'binary'
  }
  response: {
    status: number
    statusText: string
    headers: Record<string, string>
    body?: string
    size: number
  }
  timing: {
    startTime: string
    duration: number
    thinkTime: number
  }
  metadata: {
    isJsonRequest: boolean
    isFormRequest: boolean
    hasAuth: boolean
    authType?: 'basic' | 'bearer' | 'cookie'
  }
}

export interface TrafficMetadata {
  recordedAt: string
  recordedBy: string
  duration: number
  totalRequests: number
  uniqueDomains: string[]
}

export function convertHarToJmx(
  har: HAR,
  meta: PlanMeta,
  serializerOptions?: JmxSerializerOptions
): string {
  validateHar(har)

  const entries: TrafficEntry[] = har.log.entries.map((entry, idx) => {
    const parsed = parseHarUrl(entry.request.url)
    const headers = normalizeHeaders(entry.request.headers)
    const responseHeaders = normalizeHeaders(entry.response.headers)
    const query = normalizeQueryParams(entry.request.queryString)
    const body = entry.request.postData?.text ?? ''
    const responseBody = entry.response.content.text ?? ''
    const bodyType = detectBodyType(
      entry.request.postData?.mimeType ?? entry.response.content.mimeType,
      body
    )
    const domain = parsed?.host ?? entry.request.url
    const path = parsed?.path ?? entry.request.url
    const protocol = parsed?.protocol ?? 'http'
    const port = parsed?.port ?? (protocol === 'https' ? 443 : 80)

    return {
      id: `har-${idx}`,
      sequence: idx,
      request: {
        method: entry.request.method,
        url: entry.request.url,
        domain,
        path,
        port,
        protocol,
        headers,
        queryString: query,
        body: body || undefined,
        bodyType,
      },
      response: {
        status: entry.response.status,
        statusText: entry.response.statusText,
        headers: responseHeaders,
        body: responseBody || undefined,
        size: entry.response.bodySize,
      },
      timing: {
        startTime: entry.startedDateTime,
        duration: entry.time,
        thinkTime: 0,
      },
      metadata: {
        isJsonRequest: bodyType === 'json',
        isFormRequest: bodyType === 'form',
        hasAuth: hasAuthHeader(headers) || hasAuthHeader(responseHeaders),
        authType: detectAuthType(headers),
      },
    }
  })

  const requests: CapturedRequest[] = entries.map((entry) => ({
    id: entry.id,
    timestamp: entry.timing.startTime,
    method: entry.request.method,
    url: entry.request.url,
    path: entry.request.path,
    headers: entry.request.headers,
    queryParams: entry.request.queryString,
    body: entry.request.body,
    contentType: entry.request.bodyType === 'json' ? 'application/json' : undefined,
    statusCode: entry.response.status,
    responseHeaders: entry.response.headers,
    responseBody: entry.response.body,
    responseBodyContentType:
      entry.response.headers['content-type'] ?? entry.response.headers['Content-Type'],
    responseBodySize: entry.response.size,
  }))

  return buildJmx(meta, requests, serializerOptions)
}

export interface HAR {
  log: {
    version: string
    creator: { name: string; version: string }
    entries: HAREntryRaw[]
  }
}

interface HAREntryRaw {
  startedDateTime: string
  time: number
  request: {
    method: string
    url: string
    httpVersion: string
    headers: { name: string; value: string }[]
    queryString: { name: string; value: string }[]
    postData?: { mimeType: string; text?: string }
    headersSize: number
    bodySize: number
  }
  response: {
    status: number
    statusText: string
    httpVersion: string
    headers: { name: string; value: string }[]
    cookies: { name: string; value: string }[]
    content: { size: number; mimeType: string; text?: string }
    redirectURL: string
    headersSize: number
    bodySize: number
  }
  cache: Record<string, never>
  timings: {
    blocked?: number
    dns?: number
    connect?: number
    send: number
    wait: number
    receive: number
    ssl?: number
  }
}

export type HarEntries = HAR['log']['entries']

export function validateHar(har: HAR): void {
  if (!har?.log) {
    throw new Error('Invalid HAR: missing log object')
  }

  if (typeof har.log !== 'object' || har.log === null) {
    throw new Error('Invalid HAR: log must be an object')
  }

  if (har.log.version !== '1.2') {
    throw new Error(`Unsupported HAR version: ${har.log.version}`)
  }

  if (!Array.isArray(har.log.entries)) {
    throw new Error('Invalid HAR: log.entries must be an array')
  }

  if (har.log.entries.length === 0) {
    throw new Error('Invalid HAR: no entries found')
  }

  validateHarEntries(har.log.entries)
}

function validateHarEntries(entries: HarEntries): void {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]

    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`Invalid HAR entry at index ${i}: entry must be an object`)
    }

    if (typeof entry.startedDateTime !== 'string') {
      throw new Error(`Invalid HAR entry at index ${i}: missing startedDateTime`)
    }

    if (typeof entry.request !== 'object' || entry.request === null) {
      throw new Error(`Invalid HAR entry at index ${i}: missing request object`)
    }

    const req = entry.request

    if (typeof req.method !== 'string') {
      throw new Error(`Invalid HAR entry at index ${i}: missing request.method`)
    }

    if (typeof req.url !== 'string') {
      throw new Error(`Invalid HAR entry at index ${i}: missing request.url`)
    }

    if (!Array.isArray(req.headers)) {
      throw new Error(`Invalid HAR entry at index ${i}: request.headers must be an array`)
    }

    if (!Array.isArray(req.queryString)) {
      throw new Error(`Invalid HAR entry at index ${i}: request.queryString must be an array`)
    }

    if (typeof entry.response !== 'object' || entry.response === null) {
      throw new Error(`Invalid HAR entry at index ${i}: missing response object`)
    }

    const res = entry.response

    if (typeof res.status !== 'number') {
      throw new Error(`Invalid HAR entry at index ${i}: missing response.status`)
    }

    if (typeof res.headers !== 'object' || res.headers === null) {
      throw new Error(`Invalid HAR entry at index ${i}: response.headers must be an object`)
    }

    if (!Array.isArray(res.headers)) {
      throw new Error(`Invalid HAR entry at index ${i}: response.headers must be an array`)
    }

    if (typeof res.content !== 'object' || res.content === null) {
      throw new Error(`Invalid HAR entry at index ${i}: missing response.content`)
    }

    if (typeof entry.timings !== 'object' || entry.timings === null) {
      throw new Error(`Invalid HAR entry at index ${i}: missing timings`)
    }
  }
}

// EXTERNAL HAR IMPORT: Extract unique domains from HAR entries for the domain selector UI.
// Invalid URLs during extraction are skipped (they'll be handled during conversion).
export function extractHarDomains(har: HAR): string[] {
  const domains = new Set<string>()

  for (const entry of har.log.entries) {
    try {
      const url = new URL(entry.request.url)
      const hostname = url.hostname.toLowerCase().trim()
      if (hostname.length > 0) {
        domains.add(hostname)
      }
    } catch {
      // Skip invalid URLs during domain extraction
    }
  }

  return [...domains].sort((left, right) => left.localeCompare(right))
}

function parseHarUrl(
  url: string
): { protocol: string; host: string; path: string; port: number } | null {
  try {
    const parsed = new URL(url)
    const protocol = parsed.protocol.replace(':', '')
    const port = parsed.port ? Number(parsed.port) : protocol === 'https' ? 443 : 80

    return {
      protocol,
      host: parsed.host,
      path: parsed.pathname + parsed.search,
      port,
    }
  } catch {
    return null
  }
}

function normalizeHeaders(headers: { name: string; value: string }[]): Record<string, string> {
  const result: Record<string, string> = {}

  for (const header of headers) {
    result[header.name.toLowerCase()] = header.value
  }

  return result
}

function normalizeQueryParams(params: { name: string; value: string }[]): Record<string, string> {
  const result: Record<string, string> = {}

  for (const param of params) {
    result[param.name] = param.value
  }

  return result
}

function detectBodyType(
  mimeType: string,
  body: string
): 'json' | 'form' | 'text' | 'xml' | 'binary' {
  const lowered = mimeType.toLowerCase()

  if (lowered.includes('json') || lowered.includes('javascript')) {
    return 'json'
  }

  if (lowered.includes('form') || lowered.includes('x-www-form-urlencoded')) {
    return 'form'
  }

  if (lowered.includes('xml')) {
    return 'xml'
  }

  if (body.trim().length === 0) {
    return 'text'
  }

  if (lowered.includes('text')) {
    return 'text'
  }

  return 'binary'
}

function hasAuthHeader(headers: Record<string, string>): boolean {
  const lowered = Object.keys(headers).map((k) => k.toLowerCase())

  return (
    lowered.includes('authorization') ||
    lowered.includes('x-api-key') ||
    lowered.includes('x-auth-token')
  )
}

function detectAuthType(
  headers: Record<string, string>
): 'basic' | 'bearer' | 'cookie' | undefined {
  const auth = headers['authorization'] ?? headers['Authorization']

  if (!auth) {
    return undefined
  }

  if (auth.startsWith('Basic ')) {
    return 'basic'
  }

  if (auth.startsWith('Bearer ')) {
    return 'bearer'
  }

  return 'cookie'
}
