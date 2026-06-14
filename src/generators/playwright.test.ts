import { describe, expect, it } from 'vitest'
import { buildPlaywrightTest, type PlaywrightTestMeta } from './playwright'
import type { PlaywrightStep, ActionStep } from '../models/captured-request'

describe('buildPlaywrightTest', () => {
  const baseMeta: PlaywrightTestMeta = {
    testCaseName: 'Login Flow',
    baseUrl: 'https://app.example.com',
  }

  it('generates a file with required imports and test stub', () => {
    const output = buildPlaywrightTest(baseMeta, [])

    expect(output).toContain("import { test, expect } from '@playwright/test'")
    expect(output).toContain("test('Login Flow'")
  })

  it('wraps HTTP requests inside a test using page.route', () => {
    const steps: PlaywrightStep[] = [
      {
        id: 'req-1',
        timestamp: '2024-01-01T00:00:00.000Z',
        method: 'GET',
        url: 'https://app.example.com/api/users',
        headers: { accept: 'application/json' },
        queryParams: {},
        stepType: 'http',
      },
      {
        id: 'req-2',
        timestamp: '2024-01-01T00:00:01.000Z',
        method: 'POST',
        url: 'https://app.example.com/api/login',
        headers: { 'content-type': 'application/json' },
        queryParams: {},
        body: '{"username":"user","password":"pass"}',
        stepType: 'http',
      },
    ]

    const output = buildPlaywrightTest(baseMeta, steps)

    expect(output).toContain("await page.route('/api/users'")
    expect(output).toContain("await page.route('/api/login'")
    expect(output).toContain('route.fulfill')
  })

  it('ignores requests lacking a valid URL', () => {
    const steps: PlaywrightStep[] = [
      {
        id: 'req-bad',
        timestamp: '2024-01-01T00:00:00.000Z',
        method: 'GET',
        url: 'not-a-valid-url',
        headers: {},
        queryParams: {},
        stepType: 'http',
      },
    ]

    const output = buildPlaywrightTest(baseMeta, steps)

    expect(output).not.toContain('page.route')
  })

  it('renders action steps mapped to Playwright calls', () => {
    const steps: ActionStep[] = [
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
        command: 'clickAt',
        target: 'button:has-text("Sign in")',
      },
    ]

    const output = buildPlaywrightTest(baseMeta, steps)

    expect(output).toContain("await page.goto('/login')")
    expect(output).toContain("await page.fill('#username', 'admin')")
    expect(output).toContain('await page.click(\'button:has-text("Sign in")\')')
  })

  it('falls back to unknown action call while documenting unsupported commands', () => {
    const steps: ActionStep[] = [
      {
        type: 'action',
        command: 'customTap',
        target: '#custom',
        value: 'data',
      },
    ]

    const output = buildPlaywrightTest(baseMeta, steps)

    expect(output).toContain('// UNSUPPORTED command: customTap')
  })

  it('keeps request fulfillment respecting method and body when provided', () => {
    const steps: PlaywrightStep[] = [
      {
        id: 'req-post',
        timestamp: '2024-01-01T00:00:00.000Z',
        method: 'POST',
        url: 'https://app.example.com/api/submit',
        headers: { 'content-type': 'application/json' },
        queryParams: {},
        body: '{"action":"save"}',
        stepType: 'http',
      },
    ]

    const output = buildPlaywrightTest(baseMeta, steps)

    expect(output).toContain("await page.route('/api/submit'")
    expect(output).toContain('status: 200')
    expect(output).toContain("headers.set('content-type'")
    expect(output).toContain("body: Buffer.from('")
  })

  it('combines HTTP requests and action steps in correct order', () => {
    const steps: PlaywrightStep[] = [
      {
        id: 'req-1',
        timestamp: '2024-01-01T00:00:00.000Z',
        method: 'GET',
        url: 'https://app.example.com/api/users',
        headers: {},
        queryParams: {},
        stepType: 'http',
      },
      {
        type: 'action',
        command: 'clickAt',
        target: '#load-users',
      },
    ]

    const output = buildPlaywrightTest(baseMeta, steps)

    const httpIndex = output.indexOf("page.route('/api/users'")
    const actionIndex = output.indexOf("page.click('#load-users')")
    expect(httpIndex).toBeGreaterThan(-1)
    expect(actionIndex).toBeGreaterThan(-1)
    expect(httpIndex).toBeLessThan(actionIndex)
  })
})
