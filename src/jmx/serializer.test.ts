import { describe, it, expect } from 'vitest'
import { buildJmx } from './serializer'
import type { CapturedRequest, PlanMeta } from '../models/captured-request'

describe('buildJmx', () => {
  const meta: PlanMeta = {
    name: 'Test Plan',
    threadGroup: { threads: 1, rampUp: 1, loops: 1 },
  }

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
    expect(jmx).toContain('<![CDATA[{&quot;name&quot;:&quot;test&quot;}]]>')
  })

  it('escapes XML special characters in body', () => {
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

    expect(jmx).toContain('&lt;')
    expect(jmx).toContain('&gt;')
    expect(jmx).not.toContain('<script>')
    expect(jmx).not.toContain('</script>')
  })

  it('handles missing optional fields gracefully', () => {
    const requests: CapturedRequest[] = [
      {
        id: '4',
        timestamp: '2024-01-01T00:00:00Z',
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
})
