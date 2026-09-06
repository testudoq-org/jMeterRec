declare module 'jsdom' {
  export interface JSDOMOptions {
    contentType?: string
    url?: string
    includeNodeLocations?: boolean
    storageQuota?: number
  }

  export class JSDOM {
    readonly window: {
      readonly document: Document
    }

    constructor(html: string, options?: JSDOMOptions)
  }
}
