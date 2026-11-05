<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# API Actions

## General

### `load`

Parses an OpenAPI v3 document and returns a map of endpoint configurations keyed by
their `operationId`. The result is a plain serializable object — not class instances —
so it can be safely stored in a pipeline variable and passed to `invoke`.

**Returns:** A record mapping each `operationId` to its endpoint configuration.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `url` | string | ✓ | — | URL pointing to the OpenAPI (Swagger) specification JSON or YAML. |
| `include` | string[] |  | — | Optional list of operation IDs or paths to include. |
| `exclude` | string[] |  | — | Optional list of operation IDs or paths to exclude. |
| `usePathAsId` | boolean |  | — | Use the URL path as the endpoint identifier instead of operationId. |
| `idFormat` | `camelCase` \| `snakeCase` \| `kebabCase` \| `pascalCase` |  | — | Casing format applied to generated endpoint IDs (camelCase, snakeCase, etc.). |

```yaml
# Load the Linode API spec — include only the list-instances endpoint
- group: api
  name: load
  params:
    url: 'https://raw.githubusercontent.com/linode/linode-api-docs/refs/heads/development/openapi.json'
    include:
      - get-linode-instances
  destination: linodeAPI
```

## OpenAPI

### `invoke`

Calls a named endpoint from a map previously produced by `load`. Reconstructs an
`ApiFunction` from the stored configuration so the map can be safely serialized
to JSON and back between pipeline steps.

**Returns:** The parsed JSON response from the API.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `endpoints` | any | ✓ | — | Reference to the loaded OpenAPI endpoints object. |
| `method` | string | ✓ | — | Name of the endpoint method to invoke. |
| `args` | Record&lt;string, any&gt; |  | — | Path arguments required by the endpoint. |
| `parameters` | Record&lt;string, any&gt; |  | — | Query parameters for the endpoint call. |
| `headers` | Record&lt;string, any&gt; |  | — | HTTP headers to include in the request. |

```yaml
# Call the get-linode-instances endpoint loaded from the Linode OpenAPI spec
- group: api
  name: invoke
  params:
    endpoints: '{= linodeAPI =}'
    method: get-linode-instances
    headers:
      Authorization: 'Bearer {{ myToken }}'
    args:
      apiVersion: v4
  destination: instances
```

### `request`

Makes a direct HTTP request to any URL without loading an OpenAPI spec.
Build dynamic URLs with template expressions, e.g. `.../instances/{{ server.id }}`.

**Returns:** The parsed JSON response from the API.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `url` | string | ✓ | — | Full URL of the API endpoint to call. |
| `method` | `GET` \| `POST` \| `PUT` \| `DELETE` \| `PATCH` | ✓ | — | HTTP method to use (GET, POST, PUT, DELETE, PATCH). |
| `parameters` | Record&lt;string, any&gt; |  | — | Query string parameters to append to the URL. |
| `headers` | Record&lt;string, any&gt; |  | — | HTTP headers to include in the request. |
| `body` | any |  | — | Request body payload (any type). |

```yaml
# Fetch the 5 most recent Gmail messages using an OAuth2 token
- group: api
  name: request
  params:
    url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages'
    method: GET
    headers:
      Authorization: 'Bearer {{ googleToken.access_token }}'
    parameters:
      maxResults: 5
  destination: gmailMessages
```

## Direct Request

### `auth`

Authenticates via the OAuth2 authorization code flow. Opens a browser for user consent,
starts a local HTTP server to capture the authorization code, and exchanges it for tokens.
Pass a previously returned token via `token` to reuse or silently refresh it instead of
reopening the browser. Point `token` and `destination` at the same global variable (it must
already exist) to persist the token across separate task runs with no extra step.

**Returns:** Token object with `access_token`, `refresh_token`, `expires_in`, `token_created_at`, and `scope`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `type` | `oauth2` | ✓ | — | Authentication type (currently only oauth2 is supported). |
| `clientId` | string | ✓ | — | OAuth2 client ID issued by the provider. |
| `clientSecret` | string | ✓ | — | OAuth2 client secret issued by the provider. |
| `scopes` | string[] | ✓ | — | List of OAuth2 scopes to request. |
| `authEndpoint` | string | ✓ | — | Authorization endpoint URL for the OAuth2 provider. |
| `tokenEndpoint` | string | ✓ | — | Token exchange endpoint URL for the OAuth2 provider. |
| `port` | number |  | — | Local port to listen on for the OAuth2 redirect callback. |
| `token` | any |  | — | Previously returned token to reuse (e.g. {= _global.googleGmailToken =}). Empty/missing, insufficient scopes, an unrefreshable expiry, or a refresh token the provider no longer accepts (invalid_grant: expired or revoked) all fall back to a fresh consent flow. |
| `forceReauth` | boolean |  | false | Ignore the passed-in token and always request fresh consent. |

```yaml
# Authenticate with Google OAuth2, reusing/refreshing the token stored in a global
# variable (create "googleGmailToken" once via the Variables page before first use)
- group: api
  name: auth
  params:
    type: oauth2
    clientId: '{{ _env.GOOGLE_CLIENT_ID }}'
    clientSecret: '{{ _env.GOOGLE_CLIENT_SECRET }}'
    scopes:
      - 'https://www.googleapis.com/auth/gmail.readonly'
      - 'https://www.googleapis.com/auth/calendar.readonly'
    authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth'
    tokenEndpoint: 'https://oauth2.googleapis.com/token'
    token: '{= _global.googleGmailToken =}'
  destination: _global.googleGmailToken
```

## Authentication

### `basicAuth`

Base64-encodes a username/password pair for HTTP Basic Auth. Unlike `auth`'s OAuth2 flow,
this makes no network call — Basic Auth has no separate authentication step, since the
credential itself (not a server-issued token) is what gets sent on every request. Use the
result the same way an OAuth2 token is used, just with the "Basic" scheme instead of
"Bearer": `Authorization: 'Basic {{ _global.drupalBasicAuth }}'`.

**Returns:** The base64-encoded "username:password" string (without the "Basic " prefix).

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `username` | string | ✓ | — | Username for HTTP Basic Auth. |
| `password` | string | ✓ | — | Password for HTTP Basic Auth. |

```yaml
# Build a Basic Auth header value and persist it for reuse across every call to the site
- group: api
  name: basicAuth
  params:
    username: '{{ _env.DRUPAL_USER }}'
    password: '{{ _env.DRUPAL_PASS }}'
  destination: _global.drupalBasicAuth
```
