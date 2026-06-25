import type { CapturedRequest, PlanMeta } from '../models/captured-request'
import type { UserAgentId } from '../options/advanced-options'
import { getUserAgentString } from '../options/user-agents'
import {
  // Factories
  createTestPlan,
  createThreadGroup,
  createHTTPSampler,
  createCookieManager,
  createHTTPRequestDefaults,
  createResponseAssertion,
  // Serialization functions
  serializeTestPlan,
  serializeThreadGroup,
  serializeHTTPRequestDefaults,
  serializeHTTPSampler,
  serializeCookieManager,
  serializeResponseAssertion,
  // Utility helpers (used within serialization functions in element-model.ts)
  // Analysis
  analyzeRequestDefaults,
} from './element-model'

export interface JmxSerializerOptions {
  thinkTime?: { enabled: boolean; randomize: boolean; rangePercent: number }
  assertion?: { enabled: boolean; expectStatus: number }
  recordCookies?: boolean
  userAgent?: UserAgentId
}

/**
 * Model-driven JMX builder (011-A7).
 *
 * Each JMeter element is created via a typed factory from element-model.ts
 * and serialized by the corresponding serialize* function. The only
 * template-literal strings remaining govern the outer document outline
 * (jmeterTestPlan / TestPlan / ThreadGroup / hashTree hierarchy), which is
 * fixed by JMeter's schema and verified by existing E2E golden-file tests.
 */
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

  // ④ Build each sampler via model factory + serializer.
  //    Think-time timers are computed between adjacent request pairs.
  const sequenceXml = requests
    .map((req, idx) => {
      const prev = idx > 0 ? requests[idx - 1] : undefined
      const gap =
        prev !== undefined
          ? new Date(req.timestamp).getTime() - new Date(prev.timestamp).getTime()
          : 0
      const timerXml = gap > 0 ? buildThinkTimeTimer(gap, options?.thinkTime) : ''
      const assertionXml =
        options?.assertion?.enabled === true
          ? serializeResponseAssertion(createResponseAssertion(options.assertion.expectStatus))
          : ''
      const samplerModel = createHTTPSampler(
        req,
        idx,
        processHeaders(req.headers, options),
        effectiveDefaults
      )
      const samplerXml = serializeHTTPSampler(samplerModel)

      return `${timerXml}${assertionXml}${samplerXml}<hashTree/>\n`
    })
    .join('\n')

// ⑤ Assemble document — element content is model-driven, structure is schema-fixed.
  // Each element (ConfigTestElement, CookieManager, samplers) must be followed by its own hashTree.
  // CookieManager is only included if there are cookies to avoid empty hashTree elements.
  const cookieSection = cookieMgrXml ? `${cookieMgrXml}<hashTree/>\n` : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
<hashTree>
${planXml}
<hashTree>
${tgXml}
<hashTree>
${defaultsXml}
<hashTree/>
${cookieSection}${sequenceXml}
</hashTree>
</hashTree>
</hashTree>
</jmeterTestPlan>`
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
