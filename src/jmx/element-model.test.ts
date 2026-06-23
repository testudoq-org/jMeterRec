import { describe, it, expect } from 'vitest'
import { analyzeRequestDefaults } from './element-model'
import type { CapturedRequest } from '../models/captured-request'

describe('analyzeRequestDefaults', () => {
  it('returns the most frequent host as primary domain', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {},
        queryParams: {},
      },
      {
        id: '2',
        timestamp: '2024-01-01T00:00:01Z',
        method: 'GET',
        url: 'https://api.example.com/posts',
        headers: {},
        queryParams: {},
      },
      {
        id: '3',
        timestamp: '2024-01-01T00:00:02Z',
        method: 'GET',
        url: 'https://other.example.com/items',
        headers: {},
        queryParams: {},
      },
    ]

    const result = analyzeRequestDefaults(requests)

    expect(result.primaryDomain).toBe('api.example.com')
    expect(result.primaryProtocol).toBe('https')
    expect(result.primaryPort).toBe('443')
  })

  it('returns empty strings when all requests are malformed', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'not-a-valid-url',
        headers: {},
        queryParams: {},
      },
    ]

    const result = analyzeRequestDefaults(requests)

    expect(result.primaryDomain).toBe('')
    expect(result.primaryPort).toBe('')
    expect(result.primaryProtocol).toBe('')
  })

  it('returns empty strings for empty request array', () => {
    const result = analyzeRequestDefaults([])

    expect(result.primaryDomain).toBe('')
    expect(result.primaryPort).toBe('')
    expect(result.primaryProtocol).toBe('')
  })

  it('handles mixed ports correctly', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://api.example.com:8443/a',
        headers: {},
        queryParams: {},
      },
      {
        id: '2',
        timestamp: '2024-01-01T00:00:01Z',
        method: 'GET',
        url: 'https://api.example.com:8443/b',
        headers: {},
        queryParams: {},
      },
      {
        id: '3',
        timestamp: '2024-01-01T00:00:02Z',
        method: 'GET',
        url: 'https://api.example.com:443/c',
        headers: {},
        queryParams: {},
      },
    ]

    const result = analyzeRequestDefaults(requests)

    expect(result.primaryDomain).toBe('api.example.com')
    expect(result.primaryPort).toBe('8443')
    expect(result.primaryProtocol).toBe('https')
  })

  it('falls back to default port 443 for https when port is omitted', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {},
        queryParams: {},
      },
    ]

    const result = analyzeRequestDefaults(requests)

    expect(result.primaryPort).toBe('443')
  })

  it('falls back to default port 80 for http when port is omitted', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'http://api.example.com/users',
        headers: {},
        queryParams: {},
      },
    ]

    const result = analyzeRequestDefaults(requests)

    expect(result.primaryPort).toBe('80')
  })

  it('handles mixed protocols by selecting the most frequent', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://api.example.com/a',
        headers: {},
        queryParams: {},
      },
      {
        id: '2',
        timestamp: '2024-01-01T00:00:01Z',
        method: 'GET',
        url: 'https://api.example.com/b',
        headers: {},
        queryParams: {},
      },
      {
        id: '3',
        timestamp: '2024-01-01T00:00:02Z',
        method: 'GET',
        url: 'http://api.example.com/c',
        headers: {},
        queryParams: {},
      },
    ]

    const result = analyzeRequestDefaults(requests)

    expect(result.primaryProtocol).toBe('https')
  })

  it('skips malformed URLs and uses valid ones for defaults', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'not-a-valid-url',
        headers: {},
        queryParams: {},
      },
      {
        id: '2',
        timestamp: '2024-01-01T00:00:01Z',
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {},
        queryParams: {},
      },
    ]

    const result = analyzeRequestDefaults(requests)

    expect(result.primaryDomain).toBe('api.example.com')
    expect(result.primaryProtocol).toBe('https')
    expect(result.primaryPort).toBe('443')
  })
})
