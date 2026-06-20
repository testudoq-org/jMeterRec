# Extension Permissions

This file documents the permissions declared in `src/manifest.json` for
Capultura. Each permission is listed with its owner and the reason it is
required. Where a permission is conditional on product approval the approval
status is noted.

| Permission | Owner / surface | Justification | Approval |
|-----------|-----------------|---------------|----------|
| `storage` | Options, recorder state | Persist JMX defaults, theme, and transaction-panel preferences. | Shipped |
| `unlimitedStorage` | Recorder state | Allow unbounded capture of captured-request history in local storage. | Shipped |
| `webRequest` | Traffic capture | Intercept and inspect HTTP requests during recording. | Shipped |
| `activeTab` | Popup actions | Access the current tab when the user interacts with the popup or detached inspector. | Shipped |
| `windows` | Detached inspector | Open and focus the detached transaction inspector window. | Shipped |
| `downloads` | JMX / HAR export | Save generated JMX and future HAR files to the user's machine. | Shipped |
| `scripting` | Content frame injection | Dynamically inject the content script into app frames for lifecycle hooks (idempotency guard). | Pending prototype review |
| `browsingData` | Session reset | Remove cookies and cache scoped to the extension during the reset flow. | Pending implementation review |

Notes
- `host_permissions: ["<all_urls>"]` is required for `webRequest` capture across
  navigated pages. It is scoped by the content-script `all_frames` declaration
  and should not be widened.
- `browsingData` calls are limited to extension-scope data; the extension does
  not wipe full browser profiles.
- Native toast notifications are **not** implemented. Completion feedback is
  surfaced via the popup badge and status text. If toast notifications become a
  product priority, add the `notifications` permission and related code paths in
  a future spec.
