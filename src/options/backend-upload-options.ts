export interface BackendUploadConfig {
  enabled: boolean
  converterUrl: string
  authToken: string
  timeoutMs: number
  includeDomains: string[]
  exportFilename: string
}

export interface BackendUploadStorage {
  get(keys: string[]): Promise<Record<string, unknown>>
  set(values: Record<string, unknown>): Promise<void>
}

export const DEFAULT_BACKEND_UPLOAD_CONFIG: BackendUploadConfig = {
  enabled: false,
  converterUrl: '',
  authToken: '',
  timeoutMs: 60000,
  includeDomains: [],
  exportFilename: '',
}

export const BACKEND_UPLOAD_KEY = 'backendUpload'
export const LEGACY_SERVER_JMX_KEY = 'serverJMX'

export class BackendUploadStore {
  constructor(private readonly storage: BackendUploadStorage = chrome.storage.local) {}

  async load(): Promise<BackendUploadConfig> {
    const raw = await this.storage.get([BACKEND_UPLOAD_KEY, LEGACY_SERVER_JMX_KEY])
    const migrated = await this.migrateLegacyKey(raw as Record<string, unknown>)
    const value = (migrated as Record<string, unknown>)[BACKEND_UPLOAD_KEY] ?? {}
    return normalizeBackendUploadConfig(value)
  }

  async save(config: BackendUploadConfig): Promise<void> {
    const normalized = {
      enabled: config.enabled,
      converterUrl: config.converterUrl.trim(),
      authToken: config.authToken,
      timeoutMs: clampTimeout(config.timeoutMs),
      includeDomains: config.includeDomains,
      exportFilename: config.exportFilename.trim(),
    }

    await this.storage.set({ [BACKEND_UPLOAD_KEY]: normalized })
  }

  private async migrateLegacyKey(raw: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (LEGACY_SERVER_JMX_KEY in raw && raw[LEGACY_SERVER_JMX_KEY] !== undefined) {
      const legacyValue = String(raw[LEGACY_SERVER_JMX_KEY] ?? '').trim()
      const result = { ...raw }

      if (legacyValue.length > 0 && result[BACKEND_UPLOAD_KEY] === undefined) {
        result[BACKEND_UPLOAD_KEY] = {
          ...(result[BACKEND_UPLOAD_KEY] ?? {}),
          converterUrl: legacyValue,
        }
      }

      delete result[LEGACY_SERVER_JMX_KEY]
      await this.storage.set(result)
      return result
    }

    return raw
  }
}

export function normalizeBackendUploadConfig(value: unknown): BackendUploadConfig {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_BACKEND_UPLOAD_CONFIG }
  }

  const record = value as Record<string, unknown>
  const timeoutMs =
    typeof record.timeoutMs === 'number'
      ? record.timeoutMs
      : DEFAULT_BACKEND_UPLOAD_CONFIG.timeoutMs

  return {
    enabled: record.enabled === true,
    converterUrl:
      typeof record.converterUrl === 'string'
        ? record.converterUrl.trim()
        : DEFAULT_BACKEND_UPLOAD_CONFIG.converterUrl,
    authToken:
      typeof record.authToken === 'string'
        ? record.authToken
        : DEFAULT_BACKEND_UPLOAD_CONFIG.authToken,
    timeoutMs: clampTimeout(timeoutMs),
    includeDomains: Array.isArray(record.includeDomains)
      ? record.includeDomains.filter((item): item is string => typeof item === 'string')
      : DEFAULT_BACKEND_UPLOAD_CONFIG.includeDomains,
    exportFilename:
      typeof record.exportFilename === 'string'
        ? record.exportFilename.trim()
        : DEFAULT_BACKEND_UPLOAD_CONFIG.exportFilename,
  }
}

export function isValidUrl(value: string): boolean {
  if (value.trim().length === 0) {
    return false
  }

  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function clampTimeout(value: number): number {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    return DEFAULT_BACKEND_UPLOAD_CONFIG.timeoutMs
  }

  return Math.min(300000, Math.max(5000, Math.trunc(parsed)))
}
