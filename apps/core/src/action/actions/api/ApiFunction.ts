type ApiFunctionOptions =
  | { baseUrl: string; path: string; method: string }
  | { url: string; method: string };

export class ApiFunction {
  private fullUrl: string;
  private method: string;
  // Only OpenAPI paths carry `{param}` placeholders; a direct URL is already final
  // (built with Liquid), so its braces are left alone.
  private hasPathParams: boolean;

  constructor(options: ApiFunctionOptions) {
    this.method = options.method.toLowerCase();
    this.hasPathParams = !('url' in options);
    this.fullUrl = 'url' in options ? options.url : `${options.baseUrl}${options.path}`;
  }

  public async call(
    args: Record<string, any> = {},
    parameters: any = {},
    customHeaders: Record<string, string> = {}
  ): Promise<any> {
    const isGet = this.method === 'get' || this.method === 'head';
    let url = this.hasPathParams ? this.interpolatePath(this.fullUrl, args) : this.fullUrl;

    if (isGet && Object.keys(parameters).length > 0) {
      url += (url.includes('?') ? '&' : '?') + new URLSearchParams(parameters).toString();
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...customHeaders };

    let body: string | undefined;
    if (!isGet) {
      if (headers['Content-Type']?.includes('application/x-www-form-urlencoded')) {
        // encode object as key=value pairs for form submissions
        body = new URLSearchParams(parameters).toString();
      } else if (typeof parameters === 'string') {
        // already serialized — send as-is to avoid double-encoding
        body = parameters;
      } else {
        // plain object or array — serialize to JSON
        body = JSON.stringify(parameters);
      }
    }

    const response = await fetch(url, {
      method: this.method.toUpperCase(),
      headers,
      body,
    });

    if (!response.ok) {
      let body = '';
      try {
        body = await response.text();
      } catch {}
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`
      );
    }

    return await response.json();
  }

  private interpolatePath(url: string, args: Record<string, any>): string {
    return url.replace(/{([^}]+)}/g, (_, key) => {
      if (!(key in args)) throw new Error(`Missing path argument: ${key}`);
      return encodeURIComponent(args[key]);
    });
  }
}
