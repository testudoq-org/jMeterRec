# Privacy Policy

## What is captured

Capultura captures HTTP traffic during recording sessions for the purpose of generating test scripts (JMX, Playwright). The extension captures:

- **Request headers** (including cookies and authorization headers)
- **Query parameters**
- **Request bodies** (for POST/PUT requests)
- **Response status codes**
- **DOM action events** (clicks, form submissions, typing) - optional

## Storage location

All captured data is stored locally in `chrome.storage.local` on your device. No data is transmitted to external servers during recording or export.

## External transmission

The extension does **not** transmit any captured data externally. All processing (JMX/Playwright generation, HAR export) occurs locally on your device.

## Retention

- Recording data is automatically cleared when you:
  - Click "Reset" in the popup
  - Stop recording (optional, based on settings)
- No automatic transmission or retention of sensitive data

## User controls

- **Reset button**: Clears all captured requests and stops recording
- **Capture response bodies**: Opt-in feature (disabled by default) for capturing response content
- **Cookie emission in JMX**: Opt-in checkbox to include cookies in exported JMX files
- **Domain filtering**: Exclude/include specific domains during capture

## Recommendations

Review exported JMX and Playwright files before committing to version control or sharing. These exports may contain sensitive data including:

- Session tokens in authorization headers
- PII in query parameters
- Credentials in request bodies

For privacy protection, use the extension only against non-production environments.