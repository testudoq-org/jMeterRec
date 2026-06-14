import type {
  CapturedRequest,
  ActionStep,
  PlaywrightStep,
  HttpStep,
} from '../models/captured-request'

export interface PlaywrightTestMeta {
  testCaseName: string
  baseUrl?: string
}

function isCapturedRequestStep(step: PlaywrightStep): step is HttpStep {
  return (step as ActionStep).type !== 'action'
}

function escapeJsString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function buildRequestBlock(request: CapturedRequest): string {
  try {
    const url = new URL(request.url)
    const headerLines = Object.entries(request.headers)
      .map(([k, v]) => `    headers.set('${escapeJsString(k)}', '${escapeJsString(v)}')`)
      .join('\n')

    return `    // Request: ${request.method} ${request.url}
    await page.route('${escapeJsString(url.pathname || '/**')}', async (route) => {
      const headers = new Headers()
${headerLines}
      await route.fulfill({
        status: ${request.statusCode ?? 200},
        headers,
        body: ${request.body ? `Buffer.from('${escapeJsString(request.body)}', 'utf8')` : "''"},
      })
    })`
  } catch {
    return ''
  }
}

function buildJsAction(step: ActionStep): string {
  const sanitizedTarget = escapeJsString(step.target)
  const sanitizedValue = step.value !== undefined ? `, '${escapeJsString(step.value)}'` : ''

  switch (step.command) {
    case 'open':
      return `    await page.goto('${sanitizedTarget}')`
    case 'clickAt':
      return `    await page.click('${sanitizedTarget}')`
    case 'type':
      return `    await page.fill('${sanitizedTarget}'${sanitizedValue})`
    case 'select':
      return `    await page.selectOption('${sanitizedTarget}'${sanitizedValue})`
    case 'waitForElement':
      return `    await page.waitForSelector('${sanitizedTarget}')`
    default:
      return `    // UNSUPPORTED command: ${step.command}`
  }
}

export function buildPlaywrightTest(meta: PlaywrightTestMeta, steps: PlaywrightStep[]): string {
  const httpBlocks = steps
    .filter(isCapturedRequestStep)
    .map(buildRequestBlock)
    .filter((block) => block.trim().length > 0)
    .join('\n\n')

  const actionBlocks = steps
    .filter((step): step is ActionStep => step.type === 'action')
    .map(buildJsAction)
    .join('\n')

  const setupBlock = [httpBlocks, actionBlocks]
    .filter((block) => block.trim().length > 0)
    .join('\n\n')

  return `import { test, expect } from '@playwright/test'

test('${escapeJsString(meta.testCaseName)}', async ({ page }) => {
${setupBlock.trim().length > 0 ? `  ${setupBlock}` : '  // No steps recorded'}
})
`
}

export function buildPlaywrightResponse(
  meta: PlaywrightTestMeta,
  steps: PlaywrightStep[]
): { success: true; playwright: string; filename: string } {
  return {
    success: true,
    playwright: buildPlaywrightTest(meta, steps),
    filename: `${safeFilename(meta.testCaseName)}.spec.ts`,
  }
}

function safeFilename(value: string): string {
  const filename = value.trim().replace(/[^a-z0-9._-]+/gi, '-')
  return filename.length > 0 ? filename : 'Untitled-Suite'
}
