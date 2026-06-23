## Security & Privacy

### Manifest Permissions

Capultura uses the following Chrome extension permissions, each with a specific purpose:

| Permission | Purpose |
|------------|---------|
| storage | Persist recording state, captured requests, and user options to chrome.storage.local |
| unlimitedStorage | Avoid the default 5MB storage quota during long recording sessions |
| webRequest | Capture HTTP traffic headers and metadata during recording |
| activeTab | Target recordings to the currently active browser tab |
| windows | Create detached inspector windows for detailed transaction view |
| downloads | Save generated JMX and Playwright files to the user download folder |
| scripting | Dynamic content script injection for lifecycle hooks (future use) |
| browsingData | Clear session cookies and cache during cleanup operations |

### Privacy Behavior

- Cookie recording is opt-in (recordCookies advanced option, default: true). When enabled, cookie headers are captured and stored in the JMX export for session replay simulation.
- Headers are captured verbatim in JMX exports. Authorization headers, API tokens, and other sensitive data in request headers will be present in exported JMX files.
- Request/response bodies may be captured when captureResponseBody is enabled. Bodies are truncated at 4000 characters and can be marked for redaction.
- No data is uploaded all exports are saved locally via the Chrome downloads API.
- Logs are sanitized no secrets, full headers, or request bodies are written to console output.

### Known Limits

- Maximum captured requests in popup memory: 200 (configurable via maxTransactions in storage)
- Storage quota without unlimitedStorage: 5MB (insufficient for large sessions)
- Response body capture requires explicit user opt-in and is limited by MV3 webRequest API constraints
- Popup rendering is optimized for up to 500 captured requests
- Domain/host permissions use all_urls for comprehensive traffic capture during recordings
