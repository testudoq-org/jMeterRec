import type { BackgroundRequest, BackgroundResponse, RecorderSnapshot } from '../messages'
import type { CapturedRequest } from '../models/captured-request'

type ResponseWithSnapshot = Extract<BackgroundResponse, { snapshot?: RecorderSnapshot }>
type TransactionRequest = CapturedRequest & { responseBody?: string }
type RequestCapturedMessage = { type: 'REQUEST_CAPTURED'; request: TransactionRequest }

interface TransactionPanelOptions {
  maxTransactions: number
  openDetachedInspector: boolean
  captureResponseBody: boolean
}

const defaultTransactionPanelOptions: TransactionPanelOptions = {
  maxTransactions: 200,
  openDetachedInspector: false,
  captureResponseBody: false,
}

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

let availableDomains: string[] = []
let selectedDomains = new Set<string>()
let transactionPanelOptions = defaultTransactionPanelOptions

const transactions: CapturedRequest[] = []

let snapshot: RecorderSnapshot = {
  status: 'idle',
  recording: false,
  planName: 'Untitled Plan',
  requestCount: 0,
}

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
  void send({ type: 'STOP_RECORDING' })
})

clear.addEventListener('click', () => {
  void send({ type: 'CLEAR_REQUESTS' })
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

refreshState().catch((err: unknown) => {
  showError(toErrorMessage(err))
})

void seedTransactions().catch((err: unknown) => {
  showError(toErrorMessage(err))
})

void loadTransactionPanelOptions().catch((err: unknown) => {
  showError(toErrorMessage(err))
})

setInterval(updateElapsed, 1000)

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

  trimTransactions()
  renderTransactions()
}

async function exportRecording(): Promise<void> {
  clearError()

  if (exportMode.value === 'playwright') {
    const baseUrl = baseUrlInput.value.trim().length > 0 ? baseUrlInput.value.trim() : undefined

    const response = await send({
      type: 'EXPORT_PLAYWRIGHT',
      baseUrl,
      suiteName: snapshot.planName,
      testCaseName: `${snapshot.planName} Test`,
    })

    if (!response.success) {
      showError('Export failed.')
      return
    }

    if (!isPlaywrightResponse(response)) {
      showError('Export failed.')
      return
    }

    download(response.playwright, response.filename)
    return
  }

  await prepareJmxExport()
}

async function prepareJmxExport(): Promise<void> {
  const response = await send({ type: 'GET_DOMAINS' })

  if (!response.success || !isDomainsResponse(response)) {
    showError('Unable to load domains for JMX export.')
    return
  }

  availableDomains = response.domains

  if (availableDomains.length === 0) {
    showError('No domains were captured for JMX export.')
    return
  }

  const [domain] = availableDomains

  if (domain !== undefined) {
    await exportJmx([domain])
  }

  selectedDomains = new Set(availableDomains)
  renderJmxDomainSelector()
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
  const response = await send({
    type: 'EXPORT_JMX',
    includedDomains,
  })

  if (!response.success || !('jmx' in response)) {
    showError(response.success ? 'Export failed.' : response.error)
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

  return transactions.filter((request) => {
    const matchesMethod = method === 'all' || request.method === method
    const matchesStatus = statusFilter === 'all' || statusBucket(request) === statusFilter
    const matchesSearch = search.length === 0 || request.url.toLowerCase().includes(search)

    return matchesMethod && matchesStatus && matchesSearch
  })
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
  row.setAttribute(
    'aria-label',
    `${request.method} ${shortenUrl(request.url)} ${request.error ? 'error' : (request.statusCode ?? 'pending')}`
  )
  row.title = request.url

  method.textContent = request.method
  method.className = `method ${methodClass(request.method)}`

  url.textContent = shortenUrl(request.url)
  url.className = 'transaction-url'

  requestStatus.textContent = request.error ? 'Error' : statusLabel(request.statusCode)
  requestStatus.className = `status-badge ${statusClass(request)}`

  time.textContent = formatTime(request.timestamp)
  time.className = 'transaction-time'

  row.append(method, url, requestStatus, time)
  row.addEventListener('click', () => {
    const expanded = row.getAttribute('aria-expanded') === 'true'

    row.setAttribute('aria-expanded', String(!expanded))
    row.replaceChildren(method, url, requestStatus, time, createDetails(request, detailsId))
  })

  return row
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
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    typeof record.id === 'string' &&
    typeof record.timestamp === 'string' &&
    typeof record.method === 'string' &&
    typeof record.url === 'string' &&
    typeof record.headers === 'object' &&
    record.headers !== null &&
    typeof record.queryParams === 'object' &&
    record.queryParams !== null
  )
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
  }
}

function openDetachedInspectorWindowIfEnabled(): void {
  if (transactionPanelOptions.openDetachedInspector) {
    openDetachedInspectorWindow()
  }
}

function openDetachedInspectorWindow(): void {
  void chrome.windows.create({
    url: chrome.runtime.getURL('src/popup/popup.html?detached=1'),
    type: 'popup',
    width: 420,
    height: 720,
    left: window.screenX + 80,
    top: window.screenY + 80,
    focused: true,
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

  if (request.statusCode === undefined) {
    return 'pending'
  }

  if (request.statusCode >= 200 && request.statusCode < 300) {
    return '2xx'
  }

  if (request.statusCode >= 300 && request.statusCode < 400) {
    return '3xx'
  }

  if (request.statusCode >= 400 && request.statusCode < 500) {
    return '4xx'
  }

  if (request.statusCode >= 500) {
    return '5xx'
  }

  return 'pending'
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

  return request.responseBody ?? 'Unavailable from webRequest'
}

function download(contents: string, filename: string): void {
  const blob = new Blob([contents], { type: 'text/typescript' })
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

function updateElapsed(): void {
  elapsedTime.textContent = formatElapsed(snapshot.startedAt)
}

function formatElapsed(startedAt: string | undefined): string {
  return `Elapsed: ${formatDurationBetween(startedAt)}`
}

function formatDurationBetween(startedAt: string | undefined, completedAt?: string): string {
  const start = startedAt === undefined ? Date.now() : new Date(startedAt).getTime()
  const end = completedAt === undefined ? Date.now() : new Date(completedAt).getTime()

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 'unknown'
  }

  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
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
