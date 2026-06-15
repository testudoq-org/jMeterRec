interface RecorderOptions {
  defaultPlanName: string
  threads: number
  rampUp: number
  loops: number
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
  defaultPlanName: 'Untitled Plan',
  threads: 1,
  rampUp: 1,
  loops: 1,
  maxTransactions: 200,
  openDetachedInspector: false,
  captureResponseBody: false,
  theme: 'light',
}

const defaultPlanName = requireElement<HTMLInputElement>('defaultPlanName')
const threads = requireElement<HTMLInputElement>('threads')
const rampUp = requireElement<HTMLInputElement>('rampUp')
const loops = requireElement<HTMLInputElement>('loops')
const save = requireElement<HTMLButtonElement>('save')
const saved = requireElement<HTMLDivElement>('saved')
const maxTransactions = requireElement<HTMLInputElement>('maxTransactions')
const openDetachedInspector = requireElement<HTMLInputElement>('openDetachedInspector')
const captureResponseBody = requireElement<HTMLInputElement>('captureResponseBody')
const saveTransactionPanelOptions = requireElement<HTMLButtonElement>('saveTransactionPanelOptions')
const transactionPanelSaved = requireElement<HTMLDivElement>('transactionPanelSaved')
const themeMode = requireElement<HTMLSelectElement>('themeMode')

chrome.storage.local
  .get<StoredOptions>(defaults)
  .then((options: StoredOptions) => {
    const normalizedOptions = normalizeOptions(options)

    defaultPlanName.value = normalizedOptions.defaultPlanName
    threads.value = String(normalizedOptions.threads)
    rampUp.value = String(normalizedOptions.rampUp)
    loops.value = String(normalizedOptions.loops)
    maxTransactions.value = String(normalizedOptions.maxTransactions)
    openDetachedInspector.checked = normalizedOptions.openDetachedInspector
    captureResponseBody.checked = normalizedOptions.captureResponseBody
    themeMode.value = normalizedOptions.theme
    applyTheme(normalizedOptions.theme)
  })
  .catch((err: unknown) => {
    saved.textContent = `Unable to load options: ${toErrorMessage(err)}`
  })

save.addEventListener('click', () => {
  const options: RecorderOptions & AppearanceOptions = {
    defaultPlanName: defaultPlanName.value.trim() || defaults.defaultPlanName,
    threads: positiveNumber(threads.value, defaults.threads),
    rampUp: nonNegativeNumber(rampUp.value, defaults.rampUp),
    loops: positiveNumber(loops.value, defaults.loops),
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
  return {
    defaultPlanName: options.defaultPlanName || defaults.defaultPlanName,
    threads: positiveNumber(String(options.threads), defaults.threads),
    rampUp: nonNegativeNumber(String(options.rampUp), defaults.rampUp),
    loops: positiveNumber(String(options.loops), defaults.loops),
    maxTransactions: boundedNumber(options.maxTransactions, 20, 500, defaults.maxTransactions),
    openDetachedInspector: options.openDetachedInspector === true,
    captureResponseBody: options.captureResponseBody === true,
    theme: normalizeTheme(options.theme),
  }
}

function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme
}

function normalizeTheme(theme: unknown): AppTheme {
  return theme === 'dark' ? 'dark' : 'light'
}

function positiveNumber(value: string, fallback: number): number {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function nonNegativeNumber(value: string, fallback: number): number {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)

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
