import type { ResponseBodyPayload } from '../messages'

export interface ResponseBodyStoreOptions {
  readonly maxEntries?: number
  readonly maxAgeMs?: number
}

export interface ResponseBodyStorage {
  get(keys: string[]): Promise<Record<string, unknown>>
  set(values: Record<string, unknown>): Promise<void>
}

export interface RecordedResponseBody {
  readonly payload: ResponseBodyPayload
  readonly insertedAt: number
}

export class ResponseBodyStore {
  private readonly storage: ResponseBodyStorage
  private readonly setter: (values: Record<string, unknown>) => Promise<void>
  private readonly maxEntries: number
  private readonly maxAgeMs: number
  private readonly key = 'responseBodies'
  private cache = new Map<string, RecordedResponseBody>()

  constructor(
    storage: ResponseBodyStorage,
    setter?: (values: Record<string, unknown>) => Promise<void>,
    options?: ResponseBodyStoreOptions
  ) {
    this.storage = storage
    this.setter = setter ?? storage.set.bind(storage)
    this.maxEntries = options?.maxEntries ?? 200
    this.maxAgeMs = options?.maxAgeMs ?? 15 * 60 * 1000
  }

  async store(payload: ResponseBodyPayload): Promise<void> {
    const id = this.createId(payload)
    const now = Date.now()
    const next = new Map(this.cache)
    next.set(id, { payload, insertedAt: now })
    this.trim(next, now)
    this.cache = next
    await this.persist()
  }

  async load(now = Date.now()): Promise<RecordedResponseBody[]> {
    const raw = await this.storage.get([this.key])
    const value = raw[this.key]

    if (!this.isRecord(value)) {
      return []
    }

    const entries: RecordedResponseBody[] = []
    const nowDate = new Date(now)

    for (const entry of Object.values(value)) {
      if (this.isRecordedResponseBody(entry)) {
        if (nowDate.getTime() - entry.insertedAt <= this.maxAgeMs) {
          entries.push(entry)
        }
      }
    }

    return entries
  }

  async clear(): Promise<void> {
    this.cache.clear()
    await this.persist()
  }

  private persist(): Promise<void> {
    const payload: Record<string, RecordedResponseBody> = {}

    for (const [id, entry] of this.cache) {
      payload[id] = entry
    }

    return this.setter({ [this.key]: payload })
  }

  private trim(next: Map<string, RecordedResponseBody>, _now: number): void {
    if (next.size <= this.maxEntries) {
      return
    }

    const sorted = [...next.entries()].sort((a, b) => a[1].insertedAt - b[1].insertedAt)
    const toDelete = sorted.slice(0, sorted.length - this.maxEntries)

    for (const [id] of toDelete) {
      next.delete(id)
    }
  }

  private createId(payload: ResponseBodyPayload): string {
    const source = `${payload.tabId}-${payload.frameId}-${payload.method}-${payload.url}-${payload.status ?? 0}-${payload.capturedAtMs}`
    let hash = 0

    for (let index = 0; index < source.length; index += 1) {
      hash = (hash << 5) - hash + source.charCodeAt(index)
      hash |= 0
    }

    return `response-${Math.abs(hash)}`
  }

  private isRecord(value: unknown): value is Record<string, RecordedResponseBody> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false
    }

    return Object.values(value).every((entry: unknown) => this.isRecordedResponseBody(entry))
  }

  private isRecordedResponseBody(value: unknown): value is RecordedResponseBody {
    if (typeof value !== 'object' || value === null) {
      return false
    }

    const record = value as Record<string, unknown>
    return this.isResponseBodyPayload(record.payload) && typeof record.insertedAt === 'number'
  }

  private isResponseBodyPayload(value: unknown): value is ResponseBodyPayload {
    if (typeof value !== 'object' || value === null) {
      return false
    }

    const record = value as Record<string, unknown>
    return (
      typeof record.requestId === 'string' &&
      typeof record.tabId === 'number' &&
      typeof record.frameId === 'number' &&
      typeof record.url === 'string' &&
      typeof record.method === 'string' &&
      typeof record.truncated === 'boolean' &&
      typeof record.redacted === 'boolean' &&
      typeof record.size === 'number' &&
      typeof record.capturedAtMs === 'number'
    )
  }
}
