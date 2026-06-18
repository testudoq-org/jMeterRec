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
})
