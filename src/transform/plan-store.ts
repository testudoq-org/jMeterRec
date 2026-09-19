import type { ScriptTransformationPlan } from './types'

const PLAN_STORAGE_KEY = 'capyultura:transformation-plan'

/**
 * Storage interface matching the pattern used by JmxOptionsStore.
 * Allows injection for testing (e.g., chrome.storage.local).
 */
export interface PlanStorage {
  get(key: string): Promise<unknown>
  set(items: Record<string, unknown>): Promise<void>
  remove(key: string): Promise<void>
}

/**
 * In-memory plan store for development/testing.
 * Falls back to a simple object when no storage is available.
 */
export class MemoryPlanStore {
  private data: Record<string, unknown> = {}

  async get(key: string): Promise<unknown> {
    return this.data[key]
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.data, items)
  }

  async remove(key: string): Promise<void> {
    delete this.data[key]
  }
}

/**
 * Persist a transformation plan alongside the recording.
 * Uses chrome.storage.local when available, otherwise falls back to memory.
 */
export class PlanStore {
  constructor(private readonly storage: PlanStorage = createDefaultStorage()) {}

  async save(plan: ScriptTransformationPlan): Promise<void> {
    const serialized = JSON.stringify(plan)
    await this.storage.set({ [PLAN_STORAGE_KEY]: serialized })
  }

  async load(): Promise<ScriptTransformationPlan | undefined> {
    const serialized = await this.storage.get(PLAN_STORAGE_KEY)
    if (typeof serialized !== 'string') {
      return undefined
    }

    try {
      const parsed = JSON.parse(serialized) as ScriptTransformationPlan
      if (parsed.version === undefined || parsed.correlations === undefined) {
        return undefined
      }
      // Additive-field fallback: plans serialized without `groups` (pre-Feature-21)
      // load transparently with `groups === []`. No schema version bump.
      if (parsed.groups === undefined) {
        parsed.groups = []
      }
      return parsed
    } catch {
      return undefined
    }
  }

  async clear(): Promise<void> {
    await this.storage.remove(PLAN_STORAGE_KEY)
  }
}

/**
 * Create a default storage adapter.
 * Uses chrome.storage.local in extension runtime; MemoryPlanStore otherwise.
 */
function createDefaultStorage(): PlanStorage {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return {
      get: async (key: string) => {
        const result = await chrome.storage.local.get(key)
        return result[key]
      },
      set: async (items: Record<string, unknown>) => {
        await chrome.storage.local.set(items)
      },
      remove: async (key: string) => {
        await chrome.storage.local.remove(key)
      },
    }
  }
  return new MemoryPlanStore()
}
