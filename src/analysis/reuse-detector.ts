import type { CapturedRequest, AnalysisOptions, RawFind, ReuseMap, ReuseEntry } from './types'

function normalizeValue(value: string): string {
  return value.trim().toLowerCase()
}

function isSameTab(tabA: number | undefined, tabB: number | undefined): boolean {
  if (tabA === undefined || tabB === undefined) {
    return true
  }

  return tabA === tabB
}

const EXTRACTOR_RANK: Record<string, number> = {
  jsonpath: 3,
  xpath: 2,
  css: 2,
  boundary: 1,
  regex: 1,
  header: 0,
  cookie: 0,
}

export function detectReuse(
  exchanges: readonly CapturedRequest[],
  options: AnalysisOptions
): ReuseMap {
  // First pass: collect all finds grouped by normalizedValue, tracking per-exchange info
  type ExchangeFindInfo = { bodyAvailable: boolean; extractorKind: string }
  const valueToExchangeInfo = new Map<string, Map<number, ExchangeFindInfo>>()

  for (let exchangeIndex = 0; exchangeIndex < exchanges.length; exchangeIndex++) {
    const exchange = exchanges[exchangeIndex]!

    if (options.sameTabOnly) {
      const firstEntry = valueToExchangeInfo.values().next().value
      if (firstEntry !== undefined) {
        const firstProducerIdx = [...firstEntry.keys()][0]
        if (firstProducerIdx !== undefined) {
          const producer = exchanges[firstProducerIdx]
          if (producer !== undefined && !isSameTab(producer.tabId, exchange.tabId)) {
            continue
          }
        }
      }
    }

    const bodyAvailable = exchange.responseBodyMeta?.available === 'available'
    const finds = collectFinds(exchange)
    for (const find of finds) {
      const normalized = normalizeValue(find.value)
      if (!valueToExchangeInfo.has(normalized)) {
        valueToExchangeInfo.set(normalized, new Map())
      }
      const exchangeMap = valueToExchangeInfo.get(normalized)!
      const existing = exchangeMap.get(exchangeIndex)
      if (
        existing === undefined ||
        (EXTRACTOR_RANK[find.proposedExtractor.kind] ?? 0) >
          (EXTRACTOR_RANK[existing.extractorKind] ?? 0)
      ) {
        exchangeMap.set(exchangeIndex, {
          bodyAvailable,
          extractorKind: find.proposedExtractor.kind,
        })
      }
    }
  }

  // Second pass: rank producers and build reuse map
  const reuseMap = new Map<string, ReuseEntry>()

  for (const [normalized, exchangeMap] of valueToExchangeInfo) {
    const exchangeIndices = [...exchangeMap.keys()]
    const ranked = exchangeIndices.sort((a, b) => {
      const infoA = exchangeMap.get(a)!
      const infoB = exchangeMap.get(b)!
      if (infoA.bodyAvailable !== infoB.bodyAvailable) {
        return infoA.bodyAvailable ? -1 : 1
      }
      return (EXTRACTOR_RANK[infoB.extractorKind] ?? 0) - (EXTRACTOR_RANK[infoA.extractorKind] ?? 0)
    })

    const producerIndex = ranked[0]!
    const consumerIndices = ranked.slice(1)

    reuseMap.set(normalized, {
      normalizedValue: normalized,
      producerIndex,
      consumerIndices,
    })
  }

  return reuseMap
}

function collectFinds(exchange: CapturedRequest): RawFind[] {
  const finds: RawFind[] = []

  if (exchange.responseBodyMeta?.available === 'available' && exchange.responseBody !== undefined) {
    try {
      const parsed = JSON.parse(exchange.responseBody) as Record<string, unknown>
      for (const value of Object.values(parsed)) {
        if (typeof value === 'string' && value.trim().length > 0) {
          finds.push({
            value,
            location: `response.body.json:?`,
            candidateType: 'unknown',
            proposedExtractor: {
              kind: 'jsonpath',
              expression: '$',
              matchNo: 1,
              defaultValue: 'NOT_FOUND',
              variableName: '',
            },
          })
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  for (const value of Object.values(exchange.responseHeaders ?? {})) {
    if (typeof value !== 'string') {
      continue
    }
    finds.push({
      value,
      location: `response.header:?`,
      candidateType: 'header',
      proposedExtractor: {
        kind: 'header',
        expression: '',
        matchNo: 1,
        defaultValue: 'NOT_FOUND',
        variableName: '',
      },
    })
  }

  for (const value of Object.values(exchange.headers ?? {})) {
    if (typeof value !== 'string') {
      continue
    }
    finds.push({
      value,
      location: `request.header:?`,
      candidateType: 'header',
      proposedExtractor: {
        kind: 'header',
        expression: '',
        matchNo: 1,
        defaultValue: 'NOT_FOUND',
        variableName: '',
      },
    })
  }

  if (exchange.body !== undefined && exchange.body.trim().length > 0) {
    try {
      const params = new URLSearchParams(exchange.body)
      for (const value of params.values()) {
        finds.push({
          value,
          location: `request.body.form:?`,
          candidateType: 'form-field',
          proposedExtractor: {
            kind: 'boundary',
            expression: '',
            matchNo: 1,
            defaultValue: 'NOT_FOUND',
            variableName: '',
          },
        })
      }
    } catch {
      // ignore
    }
  }

  return finds
}
