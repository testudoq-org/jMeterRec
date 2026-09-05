import type {
  ProviderContext,
  ResponseBodyCaptureResult,
  ResponseBodyProvider,
} from '../response-body-provider'

export class UnsupportedResponseBodyProvider implements ResponseBodyProvider {
  readonly id = 'unsupported'

  canCapture(ctx: ProviderContext): boolean {
    return ctx.options?.bodiesEnabled === false
  }

  async capture(_ctx: ProviderContext): Promise<ResponseBodyCaptureResult> {
    return {
      available: 'not-requested',
      source: 'none',
    }
  }
}
