import { FORBIDDEN_RESPONSE_CONTENT_TYPES, measureBytes } from '../../utils/response-body'
import type {
  ProviderContext,
  ResponseBodyCaptureResult,
  ResponseBodyProvider,
} from '../response-body-provider'

export class ContentScriptResponseBodyProvider implements ResponseBodyProvider {
  readonly id = 'content-script'

  constructor(private readonly source: 'content-fetch' | 'content-xhr') {}

  canCapture(ctx: ProviderContext): boolean {
    return ctx.options?.bodiesEnabled !== false
  }

  async capture(ctx: ProviderContext): Promise<ResponseBodyCaptureResult> {
    if (!ctx.body) {
      return {
        available: 'not-requested',
        source: this.source,
      }
    }

    if (this.isForbiddenContentType(ctx.contentType)) {
      return {
        available: 'blocked',
        source: this.source,
        error: 'Forbidden content type.',
        mimeType: ctx.contentType,
        size: 0,
      }
    }

    try {
      const measured = measureBytes(ctx.body, ctx.contentType)
      return {
        ...measured,
        source: this.source,
        mimeType: ctx.contentType,
      }
    } catch (err) {
      return {
        available: 'capture-error',
        source: this.source,
        error: err instanceof Error ? err.message : 'Unable to capture response body',
        size: 0,
      }
    }
  }

  private isForbiddenContentType(contentType?: string): boolean {
    if (!contentType) {
      return false
    }

    return FORBIDDEN_RESPONSE_CONTENT_TYPES.some((regex) => regex.test(contentType))
  }
}
