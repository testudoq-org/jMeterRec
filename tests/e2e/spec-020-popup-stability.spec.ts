import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test'
import { join } from 'node:path'

const extensionPath = join(process.cwd(), 'dist')

/**
 * Popup stability regression suite.
 *
 * Chrome action-popups auto-fit to content. Any CSS that extends the
 * painted document extent beyond the viewport (fixed-position pseudo
 * elements with negative insets, backdrop-filter, or animated geometry
 * that changes intrinsic size) causes the popup to re-measure, resize,
 * and re-paint in a feedback loop — visible as a "jiggle" on load that
 * only resolves once the window gains focus.
 *
 * These tests guard against reintroducing those effects.
 */
test.describe('Popup stability on initial load', () => {
  async function openPopup(): Promise<{ context: BrowserContext; popup: Page }> {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      userAgent: 'CapulturaStabilityE2E/1.0',
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
      await context.close()
      throw new Error(`Unable to determine extension id from ${serviceWorker.url()}`)
    }

    const extensionId = match[1]!
    const popup = await context.newPage()
    await popup.setViewportSize({ width: 760, height: 760 })
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`)
    await popup.waitForLoadState('domcontentloaded')

    return { context, popup }
  }

  test('renders without backdrop-filter on any element', async () => {
    const { context, popup } = await openPopup()

    const hasBackdropFilter = await popup.evaluate(() => {
      const sheets = Array.from(document.styleSheets) as CSSStyleSheet[]
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules) as CSSRule[]
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule && rule.style.backdropFilter !== '') {
              return true
            }
          }
        } catch {
          // Cross-origin stylesheet; skip
        }
      }
      return false
    })

    expect(hasBackdropFilter).toBe(false)
    await context.close()
  })

  test('popup intrinsic height is stable across repeated measurements', async () => {
    const { context, popup } = await openPopup()

    const heights: number[] = []
    for (let i = 0; i < 5; i++) {
      const height = await popup.evaluate(() => document.body.scrollHeight)
      heights.push(height)
      await popup.waitForTimeout(50)
    }

    // All measurements must agree — no jitter.
    const [first, ...rest] = heights
    for (const h of rest) {
      expect(h).toBe(first)
    }

    await context.close()
  })

  test('popup width stays at 760px and does not exceed viewport', async () => {
    const { context, popup } = await openPopup()

    const width = await popup.evaluate(() => {
      const style = getComputedStyle(document.body)
      return Number.parseInt(style.width, 10)
    })

    expect(width).toBe(760)
    await context.close()
  })

  test('document extent does not extend beyond the viewport vertically', async () => {
    const { context, popup } = await openPopup()

    const overflow = await popup.evaluate(() => {
      const scrollHeight = document.documentElement.scrollHeight
      const clientHeight = document.documentElement.clientHeight
      return scrollHeight - clientHeight
    })

    // The document should fit within the viewport (allow small rounding).
    expect(overflow).toBeLessThanOrEqual(1)
    await context.close()
  })

  test('toggling advanced options does not cause layout thrash', async () => {
    const { context, popup } = await openPopup()

    const toggle = popup.locator('#toggleAdvancedOptions')
    const body = popup.locator('#advancedOptionsBody')

    // Collapsed by default.
    await expect(body).toBeHidden()

    // Measure height before/after toggle; both must be stable.
    const before = await popup.evaluate(() => document.body.scrollHeight)

    await toggle.click()
    await expect(body).toBeVisible()

    const afterExpand = await popup.evaluate(() => document.body.scrollHeight)
    expect(afterExpand).toBeGreaterThan(before)

    // Collapse again and verify height returns to the original value.
    await toggle.click()
    await expect(body).toBeHidden()

    const afterCollapse = await popup.evaluate(() => document.body.scrollHeight)
    expect(afterCollapse).toBe(before)

    await context.close()
  })

  test('hidden dynamic sections use display:none, not animated geometry', async () => {
    const { context, popup } = await openPopup()

    const hiddenSections = await popup.evaluate(() => {
      const ids = ['jmxOptions', 'importHarSection', 'validateJmxSection', 'analysis-panel']
      return ids.map((id) => {
        const el = document.getElementById(id)
        if (el === null) return { id, present: false }
        const style = getComputedStyle(el)
        return {
          id,
          present: true,
          display: style.display,
          visibility: style.visibility,
        }
      })
    })

    for (const section of hiddenSections) {
      if (!section.present) continue
      // Hidden sections must be fully removed from layout (display:none),
      // not merely animated to zero size, to avoid popup re-measurement.
      expect(section.display).toBe('none')
    }

    await context.close()
  })

  // --- Auto-dark-theme opt-out (color-scheme `only`) ---------------------
  // Chrome's automatic dark theme repaints any light-coloured page that has
  // not opted out. A repaint landing while the action-popup auto-fit-to-content
  // height is still settling is what produces the light-mode-only open jitter.
  // `color-scheme: only <scheme>` is the documented per-page opt-out, so the
  // popup must declare it on BOTH themes. These tests fail if the `only`
  // keyword is ever stripped from `:root` or `[data-theme='dark']`.

  test('root color-scheme opts the light popup out of auto-dark', async () => {
    const { context, popup } = await openPopup()

    const colorScheme = await popup.evaluate(() =>
      getComputedStyle(document.documentElement).colorScheme,
    )

    expect(colorScheme).toContain('only')
    await context.close()
  })

  test('root color-scheme opts the dark popup out of auto-dark', async () => {
    const { context, popup } = await openPopup()

    const colorScheme = await popup.evaluate(() => {
      // Apply the dark variant to the live DOM and read it atomically, so the
      // popup's own async applyTheme() cannot overwrite it between set+read.
      document.documentElement.dataset.theme = 'dark'
      return getComputedStyle(document.documentElement).colorScheme
    })

    expect(colorScheme).toContain('only')
    await context.close()
  })

  test('root keeps the `only` opt-out while auto-dark is emulated via CDP', async () => {
    const { context, popup } = await openPopup()

    // Mirrors the DevTools Rendering tab -> "Enable automatic dark mode",
    // which Chrome drives with Emulation.setAutoDarkModeOverride. The popup
    // must still declare the `only` opt-out, so the browser never applies its
    // colour-scheme override while the popup is settling.
    const cdp = await popup.context().newCDPSession(popup)
    await cdp.send('Emulation.setAutoDarkModeOverride', { enabled: true })
    await popup.reload({ waitUntil: 'domcontentloaded' })
    await cdp.send('Emulation.setAutoDarkModeOverride', { enabled: true })

    const colorScheme = await popup.evaluate(() =>
      getComputedStyle(document.documentElement).colorScheme,
    )

    expect(colorScheme).toContain('only')
    await context.close()
  })

  // --- First-paint overshoot (the actual light-mode jitter) ---------------
  // Chrome action-popups auto-fit their window to the document's intrinsic
  // height. If the document's painted extent ever DECREASES after first paint
  // (because a CSS-controlled `display:none` kicks in after the HTML parsed),
  // the popup re-measures, resizes downward, and the user sees a "jiggle".
  //
  // The fix is to hide dynamic sections with the `hidden` ATTRIBUTE, which
  // the browser applies during parsing (before first paint), instead of a
  // CSS class whose `display:none` only takes effect once the stylesheet
  // loads. This test samples scrollHeight every 10ms from before the module
  // script runs until settle, and asserts the sequence never decreases.
  test('document extent never shrinks during the settling window', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      userAgent: 'CapulturaStabilityE2E/1.0',
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
      await context.close()
      throw new Error(`Unable to determine extension id from ${serviceWorker.url()}`)
    }
    const extensionId = match[1]!

    const popup = await context.newPage()
    await popup.setViewportSize({ width: 420, height: 760 })

    // Sample scrollHeight every 10ms for 2.5s, starting before the module
    // script runs. The extension's CSP blocks eval, so we poll with
    // page.evaluate rather than waitForFunction(string).
    await popup.addInitScript(`
      (function () {
        const start = performance.now();
        window.__stabilitySamples = [];
        window.__stabilityDone = false;
        const iv = setInterval(() => {
          const body = document.body;
          if (!body) return;
          window.__stabilitySamples.push({
            t: Math.round(performance.now() - start),
            sh: body.scrollHeight,
            rh: Math.round(body.getBoundingClientRect().height * 100) / 100,
          });
          if (performance.now() - start > 2500) {
            clearInterval(iv);
            window.__stabilityDone = true;
          }
        }, 10);
      })()
    `)

    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`)
    await popup.waitForLoadState('domcontentloaded')

    const deadline = Date.now() + 6000
    while (Date.now() < deadline) {
      const done = await popup.evaluate(() => window.__stabilityDone === true)
      if (done) break
      await popup.waitForTimeout(50)
    }

    const samples = await popup.evaluate(() => window.__stabilitySamples ?? [])
    expect(samples.length).toBeGreaterThan(10)

    // The document extent must never DECREASE. A decrease is the action-popup
    // re-measuring a smaller extent and resizing downward = the jitter.
    const shrinks = []
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].sh < samples[i - 1].sh) {
        shrinks.push({
          at: samples[i].t,
          from: samples[i - 1].sh,
          to: samples[i].sh,
        })
      }
    }
    expect(shrinks).toEqual([])

    await context.close()
  })

  test('dynamic sections are hidden via the hidden attribute, not a CSS class', async () => {
    const { context, popup } = await openPopup()

    // The three sections that toggle at runtime must be hidden by the browser
    // during parsing (the `hidden` attribute), not by a CSS class whose
    // `display:none` only takes effect once the stylesheet loads. Reading
    // the raw HTML confirms the attribute is present in the source.
    const sectionAttrs = await popup.evaluate(() => {
      const ids = ['jmxOptions', 'importHarSection', 'validateJmxSection']
      return ids.map((id) => {
        const el = document.getElementById(id)
        return {
          id,
          hasHiddenAttr: el ? el.hasAttribute('hidden') : null,
          computedDisplay: el ? getComputedStyle(el).display : null,
        }
      })
    })

    for (const s of sectionAttrs) {
      expect(s.hasHiddenAttr).toBe(true)
      expect(s.computedDisplay).toBe('none')
    }

    await context.close()
  })

  // --- Responsive body width ---------------------------------------------
  // The action-popup body width is `min(var(--action-popup-width), 100%)`
  // (760px). In the fixed-width action popup the viewport is 760px, so the
  // body stays 760px. In a wider window the body must still cap at 760px (and
  // be centred) rather than stretching to fill the window. In an unusually
  // narrow window the body must shrink to the viewport instead of overflowing
  // it. These tests guard the `min()` rule against being replaced by a fixed
  // `width: 760px`, which would overflow a narrow window, or by
  // `width: 100%`, which would stretch a wide one. The detached window uses
  // its own `--detached-max-width` (1200px) via the
  // `html[data-detached='1']` rule below.

  async function measureBodyWidth(
    extensionId: string,
    context: BrowserContext,
    viewportWidth: number,
  ): Promise<number> {
    const popup = await context.newPage()
    await popup.setViewportSize({ width: viewportWidth, height: 760 })
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`)
    await popup.waitForLoadState('domcontentloaded')
    await popup.evaluate(() => {
      document.documentElement.dataset.theme = 'light'
    })
    const width = await popup.evaluate(() => {
      const style = getComputedStyle(document.body)
      return Number.parseInt(style.width, 10)
    })
    await popup.close()
    return width
  }

  test('body width reaches 760px when the viewport is at least 760px', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      userAgent: 'CapulturaStabilityE2E/1.0',
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
      await context.close()
      throw new Error(`Unable to determine extension id from ${serviceWorker.url()}`)
    }
    const extensionId = match[1]!

    // A real Chrome action popup sizes itself to the intrinsic body width
    // (capped at 800x600). In Playwright the popup is a normal page with an
    // explicit viewport, so set the viewport to 800 to simulate a wide
    // monitor and confirm the body reaches the 760px target instead of
    // staying at the old 420px.
    const width = await measureBodyWidth(extensionId, context, 800)
    expect(width).toBe(760)

    await context.close()
  })

  test('body width caps at 760px and does not stretch to fill a very wide window', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      userAgent: 'CapulturaStabilityE2E/1.0',
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
      await context.close()
      throw new Error(`Unable to determine extension id from ${serviceWorker.url()}`)
    }
    const extensionId = match[1]!

    const width = await measureBodyWidth(extensionId, context, 1200)
    // `min(760px, 100%)` must cap the body at 760px, not stretch to 1200px.
    expect(width).toBe(760)

    await context.close()
  })

  test('body width shrinks to the viewport in a narrow window', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      userAgent: 'CapulturaStabilityE2E/1.0',
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
      await context.close()
      throw new Error(`Unable to determine extension id from ${serviceWorker.url()}`)
    }
    const extensionId = match[1]!

    const viewportWidth = 300
    const width = await measureBodyWidth(extensionId, context, viewportWidth)
    // `min(760px, 100%)` must let the body shrink to the viewport width
    // instead of overflowing it. Allow a small rounding tolerance.
    expect(width).toBeLessThanOrEqual(viewportWidth)
    expect(width).toBeGreaterThan(0)

    await context.close()
  })

  // --- Detach window width ---------------------------------------------
  // The Detach button opens the popup in a separate, user-resizable window
  // (900x720 by default, persisted across close/reopen). That window is the
  // only surface allowed past the 800x600 action-popup cap, so its content
  // column widens to the 1200px detached cap (`--detached-max-width`) via
  // `html[data-detached='1'] body` instead of staying at the action popup's
  // 760px and leaving the extra width as blank side margin. The action popup
  // keeps its own 760px cap (`--action-popup-width`). The `isDetached` flag is
  // read from the query string at startup, so the detached window must report
  // `data-detached='1'` on the document element.

  test('detached window reports data-detached=1 on the document element', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      userAgent: 'CapulturaStabilityE2E/1.0',
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
      await context.close()
      throw new Error(`Unable to determine extension id from ${serviceWorker.url()}`)
    }
    const extensionId = match[1]!

    const popup = await context.newPage()
    await popup.setViewportSize({ width: 720, height: 820 })
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html?detached=1`)
    await popup.waitForLoadState('domcontentloaded')

    const detachedFlag = await popup.evaluate(() => {
      return document.documentElement.dataset.detached ?? null
    })
    expect(detachedFlag).toBe('1')

    await context.close()
  })

  test('detached window body widens to the viewport in a wide viewport', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      userAgent: 'CapulturaStabilityE2E/1.0',
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
      await context.close()
      throw new Error(`Unable to determine extension id from ${serviceWorker.url()}`)
    }
    const extensionId = match[1]!

    const popup = await context.newPage()
    await popup.setViewportSize({ width: 760, height: 820 })
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html?detached=1`)
    await popup.waitForLoadState('domcontentloaded')
    await popup.evaluate(() => {
      document.documentElement.dataset.theme = 'light'
    })

    const width = await popup.evaluate(() => {
      const style = getComputedStyle(document.body)
      return Number.parseInt(style.width, 10)
    })
    // `html[data-detached='1'] body { width: min(100%, 1200px) }` widens the
    // detached column to the viewport width (760px) instead of keeping it at
    // the action popup's previous 420px.
    expect(width).toBe(760)

    await context.close()
  })

  test('detached window body widens to the 1200px detached cap in a wide viewport', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      userAgent: 'CapulturaStabilityE2E/1.0',
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
      await context.close()
      throw new Error(`Unable to determine extension id from ${serviceWorker.url()}`)
    }
    const extensionId = match[1]!

    const popup = await context.newPage()
    await popup.setViewportSize({ width: 1400, height: 900 })
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html?detached=1`)
    await popup.waitForLoadState('domcontentloaded')
    await popup.evaluate(() => {
      document.documentElement.dataset.theme = 'light'
    })

    const width = await popup.evaluate(() => {
      const style = getComputedStyle(document.body)
      return Number.parseInt(style.width, 10)
    })
    // The detached window is the only surface allowed past the 800x600
    // action-popup cap, so its column widens to the 1200px detached cap
    // rather than staying at the action popup's 760px and leaving the extra
    // width as blank side margin.
    expect(width).toBe(1200)

    await context.close()
  })
})