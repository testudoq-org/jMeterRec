import { JmxOptionsStore } from '../options/jmx-options'
import type { BackgroundRequest, BackgroundResponse, RecorderSnapshot } from '../messages'
import type { CapturedRequest } from '../models/captured-request'

type ResponseWithSnapshot = Extract<BackgroundResponse, { snapshot?: RecorderSnapshot }>
type TransactionRequest = CapturedRequest & { responseBody?: string }
type RequestCapturedMessage = { type: 'REQUEST_CAPTURED'; request: TransactionRequest }
type AppTheme = 'light' | 'dark'

interface TransactionPanelOptions {
  maxTransactions: number
  openDetachedInspector: boolean
  captureResponseBody: boolean
  theme: AppTheme
}

const defaultTransactionPanelOptions: TransactionPanelOptions = {
  maxTransactions: 200,
  openDetachedInspector: false,
  captureResponseBody: false,
  theme: 'light',
}

const capturedRequestStringFields = ['id', 'timestamp', 'method', 'url'] as const
const capturedRequestObjectFields = ['headers', 'queryParams'] as const
const statusBuckets = ['pending', '2xx', '3xx', '4xx', '5xx'] as const

const planNameInput = requireElement<HTMLInputElement>('planName')
const status = requireElement<HTMLDivElement>('status')
const elapsedTime = requireElement<HTMLDivElement>('elapsedTime')
const error = requireElement<HTMLDivElement>('error')
const start = requireElement<HTMLButtonElement>('start')
const pause = requireElement<HTMLButtonElement>('pause')
const resume = requireElement<HTMLButtonElement>('resume')
const stop = requireElement<HTMLButtonElement>('stop')
const exportMode = requireElement<HTMLSelectElement>('exportMode')
const exportBtn = requireElement<HTMLButtonElement>('export')
const clear = requireElement<HTMLButtonElement>('clear')
const jmxOptions = requireElement<HTMLDivElement>('jmxOptions')
const jmxDomains = requireElement<HTMLDivElement>('jmxDomains')
const jmxDomainStatus = requireElement<HTMLDivElement>('jmxDomainStatus')
const jmxDomainError = requireElement<HTMLDivElement>('jmxDomainError')
const exportJmxSelected = requireElement<HTMLButtonElement>('exportJmxSelected')
const playwrightOptions = requireElement<HTMLDivElement>('playwrightOptions')
const baseUrlInput = requireElement<HTMLInputElement>('baseUrl')
const transactionSummary = requireElement<HTMLParagraphElement>('transactionSummary')
const transactionMethodFilter = requireElement<HTMLSelectElement>('transactionMethodFilter')
const transactionStatusFilter = requireElement<HTMLSelectElement>('transactionStatusFilter')
const transactionSearch = requireElement<HTMLInputElement>('transactionSearch')
const transactionList = requireElement<HTMLDivElement>('transactionList')
const openDetachedInspector = requireElement<HTMLButtonElement>('openDetachedInspector')
const themeMode = requireElement<HTMLSelectElement>('themeMode')

let availableDomains: string[] = []
let selectedDomains = new Set<string>()
let transactionPanelOptions = defaultTransactionPanelOptions

const transactions: CapturedRequest[] = []

let snapshot: RecorderSnapshot = {
  status: 'idle',
  recording: false,
  planName: 'Untitled Plan',
  requestCount: 0,
  startedAt: undefined,
}

let elapsedTimer: number | null = null
let detachedWindowId: number | null = null
let pausedElapsedSeconds = 0

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === detachedWindowId) {
    detachedWindowId = null
  }
})

planNameInput.addEventListener('input', () => {
  snapshot = { ...snapshot, planName: planNameInput.value }
})

exportMode.addEventListener('change', () => {
  const isJmx = exportMode.value === 'jmx'

  jmxOptions.style.display = isJmx ? 'block' : 'none'
  playwrightOptions.style.display = exportMode.value === 'playwright' ? 'block' : 'none'
  clearJmxDomainError()
})

start.addEventListener('click', () => {
  void send({ type: 'START_RECORDING', planName: planNameInput.value }).then((response) => {
    if (response.success) {
      openDetachedInspectorWindowIfEnabled()
    }
  })
})

pause.addEventListener('click', () => {
  void send({ type: 'PAUSE_RECORDING' })
})

resume.addEventListener('click', () => {
  void send({ type: 'RESUME_RECORDING' })
})

stop.addEventListener('click', () => {
  cleanupTimer()
  void send({ type: 'STOP_RECORDING' }).then((response) => {
    if (response.success) {
      snapshot = { ...snapshot, status: 'idle', recording: false, startedAt: undefined }
      applySnapshot(snapshot)
    }
  })
})

clear.addEventListener('click', () => {
  void send({ type: 'RESET' }).then((response) => {
    if (response.success) {
      if (isSnapshotResponse(response)) {
        applySnapshot(response.snapshot)
      }
      transactions.splice(0, transactions.length)
      availableDomains = []
      selectedDomains.clear()
      renderTransactions()
    }
  })
})

exportBtn.addEventListener('click', () => {
  void exportRecording()
})

exportJmxSelected.addEventListener('click', () => {
  void exportSelectedJmxDomains()
})

openDetachedInspector.addEventListener('click', () => {
  openDetachedInspectorWindow()
})

themeMode.addEventListener('change', () => {
  const theme = normalizeTheme(themeMode.value)

  applyTheme(theme)
  void chrome.storage.local.set({ theme }).catch((err: unknown) => {
    showError(toErrorMessage(err))
  })
})

transactionMethodFilter.addEventListener('change', renderTransactions)
transactionStatusFilter.addEventListener('change', renderTransactions)
transactionSearch.addEventListener('input', renderTransactions)

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isStateBroadcast(message)) {
    applySnapshot(message.snapshot)
  }

  if (isRequestCapturedMessage(message)) {
    appendTransaction(message.request)
  }
})

void refreshState().catch((err: unknown) => {
  showError(toErrorMessage(err))
})

void loadTransactionPanelOptions()
  .then(() => seedTransactions())
  .catch((err: unknown) => {
    showError(toErrorMessage(err))
  })

void loadJmxOptions().catch((err: unknown) => {
  showError(toErrorMessage(err))
})

elapsedTimer = globalThis.setInterval(updateElapsed, 1000)

chrome.runtime.onSuspend.addListener(cleanupTimer)

async function refreshState(): Promise<void> {
  const response = await send({ type: 'GET_STATE' })

  if (isSnapshotResponse(response)) {
    applySnapshot(response.snapshot)
  }
}

async function seedTransactions(): Promise<void> {
  const response = await send({ type: 'GET_REQUESTS' })

  if (isRequestsResponse(response)) {
    transactions.splice(0, transactions.length, ...response.requests.filter(isCapturedRequest))
    trimTransactions()
    renderTransactions()
  }
}

async function loadTransactionPanelOptions(): Promise<void> {
  transactionPanelOptions = normalizeTransactionPanelOptions(
    await chrome.storage.local.get<TransactionPanelOptions>(defaultTransactionPanelOptions)
  )

  applyTheme(transactionPanelOptions.theme)
  themeMode.value = transactionPanelOptions.theme
  trimTransactions()
  renderTransactions()
}

async function loadJmxOptions(): Promise<void> {
  const options = await new JmxOptionsStore().load()

  if (planNameInput.value.trim().length === 0) {
    planNameInput.value = options.name
  }
}

async function exportRecording(): Promise<void> {
  clearError()

  if (exportMode.value !== 'playwright') {
    await prepareJmxExport()
    return
  }

  await exportPlaywrightRecording()
}

async function exportPlaywrightRecording(): Promise<void> {
  const baseUrl = baseUrlInput.value.trim().length > 0 ? baseUrlInput.value.trim() : undefined

  const response = await send({
    type: 'EXPORT_PLAYWRIGHT',
    baseUrl,
    suiteName: snapshot.planName,
    testCaseName: `${snapshot.planName} Test`,
  })

  if (!canDownloadPlaywright(response)) {
    showError('Export failed.')
    return
  }

  download(response.playwright, response.filename)
}

function canDownloadPlaywright(
  response: BackgroundResponse
): response is Extract<
  BackgroundResponse,
  { success: true; playwright: string; filename: string }
> {
  return response.success && isPlaywrightResponse(response)
}

async function prepareJmxExport(): Promise<void> {
  const response = await send({ type: 'GET_DOMAINS' })

  if (!canLoadDomains(response)) {
    showError('Unable to load domains for JMX export.')
    return
  }

  availableDomains = response.domains

  if (availableDomains.length === 0) {
    showError('No domains were captured for JMX export.')
    return
  }

  selectedDomains = new Set(availableDomains)
  renderJmxDomainSelector()
  await exportJmx(availableDomains)
}

function canLoadDomains(
  response: BackgroundResponse
): response is Extract<BackgroundResponse, { success: true; domains: string[] }> {
  return response.success && isDomainsResponse(response)
}

async function exportSelectedJmxDomains(): Promise<void> {
  clearError()
  clearJmxDomainError()

  if (selectedDomains.size === 0) {
    showJmxDomainError('Select at least one domain.')
    return
  }

  await exportJmx([...selectedDomains])
}

async function exportJmx(includedDomains: string[]): Promise<void> {
  exportJmxSelected.disabled = true
  exportJmxSelected.textContent = 'Converting…'

  const response = await send({
    type: 'EXPORT_JMX',
    includedDomains,
  })

  exportJmxSelected.disabled = selectedDomains.size === 0
  exportJmxSelected.textContent = 'Export HAR → JMX'

  if (!response.success) {
    showError(response.error)
    return
  }

  if (!('jmx' in response)) {
    showError('Export failed.')
    return
  }

  download(response.jmx, response.filename)
}

async function send(message: BackgroundRequest): Promise<BackgroundResponse> {
  clearError()

  try {
    const response = await chrome.runtime.sendMessage(message)

    if (!isBackgroundResponse(response)) {
      throw new Error('Background returned an invalid response.')
    }

    if (!response.success) {
      showError(response.error)
    }

    return response
  } catch (err) {
    const messageText = toErrorMessage(err)
    showError(messageText)
    throw err
  }
}

function applySnapshot(next: RecorderSnapshot | undefined): void {
  if (next === undefined) {
    return
  }

  if (next.status === 'recording' && snapshot.status === 'paused') {
    next = { ...next, startedAt: new Date(Date.now() - pausedElapsedSeconds * 1000).toISOString() }
    pausedElapsedSeconds = 0
  }

  if (
    next.status === 'paused' &&
    snapshot.status === 'recording' &&
    snapshot.startedAt !== undefined
  ) {
    pausedElapsedSeconds = secondsBetween(snapshot.startedAt, new Date().toISOString())
  }

  if (next.status === 'idle') {
    pausedElapsedSeconds = 0
  }

  snapshot = next
  planNameInput.value = next.planName
  status.textContent = `${labelFor(next.status)} — ${next.requestCount} captured request${next.requestCount === 1 ? '' : 's'}`
  status.className = `status status-${next.status}`
  elapsedTime.textContent = formatElapsed(snapshot.startedAt)
  start.disabled = next.status === 'recording' || next.status === 'paused'
  pause.disabled = next.status !== 'recording'
  resume.disabled = next.status !== 'paused'
  stop.disabled = !next.recording
  exportBtn.disabled = next.requestCount === 0
  clear.disabled = next.requestCount === 0 && !next.recording
}

function appendTransaction(request: CapturedRequest): void {
  const existingIndex = transactions.findIndex((transaction) => transaction.id === request.id)

  if (existingIndex >= 0) {
    transactions.splice(existingIndex, 1)
  }

  transactions.push(request)
  trimTransactions()
  renderTransactions()
}

function trimTransactions(): void {
  while (transactions.length > transactionPanelOptions.maxTransactions) {
    transactions.shift()
  }
}

function renderTransactions(): void {
  const filteredTransactions = filterTransactions()

  transactionList.replaceChildren()
  transactionSummary.textContent =
    filteredTransactions.length === transactions.length
      ? `${transactions.length} recent request${transactions.length === 1 ? '' : 's'}`
      : `Showing ${filteredTransactions.length} of ${transactions.length} requests`

  for (const request of [...filteredTransactions].reverse()) {
    transactionList.append(createTransactionRow(request))
  }
}

function filterTransactions(): CapturedRequest[] {
  const method = transactionMethodFilter.value
  const statusFilter = transactionStatusFilter.value
  const search = transactionSearch.value.trim().toLowerCase()

  return transactions.filter((request) => matchesTransaction(request, method, statusFilter, search))
}

function matchesTransaction(
  request: CapturedRequest,
  method: string,
  statusFilter: string,
  search: string
): boolean {
  if (!matchesMethod(request, method)) {
    return false
  }

  if (!matchesStatus(request, statusFilter)) {
    return false
  }

  return matchesSearch(request, search)
}

function matchesMethod(request: CapturedRequest, method: string): boolean {
  return method === 'all' || request.method === method
}

function matchesStatus(request: CapturedRequest, statusFilter: string): boolean {
  return statusFilter === 'all' || statusBucket(request) === statusFilter
}

function matchesSearch(request: CapturedRequest, search: string): boolean {
  return search.length === 0 || request.url.toLowerCase().includes(search)
}

function createTransactionRow(request: CapturedRequest): HTMLButtonElement {
  const row = document.createElement('button')
  const method = document.createElement('span')
  const url = document.createElement('span')
  const requestStatus = document.createElement('span')
  const time = document.createElement('span')
  const detailsId = `transaction-details-${safeId(request.id)}`

  row.type = 'button'
  row.className = 'transaction-row'
  row.setAttribute('aria-expanded', 'false')
  row.setAttribute('aria-controls', detailsId)
  row.setAttribute('aria-label', transactionAriaLabel(request))
  row.title = request.url

  method.textContent = request.method
  method.className = transactionMethodClass(request.method)

  url.textContent = shortenUrl(request.url)
  url.className = 'transaction-url'

  requestStatus.textContent = transactionStatusText(request)
  requestStatus.className = transactionStatusClass(request)

  time.textContent = formatTime(request.timestamp)
  time.className = 'transaction-time'

  row.append(method, url, requestStatus, time)
  row.addEventListener('click', () => {
    toggleTransactionDetails(row, request, detailsId, method, url, requestStatus, time)
  })

  return row
}

function toggleTransactionDetails(
  row: HTMLButtonElement,
  request: CapturedRequest,
  detailsId: string,
  method: HTMLSpanElement,
  url: HTMLSpanElement,
  requestStatus: HTMLSpanElement,
  time: HTMLSpanElement
): void {
  const expanded = row.getAttribute('aria-expanded') === 'true'

  row.setAttribute('aria-expanded', String(!expanded))

  if (expanded) {
    row.replaceChildren(method, url, requestStatus, time)
    return
  }

  row.replaceChildren(method, url, requestStatus, time, createDetails(request, detailsId))
}

function transactionAriaLabel(request: CapturedRequest): string {
  return `${request.method} ${shortenUrl(request.url)} ${transactionStatusText(request).toLowerCase()}`
}

function transactionMethodClass(method: string): string {
  return `method ${methodClass(method)}`
}

function transactionStatusText(request: CapturedRequest): string {
  if (request.error) {
    return 'Error'
  }

  return statusLabel(request.statusCode)
}

function transactionStatusClass(request: CapturedRequest): string {
  return `status-badge ${statusClass(request)}`
}

function createDetails(request: CapturedRequest, detailsId: string): HTMLPreElement {
  const details = document.createElement('pre')

  details.id = detailsId
  details.className = 'transaction-details'
  details.textContent = JSON.stringify(
    {
      url: request.url,
      method: request.method,
      timestamp: request.timestamp,
      completedAt: request.completedAt,
      statusCode: request.statusCode,
      duration: formatDurationBetween(request.timestamp, request.completedAt),
      headers: request.headers,
      responseHeaders: request.responseHeaders,
      body: truncate(request.body, 4000),
      responseBody: responseBodyFor(request),
    },
    null,
    2
  )

  return details
}

function isDomainsResponse(
  response: BackgroundResponse
): response is Extract<BackgroundResponse, { success: true; domains: string[] }> {
  return Array.isArray((response as { domains?: unknown }).domains)
}

function renderJmxDomainSelector(): void {
  jmxOptions.style.display = 'block'
  jmxDomains.replaceChildren()

  for (const domain of availableDomains) {
    const label = document.createElement('label')
    const checkbox = document.createElement('input')
    const name = document.createElement('span')

    label.className = 'domain-option'
    checkbox.type = 'checkbox'
    checkbox.value = domain
    checkbox.checked = selectedDomains.has(domain)
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedDomains.add(domain)
      } else {
        selectedDomains.delete(domain)
      }

      updateJmxDomainSelectionState()
    })
    name.textContent = domain

    label.append(checkbox, name)
    jmxDomains.append(label)
  }

  updateJmxDomainSelectionState()
}

function updateJmxDomainSelectionState(): void {
  const selectedCount = selectedDomains.size

  exportJmxSelected.disabled = selectedCount === 0
  jmxDomainStatus.textContent = `${selectedCount} of ${availableDomains.length} domains selected`
  clearJmxDomainError()
}

function isStateBroadcast(
  message: unknown
): message is { type: 'STATE_CHANGED'; snapshot: RecorderSnapshot } {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as Record<string, unknown>).type === 'STATE_CHANGED' &&
    isRecorderSnapshot((message as Record<string, unknown>).snapshot)
  )
}

function isRequestCapturedMessage(message: unknown): message is RequestCapturedMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as Record<string, unknown>).type === 'REQUEST_CAPTURED' &&
    isCapturedRequest((message as Record<string, unknown>).request)
  )
}

function isRequestsResponse(
  response: BackgroundResponse
): response is { success: true; requests: unknown[] } {
  return response.success && Array.isArray((response as { requests?: unknown }).requests)
}

function isSnapshotResponse(response: BackgroundResponse): response is ResponseWithSnapshot {
  return 'snapshot' in response
}

function isPlaywrightResponse(
  response: BackgroundResponse
): response is Extract<
  BackgroundResponse,
  { success: true; playwright: string; filename: string }
> {
  return 'playwright' in response && 'filename' in response
}

function isBackgroundResponse(response: unknown): response is BackgroundResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    typeof (response as Record<string, unknown>).success === 'boolean'
  )
}

function isRecorderSnapshot(value: unknown): value is RecorderSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    (record.status === 'idle' || record.status === 'recording' || record.status === 'paused') &&
    typeof record.recording === 'boolean' &&
    typeof record.planName === 'string' &&
    typeof record.requestCount === 'number'
  )
}

function isCapturedRequest(value: unknown): value is CapturedRequest {
  if (!isRecord(value)) {
    return false
  }

  if (hasAllStringFields(value, capturedRequestStringFields)) {
    return hasAllObjectFields(value, capturedRequestObjectFields)
  }

  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasAllStringFields(record: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => typeof record[field] === 'string')
}

function hasAllObjectFields(record: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => {
    const value = record[field]
    return typeof value === 'object' && value !== null
  })
}

function normalizeTransactionPanelOptions(
  options: Partial<TransactionPanelOptions>
): TransactionPanelOptions {
  return {
    maxTransactions: boundedNumber(
      options.maxTransactions,
      20,
      500,
      defaultTransactionPanelOptions.maxTransactions
    ),
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

function openDetachedInspectorWindowIfEnabled(): void {
  if (transactionPanelOptions.openDetachedInspector) {
    openDetachedInspectorWindow()
  }
}

function openDetachedInspectorWindow(): void {
  if (detachedWindowId !== null) {
    chrome.windows.update(detachedWindowId, { focused: true }).catch(() => {
      detachedWindowId = null
      openDetachedInspectorWindow()
    })
    return
  }

  void chrome.windows
    .create({
      url: chrome.runtime.getURL('src/popup/popup.html?detached=1'),
      type: 'popup',
      width: 420,
      height: 720,
      focused: true,
    })
    .then((win) => {
      if (win?.id !== undefined) {
        detachedWindowId = win.id
      }
    })
}

function labelFor(statusValue: RecorderSnapshot['status']): string {
  switch (statusValue) {
    case 'recording':
      return 'Recording'
    case 'paused':
      return 'Paused'
    case 'idle':
      return 'Idle'
  }
}

function statusLabel(statusCode: number | undefined): string {
  return statusCode === undefined ? 'Pending' : `${statusCode}`
}

function statusBucket(request: CapturedRequest): string {
  if (request.error) {
    return 'error'
  }

  const statusCode = request.statusCode ?? 0
  const bucketIndex = Math.min(4, Math.max(0, Math.floor((statusCode - 200) / 100)))
  return statusBuckets[bucketIndex]!
}

function statusClass(request: CapturedRequest): string {
  return `status-${statusBucket(request)}`
}

function methodClass(method: string): string {
  return `method-${method.toLowerCase()}`
}

function responseBodyFor(request: TransactionRequest): string {
  if (!transactionPanelOptions.captureResponseBody) {
    return 'Response body capture disabled'
  }

  return request.responseBody ?? 'Unavailable from webRequest (enable capture in options)'
}

function download(contents: string, filename: string): void {
  const blob = new Blob([contents], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)

  if (element === null) {
    throw new Error(`Missing popup element: ${id}`)
  }

  return element as T
}

function showError(message: string): void {
  error.textContent = message
}

function showJmxDomainError(message: string): void {
  jmxDomainError.textContent = message
}

function clearError(): void {
  error.textContent = ''
  clearJmxDomainError()
}

function clearJmxDomainError(): void {
  jmxDomainError.textContent = ''
}

function cleanupTimer(): void {
  if (elapsedTimer !== null) {
    globalThis.clearInterval(elapsedTimer)
    elapsedTimer = null
  }
}

function updateElapsed(): void {
  // Only update elapsed time while actively recording (not paused or idle)
  if (snapshot.status === 'recording' && snapshot.startedAt !== undefined) {
    elapsedTime.textContent = formatElapsed(snapshot.startedAt)
  }
}

function formatElapsed(startedAt: string | undefined): string {
  if (startedAt === undefined) {
    return 'Elapsed: 00:00'
  }
  return `Elapsed: ${formatDurationBetween(startedAt)}`
}

function formatDurationBetween(startedAt: string | undefined, completedAt?: string): string {
  const totalSeconds = secondsBetween(startedAt, completedAt)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function secondsBetween(startedAt: string | undefined, completedAt?: string): number {
  const start = startedAt === undefined ? Date.now() : new Date(startedAt).getTime()
  const end = completedAt === undefined ? Date.now() : new Date(completedAt).getTime()

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0
  }

  return Math.max(0, Math.floor((end - start) / 1000))
}

function formatTime(isoTimestamp: string): string {
  const timestamp = new Date(isoTimestamp)

  return Number.isNaN(timestamp.getTime())
    ? isoTimestamp
    : timestamp.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
}

function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url)

    return `${parsed.hostname}${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

function truncate(value: string | undefined, maxLength: number): string | undefined {
  return value !== undefined && value.length > maxLength ? `${value.slice(0, maxLength)}…` : value
}

function safeId(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-')
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unexpected error'
}
