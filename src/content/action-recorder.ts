import type { ActionStep } from '../models/captured-request'

export class SelectorBuilder {
  build(element: Element): string {
    if (element.id && element.id.length > 0) {
      return `#${element.id}`
    }

    if (element.className && element.className.length > 0) {
      return this.buildClasses(element.className)
    }

    return element.tagName.toLowerCase()
  }

  private buildClasses(classNames: string): string {
    return classNames
      .trim()
      .split(/\s+/)
      .map((cls) => `.${cls}`)
      .join('')
  }
}

export function createActionStep(
  command: string,
  target: string,
  value?: string,
  transactionKey?: string
): ActionStep {
  const step: ActionStep = {
    type: 'action',
    command,
    target,
  }

  if (value !== undefined) {
    step.value = value
  }

  if (transactionKey !== undefined) {
    step.transactionKey = transactionKey
  }

  return step
}

// Only run in extension context
function isExtensionContext(): boolean {
  return typeof chrome !== 'undefined' && chrome !== null && 'runtime' in chrome
}

type RecorderMessageType =
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'PAUSE_RECORDING'
  | 'RESUME_RECORDING'
  | 'OPEN_RECORDING'
  | 'REQUEST_CAPTURED'

const recorderMessageTypes = new Set<RecorderMessageType>([
  'START_RECORDING',
  'STOP_RECORDING',
  'PAUSE_RECORDING',
  'RESUME_RECORDING',
  'OPEN_RECORDING',
  'REQUEST_CAPTURED',
])

interface RecorderMessage {
  type: RecorderMessageType
  transactionKey?: string
  request?: { transactionKey?: string }
}

export class ActionRecorder {
  private recording = false
  private selectorBuilder = new SelectorBuilder()
  private actionHandlers: Map<string, (ev: Event) => void> = new Map()
  private currentTransactionKey: string | undefined

  constructor() {
    if (isExtensionContext()) {
      this.setupMessageListener()
    }
  }

  private setupMessageListener(): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    chrome.runtime!.onMessage.addListener((message: unknown) => {
      if (!this.isRecorderMessage(message)) {
        return
      }

      this.handleRecorderMessage(message)
    })
  }

  private handleRecorderMessage(message: RecorderMessage): void {
    const handlers: Record<RecorderMessageType, () => void> = {
      START_RECORDING: () => {
        this.recording = true
        this.currentTransactionKey = undefined
        this.attachListeners()
      },
      STOP_RECORDING: () => {
        this.recording = false
        this.detachListeners()
      },
      PAUSE_RECORDING: () => {
        this.recording = false
        this.detachListeners()
      },
      RESUME_RECORDING: () => {
        this.recording = true
        this.attachListeners()
      },
      OPEN_RECORDING: () => {
        this.recording = true
        this.currentTransactionKey = message.transactionKey
        this.attachListeners()
      },
      REQUEST_CAPTURED: () => {
        this.currentTransactionKey = message.request?.transactionKey
      },
    }

    handlers[message.type]?.()
  }

  private isRecorderMessage(message: unknown): message is RecorderMessage {
    if (typeof message !== 'object' || message === null) {
      return false
    }

    const type = (message as Record<string, unknown>).type as RecorderMessageType
    return recorderMessageTypes.has(type)
  }

  private attachListeners(): void {
    this.attachListener('click', this.handleClick)
    this.attachListener('change', this.handleChange)
    this.attachListener('submit', this.handleSubmit)
  }

  private attachListener(eventType: string, handler: (ev: Event) => void): void {
    document.addEventListener(eventType, handler, true)
    this.actionHandlers.set(eventType, handler)
  }

  private detachListeners(): void {
    this.actionHandlers.forEach((handler, eventType) => {
      document.removeEventListener(eventType, handler, true)
    })
    this.actionHandlers.clear()
  }

  private handleClick = (ev: Event): void => {
    if (!this.recording) {
      return
    }

    const target = ev.target as Element
    const selector = this.selectorBuilder.build(target)

    const step = createActionStep(
      this.getCommandForElement(target),
      selector,
      undefined,
      this.currentTransactionKey
    )

    this.sendAction(step)
  }

  private handleChange = (ev: Event): void => {
    if (!this.recording) {
      return
    }

    const target = ev.target as Element
    const selector = this.selectorBuilder.build(target)
    const value = this.getValueForElement(target)

    if (value !== undefined) {
      const step = createActionStep('type', selector, value, this.currentTransactionKey)
      this.sendAction(step)
    }
  }

  private handleSubmit = (ev: Event): void => {
    if (!this.recording) {
      return
    }

    const target = ev.target as Element
    const selector = this.selectorBuilder.build(target)

    const step = createActionStep('submit', selector, undefined, this.currentTransactionKey)
    this.sendAction(step)
  }

  private getCommandForElement(element: Element): string {
    const tag = element.tagName.toLowerCase()

    if (tag === 'button' || tag === 'a') {
      return 'clickAt'
    }

    return 'click'
  }

  private getValueForElement(element: Element): string | undefined {
    if (isValueElement(element)) {
      return element.value
    }

    return undefined
  }

  private sendAction(step: ActionStep): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    chrome.runtime!.sendMessage({ type: 'ADD_ACTION', action: step }).catch((err: unknown) => {
      console.warn('Unable to send action to background.', err)
    })
  }
}

function isValueElement(
  element: Element
): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  )
}

// Initialize the action recorder when loaded (only in extension context)
if (isExtensionContext()) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  new ActionRecorder()
}
