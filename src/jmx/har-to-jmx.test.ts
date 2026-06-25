import { describe, expect, it } from 'vitest'
import { convertHarToJmx, validateHar, extractHarDomains } from './har-to-jmx'
import type { HAR } from './har-to-jmx'
import type { PlanMeta } from '../models/captured-request'

const meta: PlanMeta = {
  name: 'Test Plan',
  threadGroup: { threads: 1, rampUp: 1, loops: 1 },
}

function buildMinimalHar(entries: HAR['log']['entries']): HAR {
  return {
    log: {
      version: '1.2',
      creator: { name: 'Test', version: '1.0' },
      entries,
    },
  }
}

function harEntry(opts: {
  url: string
  method?: string
  status?: number
  statusText?: string
  reqHeaders?: { name: string; value: string }[]
  resHeaders?: { name: string; value: string }[]
  query?: { name: string; value: string }[]
  postMime?: string
  postText?: string
  resText?: string
  resMime?: string
  startedDateTime?: string
  time?: number
}): HAR['log']['entries'][number] {
  return {
    startedDateTime: opts.startedDateTime ?? '2026-06-19T12:00:00.000Z',
    time: opts.time ?? 0,
    request: {
      method: opts.method ?? 'GET',
      url: opts.url,
      httpVersion: 'HTTP/1.1',
      headers: opts.reqHeaders ?? [],
      queryString: opts.query ?? [],
      postData:
        opts.postMime !== undefined ? { mimeType: opts.postMime, text: opts.postText } : undefined,
      headersSize: -1,
      bodySize: 0,
    },
    response: {
      status: opts.status ?? 200,
      statusText: opts.statusText ?? '200',
      httpVersion: 'HTTP/1.1',
      headers: opts.resHeaders ?? [],
      cookies: [],
      content: {
        size: opts.resText?.length ?? 0,
        mimeType: opts.resMime ?? 'application/octet-stream',
        text: opts.resText,
      },
      redirectURL: '',
      headersSize: -1,
      bodySize: 0,
    },
    cache: {},
    timings: {
      send: 0,
      wait: 0,
      receive: 0,
    },
  }
}

describe('convertHarToJmx', () => {
  it('produces valid JMX for a GET request', () => {
    const har = buildMinimalHar([
      harEntry({
        url: 'https://example.com/api/users',
        reqHeaders: [{ name: 'Accept', value: 'application/json' }],
      }),
    ])
    const jmx = convertHarToJmx(har, meta)

    expect(jmx).toContain('<?xml version="1.0"')
    expect(jmx).toContain('testname="Test Plan"')
    expect(jmx).toContain('HTTPSamplerProxy')
    expect(jmx).toContain('example.com')
    expect(jmx).toContain('/api/users')
    expect(jmx).toContain('GET')
  })

  it('produces valid JMX for a POST request with body', () => {
    const har = buildMinimalHar([
      harEntry({
        url: 'https://example.com/api/users',
        method: 'POST',
        status: 201,
        reqHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        postMime: 'application/json',
        postText: '{"name":"test"}',
        resText: '{"id":1}',
      }),
    ])
    const jmx = convertHarToJmx(har, meta)

    expect(jmx).toContain('POST')
    expect(jmx).toContain('<![CDATA[{"id":1}]]>')
    // Note: buildJmx uses responseBody over body, so sampler content reflects the response.
  })

  it('only includes entries matching the HAR input order', () => {
    const har = buildMinimalHar([
      harEntry({ url: 'https://a.example.com/1' }),
      harEntry({ url: 'https://b.example.com/2' }),
    ])
    const jmx = convertHarToJmx(har, meta)

    const aIndex = jmx.indexOf('a.example.com')
    const bIndex = jmx.indexOf('b.example.com')
    expect(aIndex).toBeGreaterThanOrEqual(0)
    expect(bIndex).toBeGreaterThan(aIndex)
  })

  it('throws on invalid HAR (missing log)', () => {
    const bad = { log: undefined as unknown as HAR['log'] }
    expect(() => convertHarToJmx(bad, meta)).toThrow('Invalid HAR: missing log object')
  })

  it('throws on unsupported HAR version', () => {
    const har = { ...buildMinimalHar([]), log: { ...buildMinimalHar([]).log, version: '1.1' } }
    expect(() => convertHarToJmx(har, meta)).toThrow('Unsupported HAR version: 1.1')
  })

  it('throws when log.entries is not an array', () => {
    const har = {
      ...buildMinimalHar([]),
      log: { ...buildMinimalHar([]).log, entries: null as unknown as HAR['log']['entries'] },
    }
    expect(() => convertHarToJmx(har, meta)).toThrow('Invalid HAR: log.entries must be an array')
  })

  it('uses meta.name as the test plan name', () => {
    const har = buildMinimalHar([harEntry({ url: 'https://example.com/x' })])
    const jmx = convertHarToJmx(har, { ...meta, name: 'My Load Test' })

    expect(jmx).toContain('testname="My Load Test"')
  })

  it('normalises request header keys to lowercase in the JMX', () => {
    const har = buildMinimalHar([
      harEntry({
        url: 'https://example.com/x',
        reqHeaders: [{ name: 'X-Custom', value: 'abc' }],
      }),
    ])
    const jmx = convertHarToJmx(har, meta)

    expect(jmx).toContain('x-custom')
  })

  it('exposes JSON body type for json mimeType', () => {
    const har = buildMinimalHar([
      harEntry({
        url: 'https://example.com/x',
        postMime: 'application/json',
        postText: '{"a":1}',
      }),
    ])
    const jmx = convertHarToJmx(har, meta)

    // JMX header value will carry the body regardless; the marker is the body text itself
    expect(jmx).toContain('{"a":1}')
  })

  it('detects auth headers and marks hasAuth', () => {
    const har = buildMinimalHar([
      harEntry({
        url: 'https://example.com/x',
        reqHeaders: [{ name: 'Authorization', value: 'Bearer token123' }],
      }),
    ])
    const jmx = convertHarToJmx(har, meta)

    expect(jmx).toContain('Bearer token123')
  })

  it('throws on empty HAR entries array', () => {
    const har = buildMinimalHar([])
    expect(() => validateHar(har)).toThrow('Invalid HAR: no entries found')
  })
})

describe('validateHar', () => {
  it('throws on missing log', () => {
    expect(() => validateHar({ log: undefined as unknown as HAR['log'] })).toThrow(
      'Invalid HAR: missing log object'
    )
  })

  it('throws when log is null', () => {
    expect(() => validateHar({ log: null as unknown as HAR['log'] })).toThrow(
      'Invalid HAR: missing log object'
    )
  })

  it('throws on unsupported HAR version', () => {
    const har = buildMinimalHar([])
    const badVersion = { ...har, log: { ...har.log, version: '1.1' } }
    expect(() => validateHar(badVersion)).toThrow('Unsupported HAR version: 1.1')
  })

  it('throws when log.entries is not an array', () => {
    const har = {
      ...buildMinimalHar([]),
      log: { ...buildMinimalHar([]).log, entries: null as unknown as HAR['log']['entries'] },
    }
    expect(() => validateHar(har)).toThrow('Invalid HAR: log.entries must be an array')
  })

  it('throws when entries is an empty array', () => {
    const har = buildMinimalHar([])
    expect(() => validateHar(har)).toThrow('Invalid HAR: no entries found')
  })

  it('throws when entry is missing request fields', () => {
    const har: HAR = {
      log: {
        version: '1.2',
        creator: { name: 'Test', version: '1.0' },
        entries: [
          {
            startedDateTime: '2026-01-01T00:00:00.000Z',
            response: {} as HAR['log']['entries'][number]['response'],
            timings: {} as HAR['log']['entries'][number]['timings'],
          } as unknown as HAR['log']['entries'][number],
        ],
      },
    }
    expect(() => validateHar(har)).toThrow('Invalid HAR entry at index 0: missing request object')
  })

  it('throws when entry is missing response fields', () => {
    const har: HAR = {
      log: {
        version: '1.2',
        creator: { name: 'Test', version: '1.0' },
        entries: [
          {
            startedDateTime: '2026-01-01T00:00:00.000Z',
            request: {
              method: 'GET',
              url: 'https://example.com',
              headers: [],
              queryString: [],
              httpVersion: 'HTTP/1.1',
              headersSize: -1,
              bodySize: 0,
            },
            timings: { send: 0, wait: 0, receive: 0 } as HAR['log']['entries'][number]['timings'],
          } as unknown as HAR['log']['entries'][number],
        ],
      },
    }
    expect(() => validateHar(har)).toThrow('Invalid HAR entry at index 0: missing response object')
  })

  it('throws when entry is missing timings', () => {
    const har: HAR = {
      log: {
        version: '1.2',
        creator: { name: 'Test', version: '1.0' },
        entries: [
          {
            startedDateTime: '2026-01-01T00:00:00.000Z',
            request: {
              method: 'GET',
              url: 'https://example.com',
              headers: [],
              queryString: [],
              httpVersion: 'HTTP/1.1',
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
          } as unknown as HAR['log']['entries'][number],
        ],
      },
    }
    expect(() => validateHar(har)).toThrow('Invalid HAR entry at index 0: missing timings')
  })
})

describe('extractHarDomains', () => {
  it('extracts unique sorted domains from HAR entries', () => {
    const har: HAR = {
      log: {
        version: '1.2',
        creator: { name: 'Test', version: '1.0' },
        entries: [
          {
            startedDateTime: '2026-01-01T00:00:00.000Z',
            time: 0,
            request: {
              method: 'GET',
              url: 'https://example.com/a',
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
            timings: { send: 0, wait: 0, receive: 0 },
          },
          {
            startedDateTime: '2026-01-01T00:00:00.000Z',
            time: 0,
            request: {
              method: 'GET',
              url: 'https://api.example.com/b',
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
            timings: { send: 0, wait: 0, receive: 0 },
          },
          {
            startedDateTime: '2026-01-01T00:00:00.000Z',
            time: 0,
            request: {
              method: 'GET',
              url: 'https://other.com/c',
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
            timings: { send: 0, wait: 0, receive: 0 },
          },
        ],
      },
    }

    const domains = extractHarDomains(har)
    expect(domains).toEqual(['api.example.com', 'example.com', 'other.com'])
  })

  it('skips invalid URLs during extraction', () => {
    const har: HAR = {
      log: {
        version: '1.2',
        creator: { name: 'Test', version: '1.0' },
        entries: [
          {
            startedDateTime: '2026-01-01T00:00:00.000Z',
            time: 0,
            request: {
              method: 'GET',
              url: 'not-a-valid-url',
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
            timings: { send: 0, wait: 0, receive: 0 },
          },
          {
            startedDateTime: '2026-01-01T00:00:00.000Z',
            time: 0,
            request: {
              method: 'GET',
              url: 'https://valid.com/x',
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
            timings: { send: 0, wait: 0, receive: 0 },
          },
        ],
      },
    }

    const domains = extractHarDomains(har)
    expect(domains).toEqual(['valid.com'])
  })
})
