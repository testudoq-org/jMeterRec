import type { AnalysisInput, AnalysisOptions, AnalysisResult, ValueCandidate } from './types'
import { extractJson } from './extractors/json'
import { extractFormUrlencoded } from './extractors/form-urlencoded'
import { extractHeadersCookies, extractRedirectLocation } from './extractors/headers-cookies'
import { extractHtmlHidden } from './extractors/html-hidden'
import { extractXml } from './extractors/xml'
import { matchSteps, valueChanged } from './change-detector'
import { scoreCandidate } from './scoring'
import { isHardNoise, isCacheBuster } from './noise-filters'
import { deduplicateVariableName } from './variable-naming'
import { maskCandidateValue } from './masking'

const EXTRACTORS = [
  extractJson,
  extractFormUrlencoded,
  extractHeadersCookies,
  extractRedirectLocation,
  extractHtmlHidden,
  extractXml,
] as const

type ExtractorFn = (request: Parameters<typeof extractJson>[0]) => ReturnType<typeof extractJson>

interface CollectedFind {
  find: ReturnType<ExtractorFn>[number]
  exchangeIndex: number
  exchangeId: string
}

function collectAllFinds(exchanges: readonly Parameters<ExtractorFn>[0][]): CollectedFind[] {
  const finds: CollectedFind[] = []

  for (let exchangeIndex = 0; exchangeIndex < exchanges.length; exchangeIndex++) {
    const exchange = exchanges[exchangeIndex]!
    for (const extractor of EXTRACTORS) {
      const rawFinds = extractor(exchange)
      for (const find of rawFinds) {
        finds.push({
          find,
          exchangeIndex,
          exchangeId: exchange.id,
        })
      }
    }
  }

  return finds
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

function buildReuseMap(
  exchanges: readonly Parameters<ExtractorFn>[0][],
  _options: AnalysisOptions
): Map<string, { normalizedValue: string; producerIndex: number; consumerIndices: number[] }> {
  // First pass: collect all finds grouped by normalizedValue, tracking per-exchange info
  type ExchangeFindInfo = { bodyAvailable: boolean; extractorKind: string }
  const valueToExchangeInfo = new Map<string, Map<number, ExchangeFindInfo>>()

  for (let exchangeIndex = 0; exchangeIndex < exchanges.length; exchangeIndex++) {
    const exchange = exchanges[exchangeIndex]!
    const bodyAvailable = exchange.responseBodyMeta?.available === 'available'
    for (const extractor of EXTRACTORS) {
      const rawFinds = extractor(exchange)
      for (const find of rawFinds) {
        const normalized = find.value.trim().toLowerCase()
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
  }

  // Second pass: rank producers and build reuse map
  const reuseMap = new Map<
    string,
    { normalizedValue: string; producerIndex: number; consumerIndices: number[] }
  >()

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

export function runAnalysis(input: AnalysisInput, options?: AnalysisOptions): AnalysisResult {
  const opts: AnalysisOptions = {
    correlationWindowMs: Number.POSITIVE_INFINITY,
    sameTabOnly: true,
    matchStepsBy: 'url-method',
    ...options,
  }

  const primaryExchanges = input.primary.exchanges
  const baselineExchanges = input.baseline?.exchanges ?? []

  const reuseMap = buildReuseMap(primaryExchanges, opts)

  const stepMatches =
    baselineExchanges.length > 0 ? matchSteps(primaryExchanges, baselineExchanges, opts) : []

  const usedNames = new Set<string>()
  const candidates: ValueCandidate[] = []
  const rejectedNoise: ValueCandidate[] = []
  const diagnostics: string[] = []

  const processedProducerValues = new Set<string>()

  for (const collected of collectAllFinds(primaryExchanges)) {
    const normalized = collected.find.value.trim().toLowerCase()
    const reuseEntry = reuseMap.get(normalized)

    if (reuseEntry === undefined || reuseEntry.producerIndex !== collected.exchangeIndex) {
      continue
    }

    if (processedProducerValues.has(normalized)) {
      continue
    }

    processedProducerValues.add(normalized)

    const producer = primaryExchanges[reuseEntry.producerIndex]!
    const producerBodyAvailable = producer.responseBodyMeta?.available === 'available'
    const hasMissingProducerBody =
      producer.responseBodyMeta !== undefined &&
      !['available', 'not-requested'].includes(producer.responseBodyMeta.available)

    const isManagedCookie = collected.find.candidateType === 'session-id'
    const hardNoise = isHardNoise(collected.find.value, collected.find.location)
    const isSingleUseCacheBuster =
      reuseEntry.consumerIndices.length === 0 && isCacheBuster(collected.find.value)

    const structuralLocation = collected.find.proposedExtractor?.expression.trim().length > 0

    const namedTokenPattern =
      collected.find.candidateType !== 'unknown' &&
      collected.find.candidateType !== 'hidden-field' &&
      collected.find.candidateType !== 'form-field' &&
      collected.find.candidateType !== 'cookie' &&
      collected.find.candidateType !== 'header'

    let valueChanges = false
    if (baselineExchanges.length > 0) {
      const matchedStep = stepMatches.find((m) => m.primaryIndex === reuseEntry.producerIndex)
      if (matchedStep !== undefined) {
        valueChanges = valueChanged(primaryExchanges, baselineExchanges, matchedStep)
      }
    }

    const context = {
      bodyAvailable: producerBodyAvailable,
      consumerCount: reuseEntry.consumerIndices.length,
      valueChanges,
      isManagedCookie,
      isHardNoise: hardNoise,
      hasMissingProducerBody,
      isSingleUseCacheBuster,
      structuralLocation,
      namedTokenPattern,
    }

    const confidence = scoreCandidate(context)

    const variableName = deduplicateVariableName(collected.find.location, usedNames)

    const candidate: ValueCandidate = {
      id: `${collected.exchangeId}-${normalized}`,
      value: maskCandidateValue(collected.find.value, collected.find.candidateType),
      normalizedValue: normalized,
      sourceExchangeId: collected.exchangeId,
      sourceLocation: collected.find.location,
      consumerExchangeIds: reuseEntry.consumerIndices.map((idx) => primaryExchanges[idx]!.id),
      consumerLocations: reuseEntry.consumerIndices.map(
        (idx) => `${primaryExchanges[idx]!.method} ${primaryExchanges[idx]!.url}`
      ),
      candidateType: collected.find.candidateType,
      variableName,
      confidence,
      reasons: [
        ...(valueChanges ? ['Value changed between recordings'] : []),
        ...(producerBodyAvailable ? ['Producer body available'] : []),
        ...(reuseEntry.consumerIndices.length > 0
          ? [`${reuseEntry.consumerIndices.length} consumer(s)`]
          : []),
        ...(isManagedCookie ? ['Managed by JMeter CookieManager'] : []),
        ...(hasMissingProducerBody ? ['Producer body unavailable'] : []),
        ...(hardNoise ? ['Hard noise heuristic matched'] : []),
        ...(isSingleUseCacheBuster ? ['Single-use cache buster'] : []),
      ],
      proposedExtractor: collected.find.proposedExtractor
        ? {
            ...collected.find.proposedExtractor,
            variableName,
          }
        : undefined,
      warnings: hasMissingProducerBody ? ['Producer body was unavailable'] : [],
      scope: {
        producerIndex: reuseEntry.producerIndex,
        consumerIndices: reuseEntry.consumerIndices,
      },
      rejected: hardNoise,
    }

    if (hardNoise) {
      rejectedNoise.push(candidate)
    } else {
      candidates.push(candidate)
    }
  }

  return {
    recordingVersion: input.primary.schemaVersion,
    recordingId: input.primary.id,
    candidates,
    rejectedNoise,
    diagnostics,
  }
}
