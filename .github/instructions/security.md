# Security Guidelines

## Manifest Permissions

Each permission in `src/manifest.json` must be documented:

| Permission | Reason |
|------------|--------|
| `storage` | Store recorded requests and settings locally |
| `webRequest` | Capture HTTP request headers and bodies |
| `webRequestBlocking` | Intercept requests before they fire (future: modify headers) |
| `scripting` | Inject content scripts dynamically |
| `activeTab` | Access current tab for recording control |

## Security Rules

- Never commit `.env` or secrets
- Use least-privilege principle for host permissions
- Document all external API calls in code comments
- Run `npm run lint` before committing to catch potential issues

## Threat Model

- Extension runs in user's browser context
- No remote code execution
- All data stored in `chrome.storage.local`
- No analytics or telemetry by default