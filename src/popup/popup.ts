import type { BackgroundRequest, BackgroundResponse, RecorderSnapshot } from '../messages'

type ResponseWithSnapshot = Extract<BackgroundResponse, { snapshot?: RecorderSnapshot }>

const planNameInput = requireElement<HTMLInputElement>('planName')
const status = requireElement<HTMLDivElement>('status')
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

let availableDomains: string[] = []
let selectedDomains = new Set<string>()

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
  void send({ type: 'START_RECORDING', planName: planNameInput.value })
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

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isStateBroadcast(message)) {
    applySnapshot(message.snapshot)
  }
})

refreshState().catch((err: unknown) => {
  showError(toErrorMessage(err))
})

async function refreshState(): Promise<void> {
  const response = await send({ type: 'GET_STATE' })

  if (isSnapshotResponse(response)) {
    applySnapshot(response.snapshot)
  }
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
  start.disabled = next.status === 'recording' || next.status === 'paused'
  pause.disabled = next.status !== 'recording'
  resume.disabled = next.status !== 'paused'
  stop.disabled = !next.recording
  exportBtn.disabled = next.requestCount === 0
  clear.disabled = next.requestCount === 0 && !next.recording
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
    typeof (message as Record<string, unknown>).snapshot === 'object'
  )
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

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unexpected error'
}
