import { describe, expect, it } from 'vitest'
import { PlaywrightLocatorBuilder } from './playwright-locator'

describe('PlaywrightLocatorBuilder', () => {
  it('builds locator from valid CSS selector', () => {
    const builder = new PlaywrightLocatorBuilder()
    const locator = builder.build('#username')

    expect(locator).toBe('#username')
  })

  it('builds locator from valid CSS class selector', () => {
    const builder = new PlaywrightLocatorBuilder()
    const locator = builder.build('.submit-button')

    expect(locator).toBe('.submit-button')
  })

  it('builds locator from text selector', () => {
    const builder = new PlaywrightLocatorBuilder()
    const locator = builder.build({ text: 'Sign In' })

    expect(locator).toBe('text=Sign In')
  })

  it('escapes special characters in text selector', () => {
    const builder = new PlaywrightLocatorBuilder()
    const locator = builder.build({ text: 'Buy Now! (Limited Offer)' })

    expect(locator).toBe('text=Buy Now! (Limited Offer)')
  })

  it('builds xpath locator', () => {
    const builder = new PlaywrightLocatorBuilder()
    const locator = builder.build({ xpath: '//input[@type="email"]' })

    expect(locator).toBe('xpath=//input[@type="email"]')
  })

  it('extracts element from URL-embedded parameter', () => {
    const builder = new PlaywrightLocatorBuilder()
    // Simulating URL like: https://app.example.com/search?q=test#element:button.submit
    const locator = builder.extractFromUrlParameter('button.submit')

    expect(locator).toBe('button.submit')
  })

  it('returns empty string for invalid URL parameter', () => {
    const builder = new PlaywrightLocatorBuilder()
    const locator = builder.extractFromUrlParameter('')

    expect(locator).toBe('')
  })

  it('combines baseUrl with relative path', () => {
    const builder = new PlaywrightLocatorBuilder()
    const url = builder.combineBaseUrl('https://app.example.com', '/login')

    expect(url).toBe('https://app.example.com/login')
  })

  it('removes trailing slash from baseUrl', () => {
    const builder = new PlaywrightLocatorBuilder()
    const url = builder.combineBaseUrl('https://app.example.com/', '/login')

    expect(url).toBe('https://app.example.com/login')
  })

  it('handles path without leading slash', () => {
    const builder = new PlaywrightLocatorBuilder()
    const url = builder.combineBaseUrl('https://app.example.com', 'login')

    expect(url).toBe('https://app.example.com/login')
  })
})
