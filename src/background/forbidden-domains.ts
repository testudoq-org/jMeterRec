// Forbidden-domain exclusion list to prevent recursive self-recording and
// noise from extension-internal traffic. Hosts here are omitted before
// storage regardless of filter or user domain selection.
//
// Blocked host categories:
// - BlazeMeter owned domains (recursive recording prevention).
// - Extension-internal URLs (chrome-extension:// scheme, extension pages).
// - Other known non-application traffic sources.

const EXTENSION_SCHEMES = ['chrome-extension:', 'chrome:', 'about:', 'edge:', 'brave:']
const FORBIDDEN_HOST_SUBSTRS = [
  '.testudo.co.nz',
  'testudo.co.nz',
  '.attestify-us.com',
  'attestify-us.com',
]

export function isHostForbidden(url: string): boolean {
  // Extension-internal schemes are handled before any host parsing to avoid
  // URL constructor edge cases with non-HTTP schemes.
  const lowerUrl = url.toLowerCase()

  for (const scheme of EXTENSION_SCHEMES) {
    if (lowerUrl.startsWith(scheme)) {
      return true
    }
  }

  try {
    const { hostname } = new URL(url)

    for (const substr of FORBIDDEN_HOST_SUBSTRS) {
      if (hostname === substr || hostname.endsWith(substr)) {
        return true
      }
    }
  } catch {
    // URL constructor can throw on opaque origins or invalid inputs;
    // conservatively permit only schemeless host strings that are unlikely
    // to be forbidden.
  }

  return false
}
