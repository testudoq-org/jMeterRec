import { describe, expect, it } from 'vitest'
import { DEFAULT_JMX_OPTIONS, normalizeJmxOptions } from './jmx-options'

describe('normalizeJmxOptions', () => {
  it('applies defaults', () => {
    expect(normalizeJmxOptions({})).toEqual(DEFAULT_JMX_OPTIONS)
    expect(normalizeJmxOptions(null)).toEqual(DEFAULT_JMX_OPTIONS)
  })

  it('normalizes saved recorder options', () => {
    expect(
      normalizeJmxOptions({
        defaultPlanName: '  Load Test  ',
        threads: '4',
        rampUp: '0',
        loops: '6',
      })
    ).toEqual({
      name: 'Load Test',
      threads: 4,
      rampUp: 0,
      loops: 6,
      thinkTimeEnabled: false,
      thinkTimeRandomize: false,
      thinkTimeRangePercent: 20,
      assertionsEnabled: false,
      assertionExpectStatus: 200,
    })
  })

  it('falls back for invalid values', () => {
    expect(
      normalizeJmxOptions({
        defaultPlanName: 123,
        threads: 0,
        rampUp: -1,
        loops: 'abc',
      })
    ).toEqual({
      name: DEFAULT_JMX_OPTIONS.name,
      threads: DEFAULT_JMX_OPTIONS.threads,
      rampUp: DEFAULT_JMX_OPTIONS.rampUp,
      loops: DEFAULT_JMX_OPTIONS.loops,
      thinkTimeEnabled: false,
      thinkTimeRandomize: false,
      thinkTimeRangePercent: 20,
      assertionsEnabled: false,
      assertionExpectStatus: 200,
    })
  })
})
