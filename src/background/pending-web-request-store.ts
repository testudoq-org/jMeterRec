import type { PendingRequest, PendingWebRequestState } from '../models/pending-web-request'
import {
  DEFAULT_PENDING_REQUEST_MAX_AGE_MS,
  PENDING_WEB_REQUESTS_STORAGE_KEY,
  PENDING_WEB_REQUEST_STATE_VERSION,
  isPendingRequest,
} from '../models/pending-web-request'

export interface PendingWebRequestStorage {
  get(keys: string[]): Promise<Record<string, unknown>>
  set(values: Record<string, unknown>): Promise<void>
}

/**
 * Max age for stale fragments before eviction (5 minutes as per spec 014-L)
 */
export const PENDING_FRAGMENT_MAX_AGE_MS = 5 * 60 * 1000

export class PendingWebRequestStore {
  constructor(
    private readonly storage: PendingWebRequestStorage = chrome.storage.local,
    private readonly setStorage = storage.set.bind(storage)
  ) {}

  async load(now = new Date()): Promise<Record<string, PendingRequest>> {
    const state = await this.storage.get([PENDING_WEB_REQUESTS_STORAGE_KEY])
    const persisted = state[PENDING_WEB_REQUESTS_STORAGE_KEY]

    if (!this.isState(persisted)) {
      return {}
    }

    return this.pruneFragments(persisted.fragments, now)
  }

  async loadFragment(id: string, now = new Date()): Promise<PendingRequest | undefined> {
    const fragments = await this.load(now)
    return fragments[id]
  }

  async upsert(fragment: PendingRequest, now = new Date()): Promise<void> {
    const state = await this.load(now)
    state[fragment.id] = { ...fragment, updatedAt: now.toISOString() }
    await this.save(state, now)
  }

  async remove(id: string, now = new Date()): Promise<void> {
    const state = await this.load(now)
    delete state[id]
    await this.save(state, now)
  }

  async clear(): Promise<void> {
    await this.save({}, new Date())
  }

  async prune(maxAgeMs = DEFAULT_PENDING_REQUEST_MAX_AGE_MS, now = new Date()): Promise<void> {
    const state = await this.load(now)
    const pruned = this.pruneFragments(state, now, maxAgeMs, undefined)
    await this.save(pruned, now)
  }

  /**
   * Evict fragments for closed tabs on load.
   * Pass openTabIds to filter out fragments from closed tabs.
   */
  async loadExcludingClosedTabs(
    openTabIds: number[],
    now = new Date()
  ): Promise<Record<string, PendingRequest>> {
    const state = await this.storage.get([PENDING_WEB_REQUESTS_STORAGE_KEY])
    const persisted = state[PENDING_WEB_REQUESTS_STORAGE_KEY]

    if (!this.isState(persisted)) {
      return {}
    }

    return this.pruneFragments(persisted.fragments, now, PENDING_FRAGMENT_MAX_AGE_MS, openTabIds)
  }

  private async save(fragments: Record<string, PendingRequest>, now = new Date()): Promise<void> {
    const state: PendingWebRequestState = {
      version: PENDING_WEB_REQUEST_STATE_VERSION,
      fragments,
      updatedAt: now.toISOString(),
    }

    await this.setStorage({ [PENDING_WEB_REQUESTS_STORAGE_KEY]: state })
  }

  private isState(value: unknown): value is PendingWebRequestState {
    if (typeof value !== 'object' || value === null) {
      return false
    }

    const record = value as Record<string, unknown>
    if (record.version !== PENDING_WEB_REQUEST_STATE_VERSION) {
      return false
    }

    const fragments = record.fragments
    if (typeof fragments !== 'object' || fragments === null || Array.isArray(fragments)) {
      return false
    }

    return Object.values(fragments).every(isPendingRequest)
  }

  private pruneFragments(
    fragments: Record<string, PendingRequest>,
    now: Date,
    maxAgeMs = PENDING_FRAGMENT_MAX_AGE_MS,
    openTabIds?: number[]
  ): Record<string, PendingRequest> {
    const pruned: Record<string, PendingRequest> = {}
    const nowMs = now.getTime()

    for (const [id, fragment] of Object.entries(fragments)) {
      if (!isPendingRequest(fragment)) {
        continue
      }

      // TTL-based eviction: stale fragments older than maxAgeMs are discarded
      if (nowMs - fragment.startedAtMs > maxAgeMs) {
        continue
      }

      // Tab-mismatch eviction: discard fragments for closed tabs
      if (openTabIds !== undefined && fragment.tabId !== undefined) {
        if (!openTabIds.includes(fragment.tabId)) {
          continue
        }
      }

      pruned[id] = fragment
    }

    return pruned
  }
}
