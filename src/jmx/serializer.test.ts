import { describe, it, expect } from 'vitest'
import { buildJmx } from './serializer'
import type { CapturedRequest, PlanMeta } from '../models/captured-request'

const meta: PlanMeta = {
  name: 'Test Plan',
  threadGroup: { threads: 1, rampUp: 1, loops: 1 },
}

function samplerCount(jmx: string): number {
  return (jmx.match(/<HTTPSamplerProxy\b/g) ?? []).length
}

function samplerStartIndexes(jmx: string): number[] {
  const indexes: number[] = []
  let searchFrom = 0
  let index = jmx.indexOf('<HTTPSamplerProxy', searchFrom)

  while (index !== -1) {
    indexes.push(index)
    searchFrom = index + 1
    index = jmx.indexOf('<HTTPSamplerProxy', searchFrom)
  }

  return indexes
}

function samplerEndIndex(jmx: string, startIndex: number): number {
  return jmx.indexOf('</HTTPSamplerProxy>', startIndex)
}

function everySamplerHasChildHashTree(jmx: string): boolean {
  const samplerStarts = samplerStartIndexes(jmx)

  return samplerStarts.every((start, index) => {
    const end = samplerEndIndex(jmx, start)
    const nextSampler = samplerStarts[index + 1]
    const childHashTree = jmx.indexOf('<hashTree', end)

    return childHashTree !== -1 && (nextSampler === undefined || childHashTree < nextSampler)
  })
}

describe('buildJmx', () => {
  it('generates valid JMX for GET requests', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://example.com/api/users?id=123',
        headers: { 'content-type': 'application/json' },
        queryParams: { id: '123' },
      },
    ]

    const jmx = buildJmx(meta, requests)

    expect(jmx).toContain('<?xml version="1.0"')
    expect(jmx).toContain('<TestPlan')
    expect(jmx).toContain('ThreadGroup')
    expect(jmx).toContain('HTTPSamplerProxy')
    expect(jmx).toContain('example.com')
    expect(jmx).toContain('/api/users')
    expect(jmx).toContain('GET')
  })

  it('places a child hashTree after each sampler', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://example.com/one',
        headers: {},
        queryParams: {},
      },
      {
        id: '2',
        timestamp: '2024-01-01T00:00:01Z',
        method: 'GET',
        url: 'https://example.com/two',
        headers: {},
        queryParams: {},
      },
    ]

    const jmx = buildJmx(meta, requests)

    expect(samplerCount(jmx)).toBe(2)
    expect(everySamplerHasChildHashTree(jmx)).toBe(true)
  })

  it('does not place sampler elements next to each other', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://example.com/one',
        headers: {},
        queryParams: {},
      },
      {
        id: '2',
        timestamp: '2024-01-01T00:00:01Z',
        method: 'GET',
        url: 'https://example.com/two',
        headers: {},
        queryParams: {},
      },
    ]

    const jmx = buildJmx(meta, requests)

    expect(jmx).not.toMatch(/<\/HTTPSamplerProxy>\s*<HTTPSamplerProxy/)
  })

  it('generates valid JMX for POST requests with body', () => {
    const requests: CapturedRequest[] = [
      {
        id: '2',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'POST',
        url: 'https://example.com/api/users',
        headers: { 'content-type': 'application/json' },
        queryParams: {},
        body: '{"name":"test"}',
      },
    ]

    const jmx = buildJmx(meta, requests)

    expect(jmx).toContain('POST')
    expect(jmx).toContain('<![CDATA[{"name":"test"}]]>')
  })

  it('keeps POST bodies as raw CDATA', () => {
    const requests: CapturedRequest[] = [
      {
        id: '3',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'POST',
        url: 'https://example.com/path',
        headers: {},
        queryParams: {},
        body: '{"value":"<script>alert(1)</script>"}',
      },
    ]

    const jmx = buildJmx(meta, requests)

    expect(jmx).toContain('<![CDATA[{"value":"<script>alert(1)</script>"}]]>')
    expect(jmx).not.toContain('&lt;script&gt;')
  })

  it('uses saved plan name and thread group values', () => {
    const requests: CapturedRequest[] = [
      {
        id: '5',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://example.com/api',
        headers: {},
        queryParams: {},
      },
    ]

    const jmx = buildJmx(
      {
        name: 'Saved Plan',
        threadGroup: { threads: 4, rampUp: 5, loops: 6 },
      },
      requests
    )

    expect(jmx).toContain('testname="Saved Plan"')
    expect(jmx).toContain('<stringProp name="LoopController.loops">6</stringProp>')
    expect(jmx).toContain('<stringProp name="ThreadGroup.num_threads">4</stringProp>')
    expect(jmx).toContain('<stringProp name="ThreadGroup.ramp_time">5</stringProp>')
  })

  it('handles missing optional fields gracefully', () => {
    const requests: CapturedRequest[] = [
      {
        id: '4',
        timestamp: '2024-01-01T00:00:00.000Z',
        method: 'DELETE',
        url: 'https://api.example.com/resource/123',
        headers: {},
        queryParams: {},
      },
    ]

    const jmx = buildJmx(meta, requests)

    expect(jmx).toContain('DELETE')
    expect(jmx).toContain('api.example.com')
  })

  it('percent-encodes CDATA terminator ]]> in run-time bodies', () => {
    const requests: CapturedRequest[] = [
      {
        id: '6',
        timestamp: '2024-01-01T00:00:00.000Z',
        method: 'POST',
        url: 'https://example.com/search',
        headers: {},
        queryParams: {},
        body: 'query=foo]]>bar',
      },
    ]

    const jmx = buildJmx(meta, requests)

    // ]]> must be split so the XML parser does not see a CDATA close.
    expect(jmx).toContain('<![CDATA[query=foo]]]]><![CDATA[>bar]]>')
    expect(jmx).not.toContain('<![CDATA[query=foo]]>bar]]>')
  })

  it('prefers captured responseBody over request body in sampler content', () => {
    const requests: CapturedRequest[] = [
      {
        id: '7',
        timestamp: '2024-01-01T00:00:00.000Z',
        method: 'POST',
        url: 'https://example.com/api',
        headers: {},
        queryParams: {},
        body: 'request-body',
        responseBody: 'response-body',
      },
    ]

    const jmx = buildJmx(meta, requests)

    expect(jmx).toContain('<![CDATA[response-body]]>')
    expect(jmx).not.toContain('<![CDATA[request-body]]>')
  })

  it('handles redacted captured response bodies as [REDACTED]', () => {
    const requests: CapturedRequest[] = [
      {
        id: '8',
        timestamp: '2024-01-01T00:00:00.000Z',
        method: 'GET',
        url: 'https://example.com/api',
        headers: {},
        queryParams: {},
        body: 'original-request',
        responseBody: '[REDACTED]',
        responseBodyRedacted: true,
      },
    ]

    const jmx = buildJmx(meta, requests)

    expect(jmx).toContain('<![CDATA[[REDACTED]]]>')
    expect(jmx).not.toContain('<![CDATA[original-request]]>')
  })

  it('defaults to empty body when no request or response body is present', () => {
    const requests: CapturedRequest[] = [
      {
        id: '9',
        timestamp: '2024-01-01T00:00:00.000Z',
        method: 'GET',
        url: 'https://example.com/api',
        headers: {},
        queryParams: {},
      },
    ]

    const jmx = buildJmx(meta, requests)

    expect(jmx).toContain('<![CDATA[]]>')
  })

  it.each<{ method: string; expected: 'true' | 'false' }>([
    { method: 'POST', expected: 'true' },
    { method: 'PUT', expected: 'true' },
    { method: 'PATCH', expected: 'true' },
    { method: 'DELETE', expected: 'true' },
    { method: 'GET', expected: 'false' },
    { method: 'HEAD', expected: 'false' },
    { method: 'OPTIONS', expected: 'false' },
    { method: 'TRACE', expected: 'false' },
    { method: 'CONNECT', expected: 'false' },
  ])('sets postBodyRaw=$expected for $method', ({ method, expected }) => {
    const requests: CapturedRequest[] = [
      {
        id: `pb-${method}`,
        timestamp: '2024-01-01T00:00:00Z',
        method,
        url: 'https://example.com/api',
        headers: {},
        queryParams: {},
        ...(expected === 'true' ? { body: '{"key":"value"}' } : undefined),
      },
    ]

    const jmx = buildJmx(meta, requests)

    expect(jmx).toContain(`<boolProp name="HTTPSampler.postBodyRaw">${expected}</boolProp>`)
  })

  it('serializes followRedirects=false to HTTPSampler.follow_redirects=false', () => {
    const requests: CapturedRequest[] = [
      {
        id: 'fr-false',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://api.example.com/next?token=abc',
        headers: {},
        queryParams: { token: 'abc' },
        followRedirects: false,
      },
    ]

    const jmx = buildJmx(meta, requests)

    expect(jmx).toContain('<boolProp name="HTTPSampler.follow_redirects">false</boolProp>')
  })

  it('defaults followRedirects to true when not set', () => {
    const requests: CapturedRequest[] = [
      {
        id: 'fr-default',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://api.example.com/old',
        headers: {},
        queryParams: {},
      },
    ]

    const jmx = buildJmx(meta, requests)

    expect(jmx).toContain('<boolProp name="HTTPSampler.follow_redirects">true</boolProp>')
  })

  it('omits CookieManager when no Cookie or Cookie2 headers are present', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://example.com/api',
        headers: { accept: 'application/json' },
        queryParams: {},
      },
    ]

    const jmx = buildJmx(meta, requests)

    expect(jmx).not.toContain('CookieManager')
  })

  it('emits a CookieManager with a single Cookie entry', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://example.com/api',
        headers: { cookie: 'session=abc123' },
        queryParams: {},
      },
    ]

    const jmx = buildJmx(meta, requests)

    expect(jmx).toContain('CookieManager')
    expect(jmx).toContain('session=abc123')
    expect(jmx).toContain('testname="cookie"')
  })

  it('preserves both Cookie and Cookie2 headers separately', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://example.com/api',
        headers: { cookie: 'a=1', cookie2: 'a=1' },
        queryParams: {},
      },
    ]

    const jmx = buildJmx(meta, requests)

    expect(jmx).toContain('CookieManager')
    const matches = jmx.match(/<CookieManager[\s\S]*?<\/CookieManager>/g)
    expect(matches?.length).toBe(1)
    const cookieEntries = (jmx.match(/elementProp name="" elementType="Cookie"/g) ?? []).length
    expect(cookieEntries).toBe(2)
  })

  it('deduplicates identical cookies across requests', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://example.com/1',
        headers: { cookie: 'session=abc' },
        queryParams: {},
      },
      {
        id: '2',
        timestamp: '2024-01-01T00:00:01Z',
        method: 'GET',
        url: 'https://example.com/2',
        headers: { cookie: 'session=abc' },
        queryParams: {},
      },
    ]

    const jmx = buildJmx(meta, requests)

    const cookieEntries = (jmx.match(/elementProp name="" elementType="Cookie"/g) ?? []).length
    expect(cookieEntries).toBe(1)
  })

  it('preserves distinct cookies with different values', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://example.com/1',
        headers: { cookie: 'a=1' },
        queryParams: {},
      },
      {
        id: '2',
        timestamp: '2024-01-01T00:00:01Z',
        method: 'GET',
        url: 'https://example.com/2',
        headers: { cookie: 'a=2' },
        queryParams: {},
      },
    ]

    const jmx = buildJmx(meta, requests)

    const cookieEntries = (jmx.match(/elementProp name="" elementType="Cookie"/g) ?? []).length
    expect(cookieEntries).toBe(2)
  })

  it('emits a ConstantTimer between requests when there is a timestamp gap', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00.000Z',
        method: 'GET',
        url: 'https://example.com/1',
        headers: {},
        queryParams: {},
      },
      {
        id: '2',
        timestamp: '2024-01-01T00:00:01.500Z',
        method: 'GET',
        url: 'https://example.com/2',
        headers: {},
        queryParams: {},
      },
    ]

    const jmx = buildJmx(meta, requests)

    expect(jmx).toContain('ConstantTimer')
    expect(jmx).toContain('<stringProp name="ConstantTimer.delay">1500</stringProp>')
  })

  it('omits the timer when consecutive requests have zero or negative gap', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00.000Z',
        method: 'GET',
        url: 'https://example.com/1',
        headers: {},
        queryParams: {},
      },
      {
        id: '2',
        timestamp: '2024-01-01T00:00:00.000Z',
        method: 'GET',
        url: 'https://example.com/2',
        headers: {},
        queryParams: {},
      },
    ]

    const jmx = buildJmx(meta, requests)

    expect(jmx).not.toContain('ConstantTimer')
  })

  it('does not emit a timer before the first sampler', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:01.000Z',
        method: 'GET',
        url: 'https://example.com/1',
        headers: {},
        queryParams: {},
      },
    ]

    const jmx = buildJmx(meta, requests)

    const timerIndex = jmx.indexOf('ConstantTimer')
    const firstSamplerIndex = jmx.indexOf('<HTTPSamplerProxy')
    expect(timerIndex).toBe(-1)
    expect(firstSamplerIndex).toBeGreaterThan(-1)
  })

  it('omits ResponseAssertion when assertions are disabled', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00.000Z',
        method: 'GET',
        url: 'https://example.com/api',
        headers: {},
        queryParams: {},
      },
    ]

    const jmx = buildJmx(meta, requests, { assertion: { enabled: false, expectStatus: 201 } })

    expect(jmx).not.toContain('ResponseAssertion')
  })

  it('adds a ResponseAssertion for the expected status code when enabled', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00.000Z',
        method: 'GET',
        url: 'https://example.com/api',
        headers: {},
        queryParams: {},
      },
    ]

    const jmx = buildJmx(meta, requests, { assertion: { enabled: true, expectStatus: 201 } })

    expect(jmx).toContain('ResponseAssertion')
    expect(jmx).toContain('<stringProp name="200">201</stringProp>')
  })

  it('emits a UniformRandomTimer when randomization is enabled', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00.000Z',
        method: 'GET',
        url: 'https://example.com/1',
        headers: {},
        queryParams: {},
      },
      {
        id: '2',
        timestamp: '2024-01-01T00:00:02.000Z',
        method: 'GET',
        url: 'https://example.com/2',
        headers: {},
        queryParams: {},
      },
    ]

    const jmx = buildJmx(meta, requests, {
      thinkTime: { enabled: true, randomize: true, rangePercent: 20 },
    })

    expect(jmx).toContain('UniformRandomTimer')
    expect(jmx).toContain('<stringProp name="UniformRandomTimer.delay">1600')
  })
})
