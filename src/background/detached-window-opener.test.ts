import { describe, expect, it, vi } from 'vitest'
import { createDetachedOpener } from './detached-window-opener'
import type { WindowsApi } from './detached-window-opener'

const DETACHED_POPUP_URL = 'chrome-extension://test/popup/popup.html?detached=1'

function createWindowsApi(overrides: Partial<WindowsApi> = {}): WindowsApi {
  return {
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(undefined),
    getLastFocused: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function createOpener(
  windows: WindowsApi,
  loadDetachedBounds?: () => Promise<{
    width: number
    height: number
    left: number
    top: number
  } | null>
) {
  return createDetachedOpener({
    detachedPopupUrl: DETACHED_POPUP_URL,
    defaultSize: { width: 900, height: 720 },
    windows,
    ...(loadDetachedBounds !== undefined ? { loadDetachedBounds } : {}),
  })
}

describe('detached window opener', () => {
  describe('topRightPosition', () => {
    it('computes the top-right position from the source window', async () => {
      const windows = createWindowsApi({
        get: vi.fn().mockResolvedValue({
          id: 5,
          state: 'normal',
          left: 0,
          top: 0,
          width: 1920,
          height: 1080,
        }),
      })
      const opener = createOpener(windows)

      const position = await opener.topRightPosition({ width: 900, height: 720 }, 5)

      expect(position).toEqual({ left: 1012, top: 8 })
    })

    it('falls back to getLastFocused when sourceWindowId is missing', async () => {
      const focused = { id: 9, state: 'normal', left: 100, top: 50, width: 1200, height: 900 }
      const windows = createWindowsApi({
        get: vi.fn().mockResolvedValue(undefined),
        getLastFocused: vi.fn().mockResolvedValue(focused),
      })
      const opener = createOpener(windows)

      const position = await opener.topRightPosition({ width: 900, height: 720 })

      expect(position).toEqual({ left: 392, top: 58 })
      expect(windows.getLastFocused).toHaveBeenCalled()
    })

    it('falls back to getLastFocused when windows.get rejects', async () => {
      const focused = { id: 9, state: 'normal', left: 100, top: 50, width: 1200, height: 900 }
      const windows = createWindowsApi({
        get: vi.fn().mockRejectedValue(new Error('unavailable')),
        getLastFocused: vi.fn().mockResolvedValue(focused),
      })
      const opener = createOpener(windows)

      const position = await opener.topRightPosition({ width: 900, height: 720 }, 1)

      expect(position).toEqual({ left: 392, top: 58 })
    })

    it('returns an empty position when both candidates are unavailable', async () => {
      const windows = createWindowsApi({
        get: vi.fn().mockResolvedValue(undefined),
        getLastFocused: vi.fn().mockResolvedValue(undefined),
      })
      const opener = createOpener(windows)

      const position = await opener.topRightPosition({ width: 900, height: 720 }, 1)

      expect(position).toEqual({})
    })

    it('skips a minimized source window and falls back to getLastFocused', async () => {
      const focused = { id: 9, state: 'normal', left: 100, top: 50, width: 1200, height: 900 }
      const windows = createWindowsApi({
        get: vi.fn().mockResolvedValue({
          id: 1,
          state: 'minimized',
          left: 0,
          top: 0,
          width: 1920,
          height: 1080,
        }),
        getLastFocused: vi.fn().mockResolvedValue(focused),
      })
      const opener = createOpener(windows)

      const position = await opener.topRightPosition({ width: 900, height: 720 }, 1)

      expect(position).toEqual({ left: 392, top: 58 })
    })
  })

  describe('openDetachedPopupWindow', () => {
    it('creates the window with the expected geometry and position', async () => {
      const focused = { id: 9, state: 'normal', left: 0, top: 0, width: 1920, height: 1080 }
      const windows = createWindowsApi({
        get: vi.fn().mockResolvedValue(focused),
        create: vi.fn().mockResolvedValue({
          id: 42,
          state: 'normal',
          width: 900,
          height: 720,
          left: 1012,
          top: 8,
        }),
      })
      const opener = createOpener(windows)

      await opener.openDetachedPopupWindow(9)

      expect(windows.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: DETACHED_POPUP_URL,
          type: 'popup',
          width: 900,
          height: 720,
          left: 1012,
          top: 8,
          focused: true,
        })
      )
    })

    it('reuses an existing detached window instead of creating a new one', async () => {
      const windows = createWindowsApi({
        getAll: vi.fn().mockResolvedValue([
          {
            id: 7,
            type: 'popup',
            tabs: [{ url: DETACHED_POPUP_URL }],
          },
        ]),
        update: vi.fn().mockResolvedValue(undefined),
      })
      const opener = createOpener(windows)

      await opener.openDetachedPopupWindow(1)

      expect(windows.create).not.toHaveBeenCalled()
      expect(windows.update).toHaveBeenCalledWith(7, { focused: true })
    })

    it('swallows errors without throwing', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const windows = createWindowsApi({
        getAll: vi.fn().mockRejectedValue(new Error('windows unavailable')),
      })
      const opener = createOpener(windows)

      await expect(opener.openDetachedPopupWindow(1)).resolves.toBeUndefined()

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to open detached popup window.',
        expect.any(Error)
      )
      errorSpy.mockRestore()
    })
  })

  describe('loadDetachedBounds provider', () => {
    it('restores persisted bounds when the provider returns them', async () => {
      const windows = createWindowsApi({
        create: vi.fn().mockResolvedValue(undefined),
      })
      const opener = createOpener(windows, async () => ({
        width: 820,
        height: 640,
        left: 30,
        top: 30,
      }))

      await opener.openDetachedPopupWindow(1)

      expect(windows.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: DETACHED_POPUP_URL,
          type: 'popup',
          width: 820,
          height: 640,
          left: 30,
          top: 30,
          focused: true,
        })
      )
      // The geometry fallback must not have been consulted.
      expect(windows.get).not.toHaveBeenCalled()
      expect(windows.getLastFocused).not.toHaveBeenCalled()
    })

    it('falls back to default-size + top-right placement when the provider returns null', async () => {
      const focused = { id: 9, state: 'normal', left: 0, top: 0, width: 1920, height: 1080 }
      const windows = createWindowsApi({
        get: vi.fn().mockResolvedValue(focused),
        create: vi.fn().mockResolvedValue(undefined),
      })
      const opener = createOpener(windows, async () => null)

      await opener.openDetachedPopupWindow(9)

      expect(windows.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: DETACHED_POPUP_URL,
          type: 'popup',
          width: 900,
          height: 720,
          left: 1012,
          top: 8,
          focused: true,
        })
      )
    })

    it('falls back when the provider throws', async () => {
      const focused = { id: 9, state: 'normal', left: 0, top: 0, width: 1920, height: 1080 }
      const windows = createWindowsApi({
        get: vi.fn().mockResolvedValue(focused),
        create: vi.fn().mockResolvedValue(undefined),
      })
      const opener = createOpener(windows, async () => {
        throw new Error('storage unavailable')
      })

      await expect(opener.openDetachedPopupWindow(9)).resolves.toBeUndefined()
      expect(windows.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: DETACHED_POPUP_URL,
          type: 'popup',
          width: 900,
          height: 720,
          focused: true,
        })
      )
    })
  })
})
