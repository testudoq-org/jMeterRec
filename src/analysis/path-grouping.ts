import type { CapturedRequest } from '../models/captured-request'
import type { ProposedGroup } from './types'

/**
 * A single grouping rule. Each rule inspects an adjacent request pair
 * and decides whether a new group boundary should start between them.
 *
 * Rules are evaluated in order; the first rule that fires starts a new
 * group. This makes the rule set table-driven and easy to extend.
 */
export interface GroupingRule {
  name: string
  startsNewGroup: (curr: CapturedRequest, prev: CapturedRequest | undefined) => boolean
}

/**
 * Default rule set used by `proposeGroups` when no custom rules are supplied.
 *
 * Order matters: `main-frame-navigation` runs first so that a top-level
 * page load always begins a fresh group regardless of timestamp or path.
 */
export const DEFAULT_GROUPING_RULES: GroupingRule[] = [
  {
    name: 'main-frame-navigation',
    startsNewGroup: (curr) => curr.type === 'main_frame',
  },
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
      const currPath = getPathPrefix(curr.url)
      const prevPath = getPathPrefix(prev.url)
      return currPath !== prevPath
    },
  },
  {
    name: 'tab-boundary',
    // Skips cleanly when tabId is absent on either side (HAR-reconstructed
    // requests, or recordings that never captured it) — see V4.13.
    startsNewGroup: (curr, prev) => {
      if (!prev) return false
      if (curr.tabId === undefined || prev.tabId === undefined) return false
      return curr.tabId !== prev.tabId
    },
  },
  {
    name: 'frame-boundary',
    // Skips cleanly when frameId is absent on either side — see V4.13.
    startsNewGroup: (curr, prev) => {
      if (!prev) return false
      if (curr.frameId === undefined || prev.frameId === undefined) return false
      return curr.frameId !== prev.frameId
    },
  },
]

/**
 * Extracts the first path segment from a URL (e.g. "api" from "/api/users").
 * Returns `undefined` when the URL is malformed or has no path.
 */
export function getPathPrefix(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    const segments = parsed.pathname.split('/').filter(Boolean)
    return segments[0]
  } catch {
    return undefined
  }
}

/**
 * File extensions treated as static resources for grouping purposes.
 *
 * Used by the opt-in static-resource filter (`filterStaticResources` on
 * `proposeGroups`). A request whose URL pathname ends in one of these
 * extensions is dropped from the grouping input before scanning.
 *
 * This is a blunt proxy — see the Phase 2 spec §4 risks. It exists so a
 * user can opt into trimming asset noise from generated groups; it is
 * **off by default** because filtering is lossy (a JS bundle can embed a
 * CSRF token or dynamic config object that a later API call consumes).
 */
export const STATIC_RESOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.css',
  '.js',
  '.mjs',
  '.cjs',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.map',
  '.mp4',
  '.webm',
  '.mp3',
  '.wav',
  '.pdf',
  '.zip',
  '.gz',
])

/**
 * Returns true when the URL pathname ends in a known static-resource
 * extension. Case-insensitive on the extension; the rest of the path is
 * matched literally.
 */
export function isStaticResourceUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const lowerPath = parsed.pathname.toLowerCase()
    for (const ext of STATIC_RESOURCE_EXTENSIONS) {
      if (lowerPath.endsWith(ext)) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

/**
 * Propose groups of exchanges using a sequential scan with table-driven rules.
 *
 * A new group starts whenever any rule fires between the current request
 * and its predecessor. The first request always starts group 1.
 *
 * Group names are auto-generated as "Navigation 1", "Navigation 2", etc.
 * so they are unique within a single proposal run.
 *
 * @param requests - Captured requests in recording order.
 * @param rules - Grouping rules; defaults to `DEFAULT_GROUPING_RULES`.
 * @param options - Optional behaviour. `filterStaticResources` opts into
 *   dropping static assets from the grouping input before scanning.
 * @returns Proposed groups, possibly empty when `requests` is empty.
 */
export function proposeGroups(
  requests: readonly CapturedRequest[],
  rules: GroupingRule[] = DEFAULT_GROUPING_RULES,
  options: { filterStaticResources?: boolean } = {}
): ProposedGroup[] {
  if (requests.length === 0) {
    return []
  }

  const filtered: CapturedRequest[] = options.filterStaticResources
    ? requests.filter((req) => !isStaticResourceUrl(req.url))
    : Array.from(requests)

  if (filtered.length === 0) {
    return []
  }

  const groups: ProposedGroup[] = []
  let current: ProposedGroup | undefined
  let navigationCounter = 0

  for (let i = 0; i < filtered.length; i++) {
    const req = filtered[i]
    if (req === undefined) {
      continue
    }

    const prev = i > 0 ? filtered[i - 1] : undefined
    const boundary = current === undefined || rules.some((rule) => rule.startsNewGroup(req, prev))

    if (boundary) {
      navigationCounter += 1
      current = {
        id: `group-${navigationCounter}`,
        name: `Navigation ${navigationCounter}`,
        memberExchangeIds: [],
        source: 'auto',
        confidence: 1.0,
        locked: false,
        explanation: 'Auto-proposed by path-grouping heuristics',
      }
      groups.push(current)
    }

    current!.memberExchangeIds.push(req.id)
  }

  return groups
}
