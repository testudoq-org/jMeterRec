export const CURRENT_SCHEMA_VERSION = 1
export const MIN_KNOWN_SCHEMA_VERSION = 1

export interface MigrateResult {
  recording: Record<string, unknown>
  warnings: string[]
}

export function migrateRecording(input: unknown): MigrateResult {
  const warnings: string[] = []
  const recording =
    typeof input === 'object' && input !== null ? { ...(input as Record<string, unknown>) } : {}

  const schemaVersion =
    typeof recording.schemaVersion === 'number' ? recording.schemaVersion : CURRENT_SCHEMA_VERSION

  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    warnings.push(
      `Recording schema version ${schemaVersion} is newer than supported ${CURRENT_SCHEMA_VERSION}; loaded with defaults.`
    )
  }

  recording.schemaVersion = CURRENT_SCHEMA_VERSION

  const requests = recording.requests
  if (Array.isArray(requests)) {
    recording.requests = requests.map((request) => migrateRequest(request))
  }

  return { recording, warnings }
}

function migrateRequest(request: unknown): Record<string, unknown> {
  const record =
    typeof request === 'object' && request !== null
      ? { ...(request as Record<string, unknown>) }
      : {}

  if (typeof record.responseBodyMeta !== 'object' || record.responseBodyMeta === null) {
    if (record.responseBody !== undefined) {
      record.responseBodyMeta = {
        available: 'available',
        size: typeof record.responseBodySize === 'number' ? record.responseBodySize : undefined,
        truncated:
          typeof record.responseBodyTruncated === 'boolean'
            ? record.responseBodyTruncated
            : undefined,
        redacted:
          typeof record.responseBodyRedacted === 'boolean'
            ? record.responseBodyRedacted
            : undefined,
        contentType:
          typeof record.responseBodyContentType === 'string'
            ? record.responseBodyContentType
            : undefined,
      }
    } else {
      record.responseBodyMeta = { available: 'not-requested' }
    }
  }

  if (!Array.isArray(record.captureSources)) {
    record.captureSources = []
  }

  if (!Array.isArray(record.diagnostics)) {
    record.diagnostics = []
  }

  return record
}
