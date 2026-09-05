export type BodyEncoding = 'utf8' | 'base64' | 'urlencoded' | 'json' | 'unknown'

export type BodyAvailability =
  | 'available'
  | 'unavailable'
  | 'partial'
  | 'blocked'
  | 'not-requested'
  | 'capture-error'

export interface ResponseBodyCaptureResult {
  available: BodyAvailability
  encoding?: BodyEncoding
  mimeType?: string
  contentEncoding?: string
  size?: number
  error?: string
  truncated?: boolean
  redacted?: boolean
  source?: string
  body?: string
}

export interface ProviderContext {
  url: string
  method: string
  status?: number
  contentType?: string
  requestHeaders?: Record<string, string>
  responseHeaders?: Record<string, string>
  body?: string
  options?: {
    bodiesEnabled: boolean
  }
}

export interface ResponseBodyProvider {
  readonly id: string
  canCapture(ctx: ProviderContext): boolean
  capture(ctx: ProviderContext): Promise<ResponseBodyCaptureResult>
}
