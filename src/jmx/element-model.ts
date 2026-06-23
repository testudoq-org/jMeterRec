import type { CapturedRequest } from '../models/captured-request'

/**
 * Base interface for all JMeter XML element representations.
 * Every emitted element must carry these core JMeter attributes.
 */
export interface JmxElement {
  readonly type: string
  readonly testClass: string
  readonly guiClass: string
  readonly name: string
  readonly enabled: boolean
}

/**
 * Represents a <ConfigTestElement> for HTTP Request Defaults.
 *
 * JMeter uses this as an inheritance layer: if a sampler's domain,
 * port, or protocol property is empty, it falls back to the value
 * defined here. This reduces JMX verbosity for multi-request
 * recordings to the same host.
 */
export interface JmxHTTPRequestDefaults extends JmxElement {
  readonly type: 'HTTPRequestDefaults'
  readonly testClass: 'org.apache.jmeter.config.ConfigTestElement'
  readonly guiClass: 'org.apache.jmeter.protocol.http.config.gui.HttpDefaultsGui'
  readonly name: string
  readonly domain: string
  readonly port: string
  readonly protocol: string
}

/**
 * Factory constants for JMeter-required class names and GUI classes.
 * Centralising these prevents typos and keeps the serializer aligned
 * with JMeter's expected XML structure.
 */
export const ElementDefaults = {
  HTTPRequestDefaults: {
    testClass: 'org.apache.jmeter.config.ConfigTestElement',
    guiClass: 'org.apache.jmeter.protocol.http.config.gui.HttpDefaultsGui',
  },
  TestPlan: {
    testClass: 'TestPlan',
    guiClass: 'TestPlanGui',
  },
  ThreadGroup: {
    testClass: 'ThreadGroup',
    guiClass: 'ThreadGroupGui',
  },
  HTTPSamplerProxy: {
    testClass: 'HTTPSamplerProxy',
    guiClass: 'HttpTestSampleGui',
  },
} as const

/**
 * Factory interface for creating JMX element instances with
 * JMeter-compliant defaults.
 */
export interface JmxElementFactory {
  createHTTPRequestDefaults(
    domain: string,
    port: string,
    protocol: string,
    name?: string
  ): JmxHTTPRequestDefaults
}

/**
 * Creates a JmxHTTPRequestDefaults element with validated defaults.
 *
 * @param domain - Hostname (e.g. "api.example.com"). Empty string = no default.
 * @param port - Port number as string (e.g. "443", "80", ""). Empty string = no default.
 * @param protocol - Protocol name without colon (e.g. "https", "http"). Empty string = no default.
 * @param name - Display name in JMeter GUI. Defaults to "HTTP Request Defaults".
 * @returns A fully populated JmxHTTPRequestDefaults instance.
 */
export function createHTTPRequestDefaults(
  domain: string,
  port: string,
  protocol: string,
  name = 'HTTP Request Defaults'
): JmxHTTPRequestDefaults {
  return {
    type: 'HTTPRequestDefaults',
    testClass: ElementDefaults.HTTPRequestDefaults.testClass,
    guiClass: ElementDefaults.HTTPRequestDefaults.guiClass,
    name,
    enabled: true,
    domain,
    port,
    protocol,
  }
}

/**
 * Analyzes a set of captured requests to determine the most frequent
 * host, protocol, and port. The result is used to populate
 * HTTPRequestDefaults so individual samplers can inherit common
 * connection properties instead of repeating them.
 *
 * @param requests - Array of captured HTTP requests.
 * @returns Object containing the primary domain, port, and protocol.
 *   Returns empty strings for all fields when no valid requests are present
 *   or all URLs are malformed.
 */
export function analyzeRequestDefaults(requests: CapturedRequest[]): {
  primaryDomain: string
  primaryPort: string
  primaryProtocol: string
} {
  const hostCounts = new Map<
    string,
    { count: number; domain: string; port: string; protocol: string }
  >()

  for (const req of requests) {
    try {
      const url = new URL(req.url)
      const protocol = url.protocol.replace(':', '')
      const defaultPort = protocol === 'https' ? '443' : '80'
      const port = url.port || defaultPort
      const hostKey = `${url.hostname}:${port}`

      const existing = hostCounts.get(hostKey)
      if (existing !== undefined) {
        existing.count += 1
      } else {
        hostCounts.set(hostKey, {
          count: 1,
          domain: url.hostname,
          port,
          protocol,
        })
      }
    } catch {
      // Malformed URL — skip
    }
  }

  if (hostCounts.size === 0) {
    return { primaryDomain: '', primaryPort: '', primaryProtocol: '' }
  }

  // Find the most frequent host; break ties by first-encountered order
  let bestEntry = { count: 0, domain: '', port: '', protocol: '' }
  for (const entry of hostCounts.values()) {
    if (entry.count > bestEntry.count) {
      bestEntry = entry
    }
  }

  return {
    primaryDomain: bestEntry.domain,
    primaryPort: bestEntry.port,
    primaryProtocol: bestEntry.protocol,
  }
}

// ============================================================================
// TestPlan and HTTPSamplerProxy Interfaces (core MVP elements)
// ============================================================================

/**
 * TestPlan - root container for all JMeter elements.
 */
export interface JmxTestPlan extends JmxElement {
  readonly type: 'TestPlan'
  readonly testClass: 'TestPlan'
  readonly guiClass: 'TestPlanGui'
  readonly functionalMode: boolean
  readonly serializeThreadGroups: boolean
  readonly userDefinedVariables: Array<{ name: string; value: string }>
}

/**
 * HTTPSamplerProxy - HTTP request sampler for captured traffic.
 */
export interface JmxHTTPSampler extends JmxElement {
  readonly type: 'HTTPSamplerProxy'
  readonly testClass: 'HTTPSamplerProxy'
  readonly guiClass: 'HttpTestSampleGui'
  readonly domain: string
  readonly port: string
  readonly protocol: string
  readonly path: string
  readonly method: string
  readonly followRedirects: boolean
  readonly useKeepAlive: boolean
  readonly postBodyRaw: boolean
  readonly arguments: Array<{ name: string; value: string; alwaysEncode: boolean }>
  readonly headers: Array<{ name: string; value: string; enabled: boolean }>
  readonly body: string
}

/**
 * ThreadGroup - defines load profile for test execution.
 */
export interface JmxThreadGroup extends JmxElement {
  readonly type: 'ThreadGroup'
  readonly testClass: 'ThreadGroup'
  readonly guiClass: 'ThreadGroupGui'
  readonly onSampleError: 'continue' | 'stop' | 'stop_now'
  readonly numThreads: number
  readonly rampTime: number
  readonly scheduler: boolean
  readonly duration: string
  readonly delay: string
  readonly sameUserOnNextIteration: boolean
  readonly loopController: JmxLoopController
}

// ============================================================================
// LoopController - controls iteration count for a ThreadGroup or Controller.
// Contained within elementProp for ThreadGroup.main_controller.
// ============================================================================

export interface JmxLoopController extends JmxElement {
  readonly type: 'LoopController'
  readonly testClass: 'LoopController'
  readonly guiClass: 'LoopControlPanel'
  readonly continueForever: boolean
  readonly loops: number
}

/**
 * HeaderManager - manages HTTP headers for samplers.
 * Can be at ThreadGroup level (default headers) or per-sampler.
 */
export interface JmxHeaderManager extends JmxElement {
  readonly type: 'HeaderManager'
  readonly testClass: 'HeaderManager'
  readonly guiClass: 'HeaderPanel'
  readonly headers: Array<{ name: string; value: string; enabled: boolean }>
}

/**
 * CookieManager - manages HTTP cookies for samplers.
 * When enabled, captured cookies are persisted for replay.
 */
export interface JmxCookieManager extends JmxElement {
  readonly type: 'CookieManager'
  readonly testClass: 'CookieManager'
  readonly guiClass: 'CookiePanel'
  readonly eachCookieIsolate: boolean
  readonly cookies: Array<{
    name: string
    value: string
    domain?: string
    path?: string
    secure?: boolean
  }>
}

/**
 * ConstantTimer - fixed delay timer for think time between samplers.
 */
export interface JmxConstantTimer extends JmxElement {
  readonly type: 'ConstantTimer'
  readonly testClass: 'ConstantTimer'
  readonly guiClass: 'ConstantTimerGui'
  readonly delay: number
}

/**
 * UniformRandomTimer - random delay timer within a range.
 */
export interface JmxUniformRandomTimer extends JmxElement {
  readonly type: 'UniformRandomTimer'
  readonly testClass: 'UniformRandomTimer'
  readonly guiClass: 'UniformRandomTimerGui'
  readonly delay: number
  readonly range: number
}

/**
 * ResponseAssertion - validates response code or content.
 */
export interface JmxResponseAssertion extends JmxElement {
  readonly type: 'ResponseAssertion'
  readonly testClass: 'ResponseAssertion'
  readonly guiClass: 'AssertionGui'
  readonly testField: 'Assertion.response_code' | 'Assertion.response_data'
  readonly testType: number
  readonly testStrings: string[]
  readonly ignoreResponseCode: boolean
}

// ============================================================================
// Factory functions for MVP elements
// ============================================================================

export function createLoopController(loops: number, name = 'Loop Controller'): JmxLoopController {
  return {
    type: 'LoopController',
    testClass: 'LoopController',
    guiClass: 'LoopControlPanel',
    name,
    enabled: true,
    continueForever: false,
    loops,
  }
}

export function createHeaderManager(
  headers: Record<string, string>,
  name = 'HTTP Default Headers'
): JmxHeaderManager {
  return {
    type: 'HeaderManager',
    testClass: 'HeaderManager',
    guiClass: 'HeaderPanel',
    name,
    enabled: true,
    headers: Object.entries(headers).map(([k, v]) => ({
      name: k,
      value: v,
      enabled: true,
    })),
  }
}

export function createCookieManager(
  cookies: Array<{ name: string; value: string }>,
  name = 'HTTP Cookie Manager'
): JmxCookieManager {
  return {
    type: 'CookieManager',
    testClass: 'CookieManager',
    guiClass: 'CookiePanel',
    name,
    enabled: true,
    eachCookieIsolate: false,
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: '',
      path: '',
      secure: false,
    })),
  }
}

export function createConstantTimer(delayMs: number, name = 'Think Time'): JmxConstantTimer {
  return {
    type: 'ConstantTimer',
    testClass: 'ConstantTimer',
    guiClass: 'ConstantTimerGui',
    name,
    enabled: true,
    delay: delayMs,
  }
}

export function createUniformRandomTimer(
  delayMs: number,
  rangePercent: number,
  name = 'Think Time'
): JmxUniformRandomTimer {
  const baseDelay = Math.round(delayMs * (1 - rangePercent / 100))
  const upperDelay = Math.round(delayMs * (1 + rangePercent / 100))
  return {
    type: 'UniformRandomTimer',
    testClass: 'UniformRandomTimer',
    guiClass: 'UniformRandomTimerGui',
    name,
    enabled: true,
    delay: baseDelay,
    range: upperDelay - baseDelay,
  }
}

export function createResponseAssertion(
  expectStatus: number,
  name = 'Status Assertion'
): JmxResponseAssertion {
  return {
    type: 'ResponseAssertion',
    testClass: 'ResponseAssertion',
    guiClass: 'AssertionGui',
    name,
    enabled: true,
    testField: 'Assertion.response_code',
    testType: 8, // Equals (JMeter default)
    testStrings: [String(expectStatus)],
    ignoreResponseCode: false,
  }
}

/**
 * Creates a TestPlan element with JMeter defaults.
 */
export function createTestPlan(name = 'Untitled Plan'): JmxTestPlan {
  return {
    type: 'TestPlan',
    testClass: ElementDefaults.TestPlan.testClass,
    guiClass: ElementDefaults.TestPlan.guiClass,
    name,
    enabled: true,
    functionalMode: false,
    serializeThreadGroups: false,
    userDefinedVariables: [],
  }
}

/**
 * Creates a ThreadGroup element with the provided thread configuration.
 */
export function createThreadGroup(meta: {
  threads: number
  rampUp: number
  loops: number
}): JmxThreadGroup {
  return {
    type: 'ThreadGroup',
    testClass: ElementDefaults.ThreadGroup.testClass,
    guiClass: ElementDefaults.ThreadGroup.guiClass,
    name: 'Thread Group',
    enabled: true,
    onSampleError: 'continue',
    numThreads: meta.threads,
    rampTime: meta.rampUp,
    scheduler: false,
    duration: '',
    delay: '',
    sameUserOnNextIteration: true,
    loopController: createLoopController(meta.loops),
  }
}

/**
 * Creates an HTTPSamplerProxy element from a captured request.
 */
export function createHTTPSampler(
  req: CapturedRequest,
  index: number,
  headers: Record<string, string>,
  defaults?: { domain: string; port: string; protocol: string }
): JmxHTTPSampler {
  const url = parseCapturedUrl(req.url)
  const hostname = url?.hostname ?? ''
  const path = url?.path ?? req.url
  const protocol = (url?.protocol ?? 'http').replace(':', '')
  const defaultPort = protocol === 'https' ? '443' : '80'
  const port = url?.port && url.port.length > 0 ? url.port : defaultPort

  const name = `${req.method} ${hostname}${path} #${index}`
  const body = req.responseBody ?? req.body ?? ''

  // Determine which properties are inherited from HTTPRequestDefaults
  const inheritDomain = defaults !== undefined && hostname === defaults.domain
  const inheritProtocol = defaults !== undefined && protocol === defaults.protocol
  // For port inheritance, compare with the effective port (either explicit or default)
  const effectivePort = port
  const inheritPort = defaults !== undefined && effectivePort === defaults.port

  return {
    type: 'HTTPSamplerProxy',
    testClass: ElementDefaults.HTTPSamplerProxy.testClass,
    guiClass: ElementDefaults.HTTPSamplerProxy.guiClass,
    name,
    enabled: true,
    domain: inheritDomain ? '' : hostname,
    port: inheritPort ? '' : port,
    protocol: inheritProtocol ? '' : protocol,
    path,
    method: req.method,
    followRedirects: req.followRedirects ?? true,
    useKeepAlive: true,
    postBodyRaw: supportsRequestBody(req.method),
    arguments: buildSamplerArguments(req.queryParams, body),
    headers: Object.entries(headers).map(([k, v]) => ({ name: k, value: v, enabled: true })),
    body,
  }
}

/**
 * Parses a URL from a CapturedRequest, returning components needed for sampler creation.
 */
export function parseCapturedUrl(
  urlStr: string
): { host: string; hostname: string; path: string; protocol: string; port: string } | undefined {
  try {
    const url = new URL(urlStr)
    return {
      host: url.host,
      hostname: url.hostname,
      path: url.pathname,
      protocol: url.protocol.replace(':', ''),
      port: url.port,
    }
  } catch {
    return undefined
  }
}

/**
 * Builds the arguments array for a sampler including body and query params.
 */
function buildSamplerArguments(
  queryParams: Record<string, string>,
  body: string
): Array<{ name: string; value: string; alwaysEncode: boolean }> {
  const args: Array<{ name: string; value: string; alwaysEncode: boolean }> = [
    { name: '', value: body, alwaysEncode: false },
  ]

  for (const [name, value] of Object.entries(queryParams)) {
    args.push({ name, value, alwaysEncode: false })
  }

  return args
}

export function supportsRequestBody(method: string): boolean {
  switch (method.toUpperCase()) {
    case 'POST':
    case 'PUT':
    case 'PATCH':
    case 'DELETE':
      return true
    default:
      return false
  }
}

// ============================================================================
// Element hierarchy map for runtime validation
// ============================================================================

/**
 * Defines valid parent-child relationships for JMX elements.
 * Used by serializer to validate element nesting.
 */
export const ELEMENT_HIERARCHY: Record<string, string[]> = {
  TestPlan: ['ThreadGroup', 'HTTPRequestDefaults', 'HeaderManager', 'CookieManager'],
  ThreadGroup: [
    'LoopController',
    'HTTPSamplerProxy',
    'ConstantTimer',
    'UniformRandomTimer',
    'ResponseAssertion',
    'HTTPRequestDefaults',
    'HeaderManager',
    'CookieManager',
  ],
  LoopController: [],
  HTTPRequestDefaults: [],
  HeaderManager: [],
  CookieManager: [],
  HTTPSamplerProxy: ['ResponseAssertion'],
  ConstantTimer: [],
  UniformRandomTimer: [],
  ResponseAssertion: [],
} as const

/**
 * Validates that a child element can be nested within a parent.
 * @param parentType - The parent element type.
 * @param childType - The child element type.
 * @returns true if the nesting is valid.
 */
export function isValidElementNesting(parentType: string, childType: string): boolean {
  const validChildren = ELEMENT_HIERARCHY[parentType]
  return validChildren !== undefined && validChildren.includes(childType)
}

// ============================================================================
// Serialization helpers - converts element model to XML string
// ============================================================================

/**
 * Serializes a JmxTestPlan element to XML.
 */
export function serializeTestPlan(element: JmxTestPlan): string {
  return `<TestPlan guiclass="${element.guiClass}" testclass="${element.testClass}" testname="${xmlEsc(element.name)}" enabled="${element.enabled}">
<stringProp name="TestPlan.comments"></stringProp>
<stringProp name="TestPlan.functional_mode">${element.functionalMode ? 'true' : 'false'}</stringProp>
<boolProp name="TestPlan.serialize_threadgroups">${element.serializeThreadGroups ? 'true' : 'false'}</boolProp>
<elementProp name="TestPlan.user_defined_variables" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
<collectionProp name="Arguments.arguments" />
</elementProp>
</TestPlan>`
}

/**
 * Serializes a JmxThreadGroup element to XML.
 */
export function serializeThreadGroup(element: JmxThreadGroup): string {
  const lc = element.loopController
  return `<ThreadGroup guiclass="${element.guiClass}" testclass="${element.testClass}" testname="${xmlEsc(element.name)}" enabled="${element.enabled}">
<stringProp name="ThreadGroup.on_sample_error">${element.onSampleError}</stringProp>
<elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
<boolProp name="LoopController.continue_forever">${lc.continueForever ? 'true' : 'false'}</boolProp>
<stringProp name="LoopController.loops">${lc.loops}</stringProp>
</elementProp>
<stringProp name="ThreadGroup.num_threads">${element.numThreads}</stringProp>
<stringProp name="ThreadGroup.ramp_time">${element.rampTime}</stringProp>
<boolProp name="ThreadGroup.scheduler">${element.scheduler ? 'true' : 'false'}</boolProp>
<stringProp name="ThreadGroup.duration">${element.duration}</stringProp>
<stringProp name="ThreadGroup.delay"></stringProp>
<boolProp name="ThreadGroup.same_user_on_next_iteration">${element.sameUserOnNextIteration ? 'true' : 'false'}</boolProp>
</ThreadGroup>`
}

/**
 * Serializes a JmxHTTPRequestDefaults element to XML.
 */
export function serializeHTTPRequestDefaults(element: JmxHTTPRequestDefaults): string {
  return `<${element.type} guiclass="${element.guiClass}" testclass="${element.testClass}" testname="${xmlEsc(element.name)}" enabled="${element.enabled}">
<stringProp name="HTTPSampler.domain">${xmlEsc(element.domain)}</stringProp>
<stringProp name="HTTPSampler.port">${xmlEsc(element.port)}</stringProp>
<stringProp name="HTTPSampler.protocol">${xmlEsc(element.protocol)}</stringProp>
</${element.type}>`
}

/**
 * Serializes a JmxHTTPSampler element to XML.
 */
export function serializeHTTPSampler(element: JmxHTTPSampler): string {
  const argsXml = element.arguments
    .map(
      (
        arg
      ) => `<elementProp name="" elementType="HTTPArgument" guiclass="HTTPArgumentGui" testclass="HTTPArgument" testname="Argument" enabled="true">
<boolProp name="HTTPArgument.always_encode">${arg.alwaysEncode ? 'true' : 'false'}</boolProp>
<stringProp name="Argument.name">${xmlEsc(arg.name)}</stringProp>
<stringProp name="Argument.value"><![CDATA[${escapeCdata(arg.value)}]]></stringProp>
<stringProp name="Argument.metadata">=</stringProp>
</elementProp>`
    )
    .join('\n')

  const headersXml =
    element.headers.length === 0
      ? `<elementProp name="HTTPsampler.Headers" elementType="HeaderManager" guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Default Headers" enabled="true">
<collectionProp name="HeaderManager.headers" />
</elementProp>`
      : `<elementProp name="HTTPsampler.Headers" elementType="HeaderManager" guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Default Headers" enabled="true">
<collectionProp name="HeaderManager.headers">
${element.headers
  .map(
    (
      h
    ) => `              <elementProp name="" elementType="Header" guiclass="Header" testclass="Header" testname="${xmlEsc(h.name)}" enabled="true">
<stringProp name="Header.name">${xmlEsc(h.name)}</stringProp>
<stringProp name="Header.value">${xmlEsc(h.value)}</stringProp>
<stringProp name="Header.enabled">${h.enabled ? 'true' : 'false'}</stringProp>
</elementProp>`
  )
  .join('\n')}
</collectionProp>
</elementProp>`

  return `<HTTPSamplerProxy guiclass="${element.guiClass}" testclass="${element.testClass}" testname="${xmlEsc(element.name)}" enabled="${element.enabled}">
<boolProp name="HTTPSampler.postBodyRaw">${element.postBodyRaw ? 'true' : 'false'}</boolProp>
<elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
<collectionProp name="Arguments.arguments">
<elementProp name="" elementType="HTTPArgument" guiclass="HTTPArgumentGui" testclass="HTTPArgument" testname="Argument" enabled="true">
<boolProp name="HTTPArgument.always_encode">false</boolProp>
<stringProp name="Argument.name"></stringProp>
<stringProp name="Argument.value"><![CDATA[${escapeCdata(element.body)}]]></stringProp>
<stringProp name="Argument.metadata">=</stringProp>
</elementProp>
${argsXml}
</collectionProp>
</elementProp>
${element.domain ? `            <stringProp name="HTTPSampler.domain">${xmlEsc(element.domain)}</stringProp>` : ''}
${element.port ? `            <stringProp name="HTTPSampler.port">${xmlEsc(element.port)}</stringProp>` : ''}
${element.protocol ? `            <stringProp name="HTTPSampler.protocol">${xmlEsc(element.protocol)}</stringProp>` : ''}
<stringProp name="HTTPSampler.path">${xmlEsc(element.path)}</stringProp>
<stringProp name="HTTPSampler.method">${xmlEsc(element.method)}</stringProp>
<boolProp name="HTTPSampler.follow_redirects">${element.followRedirects ? 'true' : 'false'}</boolProp>
<boolProp name="HTTPSampler.auto_redirects">false</boolProp>
<boolProp name="HTTPSampler.use_keepalive">${element.useKeepAlive ? 'true' : 'false'}</boolProp>
<boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
<stringProp name="HTTPSampler.embedded_url_re"></stringProp>
<stringProp name="HTTPSampler.connect_timeout"></stringProp>
<stringProp name="HTTPSampler.response_timeout"></stringProp>
${headersXml}
</HTTPSamplerProxy>`
}

/**
 * Serializes a JmxCookieManager element to XML.
 */
export function serializeCookieManager(element: JmxCookieManager): string {
  const cookieXml = element.cookies
    .map(
      (
        c
      ) => `<elementProp name="" elementType="Cookie" guiclass="HTTPPanel" testclass="Cookie" testname="${xmlEsc(c.name)}" enabled="true">
<stringProp name="Cookie.domain">${xmlEsc(c.domain ?? '')}</stringProp>
<stringProp name="Cookie.path">${xmlEsc(c.path ?? '')}</stringProp>
<stringProp name="Cookie.value">${xmlEsc(c.value)}</stringProp>
<stringProp name="Cookie.secure">${c.secure ? 'true' : 'false'}</stringProp>
<boolProp name="Cookie.expires">false</boolProp>
</elementProp>`
    )
    .join('\n')

  return `<${element.type} guiclass="${element.guiClass}" testclass="${element.testClass}" testname="${xmlEsc(element.name)}" enabled="${element.enabled}">
<collectionProp name="CookieManager.cookies">
${cookieXml}
</collectionProp>
<stringProp name="CookieManager.eachCookieIsolate">${element.eachCookieIsolate ? 'true' : 'false'}</stringProp>
</${element.type}>`
}

/**
 * Serializes a JmxConstantTimer element to XML.
 */
export function serializeConstantTimer(element: JmxConstantTimer): string {
  return `<${element.type} guiclass="${element.guiClass}" testclass="${element.testClass}" testname="${xmlEsc(element.name)}" enabled="${element.enabled}">
<stringProp name="${element.type}.delay">${element.delay}</stringProp>
</${element.type}>`
}

/**
 * Serializes a JmxUniformRandomTimer element to XML.
 */
export function serializeUniformRandomTimer(element: JmxUniformRandomTimer): string {
  const delay = element.delay
  const upper = delay + element.range
  return `<${element.type} guiclass="${element.guiClass}" testclass="${element.testClass}" testname="${xmlEsc(element.name)}" enabled="${element.enabled}">
<stringProp name="${element.type}.delay">${delay} ${upper}</stringProp>
</${element.type}>`
}

/**
 * Serializes a JmxResponseAssertion element to XML.
 */
export function serializeResponseAssertion(element: JmxResponseAssertion): string {
  return `<${element.type} guiclass="${element.guiClass}" testclass="${element.testClass}" testname="${xmlEsc(element.name)}" enabled="${element.enabled}">
<collectionProp name="Asserter.urls">
<boolProp name="clear">false</boolProp>
</collectionProp>
<stringProp name="Assertion.test_field">${element.testField}</stringProp>
<stringProp name="Assertion.test_type">${element.testType}</stringProp>
<boolProp name="Assertion.assume_success">${element.ignoreResponseCode ? 'true' : 'false'}</boolProp>
<stringProp name="Assertion.custom_message"></stringProp>
<collectionProp name="Assertion.test_values">
${element.testStrings.map((s) => `<stringProp name="${element.testType}">${xmlEsc(s)}</stringProp>`).join('\n')}
</collectionProp>
<collectionProp name="Asserter.test_configs">
<elementProp name="0" elementType="field">
<boolProp name="IncludeEquality">true</boolProp>
<boolProp name="IncludeRegexp">false</boolProp>
<stringProp name="field">${element.testField}</stringProp>
<stringProp name="match">${element.testStrings[0] ?? ''}</stringProp>
<stringProp name="not">false</stringProp>
</elementProp>
</collectionProp>
</${element.type}>`
}

// ============================================================================
// Utility functions (shared between serialization and existing serializer)
// ============================================================================

export function xmlEsc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function escapeCdata(value: string): string {
  return value.replaceAll(']]>', ']]]]><![CDATA[>')
}
