import { describe, expect, it } from 'vitest'
import type { CapturedRequest } from '../models/captured-request'
import { filterRequestsByDomains, getCapturedRequestDomains } from './domains'

function request(id: string, url: string): CapturedRequest {
  return {
    id,
    timestamp: '2024-01-01T00:00:00.000Z',
    method: 'GET',
    url,
    headers: {},
    queryParams: {},
  }
}

describe('getCapturedRequestDomains', () => {
  it('returns sorted unique domains from captured request URLs', () => {
    const domains = getCapturedRequestDomains([
      request('one', 'https://Example.com/a'),
      request('two', 'http://api.example.com/b'),
      request('three', 'https://www.example.com/c'),
      request('four', 'https://other.test/path'),
    ])

    expect(domains).toEqual(['api.example.com', 'example.com', 'other.test', 'www.example.com'])
  })

  it('ignores invalid URLs', () => {
    const domains = getCapturedRequestDomains([
      request('one', 'https://example.com/ok'),
      request('two', 'not a url'),
    ])

    expect(domains).toEqual(['example.com'])
  })
})

describe('filterRequestsByDomains', () => {
  it('includes exact domain matches and subdomains', () => {
    const requests = [
      request('one', 'https://example.com/one'),
      request('two', 'https://www.example.com/two'),
      request('three', 'https://api.example.com/three'),
      request('four', 'https://badexample.com/four'),
    ]

    const filtered = filterRequestsByDomains(requests, ['example.com'])

    expect(filtered).toEqual([requests[0], requests[1], requests[2]])
  })

  it('excludes requests when no domains are selected', () => {
    const requests = [
      request('one', 'https://example.com/one'),
      request('two', 'https://other.test/two'),
    ]

    expect(filterRequestsByDomains(requests, [])).toEqual([])
  })
})
