import { DEFAULT_JMX_OPTIONS, normalizeJmxOptions } from './jmx-options'

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
}

interface TransactionPanelOptions {
  maxTransactions: number
  openDetachedInspector: boolean
  captureResponseBody: boolean
}

type AppTheme = 'light' | 'dark'

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
  maxTransactions: 200,
  openDetachedInspector: false,
  captureResponseBody: false,
  theme: 'light',
}

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
const save = requireElement<HTMLButtonElement>('save')
const saved = requireElement<HTMLDivElement>('saved')
const maxTransactions = requireElement<HTMLInputElement>('maxTransactions')
const openDetachedInspector = requireElement<HTMLInputElement>('openDetachedInspector')
const captureResponseBody = requireElement<HTMLInputElement>('captureResponseBody')
const saveTransactionPanelOptions = requireElement<HTMLButtonElement>('saveTransactionPanelOptions')
const transactionPanelSaved = requireElement<HTMLDivElement>('transactionPanelSaved')
const themeMode = requireElement<HTMLSelectElement>('themeMode')

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
  const normalizedJmxOptions = normalizeJmxOptions({
    defaultPlanName: defaultPlanName.value.trim(),
    threads: threads.value,
    rampUp: rampUp.value,
    loops: loops.value,
    thinkTimeEnabled: thinkTimeEnabled.checked,
    thinkTimeRandomize: thinkTimeRandomize.checked,
    thinkTimeRangePercent: positiveNumber(thinkTimeRangePercent.value, DEFAULT_JMX_OPTIONS.thinkTimeRangePercent),
    assertionsEnabled: assertionsEnabled.checked,
    assertionExpectStatus: positiveNumber(assertionExpectStatus.value, DEFAULT_JMX_OPTIONS.assertionExpectStatus),
    redirectDedupEnabled: redirectDedupEnabled.checked,
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
    theme: normalizeTheme(themeMode.value),
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

function normalizeOptions(options: StoredOptions): StoredOptions {
  const jmxOptions = normalizeJmxOptions(options)

  return {
    defaultPlanName: jmxOptions.name,
    threads: jmxOptions.threads,
    rampUp: jmxOptions.rampUp,
    loops: jmxOptions.loops,
    thinkTimeEnabled: options.thinkTimeEnabled === true,
    thinkTimeRandomize: options.thinkTimeRandomize === true,
    thinkTimeRangePercent: positiveNumber(options.thinkTimeRangePercent, DEFAULT_JMX_OPTIONS.thinkTimeRangePercent),
    assertionsEnabled: options.assertionsEnabled === true,
    assertionExpectStatus: positiveNumber(options.assertionExpectStatus, DEFAULT_JMX_OPTIONS.assertionExpectStatus),
    redirectDedupEnabled: options.redirectDedupEnabled === true,
    maxTransactions: boundedNumber(options.maxTransactions, 20, 500, defaults.maxTransactions),
    openDetachedInspector: options.openDetachedInspector === true,
    captureResponseBody: options.captureResponseBody === true,
    theme: normalizeTheme(options.theme),
  }
}

function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeTheme(theme: unknown): AppTheme {
  return theme === 'dark' ? 'dark' : 'light'
}

function updateCaptureWarning(enabled: boolean): void {
  const el = document.getElementById('captureResponseBodyWarning')
  if (el === null) {
    return
  }

  el.style.display = enabled ? 'block' : 'none'
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)

  if (element === null) {
    throw new Error(`Missing options element: ${id}`)
  }

  return element as T
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unexpected error'
}
