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
}

const JMX_OPTION_KEYS = ['defaultPlanName', 'threads', 'rampUp', 'loops', 'thinkTimeEnabled', 'thinkTimeRandomize', 'thinkTimeRangePercent', 'assertionsEnabled', 'assertionExpectStatus'] as const

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
    thinkTimeRandomize: parseBoolean(record.thinkTimeRandomize, DEFAULT_JMX_OPTIONS.thinkTimeRandomize),
    thinkTimeRangePercent: positiveNumber(record.thinkTimeRangePercent, DEFAULT_JMX_OPTIONS.thinkTimeRangePercent),
    assertionsEnabled: parseBoolean(record.assertionsEnabled, DEFAULT_JMX_OPTIONS.assertionsEnabled),
    assertionExpectStatus: positiveNumber(record.assertionExpectStatus, DEFAULT_JMX_OPTIONS.assertionExpectStatus),
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
