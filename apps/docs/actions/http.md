<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# HTTP Actions

## General

### `request`

Makes an HTTP request using Axios-compatible options and returns the response's status,
headers and body.

Supports all common HTTP methods (GET, POST, PUT, PATCH, DELETE) with optional
headers, query params, request body, basic auth, and response type control.

A 4xx or 5xx response, a timeout or a connection error fails the step. With `failOnHttpError`
false the step always returns a result: when no response arrived, `status` is 0, `data` is
null and `error` says why.

**Returns:** An object with `status`, `headers` and `data`, plus `error` when no response arrived.
`data` is the response body: parsed when it is JSON, otherwise text. Credential headers such
as `Set-Cookie` show `[REDACTED]`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `url` | string | ✓ | — | Request URL. |
| `method` | `get` \| `post` \| `put` \| `delete` \| `patch` \| `head` \| `options` |  | — | HTTP method (get, post, put, delete, patch, etc.). |
| `baseURL` | string |  | — | Optional base URL prepended to the url. |
| `headers` | Record&lt;string, any&gt; |  | — | HTTP headers as key-value pairs. |
| `params` | Record&lt;string, any&gt; |  | — | URL query parameters as key-value pairs. |
| `data` | any |  | — | Request body payload. |
| `timeout` | number |  | — | Request timeout in milliseconds. |
| `withCredentials` | boolean |  | — | Whether to send cookies with cross-site requests. |
| `auth` | object |  | — | Basic authentication credentials (username and password). |
| `responseType` | `arraybuffer` \| `document` \| `json` \| `text` \| `stream` \| `blob` |  | — | Expected response type: arraybuffer, document, json, text, stream, or blob. |
| `responseEncoding` | string |  | — | Encoding used to decode the response (e.g. utf8). |
| `failOnHttpError` | boolean |  | — | Fail the step when a request gets a 4xx or 5xx response or no response at all. On by default. Turn it off to check the result in a later step: with no response, status is 0 and error says why. |
| `allowPrivateNetwork` | boolean |  | — | Allow this specific call to reach private/internal addresses (localhost, LAN, cloud metadata). Off by default to prevent SSRF via a templated url. Must be set to a fixed true/false here — it cannot reference a variable. |

```yaml
# GET a JSON resource from a public API, then read product.status and product.data
- group: http
  name: request
  params:
    url: 'https://api.example.com/products/1'
    method: get
    responseType: json
  destination: product
```

### `downloadFile`

Downloads a file from a URL and saves it to a local path.

If `path` points to an existing directory, the filename is derived from the URL
and appended automatically. Parent directories are created if they do not exist.

**Returns:** The resolved local file path where the file was saved.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | Browser instance to use for the download. |
| `url` | string | ✓ | — | URL of the file to download. |
| `path` | string | ✓ | — | Local file path to save the downloaded file. |
| `allowPrivateNetwork` | boolean |  | — | Allow this specific call to reach private/internal addresses (localhost, LAN, cloud metadata). Off by default to prevent SSRF via a templated url. Must be set to a fixed true/false here — it cannot reference a variable. |

```yaml
# Download into the same directory as the YAML file (relative path)
- group: http
  name: downloadFile
  params:
    url: 'https://example.com/reports/daily-report.pdf'
    path: ./
```
