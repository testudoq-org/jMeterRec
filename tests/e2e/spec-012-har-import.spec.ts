import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test'
import { join } from 'node:path'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'

const extensionPath = join(process.cwd(), 'dist')
const fixtureHarPath = join(process.cwd(), 'src/har/example.com.har')

test.describe('External HAR import (012)', () => {
  test('uploads HAR and shows domain selector', async () => {
    const context = await launchExtensionContext()
    const extensionId = await extensionIdFromContext(context)
    const popup = await context.newPage()

    await popup.setViewportSize({ width: 420, height: 900 })
    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`)

    // Switch to JMX mode to reveal the import section
    const exportMode = popup.locator('#exportMode')
    await exportMode.selectOption('jmx')

    // Verify import HAR section is visible
    const importSection = popup.locator('#importHarSection')
    await expect(importSection).toBeVisible()

    // Upload HAR file via file input
    const fileInput = popup.locator('#importHarFile')
    const [fileChooser] = await Promise.all([
      popup.waitForEvent('filechooser'),
      fileInput.click(),
    ])
    await fileChooser.setFiles(fixtureHarPath)

    // Wait for parsing to complete — domain fieldset should be visible
    const fieldset = popup.locator('#importHarFieldset')
    await expect(fieldset).toBeVisible({ timeout: 5000 })

    // Verify domain checkboxes were rendered (example.com should appear)
    const domainsContainer = popup.locator('#importHarDomains')
    await expect(domainsContainer.locator('label.domain-option').first()).toBeVisible()
    const domainLabels = await domainsContainer.locator('span').allTextContents()
    expect(domainLabels.some((t) => t.includes('example.com'))).toBe(true)

    // Verify status text shows "N of M domains selected"
    const status = popup.locator('#importHarDomainStatus')
    await expect(status).toContainText('domains selected')

    // Verify Convert button starts disabled (should be enabled since domains are selected)
    const convertBtn = popup.locator('#convertHarToJmx')
    await expect(convertBtn).toBeEnabled()

    // Click Convert and verify download triggers
    const [download] = await Promise.all([
      popup.waitForEvent('download', { timeout: 10_000 }),
      convertBtn.click(),
    ])

    expect(download.suggestedFilename()).toMatch(/.jmx$/)

    // Verify JMX content contains example.com
    const jmxPath = join(process.cwd(), 'tmp-e2e-download.jmx')
    await download.saveAs(jmxPath)
    const jmx = readFileSync(jmxPath, 'utf8')
    expect(jmx).toContain('example.com')
    unlinkSync(jmxPath)

    await context.close()
  })

  test('rejects invalid JSON with error message', async () => {
    const context = await launchExtensionContext()
    const extensionId = await extensionIdFromContext(context)
    const popup = await context.newPage()

    await popup.setViewportSize({ width: 420, height: 900 })
    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`)

    await popup.locator('#exportMode').selectOption('jmx')

    // Create a temporary invalid HAR file
    const badHarPath = join(process.cwd(), 'tmp-e2e-bad.har')
    writeFileSync(badHarPath, 'not valid json {{{')

    const fileInput = popup.locator('#importHarFile')
    const [fileChooser] = await Promise.all([
      popup.waitForEvent('filechooser'),
      fileInput.click(),
    ])
    await fileChooser.setFiles(badHarPath)

    const errorEl = popup.locator('#importHarError')
    await expect(errorEl).toContainText('Invalid HAR file: file is not valid JSON', { timeout: 5000 })
    await expect(popup.locator('#importHarFieldset')).toBeHidden()

    unlinkSync(badHarPath)
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
