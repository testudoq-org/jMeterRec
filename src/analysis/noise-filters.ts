const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/
const CACHE_BUSTER_PATTERN =
  /^(?:\d{10,13}|[a-f0-9]{32,}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i
const ANALYTICS_ID_PATTERN = /^(?:UA|G[A-Z]{2}|AW|GT|DC)-[A-Z0-9-]+$/i

export function isTimestamp(value: string): boolean {
  return TIMESTAMP_PATTERN.test(value.trim())
}

export function isCacheBuster(value: string): boolean {
  return CACHE_BUSTER_PATTERN.test(value.trim())
}

export function isAnalyticsId(value: string): boolean {
  return ANALYTICS_ID_PATTERN.test(value.trim())
}

export function isHardNoise(value: string, name: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return false
  }

  if (isTimestamp(trimmed)) {
    return true
  }

  if (isCacheBuster(trimmed)) {
    return true
  }

  if (isAnalyticsId(trimmed)) {
    return true
  }

  const lowerName = name.toLowerCase()
  if (lowerName.includes('timestamp') || lowerName.includes('ts') || lowerName.includes('date')) {
    return true
  }

  if (lowerName.includes('cache') || lowerName.includes('buster')) {
    return true
  }

  return false
}
