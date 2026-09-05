import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test'
import { join } from 'node:path'

const extensionPath = join(process.cwd(), 'dist')
const E2E_BASE = `http://127.0.0.1:${Number(process.env.E2E_PORT ?? 3144)}`

test.describe('Recorder UI state lifecycle', () => {
  test('updates status text and button states through recording lifecycle', async () => {
    const context = await launchExtensionContext()
    const extensionId = await extensionIdFromContext(context)
    const popup = await context.newPage()

    await popup.setViewportSize({ width: 420, height: 760 })
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`)

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
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`)

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
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`)

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
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`)

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
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`)

    // Expand the advanced options section — controls are hidden (HTML `hidden` attribute) by default
    await popup.locator('#toggleAdvancedOptions').click()
    await expect(popup.locator('#advancedOptionsBody')).toBeVisible()

    await expect(popup.locator('#filterPattern')).toBeVisible()
    await expect(popup.locator('#recordCss')).toBeVisible()
    await expect(popup.locator('#recordJs')).toBeVisible()
    await expect(popup.locator('#recordImages')).toBeVisible()
    await expect(popup.locator('#recordRedirects')).toBeVisible()
    await expect(popup.locator('#userAgent')).toBeVisible()
    await expect(popup.locator('#recordCookies')).toBeVisible()

    await context.close()
  })

  test('advanced options controls remain in DOM when section is collapsed', async () => {
    const context = await launchExtensionContext()
    const extensionId = await extensionIdFromContext(context)
    const popup = await context.newPage()

    await popup.setViewportSize({ width: 420, height: 760 })
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`)

    // Section is hidden by default; controls should still be attached to the DOM
    await expect(popup.locator('#advancedOptionsBody')).toBeHidden()
    await expect(popup.locator('#filterPattern')).toBeAttached()
    await expect(popup.locator('#recordCss')).toBeAttached()
    await expect(popup.locator('#recordJs')).toBeAttached()
    await expect(popup.locator('#recordImages')).toBeAttached()
    await expect(popup.locator('#recordRedirects')).toBeAttached()
    await expect(popup.locator('#userAgent')).toBeAttached()
    await expect(popup.locator('#recordCookies')).toBeAttached()

    await context.close()
  })

  test('checkbox changes in popup sync to options page via storage', async () => {
    const context = await launchExtensionContext()
    const extensionId = await extensionIdFromContext(context)
    const popup = await context.newPage()
    const options = await context.newPage()

    await popup.setViewportSize({ width: 420, height: 760 })
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`)
    await options.setViewportSize({ width: 800, height: 600 })
    await options.goto(`chrome-extension://${extensionId}/options/options.html`)

    // Wait for options page to finish loading its initial state
    await expect(options.locator('#recordCss')).toBeVisible()
    await expect(options.locator('#recordJs')).toBeVisible()

    // Expand advanced options in popup (hidden by default)
    await popup.locator('#toggleAdvancedOptions').click()
    await expect(popup.locator('#advancedOptionsBody')).toBeVisible()

    // Both pages should start with matching default state (recordCss is true by default)
    await expect(popup.locator('#recordCss')).toBeChecked()
    await expect(options.locator('#recordCss')).toBeChecked()

    // Toggle the checkbox in the popup — this triggers saveAdvancedOptions via
    // chrome.storage.local.set, which fires chrome.storage.onChanged in both pages
    await popup.locator('#recordCss').uncheck()
    await expect(popup.locator('#recordCss')).not.toBeChecked()

    // The options page picks up the storage change and updates its checkbox automatically
    await expect(options.locator('#recordCss')).not.toBeChecked({ timeout: 5000 })

    // Toggle back on to verify bidirectional consistency
    await popup.locator('#recordCss').check()
    await expect(popup.locator('#recordCss')).toBeChecked()
    await expect(options.locator('#recordCss')).toBeChecked({ timeout: 5000 })

    await context.close()
  })
})

test.describe('Capture scenarios', () => {
  test('captures a same-origin fetch with available response body', async () => {
    const context = await launchExtensionContext()
    const extensionId = await extensionIdFromContext(context)
    const popup = await context.newPage()

    await popup.setViewportSize({ width: 420, height: 760 })
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`)

    // Enable response body capture for this scenario
    await popup.evaluate(async () => {
      await chrome.storage.local.set({ captureResponseBody: true })
    })

    // Navigate to the page first so the content script can load before recording starts
    const page = await context.newPage()
    await page.goto(`${E2E_BASE}/capture-fetch.html`)
    await page.waitForTimeout(1000)

    // Start recording
    await popup.locator('#start').click()
    await expect(popup.locator('#status')).toContainText('Recording')

    // Give the content script time to enable capture after STATE_CHANGED
    await page.waitForTimeout(1000)

    // Trigger a same-origin fetch
    await page.evaluate(() => {
      return fetch('/api/fetch')
        .then((r) => r.json())
        .then((data) => {
          const result = document.getElementById('result')
          if (result) result.textContent = data.token
        })
    })

    // Wait for fetch to complete and result to render
    await expect(page.locator('#result')).toContainText('synthetic-fetch-token', { timeout: 15000 })

    // Small grace period for content-script capture to reach the background
    await page.waitForTimeout(2000)

    // Stop recording
    await popup.locator('#stop').click()
    await expect(popup.locator('#status')).toContainText('Please start recording')

    // Allow background to finalize any in-flight response body captures
    await page.waitForTimeout(2000)

    // Read captured requests from the extension popup context
    const requests = await getRequestsFromPage(popup, extensionId)
    const fetchRequest = requests.find(
      (r: Record<string, unknown>) => r.url === `${E2E_BASE}/api/fetch` && r.method === 'GET'
    )

    expect(fetchRequest).toBeDefined()
    const meta = fetchRequest?.responseBodyMeta as Record<string, unknown> | undefined
    expect(meta?.available).toBe('available')
    expect(typeof meta?.size).toBe('number')
    expect(meta?.size).toBeGreaterThan(0)

    await context.close()
  })

  test('captures HTML navigation with blocked response body', async () => {
    const context = await launchExtensionContext()
    const extensionId = await extensionIdFromContext(context)
    const popup = await context.newPage()

    await popup.setViewportSize({ width: 420, height: 760 })
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`)

    // Enable response body capture for this scenario
    await popup.evaluate(async () => {
      await chrome.storage.local.set({ captureResponseBody: true })
    })

    // Navigate to the page first so the content script can load before recording starts
    const page = await context.newPage()
    await page.goto(`${E2E_BASE}/capture-html.html`)
    await page.waitForTimeout(1000)

    // Start recording
    await popup.locator('#start').click()
    await expect(popup.locator('#status')).toContainText('Recording')

    // Give the content script time to enable capture after STATE_CHANGED
    await page.waitForTimeout(1000)

    // Re-trigger navigation to capture the HTML request while recording
    await page.goto(`${E2E_BASE}/capture-html.html`)
    await page.waitForTimeout(2000)

    // Stop recording
    await popup.locator('#stop').click()
    await expect(popup.locator('#status')).toContainText('Please start recording')

    // Allow background to finalize any in-flight response body captures
    await page.waitForTimeout(500)

    // Verify the HTML request was captured and body is blocked/unavailable
    const requests = await getRequestsFromPage(popup, extensionId)
    const htmlRequest = requests.find(
      (r: Record<string, unknown>) => r.url === `${E2E_BASE}/capture-html.html` && r.method === 'GET'
    )

    expect(htmlRequest).toBeDefined()
    const meta = htmlRequest?.responseBodyMeta as Record<string, unknown> | undefined
    expect(meta?.available === 'blocked' || meta?.available === 'not-requested').toBe(true)

    await context.close()
  })

  test('captures 70 KB binary request without corrupting JMX path', async () => {
    const context = await launchExtensionContext()
    const extensionId = await extensionIdFromContext(context)
    const popup = await context.newPage()

    await popup.setViewportSize({ width: 420, height: 760 })
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`)

    // Enable response body capture for this scenario
    await popup.evaluate(async () => {
      await chrome.storage.local.set({ captureResponseBody: true })
    })

    // Navigate to the page first so the content script can load before recording starts
    const page = await context.newPage()
    await page.goto(`${E2E_BASE}/capture-binary.html`)
    await page.waitForTimeout(1000)

    // Start recording
    await popup.locator('#start').click()
    await expect(popup.locator('#status')).toContainText('Recording')

    // Give the content script time to enable capture after STATE_CHANGED
    await page.waitForTimeout(1000)

    // Trigger the binary fetch manually while recording is active
    await page.evaluate(() => {
      return fetch('/binary-70k')
        .then((r) => r.arrayBuffer())
        .then((buf) => {
          const result = document.getElementById('result')
          if (result) result.textContent = `Binary size: ${buf.byteLength}`
        })
    })

    // Wait for binary fetch to complete
    await expect(page.locator('#result')).toContainText('Binary size: 71680', { timeout: 15000 })

    // Grace period for content-script capture to finish
    await page.waitForTimeout(2000)

    // Stop recording
    await popup.locator('#stop').click()
    await expect(popup.locator('#status')).toContainText('Please start recording')

    // Allow background to finalize any in-flight response body captures
    await page.waitForTimeout(500)

    // Verify the binary request was captured and marked unavailable due to cap
    const requests = await getRequestsFromPage(popup, extensionId)
    const binaryRequest = requests.find(
      (r: Record<string, unknown>) => r.url === `${E2E_BASE}/binary-70k` && r.method === 'GET'
    )

    expect(binaryRequest).toBeDefined()
    const meta = binaryRequest?.responseBodyMeta as Record<string, unknown> | undefined
    expect(meta?.available).toBe('unavailable')
    expect(typeof meta?.error).toBe('string')
    expect(meta?.error as string).toContain('binary payload exceeds')

    await context.close()
  })
})

async function getRequestsFromPage(page: Page, extensionId: string): Promise<unknown[]> {
  return page.evaluate(
    (extId: string) => {
      return new Promise<unknown[]>((resolve, reject) => {
        chrome.runtime.sendMessage(
          extId,
          { type: 'GET_REQUESTS' },
          (response: unknown) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
              return
            }

            const record = response as { success?: boolean; requests?: unknown[] } | undefined
            if (record?.success && Array.isArray(record.requests)) {
              resolve(record.requests)
            } else {
              resolve([])
            }
          }
        )
      })
    },
    extensionId
  )
}

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

async function pollForRequest<T>(
  page: Page,
  extensionId: string,
  predicate: (request: Record<string, unknown>) => boolean,
  timeout = 10000
): Promise<T | undefined> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const requests = await getRequestsFromPage(page, extensionId)
    const match = requests.find((r) => predicate(r as Record<string, unknown>))
    if (match !== undefined) {
      return match as T
    }
    await page.waitForTimeout(500)
  }
  return undefined
}
