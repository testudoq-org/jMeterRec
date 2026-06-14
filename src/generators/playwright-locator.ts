import type { ActionStep } from '../models/captured-request'

export type LocatorInput = string | { text: string } | { xpath: string }

export class PlaywrightLocatorBuilder {
  build(input: LocatorInput): string {
    if (typeof input === 'string') {
      return input
    }

    if ('text' in input) {
      return `text=${input.text}`
    }

    if ('xpath' in input) {
      return `xpath=${input.xpath}`
    }

    return ''
  }

  extractFromUrlParameter(encoded: string): string {
    if (!encoded || encoded.trim().length === 0) {
      return ''
    }

    return encoded.trim()
  }

  combineBaseUrl(baseUrl: string, path: string): string {
    if (!baseUrl || !path) {
      return baseUrl ?? ''
    }

    const cleanBase = baseUrl.replace(/\/+$/, '')
    const cleanPath = path.replace(/^\/+/, '')

    return `${cleanBase}/${cleanPath}`
  }
}

export function generateActionLocator(step: ActionStep): string {
  const builder = new PlaywrightLocatorBuilder()
  return builder.build(step.target)
}
