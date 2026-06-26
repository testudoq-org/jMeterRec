import { describe, it, expect } from 'vitest'
import {
  analyzeRequestDefaults,
  createLoopController,
  createHeaderManager,
  createCookieManager,
  createConstantTimer,
  createUniformRandomTimer,
  createResponseAssertion,
  createDurationAssertion,
  createCacheManager,
  createJSONPostProcessor,
  createRegexExtractor,
  isValidElementNesting,
  ELEMENT_HIERARCHY,
  serializeTestPlan,
  serializeThreadGroup,
  serializeHTTPRequestDefaults,
  serializeHTTPSampler,
  serializeCookieManager,
  serializeConstantTimer,
  serializeUniformRandomTimer,
  serializeResponseAssertion,
  serializeDurationAssertion,
  serializeCacheManager,
  serializeJSONPostProcessor,
  serializeRegexExtractor,
  createTestPlan,
  createThreadGroup,
  createHTTPSampler,
} from './element-model'
import type { CapturedRequest } from '../models/captured-request'

describe('analyzeRequestDefaults', () => {
  it('returns the most frequent host as primary domain', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {},
        queryParams: {},
      },
      {
        id: '2',
        timestamp: '2024-01-01T00:00:01Z',
        method: 'GET',
        url: 'https://api.example.com/posts',
        headers: {},
        queryParams: {},
      },
      {
        id: '3',
        timestamp: '2024-01-01T00:00:02Z',
        method: 'GET',
        url: 'https://other.example.com/items',
        headers: {},
        queryParams: {},
      },
    ]

    const result = analyzeRequestDefaults(requests)

    expect(result.primaryDomain).toBe('api.example.com')
    expect(result.primaryProtocol).toBe('https')
    expect(result.primaryPort).toBe('443')
  })

  it('returns empty strings when all requests are malformed', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'not-a-valid-url',
        headers: {},
        queryParams: {},
      },
    ]

    const result = analyzeRequestDefaults(requests)

    expect(result.primaryDomain).toBe('')
    expect(result.primaryPort).toBe('')
    expect(result.primaryProtocol).toBe('')
  })

  it('returns empty strings for empty request array', () => {
    const result = analyzeRequestDefaults([])

    expect(result.primaryDomain).toBe('')
    expect(result.primaryPort).toBe('')
    expect(result.primaryProtocol).toBe('')
  })

  it('handles mixed ports correctly', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://api.example.com:8443/a',
        headers: {},
        queryParams: {},
      },
      {
        id: '2',
        timestamp: '2024-01-01T00:00:01Z',
        method: 'GET',
        url: 'https://api.example.com:8443/b',
        headers: {},
        queryParams: {},
      },
      {
        id: '3',
        timestamp: '2024-01-01T00:00:02Z',
        method: 'GET',
        url: 'https://api.example.com:443/c',
        headers: {},
        queryParams: {},
      },
    ]

    const result = analyzeRequestDefaults(requests)

    expect(result.primaryDomain).toBe('api.example.com')
    expect(result.primaryPort).toBe('8443')
    expect(result.primaryProtocol).toBe('https')
  })

  it('falls back to default port 443 for https when port is omitted', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {},
        queryParams: {},
      },
    ]

    const result = analyzeRequestDefaults(requests)

    expect(result.primaryPort).toBe('443')
  })

  it('falls back to default port 80 for http when port is omitted', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'http://api.example.com/users',
        headers: {},
        queryParams: {},
      },
    ]

    const result = analyzeRequestDefaults(requests)

    expect(result.primaryPort).toBe('80')
  })

  it('handles mixed protocols by selecting the most frequent', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'https://api.example.com/a',
        headers: {},
        queryParams: {},
      },
      {
        id: '2',
        timestamp: '2024-01-01T00:00:01Z',
        method: 'GET',
        url: 'https://api.example.com/b',
        headers: {},
        queryParams: {},
      },
      {
        id: '3',
        timestamp: '2024-01-01T00:00:02Z',
        method: 'GET',
        url: 'http://api.example.com/c',
        headers: {},
        queryParams: {},
      },
    ]

    const result = analyzeRequestDefaults(requests)

    expect(result.primaryProtocol).toBe('https')
  })

  it('skips malformed URLs and uses valid ones for defaults', () => {
    const requests: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        method: 'GET',
        url: 'not-a-valid-url',
        headers: {},
        queryParams: {},
      },
      {
        id: '2',
        timestamp: '2024-01-01T00:00:01Z',
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {},
        queryParams: {},
      },
    ]

    const result = analyzeRequestDefaults(requests)

    expect(result.primaryDomain).toBe('api.example.com')
    expect(result.primaryProtocol).toBe('https')
    expect(result.primaryPort).toBe('443')
  })
})

describe('JmxLoopController factory', () => {
  it('creates a loop controller with JMeter defaults', () => {
    const loop = createLoopController(5)

    expect(loop.type).toBe('LoopController')
    expect(loop.testClass).toBe('LoopController')
    expect(loop.guiClass).toBe('LoopControlPanel')
    expect(loop.name).toBe('Loop Controller')
    expect(loop.enabled).toBe(true)
    expect(loop.continueForever).toBe(false)
    expect(loop.loops).toBe(5)
  })

  it('uses custom name when provided', () => {
    const loop = createLoopController(10, 'My Loop')

    expect(loop.name).toBe('My Loop')
  })
})

describe('JmxHeaderManager factory', () => {
  it('creates a header manager with given headers', () => {
    const headers = { 'User-Agent': 'TestAgent', Accept: 'application/json' }
    const mgr = createHeaderManager(headers)

    expect(mgr.type).toBe('HeaderManager')
    expect(mgr.testClass).toBe('HeaderManager')
    expect(mgr.headers).toHaveLength(2)
    expect(mgr.headers[0]).toEqual({
      name: 'User-Agent',
      value: 'TestAgent',
      enabled: true,
    })
  })

  it('creates empty header manager for no headers', () => {
    const mgr = createHeaderManager({})

    expect(mgr.headers).toHaveLength(0)
  })
})

describe('JmxCookieManager factory', () => {
  it('creates a cookie manager with given cookies', () => {
    const cookies = [{ name: 'session', value: 'abc123' }]
    const mgr = createCookieManager(cookies)

    expect(mgr.type).toBe('CookieManager')
    expect(mgr.testClass).toBe('CookieManager')
    expect(mgr.eachCookieIsolate).toBe(false)
    expect(mgr.cookies).toContainEqual({
      name: 'session',
      value: 'abc123',
      domain: '',
      path: '',
      secure: false,
    })
  })
})

describe('JmxConstantTimer factory', () => {
  it('creates a constant timer with given delay', () => {
    const timer = createConstantTimer(5000)

    expect(timer.type).toBe('ConstantTimer')
    expect(timer.delay).toBe(5000)
  })
})

describe('JmxUniformRandomTimer factory', () => {
  it('creates a uniform random timer with calculated range', () => {
    const timer = createUniformRandomTimer(1000, 20)

    expect(timer.type).toBe('UniformRandomTimer')
    expect(timer.delay).toBe(800) // 1000 * (1 - 0.20)
    expect(timer.range).toBe(400) // 1200 - 800
  })
})

describe('JmxResponseAssertion factory', () => {
  it('creates an assertion for status code', () => {
    const assertion = createResponseAssertion(200)

    expect(assertion.type).toBe('ResponseAssertion')
    expect(assertion.testField).toBe('Assertion.response_code')
    expect(assertion.testStrings).toContain('200')
  })
})

describe('JmxDurationAssertion factory', () => {
  it('creates an assertion with given duration', () => {
    const assertion = createDurationAssertion(5000)

    expect(assertion.type).toBe('DurationAssertion')
    expect(assertion.durationMs).toBe(5000)
  })
})

describe('JmxCacheManager factory', () => {
  it('creates a cache manager with default values', () => {
    const mgr = createCacheManager()

    expect(mgr.type).toBe('CacheManager')
    expect(mgr.clearEachIteration).toBe(false)
    expect(mgr.maxNumberOfResults).toBe(500)
  })

  it('accepts custom values', () => {
    const mgr = createCacheManager(true, 1000)

    expect(mgr.clearEachIteration).toBe(true)
    expect(mgr.maxNumberOfResults).toBe(1000)
  })
})

describe('JmxJSONPostProcessor factory', () => {
  it('creates a JSON extractor with given expressions', () => {
    const extractor = createJSONPostProcessor('token', '$.token')

    expect(extractor.type).toBe('json')
    expect(extractor.refNames).toBe('token')
    expect(extractor.jsonPathExpressions).toBe('$.token')
    expect(extractor.defaultValues).toBe('')
    expect(extractor.matchNumbers).toBe('1')
  })
})

describe('JmxRegexExtractor factory', () => {
  it('creates a regex extractor with default template', () => {
    const extractor = createRegexExtractor('orderId', 'Order #(\\d+)')

    expect(extractor.type).toBe('regex')
    expect(extractor.refname).toBe('orderId')
    expect(extractor.regex).toBe('Order #(\\d+)')
    expect(extractor.template).toBe('$1$')
    expect(extractor.matchNumber).toBe('1')
  })

  it('accepts custom template and match number', () => {
    const extractor = createRegexExtractor('id', 'id=(\\w+)', 'fallback', '2', '$2$')

    expect(extractor.template).toBe('$2$')
    expect(extractor.matchNumber).toBe('2')
    expect(extractor.defaultValue).toBe('fallback')
  })
})

describe('ELEMENT_HIERARCHY', () => {
  it('defines valid children for TestPlan', () => {
    expect(ELEMENT_HIERARCHY.TestPlan).toContain('ThreadGroup')
    expect(ELEMENT_HIERARCHY.TestPlan).toContain('HTTPRequestDefaults')
  })

  it('allows samplers inside ThreadGroup', () => {
    expect(ELEMENT_HIERARCHY.ThreadGroup).toContain('HTTPSamplerProxy')
  })

  it('allows assertions inside HTTPSamplerProxy', () => {
    expect(ELEMENT_HIERARCHY.HTTPSamplerProxy).toContain('ResponseAssertion')
  })

  it('allows DurationAssertion inside HTTPSamplerProxy', () => {
    expect(ELEMENT_HIERARCHY.HTTPSamplerProxy).toContain('DurationAssertion')
  })

  it('allows JSONPostProcessor inside HTTPSamplerProxy', () => {
    expect(ELEMENT_HIERARCHY.HTTPSamplerProxy).toContain('JSONPostProcessor')
  })

  it('allows RegexExtractor inside HTTPSamplerProxy', () => {
    expect(ELEMENT_HIERARCHY.HTTPSamplerProxy).toContain('RegexExtractor')
  })

  it('allows CacheManager inside ThreadGroup', () => {
    expect(ELEMENT_HIERARCHY.ThreadGroup).toContain('CacheManager')
  })

  it('rejects invalid nesting', () => {
    expect(isValidElementNesting('HTTPRequestDefaults', 'HTTPSamplerProxy')).toBe(false)
    expect(isValidElementNesting('TestPlan', 'ResponseAssertion')).toBe(false)
    expect(isValidElementNesting('HTTPSamplerProxy', 'ThreadGroup')).toBe(false)
  })

  it('validates valid nesting', () => {
    expect(isValidElementNesting('ThreadGroup', 'HTTPSamplerProxy')).toBe(true)
    expect(isValidElementNesting('HTTPSamplerProxy', 'ResponseAssertion')).toBe(true)
    expect(isValidElementNesting('ThreadGroup', 'CacheManager')).toBe(true)
    expect(isValidElementNesting('HTTPSamplerProxy', 'DurationAssertion')).toBe(true)
    expect(isValidElementNesting('HTTPSamplerProxy', 'JSONPostProcessor')).toBe(true)
    expect(isValidElementNesting('HTTPSamplerProxy', 'RegexExtractor')).toBe(true)
  })
})

describe('Serialization functions', () => {
  it('serializeTestPlan produces valid XML with default values', () => {
    const plan: {
      type: 'TestPlan'
      testClass: 'TestPlan'
      guiClass: 'TestPlanGui'
      name: string
      enabled: boolean
      functionalMode: boolean
      serializeThreadGroups: boolean
      userDefinedVariables: Array<{ name: string; value: string }>
    } = {
      type: 'TestPlan',
      testClass: 'TestPlan',
      guiClass: 'TestPlanGui',
      name: 'My Test Plan',
      enabled: true,
      functionalMode: false,
      serializeThreadGroups: false,
      userDefinedVariables: [],
    }

    const xml = serializeTestPlan(plan)

    expect(xml).toContain('testclass="TestPlan"')
    expect(xml).toContain('testname="My Test Plan"')
    expect(xml).toContain('functional_mode">false')
    expect(xml).toContain('serialize_threadgroups">false')
  })

  it('serializeThreadGroup produces valid XML with loop controller', () => {
    const tg = {
      type: 'ThreadGroup',
      testClass: 'ThreadGroup',
      guiClass: 'ThreadGroupGui',
      name: 'Thread Group',
      enabled: true,
      onSampleError: 'continue' as const,
      numThreads: 5,
      rampTime: 10,
      scheduler: false,
      duration: '',
      delay: '',
      sameUserOnNextIteration: true,
      loopController: createLoopController(10),
    } as const

    const xml = serializeThreadGroup(tg)

    expect(xml).toContain('testclass="ThreadGroup"')
    expect(xml).toContain('num_threads">5')
    expect(xml).toContain('ramp_time">10')
    expect(xml).toContain('loops">10')
  })

  it('serializeHTTPRequestDefaults produces valid XML', () => {
    const defaults = {
      type: 'HTTPRequestDefaults',
      testClass: 'org.apache.jmeter.config.ConfigTestElement',
      guiClass: 'org.apache.jmeter.protocol.http.config.gui.HttpDefaultsGui',
      name: 'HTTP Request Defaults',
      enabled: true,
      domain: 'api.example.com',
      port: '443',
      protocol: 'https',
    } as const

    const xml = serializeHTTPRequestDefaults(defaults)

    // The element tag must be ConfigTestElement (not HTTPRequestDefaults) for JMeter compatibility
    expect(xml).toContain(
      '<ConfigTestElement guiclass="org.apache.jmeter.protocol.http.config.gui.HttpDefaultsGui"'
    )
    expect(xml).toContain('HTTPSampler.domain">api.example.com')
    expect(xml).toContain('HTTPSampler.port">443')
    expect(xml).toContain('HTTPSampler.protocol">https')
    // Verify the Arguments element is present (matches JMeter template)
    expect(xml).toContain('HTTPsampler.Arguments')
  })

  it('serializeHTTPSampler omits inherited properties when empty', () => {
    const sampler: {
      type: 'HTTPSamplerProxy'
      testClass: 'HTTPSamplerProxy'
      guiClass: 'HttpTestSampleGui'
      name: string
      enabled: boolean
      domain: string
      port: string
      protocol: string
      path: string
      method: string
      followRedirects: boolean
      useKeepAlive: boolean
      postBodyRaw: boolean
      arguments: Array<{ name: string; value: string; alwaysEncode: boolean }>
      headers: Array<{ name: string; value: string; enabled: boolean }>
      body: string
    } = {
      type: 'HTTPSamplerProxy',
      testClass: 'HTTPSamplerProxy',
      guiClass: 'HttpTestSampleGui',
      name: 'GET api.example.com/users #0',
      enabled: true,
      domain: '',
      port: '',
      protocol: '',
      path: '/users',
      method: 'GET',
      followRedirects: true,
      useKeepAlive: true,
      postBodyRaw: false,
      arguments: [{ name: '', value: '', alwaysEncode: false }],
      headers: [],
      body: '',
    }

    const xml = serializeHTTPSampler(sampler)

    expect(xml).toContain('testclass="HTTPSamplerProxy"')
    expect(xml).toContain('HTTPSampler.path">/users')
    // Should NOT contain domain/port/protocol when empty (inheritance from defaults)
    expect(xml).not.toContain('HTTPSampler.domain">api')
  })

  it('serializeHTTPSampler includes properties when provided', () => {
    const sampler: {
      type: 'HTTPSamplerProxy'
      testClass: 'HTTPSamplerProxy'
      guiClass: 'HttpTestSampleGui'
      name: string
      enabled: boolean
      domain: string
      port: string
      protocol: string
      path: string
      method: string
      followRedirects: boolean
      useKeepAlive: boolean
      postBodyRaw: boolean
      arguments: Array<{ name: string; value: string; alwaysEncode: boolean }>
      headers: Array<{ name: string; value: string; enabled: boolean }>
      body: string
    } = {
      type: 'HTTPSamplerProxy',
      testClass: 'HTTPSamplerProxy',
      guiClass: 'HttpTestSampleGui',
      name: 'GET api.example.com/users #0',
      enabled: true,
      domain: 'api.example.com',
      port: '443',
      protocol: 'https',
      path: '/users',
      method: 'GET',
      followRedirects: true,
      useKeepAlive: true,
      postBodyRaw: false,
      arguments: [{ name: '', value: '', alwaysEncode: false }],
      headers: [],
      body: '',
    }

    const xml = serializeHTTPSampler(sampler)

    expect(xml).toContain('HTTPSampler.domain">api.example.com')
    expect(xml).toContain('HTTPSampler.port">443')
    expect(xml).toContain('HTTPSampler.protocol">https')
  })

  it('serializeHTTPSampler escapes XML special characters', () => {
    const sampler: {
      type: 'HTTPSamplerProxy'
      testClass: 'HTTPSamplerProxy'
      guiClass: 'HttpTestSampleGui'
      name: string
      enabled: boolean
      domain: string
      port: string
      protocol: string
      path: string
      method: string
      followRedirects: boolean
      useKeepAlive: boolean
      postBodyRaw: boolean
      arguments: Array<{ name: string; value: string; alwaysEncode: boolean }>
      headers: Array<{ name: string; value: string; enabled: boolean }>
      body: string
    } = {
      type: 'HTTPSamplerProxy',
      testClass: 'HTTPSamplerProxy',
      guiClass: 'HttpTestSampleGui',
      name: 'GET <test> & "demo" #0',
      enabled: true,
      domain: 'test.com',
      port: '443',
      protocol: 'https',
      path: '/users',
      method: 'GET',
      followRedirects: true,
      useKeepAlive: true,
      postBodyRaw: false,
      arguments: [
        { name: '', value: 'test & value', alwaysEncode: false },
        { name: '', value: '', alwaysEncode: false },
      ],
      headers: [],
      body: 'data with <special> chars',
    }

    const xml = serializeHTTPSampler(sampler)

    expect(xml).toContain('testname="GET &lt;test&gt; &amp; &quot;demo&quot; #0"')
    expect(xml).toContain('<![CDATA[test & value]]>')
    expect(xml).toContain('<![CDATA[data with <special> chars]]>')
  })

  it('serializeCookieManager produces valid XML for cookies', () => {
    const mgr = createCookieManager([{ name: 'sessionId', value: 'abc123' }])

    const xml = serializeCookieManager(mgr)

    expect(xml).toContain('testclass="CookieManager"')
    expect(xml).toContain('Cookie.value">abc123')
    expect(xml).toContain('eachCookieIsolate">false')
  })

  it('serializeCookieManager handles empty cookies', () => {
    const mgr = createCookieManager([])

    const xml = serializeCookieManager(mgr)

    expect(xml).toContain('testclass="CookieManager"')
    expect(xml).toContain('CookieManager.cookies')
  })

  it('serializeConstantTimer produces valid XML', () => {
    const timer = createConstantTimer(1000)

    const xml = serializeConstantTimer(timer)

    expect(xml).toContain('testclass="ConstantTimer"')
    expect(xml).toContain('delay">1000')
  })

  it('serializeUniformRandomTimer calculates and formats range', () => {
    const timer = createUniformRandomTimer(1000, 20) // delay: 800, range: 400

    const xml = serializeUniformRandomTimer(timer)

    expect(xml).toContain('testclass="UniformRandomTimer"')
    expect(xml).toContain('delay">800 1200')
  })

  it('serializeResponseAssertion produces valid XML', () => {
    const assertion = createResponseAssertion(200)

    const xml = serializeResponseAssertion(assertion)

    expect(xml).toContain('testclass="ResponseAssertion"')
    expect(xml).toContain('Assertion.test_field">Assertion.response_code')
    expect(xml).toContain('test_values">')
    expect(xml).toContain('stringProp name="200">200')
  })

  it('serializeDurationAssertion produces valid XML', () => {
    const assertion = createDurationAssertion(5000)

    const xml = serializeDurationAssertion(assertion)

    expect(xml).toContain('testclass="DurationAssertion"')
    expect(xml).toContain('duration">5000')
  })

  it('serializeCacheManager produces valid XML', () => {
    const mgr = createCacheManager()

    const xml = serializeCacheManager(mgr)

    expect(xml).toContain('testclass="CacheManager"')
    expect(xml).toContain('clearEachIteration">false')
    expect(xml).toContain('maxNumberOfResults">500')
  })

  it('serializeJSONPostProcessor produces valid XML', () => {
    const extractor = createJSONPostProcessor('token', '$.token', '', '1')

    const xml = serializeJSONPostProcessor(extractor)

    expect(xml).toContain('testclass="JSONPostProcessor"')
    expect(xml).toContain('referenceNames">token')
    expect(xml).toContain('jsonPathExpressions">$.token')
    expect(xml).toContain('match_numbers">1')
  })

  it('serializeRegexExtractor produces valid XML and escapes regex as CDATA', () => {
    const extractor = createRegexExtractor('orderId', 'Order #(\\d+)')

    const xml = serializeRegexExtractor(extractor)

    expect(xml).toContain('testclass="RegexExtractor"')
    expect(xml).toContain('refname">orderId')
    expect(xml).toContain('<![CDATA[Order #(\\d+)]]>')
    expect(xml).toContain('template">$1$')
    expect(xml).toContain('match_number">1')
  })
})

describe('Model factory functions', () => {
  it('createTestPlan creates element with JMeter defaults', () => {
    const plan = createTestPlan('My Plan')

    expect(plan.type).toBe('TestPlan')
    expect(plan.testClass).toBe('TestPlan')
    expect(plan.guiClass).toBe('TestPlanGui')
    expect(plan.name).toBe('My Plan')
    expect(plan.enabled).toBe(true)
    expect(plan.functionalMode).toBe(false)
    expect(plan.serializeThreadGroups).toBe(false)
    expect(plan.userDefinedVariables).toEqual([])
  })

  it('createThreadGroup creates element with loop controller', () => {
    const tg = createThreadGroup({ threads: 5, rampUp: 10, loops: 3 })

    expect(tg.type).toBe('ThreadGroup')
    expect(tg.testClass).toBe('ThreadGroup')
    expect(tg.guiClass).toBe('ThreadGroupGui')
    expect(tg.numThreads).toBe(5)
    expect(tg.rampTime).toBe(10)
    expect(tg.loopController.loops).toBe(3)
    expect(tg.loopController.continueForever).toBe(false)
  })

  it('createHTTPSampler creates element from captured request', () => {
    const req: CapturedRequest = {
      id: '1',
      timestamp: '2024-01-01T00:00:00Z',
      method: 'GET',
      url: 'https://api.example.com/users?id=123',
      headers: { Accept: 'application/json' },
      queryParams: { id: '123' },
    }

    const sampler = createHTTPSampler(req, 0, { Accept: 'application/json' })

    expect(sampler.type).toBe('HTTPSamplerProxy')
    expect(sampler.method).toBe('GET')
    expect(sampler.path).toBe('/users')
    expect(sampler.domain).toBe('api.example.com')
    // When no defaults provided, port is included
    expect(sampler.port).toBe('443')
    expect(sampler.protocol).toBe('https')
    expect(sampler.headers).toHaveLength(1)
    expect(sampler.arguments).toHaveLength(2) // body + query param
  })

  it('createHTTPSampler inherits domain when defaults match', () => {
    const req: CapturedRequest = {
      id: '1',
      timestamp: '2024-01-01T00:00:00Z',
      method: 'GET',
      url: 'https://api.example.com/users',
      headers: {},
      queryParams: {},
    }

    const sampler = createHTTPSampler(
      req,
      0,
      {},
      { domain: 'api.example.com', port: '443', protocol: 'https' }
    )

    // When defaults match, domain/port/protocol should be empty (inherited)
    expect(sampler.domain).toBe('')
    expect(sampler.port).toBe('')
    expect(sampler.protocol).toBe('')
  })

  it('createHTTPSampler includes cross-host override when defaults differ', () => {
    const req: CapturedRequest = {
      id: '1',
      timestamp: '2024-01-01T00:00:00Z',
      method: 'GET',
      // Use HTTP instead of HTTPS to test protocol override
      url: 'http://other.example.com:8080/items',
      headers: {},
      queryParams: {},
    }

    const sampler = createHTTPSampler(
      req,
      0,
      {},
      { domain: 'api.example.com', port: '443', protocol: 'https' }
    )

    // When defaults differ, domain/port/protocol should be included
    expect(sampler.domain).toBe('other.example.com')
    expect(sampler.port).toBe('8080') // Port differs, so included
    expect(sampler.protocol).toBe('http') // Protocol differs, so included
  })

  it('createHTTPSampler inherits protocol when it matches defaults', () => {
    const req: CapturedRequest = {
      id: '1',
      timestamp: '2024-01-01T00:00:00Z',
      method: 'GET',
      url: 'https://other.example.com:8080/items',
      headers: {},
      queryParams: {},
    }

    const sampler = createHTTPSampler(
      req,
      0,
      {},
      { domain: 'api.example.com', port: '443', protocol: 'https' }
    )

    // Protocol matches defaults, so inherited
    expect(sampler.domain).toBe('other.example.com')
    expect(sampler.port).toBe('8080') // Port differs, so included
    expect(sampler.protocol).toBe('') // Protocol matches, so inherited
  })
})
