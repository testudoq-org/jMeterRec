import { describe, expect, it } from 'vitest'
import { DEFAULT_JMX_OPTIONS, normalizeJmxOptions, parseExtractors } from './jmx-options'

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
      redirectDedupEnabled: false,
      cacheEnabled: false,
      durationAssertionEnabled: false,
      durationAssertionThresholdMs: 5000,
      extractorsJson: '[]',
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
      redirectDedupEnabled: false,
      cacheEnabled: false,
      durationAssertionEnabled: false,
      durationAssertionThresholdMs: 5000,
      extractorsJson: '[]',
    })
  })

  it('normalizes extractorsJson', () => {
    expect(normalizeJmxOptions({ extractorsJson: '  ' }).extractorsJson).toBe('[]')
    expect(normalizeJmxOptions({ extractorsJson: 'not-json' }).extractorsJson).toBe('[]')
    expect(normalizeJmxOptions({ extractorsJson: '{"a":1}' }).extractorsJson).toBe('[]')
    const arr = '[{"type":"json","refNames":"t","jsonPathExpressions":"$.t"}]'
    expect(normalizeJmxOptions({ extractorsJson: arr }).extractorsJson).toBe(arr)
  })
})

describe('parseExtractors', () => {
  it('returns empty array for empty string', () => {
    expect(parseExtractors('')).toEqual([])
  })

  it('returns empty array for whitespace', () => {
    expect(parseExtractors('   ')).toEqual([])
  })

  it('returns empty array for malformed JSON', () => {
    expect(parseExtractors('not-json')).toEqual([])
  })

  it('returns empty array for non-array JSON', () => {
    expect(parseExtractors('{"a":1}')).toEqual([])
  })

  it('returns empty array for invalid extractor type', () => {
    expect(parseExtractors('[{"type":"invalid","refname":"x"}]')).toEqual([])
  })

  it('returns empty array for missing required fields', () => {
    expect(parseExtractors('[{"type":"json"}]')).toEqual([])
    expect(parseExtractors('[{"type":"json","refNames":"x"}]')).toEqual([])
    expect(parseExtractors('[{"type":"json","jsonPathExpressions":"$.x"}]')).toEqual([])
    expect(parseExtractors('[{"type":"regex"}]')).toEqual([])
    expect(parseExtractors('[{"type":"regex","refname":"x"}]')).toEqual([])
    expect(parseExtractors('[{"type":"regex","regex":"r"}]')).toEqual([])
  })

  it('parses valid JSON extractor', () => {
    const result = parseExtractors(
      '[{"type":"json","refNames":" token ","jsonPathExpressions":"$.token"}]'
    )
    expect(result).toEqual([
      {
        type: 'JSONPostProcessor',
        testClass: 'JSONPostProcessor',
        guiClass: 'JSONPostProcessorGui',
        name: 'JSON Post Processor',
        enabled: true,
        refNames: ' token ',
        jsonPathExpressions: '$.token',
        defaultValues: '',
        matchNumbers: '1',
      },
    ])
  })

  it('parses valid regex extractor', () => {
    const result = parseExtractors(
      '[{"type":"regex","refname":" orderId ","regex":"Order ##(d+)"}]'
    )
    expect(result).toEqual([
      {
        type: 'RegexExtractor',
        testClass: 'RegexExtractor',
        guiClass: 'RegexExtractorGui',
        name: 'Regular Expression Extractor',
        enabled: true,
        refname: ' orderId ',
        regex: 'Order ##(d+)',
        template: '$1$',
        defaultValue: '',
        matchNumber: '1',
      },
    ])
  })

  it('parses multiple extractors', () => {
    const result = parseExtractors(
      '[{"type":"json","refNames":"t","jsonPathExpressions":"$.t"},{"type":"regex","refname":"o","regex":"#(d+)"}]'
    )
    expect(result).toHaveLength(2)
    expect(result[0]?.type).toBe('JSONPostProcessor')
    expect(result[1]?.type).toBe('RegexExtractor')
  })
})
