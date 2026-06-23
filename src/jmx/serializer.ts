import type { CapturedRequest, PlanMeta } from '../models/captured-request'
import type { UserAgentId } from '../options/advanced-options'
import { getUserAgentString } from '../options/user-agents'
import {
  analyzeRequestDefaults,
  createHTTPRequestDefaults,
  xmlEsc,
  escapeCdata,
  supportsRequestBody,
  parseCapturedUrl,
} from './element-model'

export interface JmxSerializerOptions {
  thinkTime?: { enabled: boolean; randomize: boolean; rangePercent: number }
  assertion?: { enabled: boolean; expectStatus: number }
  recordCookies?: boolean
  userAgent?: UserAgentId
}

interface ThinkTimeOptions {
  enabled: boolean
  randomize: boolean
  rangePercent: number
}

const COOKIE_HEADER_NAMES = new Set(['cookie', 'cookie2'])

export function buildJmx(
  meta: PlanMeta,
  requests: CapturedRequest[],
  options?: JmxSerializerOptions
): string {
  const { primaryDomain, primaryPort, primaryProtocol } = analyzeRequestDefaults(requests)

  // MODIFIED: Added inheritance flags from defaults analysis
  const samplers = requests
    .map((req, idx) => {
      const prev = idx > 0 ? requests[idx - 1] : undefined
      const gap =
        prev !== undefined
          ? new Date(req.timestamp).getTime() - new Date(prev.timestamp).getTime()
          : 0
      const timerMarkup = gap > 0 ? buildThinkTimeTimer(gap, options?.thinkTime) : ''
      const assertionMarkup = options?.assertion?.enabled
        ? buildAssertion(options.assertion.expectStatus)
        : ''

      // Prepare headers with cookie/user-agent handling
      const processedHeaders = processHeaders(req.headers, options)

      // NEW: Pass inheritance flags so buildSampler can omit defaulted properties
      const defaults =
        primaryDomain || primaryPort || primaryProtocol
          ? { domain: primaryDomain, port: primaryPort, protocol: primaryProtocol }
          : undefined

      return `${timerMarkup}${buildSampler(req, idx, processedHeaders, defaults)}${assertionMarkup}\n        <hashTree/>`
    })
    .join('\n')

  // Cookie manager behavior: only emit if recordCookies is true (default)
  const cookieManager =
    options?.recordCookies !== false ? buildCookieManager(collectAllCookies(requests)) : ''

  // NEW: Emit HTTPRequestDefaults before CookieManager and samplers in ThreadGroup
  const httpRequestDefaults = buildHTTPRequestDefaults(primaryDomain, primaryPort, primaryProtocol)

  return `<?xml version="1.0" encoding="UTF-8"?>
  <jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
   <hashTree>
     <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${xmlEsc(meta.name)}" enabled="true">
       <stringProp name="TestPlan.comments"></stringProp>
       <stringProp name="TestPlan.functional_mode">false</stringProp>
       <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
       <elementProp name="TestPlan.user_defined_variables" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
         <collectionProp name="Arguments.arguments" />
       </elementProp>
     </TestPlan>
     <hashTree>
       <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Thread Group" enabled="true">
         <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
         <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
           <boolProp name="LoopController.continue_forever">false</boolProp>
           <stringProp name="LoopController.loops">${meta.threadGroup.loops}</stringProp>
         </elementProp>
         <stringProp name="ThreadGroup.num_threads">${meta.threadGroup.threads}</stringProp>
         <stringProp name="ThreadGroup.ramp_time">${meta.threadGroup.rampUp}</stringProp>
         <boolProp name="ThreadGroup.scheduler">false</boolProp>
         <stringProp name="ThreadGroup.duration"></stringProp>
         <stringProp name="ThreadGroup.delay"></stringProp>
         <boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
       </ThreadGroup>
       <hashTree>
${httpRequestDefaults}${cookieManager}${samplers}
       </hashTree>
     </hashTree>
   </hashTree>
  </jmeterTestPlan>`
}

// MODIFIED: Added optional `defaults` parameter to support HTTPRequestDefaults inheritance
function buildSampler(
  req: CapturedRequest,
  idx: number,
  headers: Record<string, string>,
  defaults?: { domain: string; port: string; protocol: string }
): string {
  const url = parseCapturedUrl(req.url)
  const host = url?.host ?? ''
  const path = url?.path ?? req.url
  const protocol = url?.protocol ?? 'http'
  const port = url?.port ?? ''

  const name = `${req.method} ${host}${path} #${idx}`

  const body = req.responseBody ?? req.body ?? ''
  const bodyCdata = escapeCdata(body)

  // NEW: Determine which properties are inherited from HTTPRequestDefaults
  const omitDomain = defaults !== undefined && url?.hostname === defaults.domain
  const omitProtocol = defaults !== undefined && protocol === defaults.protocol
  const omitPort = defaults !== undefined && port === defaults.port

  return `        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${xmlEsc(name)}" enabled="true">
            <boolProp name="HTTPSampler.postBodyRaw">${supportsRequestBody(req.method)}</boolProp>
            <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
              <collectionProp name="Arguments.arguments">
                <elementProp name="" elementType="HTTPArgument" guiclass="HTTPArgumentGui" testclass="HTTPArgument" testname="Argument" enabled="true">
                  <boolProp name="HTTPArgument.always_encode">false</boolProp>
                  <stringProp name="Argument.name"></stringProp>
                  <stringProp name="Argument.value"><![CDATA[${bodyCdata}]]></stringProp>
                  <stringProp name="Argument.metadata">=</stringProp>
                </elementProp>
 ${buildQueryParams(req.queryParams)}
              </collectionProp>
            </elementProp>
            ${!omitDomain ? `            <stringProp name="HTTPSampler.domain">${xmlEsc(host)}</stringProp>` : ''}
            ${!omitPort ? `            <stringProp name="HTTPSampler.port">${xmlEsc(port)}</stringProp>` : ''}
            ${!omitProtocol ? `            <stringProp name="HTTPSampler.protocol">${xmlEsc(protocol)}</stringProp>` : ''}
            <stringProp name="HTTPSampler.path">${xmlEsc(path)}</stringProp>
            <stringProp name="HTTPSampler.method">${xmlEsc(req.method)}</stringProp>
            <boolProp name="HTTPSampler.follow_redirects">${req.followRedirects ?? true}</boolProp>
            <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
            <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
            <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
            <stringProp name="HTTPSampler.embedded_url_re"></stringProp>
            <stringProp name="HTTPSampler.connect_timeout"></stringProp>
            <stringProp name="HTTPSampler.response_timeout"></stringProp>
    ${buildHeaders(headers)}
          </HTTPSamplerProxy>`
}

function buildHeaders(headers: Record<string, string>): string {
  const entries = Object.entries(headers)

  if (entries.length === 0) {
    return `          <elementProp name="HTTPsampler.Headers" elementType="HeaderManager" guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Default Headers" enabled="true">
             <collectionProp name="HeaderManager.headers" />
           </elementProp>`
  }

  const headerElements = entries
    .map(
      ([
        key,
        value,
      ]) => `              <elementProp name="" elementType="Header" guiclass="Header" testclass="Header" testname="${xmlEsc(key)}" enabled="true">
                 <stringProp name="Header.name">${xmlEsc(key)}</stringProp>
                 <stringProp name="Header.value">${xmlEsc(value)}</stringProp>
                 <stringProp name="Header.enabled">true</stringProp>
               </elementProp>`
    )
    .join('\n')

  return `          <elementProp name="HTTPsampler.Headers" elementType="HeaderManager" guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Default Headers" enabled="true">
             <collectionProp name="HeaderManager.headers">
${headerElements}
             </collectionProp>
           </elementProp>`
}

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

function buildCookieManager(cookies: Array<{ name: string; value: string }>): string {
  if (cookies.length === 0) {
    return ''
  }

  const entries = cookies
    .map(
      ({
        name,
        value,
      }) => `            <elementProp name="" elementType="Cookie" guiclass="HTTPPanel" testclass="Cookie" testname="${xmlEsc(name)}" enabled="true">
               <stringProp name="Cookie.domain"></stringProp>
               <stringProp name="Cookie.path"></stringProp>
               <stringProp name="Cookie.value">${xmlEsc(value)}</stringProp>
               <stringProp name="Cookie.secure">false</stringProp>
               <boolProp name="Cookie.expires">false</boolProp>
             </elementProp>`
    )
    .join('\n')

  return `          <CookieManager guiclass="CookiePanel" testclass="CookieManager" testname="HTTP Cookie Manager" enabled="true">
              <collectionProp name="CookieManager.cookies">
 ${entries}
              </collectionProp>
              <stringProp name="CookieManager.eachCookieIsolate">false</stringProp>
            </CookieManager>
            <hashTree/>\n`
}

// NEW: Build HTTPRequestDefaults element to deduplicate host/protocol/port across samplers
function buildHTTPRequestDefaults(domain: string, port: string, protocol: string): string {
  const defaults = createHTTPRequestDefaults(domain, port, protocol)

  return `          <${defaults.type} guiclass="${defaults.guiClass}" testclass="${defaults.testClass}" testname="${xmlEsc(defaults.name)}" enabled="true">
            <stringProp name="HTTPSampler.domain">${xmlEsc(defaults.domain)}</stringProp>
            <stringProp name="HTTPSampler.port">${xmlEsc(defaults.port)}</stringProp>
            <stringProp name="HTTPSampler.protocol">${xmlEsc(defaults.protocol)}</stringProp>
          </${defaults.type}>
          <hashTree/>\n`
}

function buildQueryParams(queryParams: Record<string, string>): string {
  const entries = Object.entries(queryParams)
    .map(
      ([
        name,
        value,
      ]) => `              <elementProp name="" elementType="HTTPArgument" guiclass="HTTPArgumentGui" testclass="HTTPArgument" testname="Argument" enabled="true">
                 <boolProp name="HTTPArgument.always_encode">false</boolProp>
                 <stringProp name="Argument.name">${xmlEsc(name)}</stringProp>
                 <stringProp name="Argument.value"><![CDATA[${escapeCdata(value)}]]></stringProp>
                 <stringProp name="Argument.metadata">=</stringProp>
               </elementProp>`
    )
    .join('\n')

  if (entries.length === 0) {
    return ''
  }

  return `\n${entries}\n`
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

  return `          <${timerType} guiclass="${guiClass}" testclass="${timerType}" testname="Think Time" enabled="true">
             <stringProp name="${timerType}.delay">${delayProp}</stringProp>
           </${timerType}>
           <hashTree/>\n`
}

function buildAssertion(expectStatus: number): string {
  return `        <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Status Assertion" enabled="true">
             <collectionProp name="Asserter.urls">
               <boolProp name="clear">false</boolProp>
             </collectionProp>
             <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
             <stringProp name="Assertion.test_type">200</stringProp>
             <boolProp name="Assertion.assume_success">false</boolProp>
             <stringProp name="Assertion.custom_message"></stringProp>
             <collectionProp name="Assertion.test_values">
               <stringProp name="200">${expectStatus}</stringProp>
             </collectionProp>
             <collectionProp name="Asserter.test_configs">
               <elementProp name="0" elementType="field">
                 <boolProp name="IncludeEquality">true</boolProp>
                 <boolProp name="IncludeRegexp">false</boolProp>
                 <stringProp name="field">Assertion.response_code</stringProp>
                 <stringProp name="match">${expectStatus}</stringProp>
                 <stringProp name="not">false</stringProp>
               </elementProp>
             </collectionProp>
           </ResponseAssertion>
           <hashTree/>
`
}
