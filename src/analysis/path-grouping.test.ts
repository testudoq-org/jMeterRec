import { describe, expect, it } from 'vitest'
import type { CapturedRequest } from '../models/captured-request'
import type { GroupingRule } from './path-grouping'
import {
  proposeGroups,
  getPathPrefix,
  isStaticResourceUrl,
  STATIC_RESOURCE_EXTENSIONS,
  DEFAULT_GROUPING_RULES,
} from './path-grouping'

function req(
  id: string,
  url: string,
  timestamp: string,
  opts: { type?: string; tabId?: number; frameId?: number } = {}
): CapturedRequest {
  return {
    id,
    timestamp,
    method: 'GET',
    url,
    headers: {},
    queryParams: {},
    ...(opts.type !== undefined ? { type: opts.type } : {}),
    ...(opts.tabId !== undefined ? { tabId: opts.tabId } : {}),
    ...(opts.frameId !== undefined ? { frameId: opts.frameId } : {}),
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
      req('b', 'https://example.com/page1', '2024-01-01T00:00:01.000Z', { type: 'main_frame' }),
      req('c', 'https://example.com/page1', '2024-01-01T00:00:02.000Z'),
    ]

    const groups = proposeGroups(requests)

    expect(groups).toHaveLength(2)
    expect(groups[0]!.memberExchangeIds).toEqual(['a'])
    expect(groups[1]!.memberExchangeIds).toEqual(['b', 'c'])
  })

  it('V4.6: tab-boundary rule starts a new group on tabId change', () => {
    const requests = [
      req('a', 'https://example.com/x', '2024-01-01T00:00:00.000Z', { tabId: 1 }),
      req('b', 'https://example.com/x', '2024-01-01T00:00:01.000Z', { tabId: 2 }),
    ]

    const groups = proposeGroups(requests)

    expect(groups).toHaveLength(2)
    expect(groups[0]!.memberExchangeIds).toEqual(['a'])
    expect(groups[1]!.memberExchangeIds).toEqual(['b'])
  })

  it('tab-boundary rule does not trigger when tabId is unchanged', () => {
    const requests = [
      req('a', 'https://example.com/x', '2024-01-01T00:00:00.000Z', { tabId: 1 }),
      req('b', 'https://example.com/x', '2024-01-01T00:00:01.000Z', { tabId: 1 }),
    ]

    const groups = proposeGroups(requests)

    expect(groups).toHaveLength(1)
  })

  it('V4.7: frame-boundary rule starts a new group on frameId change', () => {
    const requests = [
      req('a', 'https://example.com/x', '2024-01-01T00:00:00.000Z', { frameId: 10 }),
      req('b', 'https://example.com/x', '2024-01-01T00:00:01.000Z', { frameId: 11 }),
    ]

    const groups = proposeGroups(requests)

    expect(groups).toHaveLength(2)
    expect(groups[0]!.memberExchangeIds).toEqual(['a'])
    expect(groups[1]!.memberExchangeIds).toEqual(['b'])
  })

  it('frame-boundary rule does not trigger when frameId is unchanged', () => {
    const requests = [
      req('a', 'https://example.com/x', '2024-01-01T00:00:00.000Z', { frameId: 10 }),
      req('b', 'https://example.com/x', '2024-01-01T00:00:01.000Z', { frameId: 10 }),
    ]

    const groups = proposeGroups(requests)

    expect(groups).toHaveLength(1)
  })

  it('V4.13: tab-boundary and frame-boundary rules skip silently when fields are absent', () => {
    // Neither request carries tabId or frameId — the rules must no-op
    // cleanly and grouping must fall back to the other rules.
    const requests = [
      req('a', 'https://example.com/x', '2024-01-01T00:00:00.000Z'),
      req('b', 'https://example.com/x', '2024-01-01T00:00:01.000Z'),
    ]

    const groups = proposeGroups(requests)

    expect(groups).toHaveLength(1)
  })

  it('V4.13: tab-boundary rule skips when only one side has tabId', () => {
    const requests = [
      req('a', 'https://example.com/x', '2024-01-01T00:00:00.000Z', { tabId: 1 }),
      req('b', 'https://example.com/x', '2024-01-01T00:00:01.000Z'),
    ]

    const groups = proposeGroups(requests)

    expect(groups).toHaveLength(1)
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

  it('V4.12: Phase 1 output byte-identical when new rules are disabled', () => {
    // The three Phase 1 rules, in their original order, must produce the
    // same grouping as the full default set on a recording that carries
    // no tabId/frameId fields.
    const requests = [
      req('a', 'https://example.com/api/users', '2024-01-01T00:00:00.000Z'),
      req('b', 'https://example.com/api/users', '2024-01-01T00:00:06.000Z'),
      req('c', 'https://example.com/auth/login', '2024-01-01T00:00:12.000Z'),
    ]

    const phase1Rules: GroupingRule[] = [
      { name: 'main-frame-navigation', startsNewGroup: (curr) => curr.type === 'main_frame' },
      {
        name: 'timestamp-gap',
        startsNewGroup: (curr, prev) => {
          if (!prev) return false
          const gapMs = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()
          return Number.isFinite(gapMs) && gapMs > 5000
        },
      },
      {
        name: 'path-prefix-change',
        startsNewGroup: (curr, prev) => {
          if (!prev) return false
          return getPathPrefix(curr.url) !== getPathPrefix(prev.url)
        },
      },
    ]

    const withDefaults = proposeGroups(requests)
    const withPhase1 = proposeGroups(requests, phase1Rules)

    expect(withPhase1).toEqual(withDefaults)
  })

  it('DEFAULT_GROUPING_RULES is exported and non-empty', () => {
    expect(DEFAULT_GROUPING_RULES.length).toBeGreaterThan(0)
    expect(DEFAULT_GROUPING_RULES.map((r) => r.name)).toEqual([
      'main-frame-navigation',
      'timestamp-gap',
      'path-prefix-change',
      'tab-boundary',
      'frame-boundary',
    ])
  })
})

describe('isStaticResourceUrl', () => {
  it('returns true for common static asset extensions', () => {
    expect(isStaticResourceUrl('https://example.com/app/main.css')).toBe(true)
    expect(isStaticResourceUrl('https://example.com/app/bundle.js')).toBe(true)
    expect(isStaticResourceUrl('https://example.com/img/logo.png')).toBe(true)
    expect(isStaticResourceUrl('https://example.com/fonts/icon.woff2')).toBe(true)
  })

  it('is case-insensitive on the extension', () => {
    expect(isStaticResourceUrl('https://example.com/app/main.CSS')).toBe(true)
    expect(isStaticResourceUrl('https://example.com/app/Bundle.JS')).toBe(true)
  })

  it('returns false for API and page URLs', () => {
    expect(isStaticResourceUrl('https://example.com/api/users')).toBe(false)
    expect(isStaticResourceUrl('https://example.com/app/dashboard')).toBe(false)
    expect(isStaticResourceUrl('https://example.com/api/users.json')).toBe(false)
  })

  it('returns false for malformed URLs', () => {
    expect(isStaticResourceUrl('not-a-valid-url')).toBe(false)
  })

  it('STATIC_RESOURCE_EXTENSIONS is exported and non-empty', () => {
    expect(STATIC_RESOURCE_EXTENSIONS.size).toBeGreaterThan(0)
    expect(STATIC_RESOURCE_EXTENSIONS.has('.css')).toBe(true)
    expect(STATIC_RESOURCE_EXTENSIONS.has('.js')).toBe(true)
    expect(STATIC_RESOURCE_EXTENSIONS.has('.woff2')).toBe(true)
  })
})

describe('proposeGroups static-resource filter (V4.10)', () => {
  it('V4.10a: default off — identical output to not having the filter', () => {
    const requests = [
      req('page', 'https://example.com/page', '2024-01-01T00:00:00.000Z'),
      req('css', 'https://example.com/app/main.css', '2024-01-01T00:00:01.000Z'),
      req('js', 'https://example.com/app/bundle.js', '2024-01-01T00:00:02.000Z'),
      req('api', 'https://example.com/api/users', '2024-01-01T00:00:03.000Z'),
    ]

    const withoutFilter = proposeGroups(requests)
    const withFilterOff = proposeGroups(requests, undefined, { filterStaticResources: false })

    expect(withFilterOff).toEqual(withoutFilter)
    // All four requests are members — the filter did not drop anything.
    const allIds = withoutFilter.flatMap((g) => g.memberExchangeIds)
    expect(allIds.sort()).toEqual(['api', 'css', 'js', 'page'])
  })

  it('V4.10b: enabled — static assets are dropped from the grouping input', () => {
    const requests = [
      req('page', 'https://example.com/page', '2024-01-01T00:00:00.000Z'),
      req('css', 'https://example.com/app/main.css', '2024-01-01T00:00:01.000Z'),
      req('js', 'https://example.com/app/bundle.js', '2024-01-01T00:00:02.000Z'),
      req('api', 'https://example.com/api/users', '2024-01-01T00:00:03.000Z'),
    ]

    const groups = proposeGroups(requests, undefined, { filterStaticResources: true })

    const allIds = groups.flatMap((g) => g.memberExchangeIds).sort()
    // Static assets dropped; only the page and the API request remain.
    expect(allIds).toEqual(['api', 'page'])
    expect(groups.flatMap((g) => g.memberExchangeIds)).not.toContain('css')
    expect(groups.flatMap((g) => g.memberExchangeIds)).not.toContain('js')
  })

  it('filtering all-static input produces empty groups', () => {
    const requests = [
      req('css', 'https://example.com/app/main.css', '2024-01-01T00:00:00.000Z'),
      req('js', 'https://example.com/app/bundle.js', '2024-01-01T00:00:01.000Z'),
    ]

    const groups = proposeGroups(requests, undefined, { filterStaticResources: true })

    expect(groups).toEqual([])
  })
})
