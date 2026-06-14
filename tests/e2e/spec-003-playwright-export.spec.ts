import { test, expect } from '@playwright/test'

test.describe('Playwright Recording Mode E2E', () => {
  test('generates valid Playwright test structure with HTTP and action steps', async () => {
    // Import the generator to test the output structure
    const { buildPlaywrightTest } = await import('../../src/generators/playwright.js')

    // Simulate combined recording: HTTP requests + browser actions
    const meta = {
      testCaseName: 'Login Flow',
      baseUrl: 'https://example.com',
    }

    const steps = [
      {
        id: 'req-1',
        timestamp: '2024-01-01T00:00:00.000Z',
        method: 'GET',
        url: 'https://example.com/api/users',
        headers: { accept: 'application/json' },
        queryParams: {},
        type: 'http',
      },
      {
        type: 'action',
        command: 'open',
        target: '/login',
      },
      {
        type: 'action',
        command: 'type',
        target: '#username',
        value: 'admin',
      },
      {
        type: 'action',
        command: 'type',
        target: '#password',
        value: 'secret',
      },
      {
        type: 'action',
        command: 'clickAt',
        target: 'button[type="submit"]',
      },
      {
        id: 'req-2',
        timestamp: '2024-01-01T00:00:01.000Z',
        method: 'POST',
        url: 'https://example.com/api/login',
        headers: { 'content-type': 'application/json' },
        queryParams: {},
        body: '{"token":"abc123"}',
        type: 'http',
      },
    ]

    const output = buildPlaywrightTest(meta, steps)

    // Validate structure
    expect(output).toContain("import { test, expect } from '@playwright/test'")
    expect(output).toContain("test('Login Flow'")

    // Validate HTTP steps use page.route
    expect(output).toContain("await page.route('/api/users'")
    expect(output).toContain("await page.route('/api/login'")

    // Validate action steps
    expect(output).toContain("await page.goto('/login')")
    expect(output).toContain("await page.fill('#username', 'admin')")
    expect(output).toContain("await page.fill('#password', 'secret')")
    expect(output).toContain("await page.click('button[type=\"submit\"]')")

    // Validate order: HTTP first, then actions
    const openIndex = output.indexOf("page.goto('/login')")
    const clickIndex = output.indexOf("page.click('button[type=\"submit\"]')")
    const loginIndex = output.indexOf("page.route('/api/login'")

    // Actions should come after initial HTTP
    expect(openIndex).toBeGreaterThan(-1)
    expect(clickIndex).toBeGreaterThan(openIndex)

    // Verify output is valid TypeScript syntax (basic check)
    expect(output).toMatch(/async\s*\(\s*\{\s*page\s*\}\s*\)\s*=>/) // async ({ page }) =>
  })

  test('generates empty test stub when no steps', async () => {
    const { buildPlaywrightTest } = await import('../../src/generators/playwright.js')

    const output = buildPlaywrightTest({ testCaseName: 'Empty Test' }, [])

    expect(output).toContain("import { test, expect } from '@playwright/test'")
    expect(output).toContain("test('Empty Test'")
    expect(output).toContain('// No steps recorded')
  })
})