import type { JmxExtractor } from '../jmx/element-model'

export interface JmxOptions {
  name: string
  threads: number
  rampUp: number
  loops: number
  thinkTimeEnabled: boolean
  thinkTimeRandomize: boolean
  thinkTimeRangePercent: number
  assertionsEnabled: boolean
  assertionExpectStatus: number
  redirectDedupEnabled: boolean
  cacheEnabled: boolean
  durationAssertionEnabled: boolean
  durationAssertionThresholdMs: number
  extractorsJson: string
}

export interface JmxOptionsStorage {
  get(keys: string[]): Promise<Record<string, unknown>>
}

export const DEFAULT_JMX_OPTIONS: JmxOptions = {
  name: 'Untitled Plan',
  threads: 1,
  rampUp: 1,
  loops: 1,
  thinkTimeEnabled: false,
  thinkTimeRandomize: false,
  thinkTimeRangePercent: 20,
  assertionsEnabled: false,
  assertionExpectStatus: 200,
  redirectDedupEnabled: false,
  cacheEnabled: false,
  durationAssertionEnabled: false,
  durationAssertionThresholdMs: 5000,
  extractorsJson: '[]',
}

const JMX_OPTION_KEYS = [
  'defaultPlanName',
  'threads',
  'rampUp',
  'loops',
  'thinkTimeEnabled',
  'thinkTimeRandomize',
  'thinkTimeRangePercent',
  'assertionsEnabled',
  'assertionExpectStatus',
  'redirectDedupEnabled',
  'cacheEnabled',
  'durationAssertionEnabled',
  'durationAssertionThresholdMs',
  'extractorsJson',
] as const

export class JmxOptionsStore {
  constructor(private readonly storage: JmxOptionsStorage = chrome.storage.local) {}

  async load(): Promise<JmxOptions> {
    const values = await this.storage.get([...JMX_OPTION_KEYS])
    return normalizeJmxOptions(values)
  }
}

export function normalizeJmxOptions(value: unknown): JmxOptions {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_JMX_OPTIONS }
  }

  const record = value as Record<string, unknown>

  return {
    name: normalizeName(record.defaultPlanName),
    threads: positiveNumber(record.threads, DEFAULT_JMX_OPTIONS.threads),
    rampUp: nonNegativeNumber(record.rampUp, DEFAULT_JMX_OPTIONS.rampUp),
    loops: positiveNumber(record.loops, DEFAULT_JMX_OPTIONS.loops),
    thinkTimeEnabled: parseBoolean(record.thinkTimeEnabled, DEFAULT_JMX_OPTIONS.thinkTimeEnabled),
    thinkTimeRandomize: parseBoolean(
      record.thinkTimeRandomize,
      DEFAULT_JMX_OPTIONS.thinkTimeRandomize
    ),
    thinkTimeRangePercent: positiveNumber(
      record.thinkTimeRangePercent,
      DEFAULT_JMX_OPTIONS.thinkTimeRangePercent
    ),
    assertionsEnabled: parseBoolean(
      record.assertionsEnabled,
      DEFAULT_JMX_OPTIONS.assertionsEnabled
    ),
    assertionExpectStatus: positiveNumber(
      record.assertionExpectStatus,
      DEFAULT_JMX_OPTIONS.assertionExpectStatus
    ),
    redirectDedupEnabled: parseBoolean(
      record.redirectDedupEnabled,
      DEFAULT_JMX_OPTIONS.redirectDedupEnabled
    ),
    cacheEnabled: parseBoolean(record.cacheEnabled, DEFAULT_JMX_OPTIONS.cacheEnabled),
    durationAssertionEnabled: parseBoolean(
      record.durationAssertionEnabled,
      DEFAULT_JMX_OPTIONS.durationAssertionEnabled
    ),
    durationAssertionThresholdMs: positiveNumber(
      record.durationAssertionThresholdMs,
      DEFAULT_JMX_OPTIONS.durationAssertionThresholdMs
    ),
    extractorsJson: normalizeExtractorsJson(record.extractorsJson),
  }
}

export function parseExtractors(extractorsJson: string): JmxExtractor[] {
  if (typeof extractorsJson !== 'string' || extractorsJson.trim().length === 0) {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(extractorsJson)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) {
    return []
  }

  const result: JmxExtractor[] = []
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) {
      return []
    }

    const record = item as Record<string, unknown>
    const type = record.type
    if (type !== 'json' && type !== 'regex') {
      return []
    }

    if (type === 'json') {
      const refNames = record.refNames
      const jsonPathExpressions = record.jsonPathExpressions
      if (typeof refNames !== 'string' || typeof jsonPathExpressions !== 'string') {
        return []
      }
      result.push({
        type: 'json',
        testClass: 'JSONPostProcessor',
        guiClass: 'JSONPostProcessorGui',
        name: 'JSON Post Processor',
        enabled: true,
        refNames,
        jsonPathExpressions,
        defaultValues: typeof record.defaultValues === 'string' ? record.defaultValues : '',
        matchNumbers: typeof record.matchNumbers === 'string' ? record.matchNumbers : '1',
      })
    } else {
      const refname = record.refname
      const regex = record.regex
      if (typeof refname !== 'string' || typeof regex !== 'string') {
        return []
      }
      result.push({
        type: 'regex',
        testClass: 'RegexExtractor',
        guiClass: 'RegexExtractorGui',
        name: 'Regular Expression Extractor',
        enabled: true,
        refname,
        regex,
        template: typeof record.template === 'string' ? record.template : '$1$',
        defaultValue: typeof record.defaultValue === 'string' ? record.defaultValue : '',
        matchNumber: typeof record.matchNumber === 'string' ? record.matchNumber : '1',
      })
    }
  }

  return result
}

function normalizeExtractorsJson(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_JMX_OPTIONS.extractorsJson
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return '[]'
  }
  try {
    const parsed = JSON.parse(trimmed)
    if (!Array.isArray(parsed)) {
      return '[]'
    }
    return JSON.stringify(parsed)
  } catch {
    return '[]'
  }
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeName(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : DEFAULT_JMX_OPTIONS.name
}

function positiveNumber(value: unknown, fallback: number): number {
  return parseNumber(value, fallback, (parsed) => parsed > 0)
}

function nonNegativeNumber(value: unknown, fallback: number): number {
  return parseNumber(value, fallback, (parsed) => parsed >= 0)
}

function parseNumber(
  value: unknown,
  fallback: number,
  predicate: (parsed: number) => boolean
): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN

  return Number.isFinite(parsed) && predicate(parsed) ? parsed : fallback
}
