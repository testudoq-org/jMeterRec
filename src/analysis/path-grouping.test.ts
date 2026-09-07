import { describe, expect, it } from 'vitest'
import type { CapturedRequest } from '../models/captured-request'
import { proposeGroups, getPathPrefix, DEFAULT_GROUPING_RULES } from './path-grouping'

function req(id: string, url: string, timestamp: string, type?: string): CapturedRequest {
  return {
    id,
    timestamp,
    method: 'GET',
    url,
    headers: {},
    queryParams: {},
    ...(type !== undefined ? { type } : {}),
  }
}

describe('getPathPrefix', () => {
  it('returns the first path segment', () => {
    expect(getPathPrefix('https://example.com/api/users')).toBe('api')
    expect(getPathPrefix('https://example.com/api/v1/users')).toBe('api')
  })

  it('returns undefined for malformed URLs', () => {
    expect(getPathPrefix('not-a-valid-url')).toBeUndefined()
  })

  it('returns undefined for root-only paths', () => {
    expect(getPathPrefix('https://example.com/')).toBeUndefined()
    expect(getPathPrefix('https://example.com')).toBeUndefined()
  })
})

describe('proposeGroups', () => {
  it('returns empty groups for empty input', () => {
    expect(proposeGroups([])).toEqual([])
  })

  it('returns a single group for a single request', () => {
    const groups = proposeGroups([req('1', 'https://example.com/a', '2024-01-01T00:00:00.000Z')])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.memberExchangeIds).toEqual(['1'])
  })

  it('V4.1: 3-request login flow with 5s gap produces 2 groups', () => {
    // GET /login, POST /login, GET /dashboard
    // req2->req3 gap is exactly 5000ms (not > 5000), so the boundary is the
    // path-prefix change (login -> dashboard), not the timestamp gap.
    const requests = [
      req('login-get', 'https://example.com/login', '2024-01-01T00:00:00.000Z'),
      req('login-post', 'https://example.com/login', '2024-01-01T00:00:02.000Z'),
      req('dashboard', 'https://example.com/dashboard', '2024-01-01T00:00:07.000Z'),
    ]

    const groups = proposeGroups(requests)

    expect(groups).toHaveLength(2)
    expect(groups[0]!.memberExchangeIds).toEqual(['login-get', 'login-post'])
    expect(groups[1]!.memberExchangeIds).toEqual(['dashboard'])
  })

  it('path-prefix-change rule triggers a new group', () => {
    const requests = [
      req('a', 'https://example.com/api/users', '2024-01-01T00:00:00.000Z'),
      req('b', 'https://example.com/auth/login', '2024-01-01T00:00:01.000Z'),
    ]

    const groups = proposeGroups(requests)

    expect(groups).toHaveLength(2)
    expect(groups[0]!.memberExchangeIds).toEqual(['a'])
    expect(groups[1]!.memberExchangeIds).toEqual(['b'])
  })

  it('timestamp-gap rule: gap <= 5000ms does not trigger', () => {
    const requests = [
      req('a', 'https://example.com/api/users', '2024-01-01T00:00:00.000Z'),
      req('b', 'https://example.com/api/users', '2024-01-01T00:00:04.000Z'),
    ]

    const groups = proposeGroups(requests)

    expect(groups).toHaveLength(1)
  })

  it('timestamp-gap rule: gap > 5000ms triggers', () => {
    const requests = [
      req('a', 'https://example.com/api/users', '2024-01-01T00:00:00.000Z'),
      req('b', 'https://example.com/api/users', '2024-01-01T00:00:06.000Z'),
    ]

    const groups = proposeGroups(requests)

    expect(groups).toHaveLength(2)
  })

  it('main-frame-navigation rule starts a new group', () => {
    const requests = [
      req('a', 'https://example.com/page1', '2024-01-01T00:00:00.000Z'),
      req('b', 'https://example.com/page1', '2024-01-01T00:00:01.000Z', 'main_frame'),
      req('c', 'https://example.com/page1', '2024-01-01T00:00:02.000Z'),
    ]

    const groups = proposeGroups(requests)

    expect(groups).toHaveLength(2)
    expect(groups[0]!.memberExchangeIds).toEqual(['a'])
    expect(groups[1]!.memberExchangeIds).toEqual(['b', 'c'])
  })

  it('custom rules override defaults', () => {
    const requests = [
      req('a', 'https://example.com/x', '2024-01-01T00:00:00.000Z'),
      req('b', 'https://example.com/y', '2024-01-01T00:00:01.000Z'),
    ]

    // Custom rule: every request starts a new group.
    const groups = proposeGroups(requests, [
      {
        name: 'always-new',
        startsNewGroup: () => true,
      },
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0]!.memberExchangeIds).toEqual(['a'])
    expect(groups[1]!.memberExchangeIds).toEqual(['b'])
  })

  it('group names are auto-generated and unique', () => {
    const requests = [
      req('a', 'https://example.com/a', '2024-01-01T00:00:00.000Z'),
      req('b', 'https://example.com/b', '2024-01-01T00:00:06.000Z'),
      req('c', 'https://example.com/c', '2024-01-01T00:00:12.000Z'),
    ]

    const groups = proposeGroups(requests)
    const names = groups.map((g) => g.name)

    expect(names).toEqual(['Navigation 1', 'Navigation 2', 'Navigation 3'])
    expect(new Set(names).size).toBe(names.length)
  })

  it('proposed groups carry advisory metadata', () => {
    const groups = proposeGroups([req('a', 'https://example.com/x', '2024-01-01T00:00:00.000Z')])

    expect(groups[0]!.source).toBe('auto')
    expect(groups[0]!.confidence).toBe(1.0)
    expect(groups[0]!.locked).toBe(false)
    expect(groups[0]!.explanation).toBeTruthy()
  })

  it('DEFAULT_GROUPING_RULES is exported and non-empty', () => {
    expect(DEFAULT_GROUPING_RULES.length).toBeGreaterThan(0)
    expect(DEFAULT_GROUPING_RULES.map((r) => r.name)).toEqual([
      'main-frame-navigation',
      'timestamp-gap',
      'path-prefix-change',
    ])
  })
})
