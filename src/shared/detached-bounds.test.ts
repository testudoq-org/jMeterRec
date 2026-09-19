import { describe, expect, it, vi } from 'vitest'
import {
  DETACHED_BOUNDS_STORAGE_KEY,
  clampDetachedBoundsToScreen,
  defaultDetachedBounds,
  extractUsableBounds,
  loadDetachedBounds,
  loadStoredDetachedBounds,
  validateDetachedBounds,
} from './detached-bounds'

describe('shared detached bounds helpers', () => {
  describe('validateDetachedBounds', () => {
    it('rejects non-objects', () => {
      expect(validateDetachedBounds(null)).toBeNull()
      expect(validateDetachedBounds('x')).toBeNull()
      expect(validateDetachedBounds(42)).toBeNull()
    })

    it('rejects records with missing or invalid fields', () => {
      expect(validateDetachedBounds({})).toBeNull()
      expect(validateDetachedBounds({ width: 900, height: 720 })).toBeNull()
      expect(validateDetachedBounds({ width: -1, height: 720, left: 0, top: 0 })).toBeNull()
      expect(validateDetachedBounds({ width: 900, height: 720, left: 'x', top: 0 })).toBeNull()
      expect(validateDetachedBounds({ width: NaN, height: 720, left: 0, top: 0 })).toBeNull()
    })

    it('accepts valid records', () => {
      expect(validateDetachedBounds({ width: 900, height: 720, left: 40, top: 40 })).toEqual({
        width: 900,
        height: 720,
        left: 40,
        top: 40,
      })
    })
  })

  describe('extractUsableBounds', () => {
    it('rejects undefined id and non-normal states', () => {
      const base = { width: 900, height: 720, left: 0, top: 0 }
      expect(extractUsableBounds({ ...base } as chrome.windows.Window)).toBeNull()
      expect(
        extractUsableBounds({ id: 1, state: 'minimized', ...base } as chrome.windows.Window)
      ).toBeNull()
      expect(
        extractUsableBounds({ id: 1, state: 'maximized', ...base } as chrome.windows.Window)
      ).toBeNull()
      expect(
        extractUsableBounds({ id: 1, state: 'fullscreen', ...base } as chrome.windows.Window)
      ).toBeNull()
    })

    it('accepts a normal window', () => {
      expect(
        extractUsableBounds({
          id: 1,
          state: 'normal',
          width: 900,
          height: 720,
          left: 40,
          top: 40,
        } as chrome.windows.Window)
      ).toEqual({ width: 900, height: 720, left: 40, top: 40 })
    })
  })

  describe('clampDetachedBoundsToScreen', () => {
    it('clamps with an explicit screen', () => {
      const clamped = clampDetachedBoundsToScreen(
        { width: 50, height: 50, left: 10000, top: 10000 },
        { availWidth: 1366, availHeight: 768, availLeft: 0, availTop: 0 }
      )
      expect(clamped.width).toBeGreaterThanOrEqual(700)
      expect(clamped.height).toBeGreaterThanOrEqual(600)
      expect(clamped.left).toBeLessThanOrEqual(1366 - clamped.width - 1)
      expect(clamped.top).toBeLessThanOrEqual(768 - clamped.height - 1)
    })

    it('falls back to built-in defaults when no screen is supplied', () => {
      const clamped = clampDetachedBoundsToScreen({ width: 50, height: 50, left: 0, top: 0 })
      expect(clamped.width).toBeGreaterThanOrEqual(700)
      expect(clamped.height).toBeGreaterThanOrEqual(600)
    })
  })

  describe('defaultDetachedBounds', () => {
    it('returns a clamped default', () => {
      const bounds = defaultDetachedBounds()
      expect(bounds.width).toBeGreaterThanOrEqual(700)
      expect(bounds.height).toBeGreaterThanOrEqual(600)
    })
  })

  describe('loadStoredDetachedBounds', () => {
    it('returns null when nothing is stored', async () => {
      const storage = {
        get: vi.fn().mockResolvedValue({}),
      } as unknown as chrome.storage.StorageArea
      expect(await loadStoredDetachedBounds(storage)).toBeNull()
    })

    it('returns null when the stored value is invalid', async () => {
      const storage = {
        get: vi.fn().mockResolvedValue({ [DETACHED_BOUNDS_STORAGE_KEY]: { width: -1 } }),
      } as unknown as chrome.storage.StorageArea
      expect(await loadStoredDetachedBounds(storage)).toBeNull()
    })

    it('returns clamped bounds when stored and valid', async () => {
      const storage = {
        get: vi.fn().mockResolvedValue({
          [DETACHED_BOUNDS_STORAGE_KEY]: { width: 900, height: 720, left: 40, top: 40 },
        }),
      } as unknown as chrome.storage.StorageArea
      const bounds = await loadStoredDetachedBounds(storage)
      expect(bounds).not.toBeNull()
      expect(bounds).toEqual({ width: 900, height: 720, left: 40, top: 40 })
    })

    it('returns null when storage throws', async () => {
      const storage = {
        get: vi.fn().mockRejectedValue(new Error('unavailable')),
      } as unknown as chrome.storage.StorageArea
      expect(await loadStoredDetachedBounds(storage)).toBeNull()
    })
  })

  describe('loadDetachedBounds', () => {
    it('returns defaults when nothing is stored', async () => {
      const storage = {
        get: vi.fn().mockResolvedValue({}),
      } as unknown as chrome.storage.StorageArea
      const bounds = await loadDetachedBounds(storage)
      expect(bounds.width).toBeGreaterThanOrEqual(700)
      expect(bounds.height).toBeGreaterThanOrEqual(600)
    })
  })
})
