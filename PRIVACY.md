# Privacy Policy

**Effective Date:** June 28, 2026

## Overview

Capultura BETA ("Capultura," "we," "us," or "our") is a Manifest V3 Chrome extension that records browser HTTP traffic and exports it to JMeter JMX and Playwright test scripts. This policy describes what data Capultura handles, how it is stored, and your choices.

**Governance:** Capultura BETA is developed and operated by Stephen Stewart, a freelance developer trading as Testudo. All data processing is performed under his direction as the data controller.

## 1. Information We Collect

Capultura processes information locally within your browser. We do not operate servers that receive your recordings or personal data.

### 1.1 Categories of Personal Information We Collect

| Category                                                 | Collected by Capultura | Details                                                                                                                                                                   |
| -------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Identifiers**                                          | No                     | We do not collect names, email addresses, usernames, or similar identifiers.                                                                                              |
| **Internet/network activity**                            | Yes (local only)       | URLs, request/response headers, query parameters, method, status codes, timestamps, and (optionally) request/response bodies captured via `chrome.webRequest`.            |
| **Device/automation data**                               | Yes (local only)       | Browser user-agent string (user-selectable override available), window dimensions, and extension runtime state stored in `chrome.storage.local`.                          |
| **Preferences/settings**                                 | Yes (local only)       | Theme choice, recording filters, export defaults, and UI preferences stored in `chrome.storage.local`.                                                                    |
| **User-submitted files**                                 | Yes (local only)       | HAR (HTTP Archive) files that you upload for local conversion to JMX.                                                                                                     |
| **Special categories ( sensitive personal information)** | No                     | We do not collect precise geolocation, health, biometric, or financial data. Cookies are only included in JMX exports if you explicitly enable the "Emit cookies" option. |
| **Children’s data**                                      | No                     | Capultura is not directed to children under 13.                                                                                                                           |

### 1.2 Sources of Data

- **Browser APIs:** `chrome.webRequest`, `chrome.storage.local`, `chrome.runtime`, `chrome.downloads`.
- **User input:** HAR file uploads, option toggles, text inputs (plan names, filter patterns, extractors).
- **Web pages visited:** While recording is active, Capultura captures metadata from network requests matching your filter patterns across sites you visit.

### 1.3 Device and Mobile Information

Capultura does not collect device-specific identifiers, phone numbers, or contact lists. It may read the browser's user-agent string and window dimensions for display purposes. No location services or GPS data are accessed.

### 1.4 Tracking, Analytics, and Advertising

Capultura does **not** use third-party analytics SDKs, advertising networks, remarketing pixels, or trackers. We do not serve ads, and we do not share data for third-party advertising.

### 1.5 Email Communications

Capultura does **not** send marketing emails, newsletters, or transactional emails. We do not collect email addresses through the extension UI.

### 1.6 Payments and Subscriptions

Capultura is provided as-is with no payment processing, in-app purchases, or subscriptions.

## 2. How We Use Information

All processing occurs locally on your device. Capultura uses the data solely to:

- Capture and display HTTP traffic metadata in the popup transaction panel.
- Generate downloadable JMX and Playwright test scripts.
- Apply user-configured filters and exclusions.
- Persist your UI preferences and export defaults between sessions.
- Convert locally uploaded HAR files to JMX format.

## 3. Data Sharing and "Sale" or "Share"

We do **not** sell, rent, or share personal information with third parties. We do **not** use the terms "sale" or "share" as defined under CCPA/CPRA.

We do **not** transfer data to remote servers. The only external interactions are the Chrome downloads initiated by you (JMX/Playwright file downloads).

## 4. Third-Party Processors

Capultura does **not** rely on external data processors. All computation runs inside the Chrome extension sandbox using browser-provided APIs.

## 5. Data Retention

Data remains in `chrome.storage.local` until you:

- Click **Clear** in the popup (which calls `RESET` and removes captured requests).
- Uninstall the extension.
- Use Chrome’s extension data clearing controls.

We do not enforce automatic expiration of captured transaction data beyond the UI limits you configure (default: 200 transactions displayed).

## 6. Security

Capultura relies on Chrome’s extension security model:

- Extension logic executes in an isolated sandbox with no arbitrary code execution from remote sources.
- Stored data is confined to `chrome.storage.local`, which is managed by the browser.
- No network listeners are opened by the extension for data exfiltration.

## 7. Your Rights and Choices

### 7.1 CCPA/CPRA (California Residents)

If you are a California resident, you have the right to:

- **Know:** Request disclosure of the categories and specific pieces of personal information we collect, use, and disclose. Because all data is stored locally, you can inspect it through the extension UI or Chrome developer tools.
- **Delete:** Request deletion of personal information. You may use the **Clear** button in the popup or uninstall the extension to remove all locally stored data.
- **Correct:** Request correction of inaccurate personal information. Edit preferences directly in the Options page; these write through to `chrome.storage.local`.
- **Opt out of sale/share:** Capultura does not sell or share personal information.
- **Limit use/disclosure of sensitive personal information:** Capultura does not process sensitive personal information as defined by CPRA. Cookies and response bodies are opt-in features that remain local.

To exercise these rights, use the **Clear** button in the popup or uninstall the extension to remove all locally stored data. Because Capultura is an open-source project with no remote user accounts, there is no customer-service portal or web form for privacy requests. You may also email us at admin@testudo.co.nz.

### 7.2 GDPR (EU/EEA/UK Residents)

If you are located in the EU/EEA or UK, you have rights regarding your local data:

- **Right of access:** You can access all stored data via the extension’s popup transaction panel and `chrome.storage.local` inspection tools.
- **Right to rectification:** Update preferences directly in the Options page.
- **Right to erasure:** Use the **Clear** button or uninstall the extension.
- **Right to restrict processing:** Disable recording or uncheck "Capture response bodies" and "Emit cookies" to limit what is captured.
- **Right to data portability:** Exports (JMX, Playwright, HAR) are generated locally and downloaded by you.
- **Right to object:** Stop using the extension at any time.

**Lawful basis:** Processing is necessary for the performance of a task carried out in the context of your use of the extension (Article 6(1)(b) GDPR) and based on your consent for optional features such as response body capture (Article 6(1)(a) GDPR).

**International transfers:** Because no data leaves your device, there are no international data transfers.

### 7.3 CalOPPA (California Users)

CalOPPA requires us to disclose our privacy practices prominently. This policy is posted at https://github.com/testudoq-org/jMeterRec/blob/master/PRIVACY. The extension itself does not serve web pages. We do not operate a customer portal or in-extension privacy contact form.

### 7.4 Children’s Privacy (COPPA)

Capultura is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided information through the extension, please contact us so we can investigate.

## 8. How to Contact Us

Capultura is an open-source project developed by Stephen Stewart trading as Testudo. For privacy inquiries, you may reach us through:

- **Email:** admin@testudo.co.nz
- **Website / Support page:** www.testudo.co.nz

We do not offer phone or postal mail support. There is no in-extension privacy contact form or customer-service portal.

## 9. Changes to This Privacy Policy

We may update this policy from time to time. The "Effective Date" at the top indicates when the policy was last revised. If we make material changes (for example, adding remote upload features), we will update this notice and, where required by law, seek additional consent.

## 10. Additional Disclosures

- **No AI training:** We do not use your data to train AI models.
- **No behavioral advertising:** We do not track you across sites for ad targeting.
- **No remote feature:** A backend upload flow has been explicitly scoped out of the current release. Should a remote conversion feature be introduced in the future, the upload endpoint would be operated by and fully within the customer’s own domain and control; the developer would not operate or store data on that endpoint. Passed-through data would not be retained by the software or the developer—its sovereignty would remain ephemeral and under the customer’s control. Any data captured reflects traffic generated by the user’s own browser (including interactions with services such as Google), not information collected at the developer’s direction. If such a feature is added, this policy will be revised to describe the remote endpoint, data types, and transfer security.

## 11. Chrome Web Store Data Usage Disclosures

The following disclosures correspond to the data categories requested in the Chrome Web Store listing process.

| Chrome Web Store Category | Collected | Details |
|---------------------------|-----------|---------|
| **Personally identifiable information** | No | Capultura does not collect names, addresses, email addresses, ages, or identification numbers. |
| **Health information** | No | No health data, medical history, symptoms, diagnoses, or procedures are collected. |
| **Financial and payment information** | No | No credit card numbers, financial statements, or transaction data are collected by the extension. Users may record their own banking or payment pages, and that traffic is captured locally as part of normal browsing; the extension does not target or categorize financial data. |
| **Authentication information** | Yes (local only) | HTTP `Authorization` headers are captured as part of traffic recording and may appear in exported JMX files. HTTP cookies are included in JMX exports only when the user explicitly enables the "Emit cookies" option. No passwords, PINs, or security-question answers are collected by the extension itself. |
| **Personal communications** | No | No emails, text messages, or chat messages are collected. |
| **Location** | No | No region, IP address, GPS coordinates, or proximity data are collected. |
| **Web history** | No | No browsing history is stored or transmitted. Capture is session-scoped and user-initiated; data is cleared on demand. |
| **User activity** | Yes (local only) | While recording is active, Capultura captures DOM interactions — clicks, form submissions, keystrokes in input fields, and focus changes — to generate Playwright test scripts. Network activity (request method, URL, headers, status, timing) is also captured via `chrome.webRequest`. All captured activity is stored locally and used solely to generate test scripts. |
| **Website content** | Opt-in (local only) | Response bodies (`fetch` and `XMLHttpRequest` payloads) are captured only when the user explicitly enables "Capture response bodies" in advanced options. This is an opt-in feature and is disabled by default. Captured bodies may appear in the popup transaction inspector and can be exported. |

**Certifications**

- I do not sell or transfer user data to third parties, apart from the approved use cases described in this policy.
- I do not use or transfer user data for purposes that are unrelated to the extension's single purpose (recording browser flows and converting them to test scripts).
- I do not use or transfer user data to determine creditworthiness or for lending purposes.
