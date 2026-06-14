import type { CapturedRequest, PlanMeta } from '../models/captured-request'

export function buildJmx(meta: PlanMeta, requests: CapturedRequest[]): string {
  const samplers = requests
    .map((req, idx) => `${buildSampler(req, idx)}\n        <hashTree/>`)
    .join('\n')

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
${samplers}
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>`
}

function buildSampler(req: CapturedRequest, idx: number): string {
  const url = parseUrl(req.url)
  const host = url?.host ?? ''
  const path = url?.path ?? req.url
  const protocol = url?.protocol ?? 'http'
  const port = url?.port ?? ''
  const name = `${req.method} ${host}${path} #${idx}`

  return `        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${xmlEsc(name)}" enabled="true">
          <boolProp name="HTTPSampler.postBodyRaw">true</boolProp>
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument" guiclass="HTTPArgumentGui" testclass="HTTPArgument" testname="Argument" enabled="true">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.name"></stringProp>
                <stringProp name="Argument.value"><![CDATA[${escapeCdata(req.body ?? '')}]]></stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>
          <stringProp name="HTTPSampler.domain">${xmlEsc(host)}</stringProp>
          <stringProp name="HTTPSampler.port">${xmlEsc(port)}</stringProp>
          <stringProp name="HTTPSampler.protocol">${xmlEsc(protocol)}</stringProp>
          <stringProp name="HTTPSampler.path">${xmlEsc(path)}</stringProp>
          <stringProp name="HTTPSampler.method">${xmlEsc(req.method)}</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
          <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
          <stringProp name="HTTPSampler.embedded_url_re"></stringProp>
          <stringProp name="HTTPSampler.connect_timeout"></stringProp>
          <stringProp name="HTTPSampler.response_timeout"></stringProp>
${buildHeaders(req.headers)}
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

function parseUrl(
  rawUrl: string
): { host: string; path: string; protocol: string; port: string } | undefined {
  try {
    const url = new URL(rawUrl)

    return {
      host: url.host,
      path: `${url.pathname}${url.search}`,
      protocol: url.protocol.replace(':', ''),
      port: url.port,
    }
  } catch {
    return undefined
  }
}

function escapeCdata(value: string): string {
  return value.replaceAll(']]>', ']]]]><![CDATA[>')
}

function xmlEsc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
