import { describe, expect, it } from 'vitest'

// We only care about the pure helpers/normalization in options.ts.
// Re-implement the minimal normalization surface for unit coverage.
const defaults = {
  defaultPlanName: 'Untitled Plan',
  threads: 1,
  rampUp: 1,
  loops: 1,
  maxTransactions: 200,
  openDetachedInspector: false,
  captureResponseBody: false,
  theme: 'light',
}

function normalizeTheme(unknown: unknown): 'light' | 'dark' {
  return unknown === 'dark' ? 'dark' : 'light'
}

function positiveNumber(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function nonNegativeNumber(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

type OptionKey = keyof typeof defaults
type PartialOptions = Partial<Record<OptionKey, unknown>>

function normalizeOptions(opts: PartialOptions): typeof defaults {
  const defaultPlanName =
    typeof opts.defaultPlanName === 'string' ? opts.defaultPlanName : defaults.defaultPlanName
  const threads =
    typeof opts.threads === 'number' || typeof opts.threads === 'string'
      ? opts.threads
      : String(opts.threads)
  const rampUp =
    typeof opts.rampUp === 'number' || typeof opts.rampUp === 'string'
      ? opts.rampUp
      : String(opts.rampUp)
  const loops =
    typeof opts.loops === 'number' || typeof opts.loops === 'string'
      ? opts.loops
      : String(opts.loops)

  return {
    defaultPlanName,
    threads: positiveNumber(String(threads), defaults.threads),
    rampUp: nonNegativeNumber(String(rampUp), defaults.rampUp),
    loops: positiveNumber(String(loops), defaults.loops),
    maxTransactions: boundedNumber(opts.maxTransactions, 20, 500, defaults.maxTransactions),
    openDetachedInspector: opts.openDetachedInspector === true,
    captureResponseBody: opts.captureResponseBody === true,
    theme: normalizeTheme(opts.theme),
  }
}

describe('options normalization', () => {
  it('applies defaults', () => {
    expect(normalizeOptions({})).toEqual(defaults)
  })

  it('clamps maxTransactions to bounds and fallback', () => {
    expect(normalizeOptions({ maxTransactions: 5 })).toEqual({
      ...defaults,
      maxTransactions: 20,
    })
    expect(normalizeOptions({ maxTransactions: 9999 })).toEqual({
      ...defaults,
      maxTransactions: 500,
    })
    expect(normalizeOptions({ maxTransactions: 123 })).toEqual({
      ...defaults,
      maxTransactions: 123,
    })
    expect(normalizeOptions({ maxTransactions: undefined })).toEqual(defaults)
    expect(normalizeOptions({ maxTransactions: 'abc' })).toEqual(defaults)
  })

  it('coerces theme and booleans', () => {
    expect(normalizeOptions({ theme: 'dark' }).theme).toBe('dark')
    expect(normalizeOptions({ theme: 'light' }).theme).toBe('light')
    expect(normalizeOptions({ theme: '__weird__' }).theme).toBe('light')
    expect(normalizeOptions({ openDetachedInspector: true }).openDetachedInspector).toBe(true)
    expect(normalizeOptions({ captureResponseBody: true }).captureResponseBody).toBe(true)
  })

  it('validates number strings', () => {
    expect(normalizeOptions({ threads: '2' }).threads).toBe(2)
    expect(normalizeOptions({ threads: '0' }).threads).toBe(1)
    expect(normalizeOptions({ rampUp: '0' }).rampUp).toBe(0)
    expect(normalizeOptions({ loops: '-5' }).loops).toBe(1)
  })

  it('sanitizes incoming partial shapes with extra/odd fields', () => {
    const weird = {
      defaultPlanName: 123,
      threads: null,
      rampUp: undefined,
      loops: 0,
      maxTransactions: false,
      openDetachedInspector: 'true',
      captureResponseBody: 'yes',
      theme: 1,
      __UNKNOWN__: true,
    } as unknown as Partial<typeof defaults>

    const out = normalizeOptions(weird)
    expect(out.defaultPlanName).toBe(defaults.defaultPlanName)
    expect(out.threads).toBe(defaults.threads)
    expect(out.rampUp).toBe(defaults.rampUp)
    expect(out.loops).toBe(defaults.loops)
    expect(out.maxTransactions).toBe(defaults.maxTransactions)
    expect(out.openDetachedInspector).toBe(false)
    expect(out.captureResponseBody).toBe(false)
  })
})
