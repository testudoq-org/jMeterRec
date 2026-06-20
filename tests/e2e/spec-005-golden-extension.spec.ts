import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Download,
  type Page,
} from '@playwright/test'
import { createReadStream } from 'node:fs'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const e2ePort = Number(process.env.E2E_PORT ?? 3144)
const fixtureUrl = `http://127.0.0.1:${e2ePort}/golden-page.html`
const extensionPath = join(process.cwd(), 'dist')
const goldenDir = join(process.cwd(), 'tests', 'fixtures', 'golden')
const goldenJmxPath = join(goldenDir, 'golden-extension.jmx')
const goldenPlaywrightPath = join(goldenDir, 'golden-extension.spec.ts')
const volatileHeaderNames = [
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'upgrade-insecure-requests',
  'Upgrade-Insecure-Requests',
  'user-agent',
  'User-Agent',
  'accept',
]

test.describe.configure({ mode: 'serial' })

test('records a synthetic flow and exports deterministic JMX and Playwright golden artifacts', async () => {
  let context: BrowserContext | undefined

  try {
    context = await launchExtensionContext()
    const extensionId = await extensionIdFromContext(context)
    const popup = await context.newPage()

    await popup.setViewportSize({ width: 420, height: 760 })
    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`)
    await expect(popup.locator('#status')).toContainText('Please start recording')
    await popup.locator('#planName').fill('Golden E2E')
    await popup.locator('#start').click()
    await popup.locator('#status').waitFor({ timeout: 10000 })
    await expect(popup.locator('#status')).toContainText('Recording')

    const page = await context.newPage()
    await page.goto(fixtureUrl)
    await expect(page.locator('h1')).toHaveText('Capultura Golden E2E Page')

    await page.locator('#search-btn').click()
    await expect(page.locator('#search-result')).toHaveText('golden search')

    await page.locator('#username').fill('alice')
    await page.locator('#password').fill('secret')
    await page.locator('#submit-login').click()
    await expect(page.locator('#login-result')).toHaveText('golden login')

    await popup.bringToFront()
    await popup.locator('#stop').click()
    await expect(popup.locator('#status')).toContainText('Please start recording')

    const jmxDownload = await exportFromPopup(popup, 'jmx')
    const playwrightDownload = await exportFromPopup(popup, 'playwright')
    const jmx = await readDownloadText(jmxDownload)
    const playwright = await readDownloadText(playwrightDownload)

    writeGoldenIfRequested(goldenJmxPath, normalizeGoldenArtifact(jmx))
    writeGoldenIfRequested(goldenPlaywrightPath, normalizeGoldenArtifact(playwright))

    const goldenJmx = normalizeGoldenArtifact(readFileSync(goldenJmxPath, 'utf8'))
    const goldenPlaywright = normalizeGoldenArtifact(
      readFileSync(goldenPlaywrightPath, 'utf8')
    )

    expect(normalizeGoldenArtifact(jmx)).toBe(goldenJmx)
    expect(normalizeGoldenArtifact(playwright)).toBe(goldenPlaywright)
    expect(playwright).toContain("await page.route('/api/search'")
    expect(playwright).toContain("await page.route('/api/login'")
    expect(playwright).toContain("await page.click('#search-btn')")
    expect(playwright).toContain("await page.fill('#username', 'alice')")
    expect(playwright).toContain("await page.fill('#password', 'secret')")
    expect(playwright).toContain("await page.click('#submit-login')")
    expect(jmx).toContain('<stringProp name="HTTPSampler.domain">127.0.0.1:3144</stringProp>')
    expect(jmx).toContain('<stringProp name="HTTPSampler.path">/api/search?term=gold</stringProp>')
    expect(jmx).toContain('<stringProp name="HTTPSampler.path">/api/login</stringProp>')
    expect(jmx).toContain(
      '<stringProp name="Argument.value"><![CDATA[{"username":"alice","password":"secret"}]]></stringProp>'
    )
  } finally {
    await context?.close()
  }
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

async function readDownloadText(download: Download): Promise<string> {
  const chunks: Buffer[] = []
  const stream = await download.createReadStream()

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString('utf8')
}

async function exportFromPopup(popup: Page, mode: 'jmx' | 'playwright'): Promise<Download> {
  const downloadPromise = popup.waitForEvent('download')

  await popup.locator('#exportMode').selectOption(mode)
  await popup.locator('#export').click()

  return downloadPromise
}

function normalizeGoldenArtifact(contents: string): string {
  const volatileHeaderPattern = volatileHeaderNames.map(escapeRegExp).join('|')
  const withoutVolatileHeaders = volatileHeaderNames.reduce((normalized, name) => {
    const escapedName = escapeRegExp(name)

    return normalized
      .replace(new RegExp(`^\\s*headers\\.set\\('${escapedName}', '.*'\\)\\r?\\n`, 'gmi'), '')
      .replace(
        new RegExp(
          `^.*<stringProp name="Header.name">${escapedName}</stringProp>\\r?\\n^.*<stringProp name="Header.value">.*</stringProp>\\r?\\n^.*<stringProp name="Header.enabled">true</stringProp>\\r?\\n`,
          'gmi'
        ),
        ''
      )
  }, contents)

  return withoutVolatileHeaders
    .replace(
      new RegExp(`testname="(${volatileHeaderPattern})" enabled="true"`, 'gi'),
      (_match, name: string) => `testname="${name.toLowerCase()}" enabled="true"`
    )
    .split(/\r?\n/)
    .map((line) => line.trimStart())
    .join('\n')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function writeGoldenIfRequested(path: string, contents: string): void {
  if (process.env.UPDATE_GOLDEN !== '1') {
    return
  }

  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents, 'utf8')
}
