import { chromium, expect, test, type BrowserContext } from '@playwright/test'
import { join } from 'node:path'
import { writeFileSync, unlinkSync } from 'node:fs'

const extensionPath = join(process.cwd(), 'dist')

const VALID_JMX = `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Test Plan" enabled="true">
      <stringProp name="TestPlan.name">E2E Plan</stringProp>
    </TestPlan>
    <hashTree>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Thread Group" enabled="true">
        <stringProp name="ThreadGroup.num_threads">10</stringProp>
        <stringProp name="ThreadGroup.ramp_time">5</stringProp>
      </ThreadGroup>
      <hashTree>
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="GET example.com" enabled="true">
          <stringProp name="HTTPSampler.domain">example.com</stringProp>
          <stringProp name="HTTPSampler.path">/api</stringProp>
          <stringProp name="HTTPSampler.method">GET</stringProp>
        </HTTPSamplerProxy>
        <hashTree/>
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>`

test.describe('JMX validation (016)', () => {
  test('validates a valid JMX file and shows Passed', async () => {
    const context = await launchExtensionContext()
    const extensionId = await extensionIdFromContext(context)
    const popup = await context.newPage()

    await popup.setViewportSize({ width: 420, height: 900 })
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`)

    await popup.locator('#exportMode').selectOption('jmx')
    await expect(popup.locator('#validateJmxSection')).toBeVisible()

    const jmxPath = join(process.cwd(), 'tmp-e2e-valid.jmx')
    writeFileSync(jmxPath, VALID_JMX)

    const fileInput = popup.locator('#validateJmxFile')
    const [fileChooser] = await Promise.all([
      popup.waitForEvent('filechooser'),
      fileInput.click(),
    ])
    await fileChooser.setFiles(jmxPath)

    const result = popup.locator('#validateJmxResult')
    await expect(result).toContainText('Passed', { timeout: 5000 })

    unlinkSync(jmxPath)
    await context.close()
  })

  test('shows error for malformed JMX XML', async () => {
    const context = await launchExtensionContext()
    const extensionId = await extensionIdFromContext(context)
    const popup = await context.newPage()

    await popup.setViewportSize({ width: 420, height: 900 })
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`)

    await popup.locator('#exportMode').selectOption('jmx')

    const badPath = join(process.cwd(), 'tmp-e2e-bad.jmx')
    writeFileSync(badPath, '<?xml version="1.0"?><jmeterTestPlan><TestPlan>')

    const fileInput = popup.locator('#validateJmxFile')
    const [fileChooser] = await Promise.all([
      popup.waitForEvent('filechooser'),
      fileInput.click(),
    ])
    await fileChooser.setFiles(badPath)

    const resultEl = popup.locator('#validateJmxResult')
    await expect(resultEl).toContainText('Failed', { timeout: 5000 })

    unlinkSync(badPath)
    await context.close()
  })
})

async function launchExtensionContext(): Promise<BrowserContext> {
  return chromium.launchPersistentContext('', {
    headless: false,
    userAgent: 'CapulturaGoldenE2E/1.0',
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--disable-features=UserAgentClientHint',
    ],
  })
}

async function extensionIdFromContext(context: BrowserContext): Promise<string> {
  const serviceWorker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 10_000 }))
  const match = serviceWorker.url().match(/^chrome-extension:\/\/([^/]+)\//)

  if (match === null) {
    throw new Error('Unable to determine extension id from extension URL')
  }

  return match[1]!
}
