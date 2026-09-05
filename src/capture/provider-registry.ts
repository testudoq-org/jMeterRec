import type {
  ProviderContext,
  ResponseBodyCaptureResult,
  ResponseBodyProvider,
} from './response-body-provider'

export class ProviderRegistry {
  constructor(private readonly providers: ResponseBodyProvider[]) {}

  async capture(ctx: ProviderContext): Promise<ResponseBodyCaptureResult> {
    for (const provider of this.providers) {
      if (provider.canCapture(ctx)) {
        return provider.capture(ctx)
      }
    }

    return {
      available: 'not-requested',
      source: 'none',
    }
  }
}
