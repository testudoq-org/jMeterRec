import type { CapturedRequest, PlanMeta } from '../models/captured-request'

export function buildJmx(meta: PlanMeta, requests: CapturedRequest[]): string {
  const xmlEsc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const samplers = requests
    .map((req, idx) => {
      const urlObj = new URL(req.url)
      const path = `${urlObj.pathname}${urlObj.search}`
      const name = `\${method} ${req.method} ${xmlEsc(urlObj.host)}${xmlEsc(path)} #${idx}`
      const encodedBody = req.body ? xmlEsc(String(req.body)) : ''
      const headersXml = Object.entries(req.headers)
        .map(
          ([key, value]) =>
            `      <elementProp name="" elementType="HeaderManager">
        <stringProp name="HeaderManager.header_name">${xmlEsc(key)}</stringProp>
        <stringProp name="HeaderManager.header_value">${xmlEsc(value)}</stringProp>
      </elementProp>`
        )
        .join('\n')

      return `    <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${name}" enabled="true">
      <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
        <collectionProp name="Arguments.arguments">
${
  encodedBody
    ? `          <elementProp name="" elementType="HTTPArgument">
            <stringProp name="Argument.always_encode">false</stringProp>
            <stringProp name="Argument.name"></stringProp>
            <stringProp name="Argument.value"><![CDATA[${encodedBody}]]></stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
            <boolProp name="HTTPArgument.always_encode">false</boolProp>
          </elementProp>`
    : ''
}
        </collectionProp>
      </elementProp>
      <stringProp name="HTTPSampler.domain">${urlObj.host}</stringProp>
      <stringProp name="HTTPSampler.port"></stringProp>
      <stringProp name="HTTPSampler.protocol">${urlObj.protocol.replace(':', '')}</stringProp>
      <stringProp name="HTTPSampler.path">${xmlEsc(path)}</stringProp>
      <stringProp name="HTTPSampler.method">${req.method}</stringProp>
      <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
      <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
      <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
      <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
      <stringProp name="HTTPSampler.embedded_url_re"></stringProp>
      <stringProp name="HTTPSampler.connect_timeout"></stringProp>
      <stringProp name="HTTPSampler.response_timeout"></stringProp>
${headersXml ? `\n${headersXml}` : ''}
    </HTTPSamplerProxy>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.0" properties="5.0" jmeter="5.6.3">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${xmlEsc(meta.name)}" enabled="true">
      <stringProp name="TestPlan.comments"></stringProp>
      <stringProp name="TestPlan.functional_mode">false</stringProp>
    </TestPlan>
    <hashTree>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Thread Group" enabled="true">
        <stringProp name="ThreadGroup.num_threads">${meta.threadGroup.threads}</stringProp>
        <stringProp name="ThreadGroup.ramp_time">${meta.threadGroup.rampUp}</stringProp>
        <stringProp name="ThreadGroup.loops">${meta.threadGroup.loops}</stringProp>
      </ThreadGroup>
      <hashTree>
${samplers}
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>`
}
