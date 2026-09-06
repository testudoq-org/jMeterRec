import { chromium, expect, test, type BrowserContext } from '@playwright/test'
import { join } from 'node:path'

const extensionPath = join(process.cwd(), 'dist')

test.describe('Analysis panel (019)', () => {
  test('shows analysis panel after recording stops', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      userAgent: 'CapulturaGoldenE2E/1.0',
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--disable-features=UserAgentClientHint',
      ],
    })

    const serviceWorker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 10_000 }))
    const match = serviceWorker.url().match(/^chrome-extension:\/\/([^/]+)\//)

    if (match === null) {
      throw new Error('Unable to determine extension id from extension URL')
    }

    const extensionId = match[1]!
    const popup = await context.newPage()

    await popup.setViewportSize({ width: 420, height: 900 })
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`)

    await popup.locator('#start').click()
    await popup.waitForTimeout(500)
    await popup.locator('#stop').click()

    const analysisPanel = popup.locator('#analysis-panel')
    await expect(analysisPanel).toBeVisible({ timeout: 5000 })

    await context.close()
  })
})
