declare module 'jsdom' {
  export class JSDOM {
    readonly window: {
      readonly document: Document
    }

    constructor(html: string)
  }
}
