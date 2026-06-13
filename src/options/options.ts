interface RecorderOptions {
  defaultPlanName: string
  threads: number
  rampUp: number
  loops: number
}

const defaults: RecorderOptions = {
  defaultPlanName: 'Untitled Plan',
  threads: 1,
  rampUp: 1,
  loops: 1,
}

const defaultPlanName = requireElement<HTMLInputElement>('defaultPlanName')
const threads = requireElement<HTMLInputElement>('threads')
const rampUp = requireElement<HTMLInputElement>('rampUp')
const loops = requireElement<HTMLInputElement>('loops')
const save = requireElement<HTMLButtonElement>('save')
const saved = requireElement<HTMLDivElement>('saved')

chrome.storage.local
  .get<RecorderOptions>(defaults)
  .then((options: RecorderOptions) => {
    defaultPlanName.value = options.defaultPlanName
    threads.value = String(options.threads)
    rampUp.value = String(options.rampUp)
    loops.value = String(options.loops)
  })
  .catch((err: unknown) => {
    saved.textContent = `Unable to load options: ${toErrorMessage(err)}`
  })

save.addEventListener('click', () => {
  const options: RecorderOptions = {
    defaultPlanName: defaultPlanName.value.trim() || defaults.defaultPlanName,
    threads: positiveNumber(threads.value, defaults.threads),
    rampUp: nonNegativeNumber(rampUp.value, defaults.rampUp),
    loops: positiveNumber(loops.value, defaults.loops),
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

function positiveNumber(value: string, fallback: number): number {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function nonNegativeNumber(value: string, fallback: number): number {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
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
