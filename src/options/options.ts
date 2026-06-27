import { DEFAULT_JMX_OPTIONS, normalizeJmxOptions } from './jmx-options'
import {
  normalizeAdvancedOptions,
  validateFilterPattern,
  validateResourceTypes,
  validateCustomUserAgent,
  type UserAgentSelection,
  type UserAgentId,
} from './advanced-options'
import {
  applyTheme,
  boundedNumber,
  normalizeTheme,
  requireElement,
  toErrorMessage,
  type AppTheme,
} from '../shared/dom-utils'

interface RecorderOptions {
  defaultPlanName: string
  threads: number
  rampUp: number
  loops: number
  thinkTimeEnabled: boolean
  thinkTimeRandomize: boolean
  thinkTimeRangePercent: number
  assertionsEnabled: boolean
  assertionExpectStatus: number
  redirectDedupEnabled: boolean
  cacheEnabled: boolean
  durationAssertionEnabled: boolean
  durationAssertionThresholdMs: number
  extractorsJson: string
}

interface TransactionPanelOptions {
  maxTransactions: number
  openDetachedInspector: boolean
  captureResponseBody: boolean
}

interface AppearanceOptions {
  theme: AppTheme
}

type StoredOptions = RecorderOptions & TransactionPanelOptions & AppearanceOptions

const defaults: StoredOptions = {
  defaultPlanName: DEFAULT_JMX_OPTIONS.name,
  threads: DEFAULT_JMX_OPTIONS.threads,
  rampUp: DEFAULT_JMX_OPTIONS.rampUp,
  loops: DEFAULT_JMX_OPTIONS.loops,
  thinkTimeEnabled: false,
  thinkTimeRandomize: false,
  thinkTimeRangePercent: 20,
  assertionsEnabled: false,
  assertionExpectStatus: 200,
  redirectDedupEnabled: false,
  cacheEnabled: false,
  durationAssertionEnabled: false,
  durationAssertionThresholdMs: 5000,
  extractorsJson: '[]',
  maxTransactions: 200,
  openDetachedInspector: false,
  captureResponseBody: false,
  theme: 'light',
}

// JMX Options elements
const defaultPlanName = requireElement<HTMLInputElement>('defaultPlanName')
const threads = requireElement<HTMLInputElement>('threads')
const rampUp = requireElement<HTMLInputElement>('rampUp')
const loops = requireElement<HTMLInputElement>('loops')
const thinkTimeEnabled = requireElement<HTMLInputElement>('thinkTimeEnabled')
const thinkTimeRandomize = requireElement<HTMLInputElement>('thinkTimeRandomize')
const thinkTimeRangePercent = requireElement<HTMLInputElement>('thinkTimeRangePercent')
const assertionsEnabled = requireElement<HTMLInputElement>('assertionsEnabled')
const assertionExpectStatus = requireElement<HTMLInputElement>('assertionExpectStatus')
const redirectDedupEnabled = requireElement<HTMLInputElement>('redirectDedupEnabled')
const cacheEnabled = requireElement<HTMLInputElement>('cacheEnabled')
const durationAssertionEnabled = requireElement<HTMLInputElement>('durationAssertionEnabled')
const durationAssertionThresholdMs = requireElement<HTMLInputElement>(
  'durationAssertionThresholdMs'
)
const extractorsJson = requireElement<HTMLTextAreaElement>('extractorsJson')
const extractorsJsonError = requireElement<HTMLDivElement>('extractorsJsonError')
const save = requireElement<HTMLButtonElement>('save')
const saved = requireElement<HTMLDivElement>('saved')

// Transaction panel options elements
const maxTransactions = requireElement<HTMLInputElement>('maxTransactions')
const openDetachedInspector = requireElement<HTMLInputElement>('openDetachedInspector')
const captureResponseBody = requireElement<HTMLInputElement>('captureResponseBody')
const saveTransactionPanelOptions = requireElement<HTMLButtonElement>('saveTransactionPanelOptions')
const transactionPanelSaved = requireElement<HTMLDivElement>('transactionPanelSaved')

// Advanced options elements
const filterPattern = requireElement<HTMLTextAreaElement>('filterPattern')
const recordCss = requireElement<HTMLInputElement>('recordCss')
const recordJs = requireElement<HTMLInputElement>('recordJs')
const recordImages = requireElement<HTMLInputElement>('recordImages')
const recordRedirects = requireElement<HTMLInputElement>('recordRedirects')
const recordCookies = requireElement<HTMLInputElement>('recordCookies')
const userAgent = requireElement<HTMLSelectElement>('userAgent')
const customUserAgent = requireElement<HTMLInputElement>('customUserAgent')
const saveAdvancedOptions = requireElement<HTMLButtonElement>('saveAdvancedOptions')
const resetAdvancedOptions = requireElement<HTMLButtonElement>('resetAdvancedOptions')
const filterPatternError = requireElement<HTMLDivElement>('filterPatternError')
const resourceTypeError = requireElement<HTMLDivElement>('resourceTypeError')
const userAgentError = requireElement<HTMLDivElement>('userAgentError')
const advancedSaved = requireElement<HTMLDivElement>('advancedSaved')

// Theme element
const themeMode = requireElement<HTMLSelectElement>('themeMode')

// Theme handling
captureResponseBody.addEventListener('change', () => {
  updateCaptureWarning(captureResponseBody.checked)
})

chrome.storage.local
  .get<StoredOptions>(defaults)
  .then((options: StoredOptions) => {
    const normalizedOptions = normalizeOptions(options)

    defaultPlanName.value = normalizedOptions.defaultPlanName
    threads.value = String(normalizedOptions.threads)
    rampUp.value = String(normalizedOptions.rampUp)
    loops.value = String(normalizedOptions.loops)
    thinkTimeEnabled.checked = normalizedOptions.thinkTimeEnabled
    thinkTimeRandomize.checked = normalizedOptions.thinkTimeRandomize
    thinkTimeRangePercent.value = String(normalizedOptions.thinkTimeRangePercent)
    assertionsEnabled.checked = normalizedOptions.assertionsEnabled
    assertionExpectStatus.value = String(normalizedOptions.assertionExpectStatus)
    redirectDedupEnabled.checked = normalizedOptions.redirectDedupEnabled
    cacheEnabled.checked = normalizedOptions.cacheEnabled
    durationAssertionEnabled.checked = normalizedOptions.durationAssertionEnabled
    durationAssertionThresholdMs.value = String(normalizedOptions.durationAssertionThresholdMs)
    extractorsJson.value = normalizedOptions.extractorsJson
    maxTransactions.value = String(normalizedOptions.maxTransactions)
    openDetachedInspector.checked = normalizedOptions.openDetachedInspector
    captureResponseBody.checked = normalizedOptions.captureResponseBody
    themeMode.value = normalizedOptions.theme
    applyTheme(normalizedOptions.theme)
    updateCaptureWarning(normalizedOptions.captureResponseBody)
  })
  .catch((err: unknown) => {
    saved.textContent = `Unable to load options: ${toErrorMessage(err)}`
  })

save.addEventListener('click', () => {
  const extractorsValidation = validateExtractorsJson(extractorsJson.value)
  const normalizedJmxOptions = normalizeJmxOptions({
    defaultPlanName: defaultPlanName.value.trim(),
    threads: threads.value,
    rampUp: rampUp.value,
    loops: loops.value,
    thinkTimeEnabled: thinkTimeEnabled.checked,
    thinkTimeRandomize: thinkTimeRandomize.checked,
    thinkTimeRangePercent: positiveNumber(
      thinkTimeRangePercent.value,
      DEFAULT_JMX_OPTIONS.thinkTimeRangePercent
    ),
    assertionsEnabled: assertionsEnabled.checked,
    assertionExpectStatus: positiveNumber(
      assertionExpectStatus.value,
      DEFAULT_JMX_OPTIONS.assertionExpectStatus
    ),
    redirectDedupEnabled: redirectDedupEnabled.checked,
    cacheEnabled: cacheEnabled.checked,
    durationAssertionEnabled: durationAssertionEnabled.checked,
    durationAssertionThresholdMs: positiveNumber(
      durationAssertionThresholdMs.value,
      DEFAULT_JMX_OPTIONS.durationAssertionThresholdMs
    ),
    extractorsJson: extractorsJson.value,
  })
  const options: RecorderOptions & AppearanceOptions = {
    defaultPlanName: normalizedJmxOptions.name,
    threads: normalizedJmxOptions.threads,
    rampUp: normalizedJmxOptions.rampUp,
    loops: normalizedJmxOptions.loops,
    thinkTimeEnabled: thinkTimeEnabled.checked,
    thinkTimeRandomize: thinkTimeRandomize.checked,
    thinkTimeRangePercent: normalizedJmxOptions.thinkTimeRangePercent,
    assertionsEnabled: assertionsEnabled.checked,
    assertionExpectStatus: normalizedJmxOptions.assertionExpectStatus,
    redirectDedupEnabled: redirectDedupEnabled.checked,
    cacheEnabled: cacheEnabled.checked,
    durationAssertionEnabled: durationAssertionEnabled.checked,
    durationAssertionThresholdMs: normalizedJmxOptions.durationAssertionThresholdMs,
    extractorsJson: normalizedJmxOptions.extractorsJson,
    theme: normalizeTheme(themeMode.value),
  }

  extractorsJsonError.style.display = extractorsValidation.valid ? 'none' : 'block'
  extractorsJsonError.textContent = extractorsValidation.error ?? ''

  if (!extractorsValidation.valid) {
    return
  }

  chrome.storage.local
    .set(options)
    .then(() => {
      saved.textContent = 'Options saved.'
    })
    .catch((err: unknown) => {
      saved.textContent = `Unable to save options: ${toErrorMessage(err)}`
    })
})

themeMode.addEventListener('change', () => {
  const theme = normalizeTheme(themeMode.value)

  applyTheme(theme)
  void chrome.storage.local.set({ theme }).then(() => {
    saved.textContent = 'Theme saved.'
  })
})

saveTransactionPanelOptions.addEventListener('click', () => {
  const options: TransactionPanelOptions = {
    maxTransactions: boundedNumber(maxTransactions.value, 20, 500, defaults.maxTransactions),
    openDetachedInspector: openDetachedInspector.checked,
    captureResponseBody: captureResponseBody.checked,
  }

  chrome.storage.local
    .set(options)
    .then(() => {
      transactionPanelSaved.textContent = 'Transaction panel options saved.'
    })
    .catch((err: unknown) => {
      transactionPanelSaved.textContent = `Unable to save transaction panel options: ${toErrorMessage(err)}`
    })
})

// Advanced options loading and handling
chrome.storage.local
  .get({
    filterPattern: 'http://*/*, https://*/*',
    recordCss: true,
    recordJs: true,
    recordImages: true,
    recordRedirects: false,
    recordCookies: true,
    userAgent: 'current',
  })
  .then((stored) => {
    const opts = normalizeAdvancedOptions(stored)

    filterPattern.value = opts.filterPattern
    recordCss.checked = opts.recordCss
    recordJs.checked = opts.recordJs
    recordImages.checked = opts.recordImages
    recordRedirects.checked = opts.recordRedirects
    recordCookies.checked = opts.recordCookies
    userAgent.value = isCustomUserAgent(opts.userAgent) ? 'custom' : opts.userAgent
    customUserAgent.value = isCustomUserAgent(opts.userAgent) ? opts.userAgent.slice(7) : ''
    updateCustomUserAgentVisibility()
  })
  .catch((err: unknown) => {
    advancedSaved.textContent = `Unable to load advanced options: ${toErrorMessage(err)}`
  })

userAgent.addEventListener('change', () => {
  updateCustomUserAgentVisibility()
})

saveAdvancedOptions.addEventListener('click', () => {
  // Validate all fields
  const filterValidation = validateFilterPattern(filterPattern.value)
  const resourceValidation = validateResourceTypes({
    recordCss: recordCss.checked,
    recordJs: recordJs.checked,
    recordImages: recordImages.checked,
  })
  const customValue = userAgent.value === 'custom' ? customUserAgent.value : ''
  const userAgentValidation = validateCustomUserAgent(
    userAgent.value as UserAgentSelection,
    customValue
  )

  // Show/hide errors
  filterPatternError.style.display = filterValidation.valid ? 'none' : 'block'
  filterPatternError.textContent = filterValidation.error ?? ''
  resourceTypeError.style.display = resourceValidation.valid ? 'none' : 'block'
  resourceTypeError.textContent = resourceValidation.error ?? ''
  userAgentError.style.display = userAgentValidation.valid ? 'none' : 'block'
  userAgentError.textContent = userAgentValidation.error ?? ''

  // Block save if any validation fails
  if (!filterValidation.valid || !resourceValidation.valid || !userAgentValidation.valid) {
    return
  }

  const storedUserAgent: UserAgentId =
    userAgent.value === 'custom'
      ? (`custom:${customUserAgent.value.trim()}` as UserAgentId)
      : (userAgent.value as UserAgentSelection as UserAgentId)

  const options = {
    filterPattern: filterPattern.value.trim(),
    recordCss: recordCss.checked,
    recordJs: recordJs.checked,
    recordImages: recordImages.checked,
    recordRedirects: recordRedirects.checked,
    recordCookies: recordCookies.checked,
    userAgent: storedUserAgent,
  }

  chrome.storage.local
    .set(options)
    .then(() => {
      advancedSaved.textContent = 'Advanced options saved.'
    })
    .catch((err: unknown) => {
      advancedSaved.textContent = `Unable to save advanced options: ${toErrorMessage(err)}`
    })
})

resetAdvancedOptions.addEventListener('click', () => {
  filterPattern.value = 'http://*/*, https://*/*'
  recordCss.checked = true
  recordJs.checked = true
  recordImages.checked = true
  recordRedirects.checked = false
  recordCookies.checked = true
  userAgent.value = 'current'
  customUserAgent.value = ''
  updateCustomUserAgentVisibility()

  // Clear error messages
  filterPatternError.style.display = 'none'
  resourceTypeError.style.display = 'none'
  userAgentError.style.display = 'none'
})

// Sync advanced options from storage changes (cross-window sync)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return
  }

  const advancedKeys = [
    'filterPattern',
    'recordCss',
    'recordJs',
    'recordImages',
    'recordRedirects',
    'recordCookies',
    'userAgent',
  ] as const

  const hasAdvancedChange = advancedKeys.some((key) => changes[key] !== undefined)
  if (!hasAdvancedChange) {
    return
  }

  chrome.storage.local
    .get({
      filterPattern: 'http://*/*, https://*/*',
      recordCss: true,
      recordJs: true,
      recordImages: true,
      recordRedirects: false,
      recordCookies: true,
      userAgent: 'current',
    })
    .then((stored) => {
      const opts = normalizeAdvancedOptions(stored)
      filterPattern.value = opts.filterPattern
      recordCss.checked = opts.recordCss
      recordJs.checked = opts.recordJs
      recordImages.checked = opts.recordImages
      recordRedirects.checked = opts.recordRedirects
      recordCookies.checked = opts.recordCookies
      userAgent.value = isCustomUserAgent(opts.userAgent) ? 'custom' : opts.userAgent
      customUserAgent.value = isCustomUserAgent(opts.userAgent) ? opts.userAgent.slice(7) : ''
      updateCustomUserAgentVisibility()
    })
    .catch((err: unknown) => {
      advancedSaved.textContent = `Sync error: ${toErrorMessage(err)}`
    })
})

function updateCustomUserAgentVisibility(): void {
  customUserAgent.style.display = userAgent.value === 'custom' ? 'block' : 'none'
}

function isCustomUserAgent(id: UserAgentId): boolean {
  return id.startsWith('custom:')
}

function normalizeOptions(options: StoredOptions): StoredOptions {
  const jmxOptions = normalizeJmxOptions(options)

  return {
    defaultPlanName: jmxOptions.name,
    threads: jmxOptions.threads,
    rampUp: jmxOptions.rampUp,
    loops: jmxOptions.loops,
    thinkTimeEnabled: options.thinkTimeEnabled === true,
    thinkTimeRandomize: options.thinkTimeRandomize === true,
    thinkTimeRangePercent: positiveNumber(
      options.thinkTimeRangePercent,
      DEFAULT_JMX_OPTIONS.thinkTimeRangePercent
    ),
    assertionsEnabled: options.assertionsEnabled === true,
    assertionExpectStatus: positiveNumber(
      options.assertionExpectStatus,
      DEFAULT_JMX_OPTIONS.assertionExpectStatus
    ),
    redirectDedupEnabled: options.redirectDedupEnabled === true,
    cacheEnabled: options.cacheEnabled === true,
    durationAssertionEnabled: options.durationAssertionEnabled === true,
    durationAssertionThresholdMs: positiveNumber(
      options.durationAssertionThresholdMs,
      DEFAULT_JMX_OPTIONS.durationAssertionThresholdMs
    ),
    extractorsJson: options.extractorsJson ?? '[]',
    maxTransactions: boundedNumber(options.maxTransactions, 20, 500, defaults.maxTransactions),
    openDetachedInspector: options.openDetachedInspector === true,
    captureResponseBody: options.captureResponseBody === true,
    theme: normalizeTheme(options.theme),
  }
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function validateExtractorsJson(value: string): { valid: boolean; error?: string } {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return { valid: true }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { valid: false, error: 'Invalid JSON format for extractors' }
  }
  if (!Array.isArray(parsed)) {
    return { valid: false, error: 'Extractors must be a JSON array' }
  }
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i]
    if (typeof item !== 'object' || item === null) {
      return { valid: false, error: 'Extractor at index ' + i + ' must be an object' }
    }
    const record = item as Record<string, unknown>
    if (record.type !== 'json' && record.type !== 'regex') {
      return {
        valid: false,
        error:
          'Extractor at index ' +
          i +
          ' has invalid type: ' +
          String(record.type) +
          '. Must be json or regex',
      }
    }
    if (record.type === 'json') {
      if (typeof record.refNames !== 'string' || record.refNames.length === 0) {
        return { valid: false, error: 'JSON extractor at index ' + i + ' must have refNames' }
      }
      if (
        typeof record.jsonPathExpressions !== 'string' ||
        record.jsonPathExpressions.length === 0
      ) {
        return {
          valid: false,
          error: 'JSON extractor at index ' + i + ' must have jsonPathExpressions',
        }
      }
    } else {
      if (typeof record.refname !== 'string' || record.refname.length === 0) {
        return { valid: false, error: 'Regex extractor at index ' + i + ' must have refname' }
      }
      if (typeof record.regex !== 'string' || record.regex.length === 0) {
        return { valid: false, error: 'Regex extractor at index ' + i + ' must have regex' }
      }
    }
  }
  return { valid: true }
}

function updateCaptureWarning(enabled: boolean): void {
  const el = document.getElementById('captureResponseBodyWarning')
  if (el === null) {
    return
  }

  el.style.display = enabled ? 'block' : 'none'
}
