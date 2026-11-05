declare module 'chrome-har' {
  export interface HarFromMessagesOptions {
    includeResourcesFromDiskCache?: boolean;
    includeTextFromResponseBody?: boolean;
  }

  export function harFromMessages(
    messages: Array<{ method: string; params: any }>,
    options?: HarFromMessagesOptions
  ): any;
}
