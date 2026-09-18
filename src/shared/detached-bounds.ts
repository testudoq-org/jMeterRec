/**
 * Shared detached-window bounds helpers.
 *
 * The detached inspector window is the only surface that can exceed the
 * 800x600 action-popup cap, so its size/location is worth remembering across
 * close/reopen. Bounds are read from `chrome.storage.local` on open,
 * validated, clamped to the available work area, and persisted back on every
 * `chrome.windows.onBoundsChanged` event (debounced).
 *
 * This module is intentionally side-effect-free and dependency-free so it can
 * be imported from both the popup process and the background service worker.
 * `clampDetachedBoundsToScreen` accepts an optional `screen` argument because
 * service workers have no `window`; the popup process passes nothing and
 * still gets `window.screen` at call time, so its behaviour is unchanged.
 */

export interface DetachedBounds {
  width: number
  height: number
  left: number
  top: number
}

export interface DetachedBoundsStorage {
  [key: string]: DetachedBounds | undefined
}

export interface ScreenLike {
  availWidth?: number
  availHeight?: number
  availLeft?: number
  availTop?: number
}

export const DETACHED_BOUNDS_STORAGE_KEY = 'capyultura:detached-inspector-bounds'
export const DETACHED_BOUNDS_MIN = { width: 700, height: 600 }
export const DETACHED_BOUNDS_DEFAULT_WIDTH = 900
export const DETACHED_BOUNDS_DEFAULT_HEIGHT = 720

function defaultScreen(): ScreenLike {
  if (typeof window !== 'undefined') {
    return window.screen as unknown as ScreenLike
  }

  return {}
}

export function asFinitePositive(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }

  return Math.trunc(value)
}

export function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return Math.trunc(value)
}

export function validateDetachedBounds(value: unknown): DetachedBounds | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const record = value as Record<string, unknown>
  const width = asFinitePositive(record.width)
  const height = asFinitePositive(record.height)
  const left = asFiniteNumber(record.left)
  const top = asFiniteNumber(record.top)

  if (width === null || height === null || left === null || top === null) {
    return null
  }

  return { width, height, left, top }
}

export function extractUsableBounds(win: chrome.windows.Window): DetachedBounds | null {
  if (
    win.id === undefined ||
    win.state === 'minimized' ||
    win.state === 'maximized' ||
    win.state === 'fullscreen'
  ) {
    return null
  }

  const width = asFinitePositive(win.width)
  const height = asFinitePositive(win.height)
  const left = asFiniteNumber(win.left)
  const top = asFiniteNumber(win.top)

  if (width === null || height === null || left === null || top === null) {
    return null
  }

  return { width, height, left, top }
}

export function clampDetachedBoundsToScreen(
  bounds: DetachedBounds,
  screen: ScreenLike = defaultScreen()
): DetachedBounds {
  const availWidth = typeof screen.availWidth === 'number' ? screen.availWidth : 1366
  const availHeight = typeof screen.availHeight === 'number' ? screen.availHeight : 768
  const availLeft = typeof screen.availLeft === 'number' ? screen.availLeft : 0
  const availTop = typeof screen.availTop === 'number' ? screen.availTop : 0

  const width = Math.min(
    Math.max(bounds.width, DETACHED_BOUNDS_MIN.width),
    Math.max(1, availWidth - 40)
  )
  const height = Math.min(
    Math.max(bounds.height, DETACHED_BOUNDS_MIN.height),
    Math.max(1, availHeight - 40)
  )

  const left = Math.min(
    Math.max(bounds.left, availLeft),
    Math.max(availLeft, availLeft + availWidth - width - 1)
  )
  const top = Math.min(
    Math.max(bounds.top, availTop),
    Math.max(availTop, availTop + availHeight - height - 1)
  )

  return { width, height, left, top }
}

export function defaultDetachedBounds(): DetachedBounds {
  return clampDetachedBoundsToScreen({
    width: DETACHED_BOUNDS_DEFAULT_WIDTH,
    height: DETACHED_BOUNDS_DEFAULT_HEIGHT,
    left: 0,
    top: 0,
  })
}

/**
 * Read, validate, and clamp stored bounds. Returns `null` when nothing is
 * stored, the stored value is invalid, or the storage call fails. Callers
 * that must never return `null` (the popup Detach path) wrap this with a
 * default; callers that want a fallback (the toolbar-click service-worker
 * path) can use the `null` directly.
 */
export async function loadStoredDetachedBounds(
  storage: chrome.storage.StorageArea = chrome.storage.local
): Promise<DetachedBounds | null> {
  try {
    const stored = await storage.get<DetachedBoundsStorage>(DETACHED_BOUNDS_STORAGE_KEY)
    const raw = stored?.[DETACHED_BOUNDS_STORAGE_KEY]
    if (raw === undefined) {
      return null
    }

    const validated = validateDetachedBounds(raw)
    if (validated === null) {
      return null
    }

    return clampDetachedBoundsToScreen(validated)
  } catch {
    return null
  }
}

/**
 * Never-null variant used by the popup Detach path. Falls back to the
 * default clamped bounds on any miss or error.
 */
export async function loadDetachedBounds(
  storage: chrome.storage.StorageArea = chrome.storage.local
): Promise<DetachedBounds> {
  const stored = await loadStoredDetachedBounds(storage)
  return stored ?? defaultDetachedBounds()
}
