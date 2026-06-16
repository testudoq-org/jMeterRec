# Security Guidelines

## Manifest Permissions

Current `src/manifest.json` permissions must be documented as follows:

| Permission | Reason |
|------------|--------|
| `storage` | Store recording state, captured requests, JMX/Playwright settings, transaction panel options, and theme locally |
| `unlimitedStorage` | Allow local storage to grow with captured requests and settings |
| `webRequest` | Capture HTTP request headers and request bodies for browser traffic |
| `activeTab` | Support recording control for the active tab |
| `windows` | Create and focus the detached transaction inspector window |

Current host permission:

| Host permission | Reason |
|-----------------|--------|
| `<all_urls>` | Capture browser HTTP traffic across sites while recording is active |

Permissions intentionally not declared in the current implementation:

| Permission | Reason |
|------------|--------|
| `webRequestBlocking` | Not needed by the current capture/export path |
| `scripting` | Not used by the current static content script setup |
| `debugger` | Avoided because devtools-style response body capture is high-risk and not implemented |
| `sidePanel` | Not used by the current popup/detached-window UX |

## Response body capture

`chrome.webRequest` can capture request bodies, response headers, status, and timing metadata, but it cannot reliably capture response bodies for all traffic. The current popup displays:

- Request body when present
- Response headers and status when present
- `Response body capture disabled` when the option is disabled
- `Unavailable from webRequest` when the option is enabled but no response body is available

A future response body capture feature should require explicit user opt-in, privacy warnings, size limits, and tests.

## Security Rules

- Never commit `.env`, secrets, or personal browsing data
- Use least-privilege principle for host permissions
- Document all external API calls in code comments; the current extension should make no external calls during recording/export
- Render captured request/response content with `textContent` or `JSON.stringify`, never `innerHTML`
- Truncate large payloads before display
- Run `npm run lint` before committing to catch potential issues
- Review manifest permissions before adding new Chrome APIs

## Threat Model

- Extension runs in the user's browser context
- Captured requests may contain credentials, tokens, cookies, and personal data
- All data is stored locally in `chrome.storage.local` unless a future feature explicitly changes that
- No analytics or telemetry by default
- Detached inspector windows reuse the same popup UI and must preserve the same safe rendering rules
- No remote code execution; avoid remote-loaded scripts and CDN dependencies
