import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test'
import { join } from 'node:path'

const extensionPath = join(process.cwd(), 'dist')

test.describe('Recorder UI state lifecycle', () => {
  test('updates status text and button states through recording lifecycle', async () => {
    const context = await launchExtensionContext()
    const extensionId = await extensionIdFromContext(context)
    const popup = await context.newPage()

    await popup.setViewportSize({ width: 420, height: 760 })
    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`)

    // Initial state - idle
    await expect(popup.locator('#status')).toContainText('Please start recording')
    await expect(popup.locator('#status')).toHaveClass(/status-idle/)
    await expect(popup.locator('#start')).toBeEnabled()
    await expect(popup.locator('#pause')).toBeDisabled()
    await expect(popup.locator('#resume')).toBeDisabled()
    await expect(popup.locator('#stop')).toBeDisabled()
    await expect(popup.locator('#clear')).toBeDisabled()

    // Start recording
    await popup.locator('#start').click()
    await popup.locator('#status').waitFor({ timeout: 10000 })
    await expect(popup.locator('#status')).toContainText('Recording')
    await expect(popup.locator('#status')).toHaveClass(/status-recording/)
    await expect(popup.locator('#start')).toBeDisabled()
    await expect(popup.locator('#pause')).toBeEnabled()
    await expect(popup.locator('#resume')).toBeDisabled()
    await expect(popup.locator('#stop')).toBeEnabled()

    // Pause recording
    await popup.locator('#pause').click()
    await expect(popup.locator('#status')).toContainText('Paused recorder state...')
    await expect(popup.locator('#status')).toHaveClass(/status-paused/)
    await expect(popup.locator('#start')).toBeDisabled()
    await expect(popup.locator('#pause')).toBeDisabled()
    await expect(popup.locator('#resume')).toBeEnabled()
    await expect(popup.locator('#stop')).toBeEnabled()

    // Resume recording
    await popup.locator('#resume').click()
    await expect(popup.locator('#status')).toContainText('Recording')
    await expect(popup.locator('#status')).toHaveClass(/status-recording/)
    await expect(popup.locator('#start')).toBeDisabled()
    await expect(popup.locator('#pause')).toBeEnabled()
    await expect(popup.locator('#resume')).toBeDisabled()
    await expect(popup.locator('#stop')).toBeEnabled()

    // Stop recording
    await popup.locator('#stop').click()
    await expect(popup.locator('#status')).toContainText('Please start recording')
    await expect(popup.locator('#status')).toHaveClass(/status-idle/)
    await expect(popup.locator('#start')).toBeEnabled()
    await expect(popup.locator('#pause')).toBeDisabled()
    await expect(popup.locator('#resume')).toBeDisabled()
    await expect(popup.locator('#stop')).toBeDisabled()

    await context.close()
  })

  test('clear button resets state when requests are captured', async () => {
    const context = await launchExtensionContext()
    const extensionId = await extensionIdFromContext(context)
    const popup = await context.newPage()

    await popup.setViewportSize({ width: 420, height: 760 })
    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`)

    // Start and stop to capture some state
    await popup.locator('#start').click()
    await expect(popup.locator('#status')).toContainText('Recording')
    await popup.locator('#stop').click()

    // After stop, clear should be enabled (requestCount > 0 or just recorded)
    await expect(popup.locator('#stop')).toBeDisabled()
    await expect(popup.locator('#clear')).toBeEnabled()

    // Clear resets to idle state
    await popup.locator('#clear').click()
    await expect(popup.locator('#status')).toContainText('Please start recording')
    await expect(popup.locator('#clear')).toBeDisabled()

    await context.close()
  })

  test('updates elapsed time while recording and freezes while paused', async () => {
    const context = await launchExtensionContext()
    const extensionId = await extensionIdFromContext(context)
    const popup = await context.newPage()

    await popup.setViewportSize({ width: 420, height: 760 })
    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`)

    await popup.locator('#start').click()
    await expect(popup.locator('#status')).toContainText('Recording')

    // Elapsed time should advance while recording
    const elapsedBefore = await popup.locator('#elapsedTime').textContent()
    await popup.waitForTimeout(1500)
    const elapsedAfter = await popup.locator('#elapsedTime').textContent()
    expect(elapsedAfter).not.toBe(elapsedBefore)

    // Pause - elapsed should freeze
    await popup.locator('#pause').click()
    await expect(popup.locator('#status')).toContainText('Paused recorder state...')
    const pausedElapsed = await popup.locator('#elapsedTime').textContent()
    await popup.waitForTimeout(1500)
    expect(await popup.locator('#elapsedTime').textContent()).toBe(pausedElapsed)

    // Resume - elapsed should advance again
    await popup.locator('#resume').click()
    await expect(popup.locator('#status')).toContainText('Recording')
    const resumedElapsed = await popup.locator('#elapsedTime').textContent()
    await popup.waitForTimeout(1500)
    expect(await popup.locator('#elapsedTime').textContent()).not.toBe(resumedElapsed)

    await popup.locator('#stop').click()
    await context.close()
  })

  test('advanced options section is collapsed by default and can be toggled', async () => {
    const context = await launchExtensionContext()
    const extensionId = await extensionIdFromContext(context)
    const popup = await context.newPage()

    await popup.setViewportSize({ width: 420, height: 760 })
    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`)

    const advancedSection = popup.locator('#advancedOptionsBody')
    const toggleBtn = popup.locator('#toggleAdvancedOptions')

    await expect(advancedSection).toBeHidden()
    await expect(toggleBtn).toContainText('Show')

    await toggleBtn.click()
    await expect(advancedSection).toBeVisible()
    await expect(toggleBtn).toContainText('Hide')

    await toggleBtn.click()
    await expect(advancedSection).toBeHidden()
    await expect(toggleBtn).toContainText('Show')

    await context.close()
  })

  test('advanced options controls are present in popup', async () => {
    const context = await launchExtensionContext()
    const extensionId = await extensionIdFromContext(context)
    const popup = await context.newPage()

    await popup.setViewportSize({ width: 420, height: 760 })
    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`)

    await expect(popup.locator('#filterPattern')).toBeVisible()
    await expect(popup.locator('#recordCss')).toBeVisible()
    await expect(popup.locator('#recordJs')).toBeVisible()
    await expect(popup.locator('#recordImages')).toBeVisible()
    await expect(popup.locator('#recordRedirects')).toBeVisible()
    await expect(popup.locator('#userAgent')).toBeVisible()
    await expect(popup.locator('#recordCookies')).toBeVisible()

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
    throw new Error(`Unable to determine extension id from ${serviceWorker.url()}`)
  }

  return match[1]!
}
