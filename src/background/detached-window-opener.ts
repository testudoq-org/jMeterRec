/**
 * Detached popup window opener (area 5).
 *
 * Clicking the toolbar icon (or the hidden Detach button) opens the popup in a
 * separate, user-resizable window instead of the constrained 800x600 action
 * popup. This module owns that logic so it can be unit-tested without a
 * browser: the `chrome.windows` surface is injected through `WindowsApi`,
 * and the popup URL / default size are passed in explicitly.
 *
 * Bounds persistence (read on open, written on resize) lives in the popup
 * process and is intentionally NOT part of this module. The service worker
 * path applies persisted bounds through this opener once that work lands;
 * see the `detachedBounds` option, currently `undefined`.
 */

import type { DetachedBounds } from '../shared/detached-bounds'

export interface WindowsApi {
  getAll(options: { populate: boolean }): Promise<chrome.windows.Window[]>
  get(windowId: number): Promise<chrome.windows.Window | undefined>
  getLastFocused(): Promise<chrome.windows.Window>
  create(options: chrome.windows.CreateData): Promise<chrome.windows.Window | undefined>
  update(
    windowId: number,
    options: chrome.windows.UpdateInfo
  ): Promise<chrome.windows.Window | undefined>
}

export interface DetachedOpenerOptions {
  detachedPopupUrl: string
  defaultSize: { width: number; height: number }
  margin?: number
  windows: WindowsApi
  /**
   * Optional persisted-bounds provider. When supplied, the opener restores
   * the last size/location the user gave the detached window on the first
   * open through this path (the toolbar icon / service worker). Returning
   * `null` (nothing stored, invalid, or unavailable) falls back to
   * `defaultSize` + `topRightPosition`, preserving the existing behaviour.
   */
  loadDetachedBounds?: () => Promise<DetachedBounds | null>
}

export interface DetachedOpener {
  openDetachedPopupWindow(sourceWindowId?: number): Promise<void>
  topRightPosition(
    size: { width: number; height: number },
    sourceWindowId?: number
  ): Promise<{ left?: number; top?: number }>
}

export function createDetachedOpener(options: DetachedOpenerOptions): DetachedOpener {
  const margin = options.margin ?? 8
  const { detachedPopupUrl, defaultSize, windows, loadDetachedBounds } = options

  async function findExisting(): Promise<chrome.windows.Window | undefined> {
    const all = await windows.getAll({ populate: true })
    return all.find(
      (win) =>
        win.type === 'popup' &&
        win.id !== undefined &&
        (win.tabs ?? []).some((tab) => tab.url?.startsWith(detachedPopupUrl))
    )
  }

  async function topRightPosition(
    size: { width: number; height: number },
    sourceWindowId?: number
  ): Promise<{ left?: number; top?: number }> {
    const candidates: Array<Promise<chrome.windows.Window | undefined>> = [
      sourceWindowId !== undefined ? windows.get(sourceWindowId) : Promise.resolve(undefined),
      windows.getLastFocused(),
    ]

    for (const candidate of candidates) {
      try {
        const focused = await candidate
        if (
          focused?.id === undefined ||
          typeof focused.left !== 'number' ||
          typeof focused.top !== 'number' ||
          typeof focused.width !== 'number' ||
          typeof focused.height !== 'number' ||
          focused.state === 'minimized'
        ) {
          continue
        }

        return {
          left: Math.round(focused.left + focused.width - size.width - margin),
          top: Math.round(focused.top + margin),
        }
      } catch {
        // This candidate is unavailable; try the next one.
        continue
      }
    }

    return {}
  }

  async function openDetachedPopupWindow(sourceWindowId?: number): Promise<void> {
    try {
      const existing = await findExisting()
      if (existing?.id !== undefined) {
        await windows.update(existing.id, { focused: true })
        return
      }

      // Restore persisted bounds when a provider is supplied (the
      // toolbar-click service-worker path). A null result — nothing stored,
      // invalid, or unavailable — falls back to the default-size + top-right
      // placement path below. A throwing provider is treated the same way so
      // the detached window always opens.
      if (loadDetachedBounds !== undefined) {
        const bounds = await loadDetachedBounds().catch(() => null)
        if (bounds !== null) {
          await windows.create({
            url: detachedPopupUrl,
            type: 'popup',
            width: bounds.width,
            height: bounds.height,
            left: bounds.left,
            top: bounds.top,
            focused: true,
          })
          return
        }
      }

      const position = await topRightPosition(defaultSize, sourceWindowId)
      await windows.create({
        url: detachedPopupUrl,
        type: 'popup',
        width: defaultSize.width,
        height: defaultSize.height,
        ...position,
        focused: true,
      })
    } catch (err) {
      console.error('Failed to open detached popup window.', err)
    }
  }

  return { openDetachedPopupWindow, topRightPosition }
}
