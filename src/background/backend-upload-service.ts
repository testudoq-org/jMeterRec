import type { BackendUploadConfig } from '../options/backend-upload-options'
import type { CapturedRequest } from '../models/captured-request'

export class BackendUploadService {
  async uploadAndDownload(
    config: BackendUploadConfig,
    allRequests: CapturedRequest[]
  ): Promise<
    | { success: true; jmx: string; filename: string }
    | { success: true; downloadUrl: string }
    | { success: false; error: string }
  > {
    if (config.converterUrl.trim().length === 0) {
      return { success: false, error: 'Converter URL is not configured.' }
    }

    const includedDomains = config.includeDomains.filter((domain) => domain.trim().length > 0)

    if (includedDomains.length === 0) {
      return { success: false, error: 'Select at least one domain before uploading.' }
    }

    const requests = allRequests.filter((request) =>
      includedDomains.some((domain) => request.url.includes(domain))
    )

    if (requests.length === 0) {
      return { success: false, error: 'No requests match the selected domains.' }
    }

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', config.converterUrl)
      xhr.timeout = config.timeoutMs
      xhr.responseType = 'text'

      xhr.setRequestHeader('Content-Type', 'application/json')
      if (config.authToken.trim().length > 0) {
        xhr.setRequestHeader('Authorization', `Bearer ${config.authToken.trim()}`)
      }

      xhr.onload = () => {
        const status = xhr.status
        const responseText = xhr.responseText ?? ''

        if (status === 0) {
          resolve({
            success: false,
            error: 'Network error uploading to converter. Check URL and connectivity.',
          })
          return
        }

        const contentType = xhr.getResponseHeader('content-type') ?? ''

        if (status < 200 || status >= 300) {
          const bodySnippet = responseText.slice(0, 200)

          if (status === 401 || status === 403) {
            resolve({ success: false, error: 'Converter rejected the request. Check auth token.' })
            return
          }

          if (status >= 500) {
            resolve({
              success: false,
              error: 'Converter is temporarily unavailable. Try again later.',
            })
            return
          }

          resolve({
            success: false,
            error: `Converter returned an error: ${status} ${bodySnippet}`.trim(),
          })
          return
        }

        if (contentType.includes('xml') || contentType.includes('text')) {
          const jmx = responseText

          if (!isLikelyJmx(jmx)) {
            resolve({ success: false, error: 'Unexpected response format from converter.' })
            return
          }

          const filename = `${config.exportFilename || 'Untitled Plan'}.jmx`
          resolve({ success: true, jmx, filename })
          return
        }

        try {
          const json = JSON.parse(responseText) as Record<string, unknown>

          if (typeof json.downloadUrl === 'string') {
            resolve({ success: true, downloadUrl: json.downloadUrl })
            return
          }
        } catch {
          // Not JSON, fall through to format error
        }

        resolve({ success: false, error: 'Unexpected response format from converter.' })
      }

      xhr.onerror = () => {
        resolve({
          success: false,
          error: 'Network error uploading to converter. Check URL and connectivity.',
        })
      }

      xhr.ontimeout = () => {
        resolve({
          success: false,
          error: `Converter did not respond within ${Math.round(config.timeoutMs / 1000)} seconds.`,
        })
      }

      xhr.onabort = () => {
        resolve({
          success: false,
          error: 'Upload was aborted.',
        })
      }

      xhr.send(JSON.stringify({ requests }))
    })
  }
}

function isLikelyJmx(content: string): boolean {
  return content.includes('jmeterTestPlan') && content.includes('hashTree')
}
