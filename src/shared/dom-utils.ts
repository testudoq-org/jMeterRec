export type AppTheme = 'light' | 'dark'

export function requireElement<T extends HTMLElement>(id: string, context = 'element'): T {
  const element = document.getElementById(id)

  if (element === null) {
    throw new Error(`Missing ${context}: ${id}`)
  }

  return element as T
}

export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unexpected error'
}

export function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

export function normalizeTheme(theme: unknown): AppTheme {
  return theme === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme

  // Keep the <meta name="color-scheme"> in sync. This meta is read by the
  // browser during HTML parsing (before the stylesheet loads), so it is the
  // only way to tell Chrome our colour-scheme preference up front and avoid a
  // forced-dark repaint during the action-popup auto-fit window.
  const meta = document.querySelector('meta[name="color-scheme"]')
  if (meta !== null) {
    meta.setAttribute('content', `only ${theme}`)
  }
}
