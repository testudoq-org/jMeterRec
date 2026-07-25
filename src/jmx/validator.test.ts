import { JSDOM } from 'jsdom'
import { describe, expect, it, beforeEach } from 'vitest'
import { JMXValidator, type ValidationReport, type ValidationMessage } from './validator'

// ============================================================================
// DOMParser shim for node test environment
// ============================================================================

beforeEach(() => {
  const window = new JSDOM('').window as unknown as { DOMParser: new () => unknown }
  ;(globalThis as Record<string, unknown>).DOMParser = window.DOMParser
})

// ============================================================================
// JMX fixtures (inline, per spec §9.2)
// ============================================================================

const VALID_MINIMAL = `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
<hashTree>
<TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="My Plan" enabled="true">
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
<stringProp name="LoopController.loops">1</stringProp>
</elementProp>
<stringProp name="ThreadGroup.num_threads">10</stringProp>
<stringProp name="ThreadGroup.ramp_time">5</stringProp>
<boolProp name="ThreadGroup.scheduler">false</boolProp>
<stringProp name="ThreadGroup.duration"></stringProp>
<stringProp name="ThreadGroup.delay"></stringProp>
<boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
</ThreadGroup>
<hashTree>
<HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="GET example.com #0" enabled="true">
<boolProp name="HTTPSampler.postBodyRaw">false</boolProp>
<elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
<collectionProp name="Arguments.arguments">
<elementProp name="" elementType="HTTPArgument" guiclass="HTTPArgumentGui" testclass="HTTPArgument" testname="Argument" enabled="true">
<boolProp name="HTTPArgument.always_encode">false</boolProp>
<stringProp name="Argument.name"></stringProp>
<stringProp name="Argument.value"></stringProp>
<stringProp name="Argument.metadata">=</stringProp>
</elementProp>
</collectionProp>
</elementProp>
<stringProp name="HTTPSampler.domain">example.com</stringProp>
<stringProp name="HTTPSampler.port">80</stringProp>
<stringProp name="HTTPSampler.protocol">http</stringProp>
<stringProp name="HTTPSampler.path">/api</stringProp>
<stringProp name="HTTPSampler.method">GET</stringProp>
<boolProp name="HTTPSampler.follow_redirects">true</boolProp>
<boolProp name="HTTPSampler.auto_redirects">false</boolProp>
<boolProp name="HTTPSampler.use_keepalive">true</boolProp>
<boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
<stringProp name="HTTPSampler.embedded_url_re"></stringProp>
<stringProp name="HTTPSampler.connect_timeout"></stringProp>
<stringProp name="HTTPSampler.response_timeout"></stringProp>
<elementProp name="HTTPsampler.Headers" elementType="HeaderManager" guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Default Headers" enabled="true">
<collectionProp name="HeaderManager.headers" />
</elementProp>
</HTTPSamplerProxy>
<hashTree/>
</hashTree>
</hashTree>
</hashTree>
</jmeterTestPlan>`

const INVALID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan>
<hashTree>
<TestPlan>
</jmeterTestPlan>`

const MISSING_THREADGROUP = `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
<hashTree>
<TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Plan" enabled="true">
<stringProp name="TestPlan.comments"></stringProp>
<stringProp name="TestPlan.functional_mode">false</stringProp>
<boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
<elementProp name="TestPlan.user_defined_variables" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
<collectionProp name="Arguments.arguments" />
</elementProp>
</TestPlan>
<hashTree>
</hashTree>
</hashTree>
</jmeterTestPlan>`

const INVALID_NESTING = `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
<hashTree>
<TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Plan" enabled="true">
<stringProp name="TestPlan.comments"></stringProp>
<stringProp name="TestPlan.functional_mode">false</stringProp>
<boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
<elementProp name="TestPlan.user_defined_variables" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
<collectionProp name="Arguments.arguments" />
</elementProp>
</TestPlan>
<hashTree>
<HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Bad" enabled="true">
<boolProp name="HTTPSampler.postBodyRaw">false</boolProp>
<elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
<collectionProp name="Arguments.arguments">
<elementProp name="" elementType="HTTPArgument" guiclass="HTTPArgumentGui" testclass="HTTPArgument" testname="Argument" enabled="true">
<boolProp name="HTTPArgument.always_encode">false</boolProp>
<stringProp name="Argument.name"></stringProp>
<stringProp name="Argument.value"></stringProp>
<stringProp name="Argument.metadata">=</stringProp>
</elementProp>
</collectionProp>
</elementProp>
<stringProp name="HTTPSampler.domain">example.com</stringProp>
<stringProp name="HTTPSampler.port">80</stringProp>
<stringProp name="HTTPSampler.protocol">http</stringProp>
<stringProp name="HTTPSampler.path">/api</stringProp>
<stringProp name="HTTPSampler.method">GET</stringProp>
<boolProp name="HTTPSampler.follow_redirects">true</boolProp>
<boolProp name="HTTPSampler.auto_redirects">false</boolProp>
<boolProp name="HTTPSampler.use_keepalive">true</boolProp>
<boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
<stringProp name="HTTPSampler.embedded_url_re"></stringProp>
<stringProp name="HTTPSampler.connect_timeout"></stringProp>
<stringProp name="HTTPSampler.response_timeout"></stringProp>
<elementProp name="HTTPsampler.Headers" elementType="HeaderManager" guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Default Headers" enabled="true">
<collectionProp name="HeaderManager.headers" />
</elementProp>
</HTTPSamplerProxy>
<hashTree/>
</hashTree>
</hashTree>
</jmeterTestPlan>`

const HIGH_THREADS = VALID_MINIMAL.replace(
  'ThreadGroup.num_threads">10</stringProp',
  'ThreadGroup.num_threads">6000</stringProp'
)

const EMPTY_PLAN_NAME = VALID_MINIMAL.replace('testname="My Plan"', 'testname=""')

const ZERO_THREADS = VALID_MINIMAL.replace(
  'ThreadGroup.num_threads">10</stringProp',
  'ThreadGroup.num_threads">0</stringProp'
)

const MISSING_PATH = VALID_MINIMAL.replace(
  'HTTPSampler.path">/api</stringProp',
  'HTTPSampler.path"></stringProp'
)

const MISSING_METHOD = VALID_MINIMAL.replace(
  'HTTPSampler.method">GET</stringProp',
  'HTTPSampler.method"></stringProp'
)

const UNKNOWN_METHOD = VALID_MINIMAL.replace(
  'HTTPSampler.method">GET</stringProp',
  'HTTPSampler.method">TRACE</stringProp'
)

const MISSING_DOMAIN_ONLY = VALID_MINIMAL.replace(
  '<stringProp name="HTTPSampler.domain">example.com</stringProp>',
  '<stringProp name="HTTPSampler.domain"></stringProp>'
)

const MISSING_PROTOCOL_ONLY = VALID_MINIMAL.replace(
  '<stringProp name="HTTPSampler.protocol">http</stringProp>',
  '<stringProp name="HTTPSampler.protocol"></stringProp>'
)

const MISSING_DOMAIN_AND_PROTOCOL = VALID_MINIMAL.replace(
  '<stringProp name="HTTPSampler.domain">example.com</stringProp>',
  '<stringProp name="HTTPSampler.domain"></stringProp>'
).replace(
  '<stringProp name="HTTPSampler.protocol">http</stringProp>',
  '<stringProp name="HTTPSampler.protocol"></stringProp>'
)

// FIXTURE: ConfigTestElement provides inherited domain only (no protocol).
// The HTTPSamplerProxy has empty protocol but inherits domain — missing-domain
// should NOT fire, missing-protocol SHOULD fire.
const CONFIG_TEST_ELEMENT_DOMAIN_ONLY = `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
<hashTree>
<TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Plan" enabled="true">
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
<stringProp name="LoopController.loops">1</stringProp>
</elementProp>
<stringProp name="ThreadGroup.num_threads">1</stringProp>
<stringProp name="ThreadGroup.ramp_time">1</stringProp>
<boolProp name="ThreadGroup.scheduler">false</boolProp>
<stringProp name="ThreadGroup.duration"></stringProp>
<stringProp name="ThreadGroup.delay"></stringProp>
<boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
</ThreadGroup>
<hashTree>
<ConfigTestElement guiclass="org.apache.jmeter.protocol.http.config.gui.HttpDefaultsGui" testclass="org.apache.jmeter.config.ConfigTestElement" testname="HTTP Request Defaults" enabled="true">
<stringProp name="HTTPSampler.domain">example.com</stringProp>
<stringProp name="HTTPSampler.port">443</stringProp>
</ConfigTestElement>
<hashTree/>
<HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="GET /api" enabled="true">
<boolProp name="HTTPSampler.postBodyRaw">false</boolProp>
<elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
<collectionProp name="Arguments.arguments" />
</elementProp>
<stringProp name="HTTPSampler.domain"></stringProp>
<stringProp name="HTTPSampler.port"></stringProp>
<stringProp name="HTTPSampler.protocol"></stringProp>
<stringProp name="HTTPSampler.path">/api</stringProp>
<stringProp name="HTTPSampler.method">GET</stringProp>
</HTTPSamplerProxy>
<hashTree/>
</hashTree>
</hashTree>
</hashTree>
</jmeterTestPlan>`

// FIXTURE: ConfigTestElement provides inherited protocol only (no domain).
// The HTTPSamplerProxy has empty domain but inherits protocol — missing-protocol
// should NOT fire, missing-domain SHOULD fire.
const CONFIG_TEST_ELEMENT_PROTOCOL_ONLY = `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
<hashTree>
<TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Plan" enabled="true">
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
<stringProp name="LoopController.loops">1</stringProp>
</elementProp>
<stringProp name="ThreadGroup.num_threads">1</stringProp>
<stringProp name="ThreadGroup.ramp_time">1</stringProp>
<boolProp name="ThreadGroup.scheduler">false</boolProp>
<stringProp name="ThreadGroup.duration"></stringProp>
<stringProp name="ThreadGroup.delay"></stringProp>
<boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
</ThreadGroup>
<hashTree>
<ConfigTestElement guiclass="org.apache.jmeter.protocol.http.config.gui.HttpDefaultsGui" testclass="org.apache.jmeter.config.ConfigTestElement" testname="HTTP Request Defaults" enabled="true">
<stringProp name="HTTPSampler.protocol">https</stringProp>
<stringProp name="HTTPSampler.port">443</stringProp>
</ConfigTestElement>
<hashTree/>
<HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="GET /api" enabled="true">
<boolProp name="HTTPSampler.postBodyRaw">false</boolProp>
<elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
<collectionProp name="Arguments.arguments" />
</elementProp>
<stringProp name="HTTPSampler.domain"></stringProp>
<stringProp name="HTTPSampler.port"></stringProp>
<stringProp name="HTTPSampler.protocol"></stringProp>
<stringProp name="HTTPSampler.path">/api</stringProp>
<stringProp name="HTTPSampler.method">GET</stringProp>
</HTTPSamplerProxy>
<hashTree/>
</hashTree>
</hashTree>
</hashTree>
</jmeterTestPlan>`

const DEPRECATED_TAG = VALID_MINIMAL.replace(
  '<HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="GET example.com #0" enabled="true">',
  '<HTTPRequestDefaults guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="GET example.com #0" enabled="true">'
).replace('</HTTPSamplerProxy>', '</HTTPRequestDefaults>')

const NO_ASSERTIONS = VALID_MINIMAL
const NO_THINK_TIME = VALID_MINIMAL

const HIGH_LOOP_COUNT = VALID_MINIMAL.replace(
  'LoopController.loops">1</stringProp>',
  'LoopController.loops">5000</stringProp>'
)

const MISSING_CSV_FILENAME = `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
<hashTree>
<TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Plan" enabled="true">
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
<stringProp name="LoopController.loops">1</stringProp>
</elementProp>
<stringProp name="ThreadGroup.num_threads">1</stringProp>
<stringProp name="ThreadGroup.ramp_time">1</stringProp>
<boolProp name="ThreadGroup.scheduler">false</boolProp>
<stringProp name="ThreadGroup.duration"></stringProp>
<stringProp name="ThreadGroup.delay"></stringProp>
<boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
</ThreadGroup>
<hashTree>
<CSVDataSet guiclass="TestBeanGUI" testclass="CSVDataSet" testname="CSV Data Set" enabled="true">
<stringProp name="filename"></stringProp>
<stringProp name="fileEncoding"></stringProp>
<stringProp name="variableNames"></stringProp>
<stringProp name="delimiter">,</stringProp>
<boolProp name="quotedData">false</boolProp>
<boolProp name="recycle">true</boolProp>
<boolProp name="stopThread">false</boolProp>
<boolProp name="shareMode">shareMode.all</boolProp>
</CSVDataSet>
<hashTree/>
</hashTree>
</hashTree>
</hashTree>
</jmeterTestPlan>`

// ============================================================================
// Helpers
// ============================================================================

const validator = new JMXValidator()

function assertReport(report: ValidationReport): void {
  expect(report).toHaveProperty('valid')
  expect(report).toHaveProperty('errors')
  expect(report).toHaveProperty('warnings')
  expect(report).toHaveProperty('info')
  expect(Array.isArray(report.errors)).toBe(true)
  expect(Array.isArray(report.warnings)).toBe(true)
  expect(Array.isArray(report.info)).toBe(true)
}

function countByRuleId(messages: ValidationMessage[], ruleId: string): number {
  return messages.filter((m) => m.ruleId === ruleId).length
}

// FIXTURE: ConfigTestElement (HTTP Request Defaults) with inherited values.
// The HTTPSamplerProxy has empty domain/protocol but inherits from the
// ConfigTestElement — missing-domain-protocol should NOT fire.
const CONFIG_TEST_ELEMENT_INHERITANCE = `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
<hashTree>
<TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Plan" enabled="true">
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
<stringProp name="LoopController.loops">1</stringProp>
</elementProp>
<stringProp name="ThreadGroup.num_threads">1</stringProp>
<stringProp name="ThreadGroup.ramp_time">1</stringProp>
<boolProp name="ThreadGroup.scheduler">false</boolProp>
<stringProp name="ThreadGroup.duration"></stringProp>
<stringProp name="ThreadGroup.delay"></stringProp>
<boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
</ThreadGroup>
<hashTree>
<ConfigTestElement guiclass="org.apache.jmeter.protocol.http.config.gui.HttpDefaultsGui" testclass="org.apache.jmeter.config.ConfigTestElement" testname="HTTP Request Defaults" enabled="true">
<stringProp name="HTTPSampler.domain">example.com</stringProp>
<stringProp name="HTTPSampler.port">443</stringProp>
<stringProp name="HTTPSampler.protocol">https</stringProp>
</ConfigTestElement>
<hashTree/>
<HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="GET /api" enabled="true">
<boolProp name="HTTPSampler.postBodyRaw">false</boolProp>
<elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
<collectionProp name="Arguments.arguments" />
</elementProp>
<stringProp name="HTTPSampler.domain"></stringProp>
<stringProp name="HTTPSampler.port"></stringProp>
<stringProp name="HTTPSampler.protocol"></stringProp>
<stringProp name="HTTPSampler.path">/api</stringProp>
<stringProp name="HTTPSampler.method">GET</stringProp>
</HTTPSamplerProxy>
<hashTree/>
</hashTree>
</hashTree>
</hashTree>
</jmeterTestPlan>`

// FIXTURE: TestPlan with testname attribute set but no TestPlan.name stringProp.
// empty-plan-name should NOT fire since the name comes from the attribute.
const PLAN_NAME_FROM_ATTRIBUTE = VALID_MINIMAL.replace(
  '<stringProp name="TestPlan.comments"></stringProp>',
  ''
).replace(
  '<TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="My Plan" enabled="true">',
  '<TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Inherited Name" enabled="true">'
)

// ============================================================================
// Tests
// ============================================================================

describe('JMXValidator syntax layer', () => {
  it('returns errors for malformed XML', () => {
    const report = validator.validate(INVALID_XML)
    assertReport(report)
    expect(report.valid).toBe(false)
    expect(report.errors.some((m) => m.ruleId === 'malformed-xml')).toBe(true)
    expect(report.warnings).toHaveLength(0)
    expect(report.info).toHaveLength(0)
  })

  it('returns a valid report for well-formed XML', () => {
    const report = validator.validate(VALID_MINIMAL)
    assertReport(report)
    expect(report.errors).toHaveLength(0)
  })
})

describe('JMXValidator structural layer', () => {
  it('reports missing ThreadGroup', () => {
    const report = validator.validate(MISSING_THREADGROUP)
    expect(countByRuleId(report.errors, 'missing-threadgroup')).toBeGreaterThanOrEqual(1)
  })

  it('reports invalid nesting (sampler directly under TestPlan)', () => {
    const report = validator.validate(INVALID_NESTING)
    expect(countByRuleId(report.errors, 'invalid-nesting')).toBeGreaterThanOrEqual(1)
  })

  it('reports invalid num_threads when zero', () => {
    const report = validator.validate(ZERO_THREADS)
    expect(
      report.errors.some((m) => m.ruleId === 'invalid-threads' || m.ruleId === 'zero-threads')
    ).toBe(true)
  })

  it('reports invalid ramp_time when negative', () => {
    const badRamp = VALID_MINIMAL.replace('ramp_time">5', 'ramp_time">-1')
    const report = validator.validate(badRamp)
    expect(countByRuleId(report.errors, 'invalid-ramp-time')).toBeGreaterThanOrEqual(1)
  })

  it('reports missing sampler path', () => {
    const report = validator.validate(MISSING_PATH)
    expect(countByRuleId(report.errors, 'missing-path')).toBeGreaterThanOrEqual(1)
  })

  it('reports missing sampler method', () => {
    const report = validator.validate(MISSING_METHOD)
    expect(countByRuleId(report.errors, 'missing-method')).toBeGreaterThanOrEqual(1)
  })

  it('reports missing CSV filename', () => {
    const report = validator.validate(MISSING_CSV_FILENAME)
    expect(countByRuleId(report.errors, 'missing-csv-filename')).toBeGreaterThanOrEqual(1)
  })

  it('does not flag ConfigTestElement (HTTP Request Defaults) under ThreadGroup as invalid nesting', () => {
    const report = validator.validate(CONFIG_TEST_ELEMENT_INHERITANCE)
    expect(countByRuleId(report.errors, 'invalid-nesting')).toBe(0)
  })
})

describe('JMXValidator semantic / best-practice layer', () => {
  it('warns on empty plan name', () => {
    const report = validator.validate(EMPTY_PLAN_NAME)
    expect(countByRuleId(report.warnings, 'empty-plan-name')).toBeGreaterThanOrEqual(1)
  })

  it('does not warn when plan name is set via testname attribute', () => {
    const report = validator.validate(PLAN_NAME_FROM_ATTRIBUTE)
    expect(countByRuleId(report.warnings, 'empty-plan-name')).toBe(0)
  })

  it('errors on zero threads', () => {
    const report = validator.validate(ZERO_THREADS)
    expect(countByRuleId(report.errors, 'zero-threads')).toBeGreaterThanOrEqual(1)
  })

  it('warns on high thread count', () => {
    const report = validator.validate(HIGH_THREADS)
    expect(countByRuleId(report.warnings, 'high-thread-count')).toBeGreaterThanOrEqual(1)
  })

  it('warns on unknown HTTP method', () => {
    const report = validator.validate(UNKNOWN_METHOD)
    expect(countByRuleId(report.warnings, 'unknown-method')).toBeGreaterThanOrEqual(1)
  })

  it('warns when domain is empty with no inherited domain', () => {
    const report = validator.validate(MISSING_DOMAIN_ONLY)
    expect(countByRuleId(report.warnings, 'missing-domain')).toBeGreaterThanOrEqual(1)
    expect(countByRuleId(report.warnings, 'missing-protocol')).toBe(0)
  })

  it('warns when protocol is empty with no inherited protocol', () => {
    const report = validator.validate(MISSING_PROTOCOL_ONLY)
    expect(countByRuleId(report.warnings, 'missing-domain')).toBe(0)
    expect(countByRuleId(report.warnings, 'missing-protocol')).toBeGreaterThanOrEqual(1)
  })

  it('warns for both missing domain and protocol with no inherited values', () => {
    const report = validator.validate(MISSING_DOMAIN_AND_PROTOCOL)
    expect(countByRuleId(report.warnings, 'missing-domain')).toBeGreaterThanOrEqual(1)
    expect(countByRuleId(report.warnings, 'missing-protocol')).toBeGreaterThanOrEqual(1)
  })

  it('does not warn when domain is inherited from HTTP Request Defaults', () => {
    const report = validator.validate(CONFIG_TEST_ELEMENT_DOMAIN_ONLY)
    expect(countByRuleId(report.warnings, 'missing-domain')).toBe(0)
    expect(countByRuleId(report.warnings, 'missing-protocol')).toBeGreaterThanOrEqual(1)
  })

  it('does not warn when protocol is inherited from HTTP Request Defaults', () => {
    const report = validator.validate(CONFIG_TEST_ELEMENT_PROTOCOL_ONLY)
    expect(countByRuleId(report.warnings, 'missing-domain')).toBeGreaterThanOrEqual(1)
    expect(countByRuleId(report.warnings, 'missing-protocol')).toBe(0)
  })

  it('does not warn when domain/protocol are inherited from HTTP Request Defaults', () => {
    const report = validator.validate(CONFIG_TEST_ELEMENT_INHERITANCE)
    expect(countByRuleId(report.warnings, 'missing-domain')).toBe(0)
    expect(countByRuleId(report.warnings, 'missing-protocol')).toBe(0)
  })

  it('errors on deprecated tag alias', () => {
    const report = validator.validate(DEPRECATED_TAG)
    expect(countByRuleId(report.errors, 'deprecated-tag')).toBeGreaterThanOrEqual(1)
  })

  it('info when ThreadGroup has no assertions', () => {
    const report = validator.validate(NO_ASSERTIONS)
    expect(countByRuleId(report.info, 'no-assertions')).toBeGreaterThanOrEqual(1)
  })

  it('info when ThreadGroup has no timers', () => {
    const report = validator.validate(NO_THINK_TIME)
    expect(countByRuleId(report.info, 'no-think-time')).toBeGreaterThanOrEqual(1)
  })

  it('warns on high loop count', () => {
    const report = validator.validate(HIGH_LOOP_COUNT)
    expect(countByRuleId(report.warnings, 'high-loop-count')).toBeGreaterThanOrEqual(1)
  })
})

describe('JMXValidator report contract', () => {
  it('marks reports with only warnings/info as valid', () => {
    const report = validator.validate(VALID_MINIMAL)
    assertReport(report)
    expect(report.valid).toBe(true)
    expect(report.errors).toHaveLength(0)
  })

  it('marks reports with errors as invalid', () => {
    const report = validator.validate(ZERO_THREADS)
    assertReport(report)
    expect(report.valid).toBe(false)
    expect(report.errors.length).toBeGreaterThan(0)
  })

  it('exposes per-message remediation', () => {
    const report = validator.validate(INVALID_XML)
    const errorsWithRemediation = report.errors.filter((m) => m.remediation !== undefined)
    expect(errorsWithRemediation.length).toBeGreaterThan(0)
  })
})
