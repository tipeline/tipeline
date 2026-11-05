import axios, { AxiosBasicCredentials, AxiosRequestConfig } from 'axios';
import fs from 'fs';
import net from 'net';
import dns from 'dns';
import path from 'path';
import { z } from 'zod';
import { validations } from '@tipeline/schemas';
import { Task } from '@task/Task';

type RequestParams = z.infer<typeof validations.http.request.runtime.schema>;
type DownloadFileParams = z.infer<typeof validations.http.downloadFile.runtime.schema>;

// Set TIPELINE_ALLOW_PRIVATE_HTTP=true to let http actions reach private/internal
// addresses — needed for legitimate internal integrations, off by default.
const ALLOW_PRIVATE_HTTP = process.env.TIPELINE_ALLOW_PRIVATE_HTTP === 'true';

function ipv4ToLong(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function inIpv4Cidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToLong(ip) & mask) === (ipv4ToLong(range) & mask);
}

// Loopback, RFC1918 private ranges, link-local (includes the 169.254.169.254 cloud
// metadata endpoint), CGNAT, and the "this network" range.
const BLOCKED_IPV4_RANGES = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.168.0.0/16',
];

function isBlockedAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    return BLOCKED_IPV4_RANGES.some((cidr) => inIpv4Cidr(address, cidr));
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('::ffff:')) {
      const embedded = normalized.slice(7);
      if (net.isIPv4(embedded)) return isBlockedAddress(embedded);
    }
    if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true; // link-local fe80::/10
    if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // unique local fc00::/7
    return false;
  }
  return true; // unknown address family — fail closed
}

// Passed as axios's `lookup` option so the IP we validate is the exact IP the request
// connects to (resolving once, not twice) — closing the DNS-rebinding gap where a hostname
// could resolve to a public address at check time and a private one at connect time.
//
// `allowPrivate` is this one call's own `allowPrivateNetwork` param, ORed with the global
// env override. It must come from the action's resolved params (a plain, non-templatable
// boolean enforced by both the zod schema and TaskValidator — see http.ts in
// packages/schemas and TaskValidation.ts) — never from anything that passed through
// parseParams' generic variable substitution, since that would let a runtime variable
// (webhook payload, a previous step's result) flip this open.
function makeSafeLookup(allowPrivate: boolean) {
  return function safeLookup(hostname: string, options: any, callback: any): void {
    if (allowPrivate) {
      dns.lookup(hostname, options, callback);
      return;
    }
    dns.lookup(hostname, options, (err: Error | null, address: any, family: any) => {
      if (err) return callback(err);
      const candidates = Array.isArray(address) ? address : [{ address, family }];
      for (const candidate of candidates) {
        const candidateAddress = typeof candidate === 'string' ? candidate : candidate.address;
        if (isBlockedAddress(candidateAddress)) {
          callback(new Error(`Blocked HTTP request to restricted address: ${candidateAddress}`));
          return;
        }
      }
      callback(null, address, family);
    });
  };
}

// Response headers that carry credentials. A request's result ends up in variables and run
// history, so these are hidden there.
const SENSITIVE_RESPONSE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'set-cookie',
  'set-cookie2',
]);

function safeResponseHeaders(headers: unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({ ...(headers as Record<string, unknown>) }).map(([name, value]) => [
      name,
      SENSITIVE_RESPONSE_HEADERS.has(name.toLowerCase()) ? '[REDACTED]' : value,
    ])
  );
}

/**
 * @group Actions
 */
export class GroupHTTP {
  /**
   * Makes an HTTP request using Axios-compatible options and returns the response's status,
   * headers and body.
   *
   * Supports all common HTTP methods (GET, POST, PUT, PATCH, DELETE) with optional
   * headers, query params, request body, basic auth, and response type control.
   *
   * A 4xx or 5xx response, a timeout or a connection error fails the step. With `failOnHttpError`
   * false the step always returns a result: when no response arrived, `status` is 0, `data` is
   * null and `error` says why.
   *
   * @param params - The input parameters.
   * @returns An object with `status`, `headers` and `data`, plus `error` when no response arrived.
   * `data` is the response body: parsed when it is JSON, otherwise text. Credential headers such
   * as `Set-Cookie` show `[REDACTED]`.
   * @example
   * ```yaml
   * # GET a JSON resource from a public API, then read product.status and product.data
   * - group: http
   *   name: request
   *   params:
   *     url: 'https://api.example.com/products/1'
   *     method: get
   *     responseType: json
   *   destination: product
   * ```
   * @example
   * ```yaml
   * # POST JSON data with a bearer token header
   * - group: http
   *   name: request
   *   params:
   *     url: 'https://api.example.com/tasks'
   *     method: post
   *     headers:
   *       Authorization: 'Bearer {{ apiToken }}'
   *       Content-Type: application/json
   *     data:
   *       name: Send Daily Report
   *       status: active
   *     timeout: 5000
   *     responseType: json
   * ```
   * @example
   * ```yaml
   * # Keep going on a 404, a 500 or a dead host, then check check.status and check.error
   * - group: http
   *   name: request
   *   params:
   *     url: 'https://example.com/health'
   *     failOnHttpError: false
   *   destination: check
   * ```
   */
  static async request(params: RequestParams): Promise<any> {
    const parsed = validations.http.request.runtime.validate(params);
    const failOnHttpError = parsed.failOnHttpError !== false;

    const config: AxiosRequestConfig = {
      url: parsed.url,
      method: parsed.method || 'get',
      baseURL: parsed.baseURL,
      headers: parsed.headers,
      params: parsed.params,
      data: parsed.data,
      timeout: parsed.timeout ?? 0,
      withCredentials: parsed.withCredentials ?? false,
      auth: parsed.auth as AxiosBasicCredentials | undefined,
      responseType: parsed.responseType || 'json',
      responseEncoding: parsed.responseEncoding || 'utf8',
      lookup: makeSafeLookup(ALLOW_PRIVATE_HTTP || parsed.allowPrivateNetwork === true),
      ...(failOnHttpError ? {} : { validateStatus: () => true }),
    };

    let response;
    try {
      response = await axios.request(config);
    } catch (error: any) {
      if (failOnHttpError) throw error;
      return {
        status: 0,
        headers: {},
        data: null,
        error: error.message || error.code || 'No response',
      };
    }

    return {
      status: response.status,
      headers: safeResponseHeaders(response.headers),
      data: response.data,
    };
  }

  /**
   * Downloads a file from a URL and saves it to a local path.
   *
   * If `path` points to an existing directory, the filename is derived from the URL
   * and appended automatically. Parent directories are created if they do not exist.
   *
   * @param params - The input parameters.
   * @returns The resolved local file path where the file was saved.
   * @example
   * ```yaml
   * # Download into the same directory as the YAML file (relative path)
   * - group: http
   *   name: downloadFile
   *   params:
   *     url: 'https://example.com/reports/daily-report.pdf'
   *     path: ./
   * ```
   * @example
   * ```yaml
   * # Download to an absolute directory — filename is inferred from the URL
   * - group: http
   *   name: downloadFile
   *   params:
   *     url: '{{ fileUrl }}'
   *     path: '/path/to/downloads/'
   * ```
   */
  static async downloadFile(params: DownloadFileParams, task: Task): Promise<string> {
    const parsed = validations.http.downloadFile.runtime.validate(params);

    const fileUrl = parsed.url;
    const urlObject = new URL(fileUrl);
    let downloadPath = parsed.path;

    if (!path.isAbsolute(downloadPath)) {
      const taskFilePath = task?.getFilePath();
      const base = taskFilePath ? path.dirname(taskFilePath) : process.cwd();
      downloadPath = path.resolve(base, downloadPath);
    }

    if (fs.existsSync(downloadPath) && fs.lstatSync(downloadPath).isDirectory()) {
      const fileName = path.basename(urlObject.pathname);
      downloadPath = path.join(downloadPath, fileName);
    }

    fs.mkdirSync(path.dirname(downloadPath), { recursive: true });

    const response = await axios.get(fileUrl, {
      responseType: 'stream',
      lookup: makeSafeLookup(ALLOW_PRIVATE_HTTP || parsed.allowPrivateNetwork === true),
    });

    const writer = fs.createWriteStream(downloadPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(downloadPath));
      writer.on('error', reject);
    });
  }
}
