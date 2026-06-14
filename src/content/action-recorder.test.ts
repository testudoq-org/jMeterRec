import { describe, expect, it } from 'vitest'
import { SelectorBuilder, createActionStep } from './action-recorder'

describe('action-recorder', () => {
  describe('SelectorBuilder', () => {
    it('returns id selector when element has id', () => {
      const element = { id: 'submit-btn' } as unknown as Element
      const builder = new SelectorBuilder()

      const result = builder.build(element)

      expect(result).toBe('#submit-btn')
    })

    it('returns class selector when element has class but no id', () => {
      const element = { className: 'btn primary' } as unknown as Element
      const builder = new SelectorBuilder()

      const result = builder.build(element)

      expect(result).toBe('.btn.primary')
    })

    it('returns tag selector as fallback', () => {
      const element = { tagName: 'BUTTON' } as unknown as Element
      const builder = new SelectorBuilder()

      const result = builder.build(element)

      expect(result).toBe('button')
    })

    it('prioritizes id over class', () => {
      const element = { id: 'my-btn', className: 'btn' } as unknown as Element
      const builder = new SelectorBuilder()

      const result = builder.build(element)

      expect(result).toBe('#my-btn')
    })
  })

  describe('createActionStep', () => {
    it('creates click action step', () => {
      const step = createActionStep('click', '#btn')

      expect(step).toEqual({
        type: 'action',
        command: 'click',
        target: '#btn',
      })
    })

    it('creates type action step with value', () => {
      const step = createActionStep('type', '#username', 'admin')

      expect(step).toEqual({
        type: 'action',
        command: 'type',
        target: '#username',
        value: 'admin',
      })
    })

    it('creates select action step with value', () => {
      const step = createActionStep('select', '#country', 'US')

      expect(step).toEqual({
        type: 'action',
        command: 'select',
        target: '#country',
        value: 'US',
      })
    })

    it('creates waitForElement action step', () => {
      const step = createActionStep('waitForElement', '#loading-spinner')

      expect(step).toEqual({
        type: 'action',
        command: 'waitForElement',
        target: '#loading-spinner',
      })
    })

    it('creates action step with transactionKey', () => {
      const step = createActionStep('click', '#btn', undefined, 'tx-001')

      expect(step.transactionKey).toBe('tx-001')
    })
  })
})
