export interface AdvancedOptions {
  filterPattern: string
  recordCss: boolean
  recordJs: boolean
  recordImages: boolean
  recordRedirects: boolean
  recordCookies: boolean
  userAgent: UserAgentId
}

export type UserAgentId =
  | 'current'
  | 'chrome-win'
  | 'chrome-mac'
  | 'chrome-linux'
  | 'firefox-win'
  | 'firefox-mac'
  | 'firefox-linux'
  | 'edge-win'
  | `custom:${string}`

export type UserAgentSelection =
  | 'current'
  | 'chrome-win'
  | 'chrome-mac'
  | 'chrome-linux'
  | 'firefox-win'
  | 'firefox-mac'
  | 'firefox-linux'
  | 'edge-win'
  | 'custom'

export const DEFAULT_FILTER_PATTERN = 'http://*/*, https://*/*'

export const DEFAULT_ADVANCED_OPTIONS: AdvancedOptions = {
  filterPattern: DEFAULT_FILTER_PATTERN,
  recordCss: true,
  recordJs: true,
  recordImages: true,
  recordRedirects: false,
  recordCookies: true,
  userAgent: 'current',
}

const ADVANCED_OPTION_KEYS = [
  'filterPattern',
  'recordCss',
  'recordJs',
  'recordImages',
  'recordRedirects',
  'recordCookies',
  'userAgent',
] as const

const FONT_EXTENSIONS = ['.woff', '.woff2', '.ttf', '.eot', '.otf']
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico']

const RESOURCE_TYPE_CSS = new Set(['stylesheet'])
const RESOURCE_TYPE_JS = new Set(['script', 'xmlhttprequest', 'fetch', 'main_frame', 'sub_frame'])
const RESOURCE_TYPE_IMAGES = new Set(['image'])

export interface ValidationResult {
  valid: boolean
  error?: string
}

export function validateFilterPattern(pattern: string | undefined): ValidationResult {
  const trimmed = (pattern ?? '').trim()

  if (trimmed.length === 0) {
    return { valid: true } // Empty means use default
  }

  if (trimmed === '*') {
    return { valid: true }
  }

  const patterns = parseUrlPatterns(trimmed)
  if (patterns.length === 0) {
    return { valid: false, error: 'Enter a valid URL pattern or *' }
  }

  // Try to parse each pattern - valid patterns have scheme or match <all_urls>
  for (const p of patterns) {
    if (p === '<all_urls>') {
      continue
    }

    // Must have a scheme for valid URL filter pattern
    // Check that scheme exists (not just ://)
    if (!p.includes('://')) {
      return { valid: false, error: 'Enter a valid URL pattern or *' }
    }

    // Extract scheme part and verify it's non-empty
    const schemePart = p.split('://')[0]
    if (schemePart === undefined || schemePart.length === 0) {
      return { valid: false, error: 'Enter a valid URL pattern or *' }
    }
  }

  return { valid: true }
}

export function validateResourceTypes(opts: {
  recordCss: boolean
  recordJs: boolean
  recordImages: boolean
}): ValidationResult {
  if (!opts.recordCss && !opts.recordJs && !opts.recordImages) {
    return { valid: false, error: 'At least one resource type must be selected' }
  }
  return { valid: true }
}

export function validateCustomUserAgent(
  selection: UserAgentSelection,
  customValue: string
): ValidationResult {
  if (selection !== 'custom') {
    return { valid: true }
  }

  const trimmed = customValue.trim()

  if (trimmed.length === 0) {
    return { valid: false, error: 'Custom User-Agent string cannot be empty' }
  }

  if (trimmed.length >= 512) {
    return { valid: false, error: 'Custom User-Agent string must be less than 512 characters' }
  }

  if (trimmed.includes('\n') || trimmed.includes('\r')) {
    return { valid: false, error: 'Custom User-Agent string cannot contain line breaks' }
  }

  return { valid: true }
}

export function normalizeAdvancedOptions(value: unknown): AdvancedOptions {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_ADVANCED_OPTIONS }
  }

  const record = value as Record<string, unknown>

  const filterPattern = normalizeFilterPattern(record.filterPattern)
  const recordCss = parseBoolean(record.recordCss, DEFAULT_ADVANCED_OPTIONS.recordCss)
  const recordJs = parseBoolean(record.recordJs, DEFAULT_ADVANCED_OPTIONS.recordJs)
  const recordImages = parseBoolean(record.recordImages, DEFAULT_ADVANCED_OPTIONS.recordImages)
  const recordRedirects = parseBoolean(
    record.recordRedirects,
    DEFAULT_ADVANCED_OPTIONS.recordRedirects
  )
  const recordCookies = parseBoolean(record.recordCookies, DEFAULT_ADVANCED_OPTIONS.recordCookies)
  const userAgent = normalizeUserAgent(record.userAgent)

  return {
    filterPattern,
    recordCss,
    recordJs,
    recordImages,
    recordRedirects,
    recordCookies,
    userAgent,
  }
}

export class AdvancedOptionsStore {
  constructor(private readonly storage: chrome.storage.LocalStorageArea = chrome.storage.local) {}

  async load(): Promise<AdvancedOptions> {
    const values = await this.storage.get(ADVANCED_OPTION_KEYS as unknown as string[])
    return normalizeAdvancedOptions(values)
  }

  async save(options: AdvancedOptions): Promise<void> {
    await this.storage.set(options)
  }
}

function normalizeFilterPattern(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_FILTER_PATTERN
  }
  return value.trim()
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeUserAgent(value: unknown): UserAgentId {
  if (typeof value !== 'string') {
    return DEFAULT_ADVANCED_OPTIONS.userAgent
  }

  // Handle custom user agent format
  if (value.startsWith('custom:')) {
    const customValue = value.slice(7).trim()
    const validation = validateCustomUserAgent('custom', customValue)
    if (!validation.valid || customValue.length === 0) {
      return DEFAULT_ADVANCED_OPTIONS.userAgent
    }
    return `custom:${customValue}` as const
  }

  // Check if valid predefined selection (excluding 'custom')
  if (isPredefinedUserAgent(value)) {
    return value
  }

  return DEFAULT_ADVANCED_OPTIONS.userAgent
}

function isPredefinedUserAgent(
  value: string
): value is
  | 'current'
  | 'chrome-win'
  | 'chrome-mac'
  | 'chrome-linux'
  | 'firefox-win'
  | 'firefox-mac'
  | 'firefox-linux'
  | 'edge-win' {
  const validIds = [
    'current',
    'chrome-win',
    'chrome-mac',
    'chrome-linux',
    'firefox-win',
    'firefox-mac',
    'firefox-linux',
    'edge-win',
  ]
  return validIds.includes(value)
}

// URL Pattern matching functions

export function parseUrlPatterns(pattern: string | undefined): string[] {
  if (pattern === undefined || pattern.trim().length === 0) {
    return ['<all_urls>']
  }

  const trimmed = pattern.trim()
  if (trimmed === '*') {
    return ['<all_urls>']
  }

  const patterns = trimmed
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  return patterns.length > 0 ? patterns : ['<all_urls>']
}

export function matchesUrlPattern(url: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (matchesSinglePattern(url, pattern)) {
      return true
    }
  }
  return false
}

function matchesSinglePattern(url: string, pattern: string): boolean {
  if (pattern === '<all_urls>') {
    return true
  }

  // Parse chrome match pattern syntax
  // Pattern format: [<scheme>://]<host><path>
  // Scheme can be: http, https, *, or specific scheme
  // Host can be: *, *.example.com, example.com, etc.
  // Path is a prefix match

  try {
    const urlObj = new URL(url)
    const urlScheme = urlObj.protocol.replace(':', '')
    const urlHost = urlObj.host.toLowerCase()
    const urlPath = urlObj.pathname

    // Parse pattern
    const patternParts = pattern.split('://')
    const scheme = patternParts.length > 1 && patternParts[0] ? patternParts[0].toLowerCase() : null
    const afterSchemeRaw = patternParts.length > 1 ? patternParts[1] : patternParts[0]
    const afterScheme = afterSchemeRaw ?? ''

    // If no scheme in pattern, it's invalid for our purposes
    if (scheme === null) {
      return false
    }

    // If scheme is '*', it matches http or https
    if (scheme !== '*' && scheme !== urlScheme) {
      // Also allow http/https cross-scheme matching
      if (scheme !== 'http' && scheme !== 'https') {
        return false
      }
      // For http/https patterns, we allow cross-scheme matching (continue)
    }

    // Parse host and path from the pattern
    const slashIndex = afterScheme.indexOf('/')
    const patternHost = slashIndex >= 0 ? afterScheme.substring(0, slashIndex) : afterScheme
    const patternPath = slashIndex >= 0 ? afterScheme.substring(slashIndex) : '/'

    // Host matching
    if (!matchesHost(urlHost, patternHost)) {
      return false
    }

    // Path matching (prefix match, with * being wildcard)
    const normalizedPath = patternPath.replace(/\*/g, '')
    if (!urlPath.startsWith(normalizedPath)) {
      return false
    }

    return true
  } catch {
    return false
  }
}

function matchesHost(urlHost: string, patternHost: string): boolean {
  if (patternHost === '*') {
    return true
  }

  const normalizedPattern = patternHost.toLowerCase()

  if (normalizedPattern.startsWith('*.')) {
    const domain = normalizedPattern.slice(2)
    return urlHost === domain || urlHost.endsWith('.' + domain)
  }

  return urlHost === normalizedPattern
}

// Resource type filtering

export function shouldCaptureResourceType(
  opts: AdvancedOptions,
  resourceType: string,
  url?: string
): boolean {
  // Check font/image extensions first - they override resource type based on URL content
  // Font extensions are controlled by recordCss (per spec)
  if (url && hasFontExtension(url)) {
    return opts.recordCss
  }

  // Image extensions are controlled by recordImages
  if (url && hasImageExtension(url) && !hasFontExtension(url)) {
    return opts.recordImages
  }

  // CSS/Font resources
  if (RESOURCE_TYPE_CSS.has(resourceType)) {
    return opts.recordCss
  }

  // JS/XHR/Fetch/Main-frame/Sub-frame resources
  if (RESOURCE_TYPE_JS.has(resourceType)) {
    return opts.recordJs
  }

  // Image resources (but not font URLs which were already handled above)
  if (RESOURCE_TYPE_IMAGES.has(resourceType)) {
    return opts.recordImages
  }

  // Default: capture if at least one resource type is enabled
  return opts.recordCss || opts.recordJs || opts.recordImages
}

function hasFontExtension(url: string): boolean {
  const lowerUrl = url.toLowerCase()
  return FONT_EXTENSIONS.some((ext) => lowerUrl.includes(ext))
}

function hasImageExtension(url: string): boolean {
  const lowerUrl = url.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lowerUrl.includes(ext))
}
