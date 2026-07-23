import type { UserAgentId, UserAgentSelection } from './advanced-options'

export interface UserAgentEntry {
  id: UserAgentSelection
  label: string
}

export const USER_AGENT_OPTIONS: UserAgentEntry[] = [
  { id: 'current', label: 'Current Browser' },
  { id: 'chrome-win', label: 'Chrome on Windows' },
  { id: 'chrome-mac', label: 'Chrome on macOS' },
  { id: 'chrome-linux', label: 'Chrome on Linux' },
  { id: 'firefox-win', label: 'Firefox on Windows' },
  { id: 'firefox-mac', label: 'Firefox on macOS' },
  { id: 'firefox-linux', label: 'Firefox on Linux' },
  { id: 'edge-win', label: 'Edge on Windows' },
  { id: 'custom', label: 'Custom...' },
]

export function getUserAgentString(id: UserAgentId): string {
  if (id === 'current') {
    return ''
  }

  if (id.startsWith('custom:')) {
    return id.slice(7)
  }

  const uaStrings: Record<string, string> = {
    'chrome-win':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'chrome-mac':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'chrome-linux':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'firefox-win':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'firefox-mac':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    'firefox-linux': 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'edge-win':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0',
  }

  return uaStrings[id] ?? ''
}
