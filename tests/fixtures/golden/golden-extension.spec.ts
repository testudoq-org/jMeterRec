import { test, expect } from '@playwright/test'

test('Golden E2E Test', async ({ page }) => {
// Request: GET http://127.0.0.1:3144/golden-page.html
await page.route('/golden-page.html', async (route) => {
const headers = new Headers()
await route.fulfill({
status: 200,
headers,
body: '',
})
})

// Request: GET http://127.0.0.1:3144/api/search?term=gold
await page.route('/api/search', async (route) => {
const headers = new Headers()
await route.fulfill({
status: 200,
headers,
body: '',
})
})

// Request: POST http://127.0.0.1:3144/api/login
await page.route('/api/login', async (route) => {
const headers = new Headers()
headers.set('content-type', 'application/json')
await route.fulfill({
status: 200,
headers,
body: Buffer.from('{"username":"alice","password":"secret"}', 'utf8'),
})
})

await page.click('#search-btn')
await page.fill('#username', 'alice')
await page.fill('#password', 'secret')
await page.click('#submit-login')
})
