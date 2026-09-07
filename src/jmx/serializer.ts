import type { JmxExtractor, JmxResponseAssertion, JmxCsvDataSet } from './element-model'
import type { CapturedRequest, PlanMeta } from '../models/captured-request'
import type { UserAgentId } from '../options/advanced-options'
import type { ReplacementOperation } from '../transform/types'
import { getUserAgentString } from '../options/user-agents'
import { sanitizeForXml } from '../utils/xml-sanitizer'
import {
  // Factories
  createTestPlan,
  createThreadGroup,
  createHTTPSampler,
  createCookieManager,
  createHTTPRequestDefaults,
  createResponseAssertion,
  createDurationAssertion,
  createCacheManager,
  createJSONPostProcessor,
  createRegexExtractor,
  // Serialization functions
  serializeTestPlan,
  serializeThreadGroup,
  serializeHTTPRequestDefaults,
  serializeHTTPSampler,
  serializeCookieManager,
  serializeResponseAssertion,
  serializeDurationAssertion,
  serializeCacheManager,
  serializeCsvDataSet,
  serializeJSONPostProcessor,
  serializeRegexExtractor,
  // Utility helpers (used within serialization functions in element-model.ts)
  // Analysis
  analyzeRequestDefaults,
} from './element-model'

export interface JmxSerializerOptions {
  thinkTime?: { enabled: boolean; randomize: boolean; rangePercent: number }
  assertion?: { enabled: boolean; expectStatus: number }
  durationAssertion?: { enabled: boolean; thresholdMs: number }
  recordCookies?: boolean
  userAgent?: UserAgentId
  cacheEnabled?: boolean
  extractors?: JmxExtractor[]
  /**
   * Per-sampler extractors keyed by request index (producer index within the
   * exported request sequence). Placed as children of that specific sampler's
   * hashTree instead of at the ThreadGroup level.
   */
  perSamplerExtractors?: Map<number, JmxExtractor[]>
  /**
   * Consumer substitutions applied during sampler creation — variable names
   * referencing `${varName}` patterns replacing original values in URL, query,
   * headers, and body.
   */
  consumerSubstitutions?: ReplacementOperation[]
  /**
   * Per-sampler response assertions keyed by request index. Placed as children
   * of that specific sampler's hashTree instead of at the ThreadGroup level.
   */
  perSamplerAssertions?: Map<number, JmxResponseAssertion[]>
  /**
   * CSV Data Set Config elements to emit in the ThreadGroup before samplers.
   * Derived from ParameterizationProposal entries with source === 'csv'.
   */
  csvDataSets?: JmxCsvDataSet[]
}

/**
 * Model-driven JMX builder (011-A7).
 *
 * Each JMeter element is created via a typed factory from element-model.ts
 * and serialized by the corresponding serialize* function. The only
 * template-literal strings remaining govern the outer document outline
 * (jmeterTestPlan / TestPlan / ThreadGroup / hashTree hierarchy).
 *
 * JMeter schema limitations (see specs/013-jmx-output-hardening.md §6):
 * - Every non-leaf element must be followed by its own <hashTree/> before the next sibling.
 * - Element tag names must match JMeter's saveservice.properties aliases
 *   (use <ConfigTestElement>, not <HTTPRequestDefaults>).
 * - Empty child elements without <hashTree/> may be silently discarded or shift ordering.
 * - Response bodies containing &, <, > must use CDATA to avoid invalid XML.
 */

const EXTRACTOR_BUILDERS = new Map<JmxExtractor['type'], (ext: JmxExtractor) => string>([
  [
    'JSONPostProcessor',
    (ext: JmxExtractor) => {
      const jsonExt = ext as Extract<JmxExtractor, { type: 'JSONPostProcessor' }>
      const xml = serializeJSONPostProcessor(
        createJSONPostProcessor(
          jsonExt.refNames,
          jsonExt.jsonPathExpressions,
          jsonExt.defaultValues ?? '',
          jsonExt.matchNumbers ?? '1'
        )
      )
      return `${xml}<hashTree/>`
    },
  ],
  [
    'RegexExtractor',
    (ext: JmxExtractor) => {
      const regexExt = ext as Extract<JmxExtractor, { type: 'RegexExtractor' }>
      const xml = serializeRegexExtractor(
        createRegexExtractor(
          regexExt.refname,
          regexExt.regex,
          regexExt.defaultValue ?? '',
          regexExt.matchNumber ?? '1',
          regexExt.template ?? '$1$'
        )
      )
      return `${xml}<hashTree/>`
    },
  ],
])

function buildAssertionXml(options?: JmxSerializerOptions): string {
  return options?.assertion?.enabled === true
    ? serializeResponseAssertion(createResponseAssertion(options.assertion.expectStatus))
    : ''
}

function buildSamplerAssertions(
  perSamplerAssertions?: Map<number, JmxResponseAssertion[]>,
  requestIndex?: number
): string {
  if (requestIndex === undefined || !perSamplerAssertions) {
    return ''
  }

  const assertions = perSamplerAssertions.get(requestIndex) ?? []
  return assertions.map((assertion) => serializeResponseAssertion(assertion)).join('\n')
}

function buildDurationAssertionXml(options?: JmxSerializerOptions): string {
  return options?.durationAssertion?.enabled === true
    ? serializeDurationAssertion(createDurationAssertion(options.durationAssertion.thresholdMs))
    : ''
}

function buildSamplerSequence(
  requests: CapturedRequest[],
  options?: JmxSerializerOptions,
  effectiveDefaults?: { domain: string; port: string; protocol: string }
): string {
  return requests
    .map((req, idx) => {
      const prev = idx > 0 ? requests[idx - 1] : undefined
      const gap =
        prev !== undefined
          ? new Date(req.timestamp).getTime() - new Date(prev.timestamp).getTime()
          : 0
      const timerXml = gap > 0 ? buildThinkTimeTimer(gap, options?.thinkTime) : ''
      const assertionXml = buildAssertionXml(options)
      const durationAssertionXml = buildDurationAssertionXml(options)

      // Per-sampler extractors (from plan) — placed as children of this sampler's
      // hashTree. Falls back to ThreadGroup-level extractors when no plan applies.
      const samplerExtractors = options?.perSamplerExtractors?.get(idx)
      const extractorsXml = (samplerExtractors ?? options?.extractors ?? [])
        .map((ext) => EXTRACTOR_BUILDERS.get(ext.type)?.(ext) ?? '')
        .join('\n')

      // Per-sampler assertions (from plan) — placed as children of this sampler's
      // hashTree after the sampler element.
      const samplerAssertionsXml = buildSamplerAssertions(options?.perSamplerAssertions, idx)

      // Apply consumer variable substitutions during sampler creation
      const substitutedReq = applyConsumerSubstitutions(req, options?.consumerSubstitutions)
      const samplerModel = createHTTPSampler(
        substitutedReq,
        idx,
        processHeaders(substitutedReq.headers, options),
        effectiveDefaults
      )
      const samplerXml = serializeHTTPSampler(samplerModel)
      const assertionSection = samplerAssertionsXml.length > 0 ? `\n${samplerAssertionsXml}` : ''
      const extractorSection = extractorsXml.length > 0 ? `\n${extractorsXml}` : ''

      return `${timerXml}${assertionXml}${durationAssertionXml}${samplerXml}<hashTree/>${assertionSection}${extractorSection}`
    })
    .join('\n')
}

export function buildJmx(
  meta: PlanMeta,
  requests: CapturedRequest[],
  options?: JmxSerializerOptions
): string {
  // ① Analyse the most-frequent host/protocol/port for HTTPRequestDefaults.
  const { primaryDomain, primaryPort, primaryProtocol } = analyzeRequestDefaults(requests)
  const hasDefaults =
    primaryDomain.length > 0 || primaryPort.length > 0 || primaryProtocol.length > 0
  const effectiveDefaults = hasDefaults
    ? { domain: primaryDomain, port: primaryPort, protocol: primaryProtocol }
    : undefined

  // ② Build container elements via model factories, then serialize.
  const planXml = serializeTestPlan(createTestPlan(meta.name))
  const tgXml = serializeThreadGroup(createThreadGroup(meta.threadGroup))

  // Always emit HTTPRequestDefaults (per §4.4.3.4 — never skip).
  const defaultsXml = serializeHTTPRequestDefaults(
    createHTTPRequestDefaults(primaryDomain, primaryPort, primaryProtocol)
  )

  // ③ Cookie manager — honour recordCookies flag, skip when no cookies exist.
  const cookies = collectAllCookies(requests)
  const cookieMgrXml =
    options?.recordCookies !== false && cookies.length > 0
      ? serializeCookieManager(createCookieManager(cookies))
      : ''

  // ④ CacheManager — honour cacheEnabled flag, emit under ThreadGroup.
  const cacheMgrXml =
    options?.cacheEnabled === true ? serializeCacheManager(createCacheManager()) : ''

  // ④b CSV Data Set Configs — emit parameterised CSV datasets under ThreadGroup.
  const csvDataSetsXml = options?.csvDataSets?.map(serializeCsvDataSet).join('\n') ?? ''
  const csvSection = csvDataSetsXml.length > 0 ? `${csvDataSetsXml}<hashTree/>\n` : ''

  // ⑤ Build each sampler via model factory + serializer.
  //    Think-time timers are computed between adjacent request pairs.
  const sequenceXml = buildSamplerSequence(requests, options, effectiveDefaults)

  // ⑥ Assemble document — element content is model-driven, structure is schema-fixed.
  // Each element (ConfigTestElement, CookieManager, samplers) must be followed by its own hashTree.
  // CookieManager is only included if there are cookies to avoid empty hashTree elements.
  const cookieSection = cookieMgrXml ? `${cookieMgrXml}<hashTree/>\n` : ''
  const cacheSection = cacheMgrXml ? `${cacheMgrXml}<hashTree/>\n` : ''
  const jmx = `<?xml version="1.0" encoding="UTF-8"?>
 <jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
 <hashTree>
 ${planXml}
 <hashTree>
 ${tgXml}
 <hashTree>
 ${defaultsXml}
 <hashTree/>
 ${cacheSection}${csvSection}${cookieSection}${sequenceXml}
 </hashTree>
 </hashTree>
 </hashTree>
 </jmeterTestPlan>`

  assertJmxWellFormedInDom(jmx)
  return sanitizeForXml(jmx)
}

/**
 * Development-only assertion that the generated JMX is well-formed XML.
 *
 * This is a no-op in the MV3 service-worker runtime because `DOMParser` is
 * unavailable there. The authoritative runtime protection is the
 * `sanitizeForXml()` guard in `xmlEsc()` / `escapeCdata()`.
 *
 * This assertion runs in browser and jsdom test environments to catch
 * serializer regressions that would produce invalid XML before the file
 * is written or handed off to strict validators like BlazeMeter.
 */
function assertJmxWellFormedInDom(jmx: string): void {
  const error = validateJmxSyntax(jmx)
  if (error !== undefined) {
    throw new Error(`Generated JMX is not valid XML: ${error}`)
  }
}

/**
 * Client-side syntax guard for JMX strings. Returns an error description
 * when the XML is not well-formed, or `undefined` when it passes.
 *
 * This is safe to call in popup and test environments where `DOMParser`
 * is available. It is a no-op in service-worker runtimes.
 */
export function validateJmxSyntax(jmx: string): string | undefined {
  if (typeof DOMParser === 'undefined') {
    return undefined
  }

  const doc = new DOMParser().parseFromString(jmx, 'application/xml')
  const parserError = doc.querySelector('parsererror')
  if (parserError === null) {
    return undefined
  }

  return parserError.textContent?.trim() ?? 'Malformed XML'
}

// ---------------------------------------------------------------------------
// Think-time timer helper (gate on options; no model needed — timeless statics)
// ---------------------------------------------------------------------------

interface ThinkTimeOptions {
  enabled: boolean
  randomize: boolean
  rangePercent: number
}

function buildThinkTimeTimer(thinkTimeMs: number, options?: ThinkTimeOptions): string {
  if (thinkTimeMs <= 0) {
    return ''
  }

  const enabled = options?.enabled ?? true
  if (!enabled) {
    return ''
  }

  const delay = options?.randomize
    ? Math.round(thinkTimeMs * (1 - (options.rangePercent ?? 20) / 100))
    : thinkTimeMs
  const timerType = options?.randomize ? 'UniformRandomTimer' : 'ConstantTimer'
  const guiClass = options?.randomize ? 'UniformRandomTimerGui' : 'ConstantTimerGui'
  const upper = options?.randomize
    ? Math.round(thinkTimeMs * (1 + (options.rangePercent ?? 20) / 100))
    : delay
  const delayProp = options?.randomize ? `${delay} ${upper}` : `${delay}`

  return `<${timerType} guiclass="${guiClass}" testclass="${timerType}" testname="Think Time" enabled="true">
<stringProp name="${timerType}.delay">${delayProp}</stringProp>
</${timerType}>
<hashTree/>
`
}

// ---------------------------------------------------------------------------
// Header / cookie processing (stays in serializer as it bridges web ↔ JMX)
// ---------------------------------------------------------------------------

const COOKIE_HEADER_NAMES = new Set(['cookie', 'cookie2'])

function processHeaders(
  headers: Record<string, string>,
  options?: JmxSerializerOptions
): Record<string, string> {
  const result: Record<string, string> = {}
  const userAgent = options?.userAgent
  const userAgentValue =
    userAgent !== undefined && userAgent !== 'current' ? getUserAgentString(userAgent) : ''

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase()

    // Skip cookie headers if recordCookies is true (they go to CookieManager)
    if (lowerKey === 'cookie' || lowerKey === 'cookie2') {
      if (options?.recordCookies !== false) {
        continue
      }
    }

    result[key] = value
  }

  // Add/override User-Agent header if specified
  if (userAgentValue.length > 0) {
    result['User-Agent'] = userAgentValue
  } else if (userAgent === 'current') {
    // Remove User-Agent header when using current browser
    delete result['User-Agent']
    delete result['user-agent']
  }

  return result
}

function collectAllCookies(
  requests: CapturedRequest[],
  includeCookies: boolean = true
): Array<{ name: string; value: string }> {
  if (!includeCookies) {
    return []
  }

  const seen = new Set<string>()
  const cookies: Array<{ name: string; value: string }> = []

  for (const req of requests) {
    for (const [rawName, rawValue] of Object.entries(req.headers)) {
      const name = rawName.toLowerCase()
      if (!COOKIE_HEADER_NAMES.has(name)) {
        continue
      }

      const trimmed = rawValue.trim()
      if (trimmed.length === 0) {
        continue
      }

      const key = `${name}:${trimmed}`
      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      cookies.push({ name: rawName, value: trimmed })
    }
  }

  return cookies
}

/**
 * Apply consumer variable substitutions to a captured request.
 * Replaces original values with `${variableName}` patterns in URL, query params,
 * headers, and body based on the plan's ReplacementOperation set.
 *
 * Each ReplacementOperation specifies a targetExchangeId that matches the
 * request's exchange ID (req.id).
 */
function applyConsumerSubstitutions(
  req: CapturedRequest,
  substitutions?: ReplacementOperation[]
): CapturedRequest {
  if (!substitutions || substitutions.length === 0) {
    return req
  }

  const matchingSubs = substitutions.filter((sub) => sub.targetExchangeId === req.id)
  if (matchingSubs.length === 0) {
    return req
  }

  // Apply substitutions immutably
  let newUrl = req.url
  const newHeaders: Record<string, string> = { ...req.headers }
  const newQueryParams: Record<string, string> = { ...req.queryParams }
  let newBody = req.body

  for (const sub of matchingSubs) {
    const varPattern = `\${${sub.variableName}}`

    switch (sub.location) {
      case 'url':
        newUrl = newUrl.replace(sub.originalValue, varPattern)
        break
      case 'header':
        if (sub.path && sub.originalValue) {
          const headerKey = Object.keys(newHeaders).find(
            (k) => k.toLowerCase() === sub.path!.toLowerCase()
          )
          if (headerKey !== undefined) {
            const currentVal = newHeaders[headerKey] ?? ''
            newHeaders[headerKey] = currentVal.replace(sub.originalValue, varPattern)
          }
        }
        break
      case 'query':
        if (sub.path && sub.originalValue) {
          const queryKey = Object.keys(newQueryParams).find(
            (k) => k.toLowerCase() === sub.path!.toLowerCase()
          )
          if (queryKey !== undefined) {
            const currentVal = newQueryParams[queryKey] ?? ''
            newQueryParams[queryKey] = currentVal.replace(sub.originalValue, varPattern)
          }
        }
        break
      case 'body':
        if (sub.originalValue) {
          const currentBody = newBody ?? ''
          newBody = currentBody.replace(sub.originalValue, varPattern)
        }
        break
    }
  }

  return {
    ...req,
    url: newUrl,
    headers: newHeaders,
    queryParams: newQueryParams,
    body: newBody,
  }
}
