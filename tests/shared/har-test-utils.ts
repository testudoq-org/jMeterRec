/** Shared test utilities for HAR file import tests. */

export interface HarEntry {
  url: string
  method?: string
}

export interface HarLog {
  version: string
  creator: { name: string; version: string }
  entries: HarEntry[]
}

export interface HarDocument {
  log: HarLog
}

export function createMockHarFile(
  content: string,
  filename = 'test.har'
): File {
  return new File([content], filename, { type: 'application/json' })
}

export function createValidHarJson(
  entries: Array<HarEntry> = [
    { url: 'https://example.com/api' },
    { url: 'https://example.com/users' },
  ]
): string {
  return JSON.stringify({
    log: {
      version: '1.2',
      creator: { name: 'DevTools', version: '1.0' },
      entries: entries.map((e) => ({
        startedDateTime: '2026-01-01T00:00:00.000Z',
        time: 100,
        request: {
          method: e.method ?? 'GET',
          url: e.url,
          httpVersion: 'HTTP/1.1',
          headers: [],
          queryString: [],
          headersSize: -1,
          bodySize: 0,
        },
        response: {
          status: 200,
          statusText: 'OK',
          httpVersion: 'HTTP/1.1',
          headers: [],
          cookies: [],
          content: { size: 0, mimeType: 'text/plain' },
          redirectURL: '',
          headersSize: -1,
          bodySize: 0,
        },
        cache: {},
        timings: { send: 0, wait: 100, receive: 0 },
      })),
    },
  })
}

export function parseHarJson(harString: string): HarDocument {
  const parsed = JSON.parse(harString) as HarDocument
  if (!parsed || typeof parsed !== 'object' || !('log' in parsed)) {
    throw new Error('Invalid HAR file: expected object with log property')
  }
  return parsed
}
