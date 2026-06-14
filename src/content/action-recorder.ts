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

interface RecorderMessage {
  type: string
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
      if (this.isRecorderMessage(message)) {
        if (message.type === 'START_RECORDING') {
          this.recording = true
          this.currentTransactionKey = undefined
          this.attachListeners()
        } else if (message.type === 'STOP_RECORDING' || message.type === 'PAUSE_RECORDING') {
          this.recording = false
          this.detachListeners()
        } else if (message.type === 'RESUME_RECORDING') {
          this.recording = true
          this.attachListeners()
        } else if (message.type === 'OPEN_RECORDING') {
          this.recording = true
          this.currentTransactionKey = message.transactionKey
          this.attachListeners()
        } else if (message.type === 'REQUEST_CAPTURED') {
          this.currentTransactionKey = message.request?.transactionKey
        }
      }
    })
  }

  private isRecorderMessage(message: unknown): message is RecorderMessage {
    if (typeof message !== 'object' || message === null) {
      return false
    }

    const record = message as Record<string, unknown>
    return (
      record.type === 'START_RECORDING' ||
      record.type === 'STOP_RECORDING' ||
      record.type === 'PAUSE_RECORDING' ||
      record.type === 'RESUME_RECORDING' ||
      record.type === 'OPEN_RECORDING' ||
      record.type === 'REQUEST_CAPTURED'
    )
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
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.value
    }

    if (element instanceof HTMLSelectElement) {
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

// Initialize the action recorder when loaded (only in extension context)
if (isExtensionContext()) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  new ActionRecorder()
}
