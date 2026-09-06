const JMETER_VARIABLE_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/
const INVALID_CHAR_REGEX = /[^a-zA-Z0-9_]/g

export function sanitizeVariableName(name: string): string {
  const trimmed = name.trim()

  if (trimmed.length === 0) {
    return '_'
  }

  let sanitized = trimmed.replace(INVALID_CHAR_REGEX, '_')
  sanitized = sanitized.replace(/_+/g, '_')

  if (/^[0-9]/.test(sanitized)) {
    sanitized = `_${sanitized}`
  }

  if (!JMETER_VARIABLE_NAME_REGEX.test(sanitized)) {
    sanitized = '_'
  }

  return sanitized
}

export function deduplicateVariableName(name: string, used: Set<string>): string {
  const candidate = sanitizeVariableName(name)

  if (!used.has(candidate)) {
    used.add(candidate)
    return candidate
  }

  let suffix = 1
  while (used.has(`${candidate}_${suffix}`)) {
    suffix++
  }

  const deduped = `${candidate}_${suffix}`
  used.add(deduped)
  return deduped
}
