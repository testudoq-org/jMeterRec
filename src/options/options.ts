import { DEFAULT_JMX_OPTIONS, normalizeJmxOptions } from './jmx-options'
import {
  DEFAULT_BACKEND_UPLOAD_CONFIG,
  BackendUploadStore,
  isValidUrl,
} from './backend-upload-options'
import type { BackendUploadConfig } from './backend-upload-options'

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
  defaultPlanName: DEFAULT_JMX_OPTIONS.name,
  threads: DEFAULT_JMX_OPTIONS.threads,
  rampUp: DEFAULT_JMX_OPTIONS.rampUp,
  loops: DEFAULT_JMX_OPTIONS.loops,
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

const backendUploadEnabled = requireElement<HTMLInputElement>('backendUploadEnabled')
const backendUploadConverterUrl = requireElement<HTMLInputElement>('backendUploadConverterUrl')
const backendUploadAuthToken = requireElement<HTMLInputElement>('backendUploadAuthToken')
const backendUploadTimeout = requireElement<HTMLInputElement>('backendUploadTimeout')
const backendUploadFields = requireElement<HTMLDivElement>('backendUploadFields')
const backendUploadUrlError = requireElement<HTMLDivElement>('backendUploadUrlError')
const saveBackendUploadOptions = requireElement<HTMLButtonElement>('saveBackendUploadOptions')
const backendUploadSaved = requireElement<HTMLDivElement>('backendUploadSaved')

const backendUploadStore = new BackendUploadStore()

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

void loadBackendUploadOptions().catch(() => undefined)

save.addEventListener('click', () => {
  const normalizedJmxOptions = normalizeJmxOptions({
    defaultPlanName: defaultPlanName.value.trim(),
    threads: threads.value,
    rampUp: rampUp.value,
    loops: loops.value,
  })
  const options: RecorderOptions & AppearanceOptions = {
    defaultPlanName: normalizedJmxOptions.name,
    threads: normalizedJmxOptions.threads,
    rampUp: normalizedJmxOptions.rampUp,
    loops: normalizedJmxOptions.loops,
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

saveBackendUploadOptions.addEventListener('click', () => {
  if (saveBackendUploadOptions.disabled) {
    return
  }

  const url = backendUploadConverterUrl.value.trim()

  if (!isValidUrl(url)) {
    backendUploadUrlError.textContent = 'Enter a valid URL.'
    backendUploadConverterUrl.setAttribute('aria-invalid', 'true')
    return
  }

  backendUploadUrlError.textContent = ''
  backendUploadConverterUrl.removeAttribute('aria-invalid')

  const config: BackendUploadConfig = {
    enabled: backendUploadEnabled.checked,
    converterUrl: url,
    authToken: backendUploadAuthToken.value,
    timeoutMs: boundedNumber(
      backendUploadTimeout.value,
      5000,
      300000,
      DEFAULT_BACKEND_UPLOAD_CONFIG.timeoutMs
    ),
    includeDomains: [],
    exportFilename: '',
  }

  backendUploadStore
    .save(config)
    .then(() => {
      backendUploadSaved.textContent = 'Backend converter options saved.'
    })
    .catch((err: unknown) => {
      backendUploadSaved.textContent = `Unable to save backend converter options: ${toErrorMessage(err)}`
    })
})

backendUploadEnabled.addEventListener('change', () => {
  applyBackendUploadDisabledState()
})

backendUploadConverterUrl.addEventListener('blur', () => {
  if (
    backendUploadConverterUrl.value.trim().length > 0 &&
    !isValidUrl(backendUploadConverterUrl.value)
  ) {
    backendUploadUrlError.textContent = 'Enter a valid URL.'
    backendUploadConverterUrl.setAttribute('aria-invalid', 'true')
  } else {
    backendUploadUrlError.textContent = ''
    backendUploadConverterUrl.removeAttribute('aria-invalid')
  }
})

function normalizeOptions(options: StoredOptions): StoredOptions {
  const jmxOptions = normalizeJmxOptions(options)

  return {
    defaultPlanName: jmxOptions.name,
    threads: jmxOptions.threads,
    rampUp: jmxOptions.rampUp,
    loops: jmxOptions.loops,
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

function applyBackendUploadDisabledState(): void {
  const disabled = !backendUploadEnabled.checked
  backendUploadConverterUrl.disabled = disabled
  backendUploadAuthToken.disabled = disabled
  backendUploadTimeout.disabled = disabled

  if (disabled) {
    backendUploadFields.classList.add('disabled')
  } else {
    backendUploadFields.classList.remove('disabled')
  }
}

async function loadBackendUploadOptions(): Promise<void> {
  try {
    const config = await backendUploadStore.load()
    backendUploadEnabled.checked = config.enabled
    backendUploadConverterUrl.value = config.converterUrl
    backendUploadAuthToken.value = config.authToken
    backendUploadTimeout.value = String(config.timeoutMs)
    applyBackendUploadDisabledState()
  } catch {
    // Ignore load failures
  }
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
