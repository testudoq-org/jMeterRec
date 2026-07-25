import type { ValidationReport, ValidationMessage } from '../jmx/validator'
import { JMXValidator } from '../jmx/validator'
import { requireElement, toErrorMessage } from '../shared/dom-utils'

// JMX VALIDATION: DOM elements
const validateJmxSection = requireElement<HTMLDivElement>('validateJmxSection')
const validateJmxFile = requireElement<HTMLInputElement>('validateJmxFile')
const validateJmxError = requireElement<HTMLDivElement>('validateJmxError')
const validateJmxResult = requireElement<HTMLDivElement>('validateJmxResult')

export function initJmxValidation(): void {
  validateJmxFile.addEventListener('change', () => {
    void handleValidateJmxFile()
  })
}

export { validateJmxSection }

async function handleValidateJmxFile(): Promise<void> {
  const file = validateJmxFile.files?.[0]

  if (!file) {
    showValidationError('Empty JMX file: please select a file.')
    clearValidationResult()
    return
  }

  if (file.size === 0) {
    showValidationError('Empty JMX file: file has no content.')
    clearValidationResult()
    return
  }

  clearValidationError()
  clearValidationResult()

  validateJmxFile.disabled = true
  try {
    const text = await file.text()
    const validator = new JMXValidator()
    const report = validator.validate(text)
    renderValidationResult(report)
  } catch (err) {
    showValidationError(toErrorMessage(err))
  } finally {
    validateJmxFile.disabled = false
    validateJmxFile.value = ''
  }
}

function renderValidationResult(report: ValidationReport): void {
  validateJmxResult.replaceChildren()

  const summary = document.createElement('div')
  summary.className = 'validation-summary'
  summary.textContent = report.valid
    ? `Passed (${report.errors.length} errors, ${report.warnings.length} warnings, ${report.info.length} info)`
    : `Failed (${report.errors.length} errors, ${report.warnings.length} warnings, ${report.info.length} info)`
  validateJmxResult.append(summary)

  const renderMessages = (messages: ValidationMessage[], severityClass: string) => {
    for (const msg of messages) {
      const item = document.createElement('div')
      item.className = `validation-message ${severityClass}`
      const label = document.createElement('strong')
      label.textContent = `${msg.ruleId}:`
      item.append(label, ` ${msg.message}`)
      if (msg.remediation !== undefined && msg.remediation.length > 0) {
        const remediation = document.createElement('div')
        remediation.className = 'validation-remediation'
        remediation.textContent = `Fix: ${msg.remediation}`
        item.append(remediation)
      }
      validateJmxResult.append(item)
    }
  }

  renderMessages(report.errors, 'validation-error')
  renderMessages(report.warnings, 'validation-warning')
  renderMessages(report.info, 'validation-info')
}

function showValidationError(message: string): void {
  validateJmxError.textContent = message
}

export function clearValidationError(): void {
  validateJmxError.textContent = ''
}

export function clearValidationResult(): void {
  validateJmxResult.textContent = ''
}
