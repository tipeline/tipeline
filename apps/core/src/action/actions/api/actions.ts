import { z } from 'zod';
import { validations } from '@tipeline/schemas';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIV3 } from 'openapi-types';
import { OAuth2Client } from '@action/actions/api/OAuth2Client';
import { DebugController } from '@engine/DebugController';
import type { Task } from '@task/Task';
import { ApiFunction } from '@action/actions/api/ApiFunction';

type LoadParams = z.infer<typeof validations.api.load.runtime.schema>;
type InvokeParams = z.infer<typeof validations.api.invoke.runtime.schema>;
type RequestParams = z.infer<typeof validations.api.request.runtime.schema>;
type AuthParams = z.infer<typeof validations.api.auth.runtime.schema>;
type BasicAuthParams = z.infer<typeof validations.api.basicAuth.runtime.schema>;

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options' | 'trace';

// Plain serializable shape stored in pipeline variables by `load` and consumed by `invoke`.
// Using a plain object (not an ApiFunction instance) ensures it survives JSON serialization.
type EndpointConfig = { baseUrl: string; method: string; path: string };

/**
 * @group Actions
 */
export class GroupApi {
  // --------------------------------------------------
  // OpenAPI
  // --------------------------------------------------

  /**
   * Parses an OpenAPI v3 document and returns a map of endpoint configurations keyed by
   * their `operationId`. The result is a plain serializable object — not class instances —
   * so it can be safely stored in a pipeline variable and passed to `invoke`.
   *
   * @param params - The input parameters.
   * @param params.url - URL to the OpenAPI specification document.
   * @param params.include - Optional list of `operationId`s to include. Loads all if omitted.
   * @param params.exclude - Optional list of `operationId`s to exclude.
   * @returns A record mapping each `operationId` to its endpoint configuration.
   * @example
   * ```yaml
   * # Load the Linode API spec — include only the list-instances endpoint
   * - group: api
   *   name: load
   *   params:
   *     url: 'https://raw.githubusercontent.com/linode/linode-api-docs/refs/heads/development/openapi.json'
   *     include:
   *       - get-linode-instances
   *   destination: linodeAPI
   * ```
   */
  static async load(params: LoadParams): Promise<Record<string, EndpointConfig>> {
    const { url, include, exclude } = validations.api.load.runtime.validate(params);

    const apiDoc = (await SwaggerParser.dereference(url)) as OpenAPIV3.Document;
    const baseUrl = apiDoc.servers?.[0]?.url || '';
    const endpoints: Record<string, EndpointConfig> = {};

    for (const path in apiDoc.paths) {
      const pathItem = apiDoc.paths[path];
      if (!pathItem) continue;

      for (const method of Object.keys(pathItem) as HttpMethod[]) {
        const operation = pathItem[method];
        if (!operation || typeof operation !== 'object' || !('operationId' in operation)) continue;

        const operationId = operation.operationId;
        if (!operationId) continue;
        if (include && !include.includes(operationId)) continue;
        if (exclude && exclude.includes(operationId)) continue;

        endpoints[operationId] = { baseUrl, method, path };
      }
    }

    return endpoints;
  }

  /**
   * Calls a named endpoint from a map previously produced by `load`. Reconstructs an
   * `ApiFunction` from the stored configuration so the map can be safely serialized
   * to JSON and back between pipeline steps.
   *
   * @param params - The input parameters.
   * @param params.endpoints - The endpoint map returned by `load` (use `{= varName =}` syntax).
   * @param params.method - The `operationId` of the endpoint to call.
   * @param params.args - Values to substitute into `{param}` placeholders in the URL path.
   * @param params.parameters - Query parameters (GET) or request body (POST/PUT/PATCH/DELETE).
   * @param params.headers - HTTP headers to include (e.g. `Authorization: Bearer <token>`).
   * @returns The parsed JSON response from the API.
   * @example
   * ```yaml
   * # Call the get-linode-instances endpoint loaded from the Linode OpenAPI spec
   * - group: api
   *   name: invoke
   *   params:
   *     endpoints: '{= linodeAPI =}'
   *     method: get-linode-instances
   *     headers:
   *       Authorization: 'Bearer {{ myToken }}'
   *     args:
   *       apiVersion: v4
   *   destination: instances
   * ```
   */
  static async invoke(params: InvokeParams): Promise<any> {
    const {
      endpoints,
      method,
      args = {},
      parameters = {},
      headers = {},
    } = validations.api.invoke.runtime.validate(params);

    if (!endpoints || typeof endpoints !== 'object') {
      throw new Error(`Endpoint "${method}" not found in loaded endpoints`);
    }

    const config: EndpointConfig = endpoints[method];
    if (!config || !config.baseUrl || !config.method || !config.path) {
      throw new Error(`Endpoint "${method}" not found in loaded endpoints`);
    }

    const apiFunction = new ApiFunction(config);
    return await apiFunction.call(args, parameters, headers);
  }

  // --------------------------------------------------
  // Direct Request
  // --------------------------------------------------

  /**
   * Makes a direct HTTP request to any URL without loading an OpenAPI spec.
   * Build dynamic URLs with template expressions, e.g. `.../instances/{{ server.id }}`.
   *
   * @param params - The input parameters.
   * @param params.url - Full URL of the endpoint.
   * @param params.method - HTTP method (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`).
   * @param params.parameters - Query parameters (GET) or request body (POST/PUT/PATCH/DELETE).
   * @param params.headers - HTTP headers to include (e.g. `Authorization: Bearer <token>`).
   * @returns The parsed JSON response from the API.
   * @example
   * ```yaml
   * # Fetch the 5 most recent Gmail messages using an OAuth2 token
   * - group: api
   *   name: request
   *   params:
   *     url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages'
   *     method: GET
   *     headers:
   *       Authorization: 'Bearer {{ googleToken.access_token }}'
   *     parameters:
   *       maxResults: 5
   *   destination: gmailMessages
   * ```
   * @example
   * ```yaml
   * # Create a new Linode instance (POST)
   * - group: api
   *   name: request
   *   params:
   *     url: 'https://api.linode.com/v4/linode/instances'
   *     method: POST
   *     headers:
   *       Authorization: 'Bearer {{ linodeToken }}'
   *     parameters:
   *       label: my-server
   *       region: us-east
   *       type: g6-standard-1
   *       image: linode/almalinux9
   *       root_pass: '{{ serverRootPass }}'
   *       booted: true
   *   destination: newInstance
   * ```
   */
  static async request(params: RequestParams): Promise<any> {
    const {
      url,
      method,
      parameters = {},
      body,
      headers = {},
    } = validations.api.request.runtime.validate(params);

    const apiFunction = new ApiFunction({ url, method });
    return await apiFunction.call({}, body !== undefined ? body : parameters, headers);
  }

  // --------------------------------------------------
  // Authentication
  // --------------------------------------------------

  /**
   * Authenticates via the OAuth2 authorization code flow. Opens a browser for user consent,
   * starts a local HTTP server to capture the authorization code, and exchanges it for tokens.
   * Pass a previously returned token via `token` to reuse or silently refresh it instead of
   * reopening the browser. Point `token` and `destination` at the same global variable (it must
   * already exist) to persist the token across separate task runs with no extra step.
   *
   * @param params - The input parameters.
   * @param params.type - Authentication type. Only `oauth2` is supported.
   * @param params.clientId - OAuth2 client ID from your app's credentials.
   * @param params.clientSecret - OAuth2 client secret from your app's credentials.
   * @param params.scopes - Array of OAuth2 scope strings the app needs access to.
   * @param params.authEndpoint - Authorization endpoint URL (e.g. Google's `/o/oauth2/v2/auth`).
   * @param params.tokenEndpoint - Token exchange endpoint URL (e.g. Google's `/token`).
   * @param params.port - Local port for the redirect server. Defaults to `3000`.
   * @param params.token - Previously returned token to try reusing (e.g. `{= _global.googleGmailToken =}`).
   *   Empty/missing, insufficient scopes, an unrefreshable expiry, or a refresh token the provider no
   *   longer accepts (OAuth2 `invalid_grant`: expired or revoked) all fall back to a fresh consent flow.
   * @param params.forceReauth - Ignore the passed-in token and always request fresh consent.
   * @returns Token object with `access_token`, `refresh_token`, `expires_in`, `token_created_at`, and `scope`.
   * @example
   * ```yaml
   * # Authenticate with Google OAuth2, reusing/refreshing the token stored in a global
   * # variable (create "googleGmailToken" once via the Variables page before first use)
   * - group: api
   *   name: auth
   *   params:
   *     type: oauth2
   *     clientId: '{{ _env.GOOGLE_CLIENT_ID }}'
   *     clientSecret: '{{ _env.GOOGLE_CLIENT_SECRET }}'
   *     scopes:
   *       - 'https://www.googleapis.com/auth/gmail.readonly'
   *       - 'https://www.googleapis.com/auth/calendar.readonly'
   *     authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth'
   *     tokenEndpoint: 'https://oauth2.googleapis.com/token'
   *     token: '{= _global.googleGmailToken =}'
   *   destination: _global.googleGmailToken
   * ```
   */
  static async auth(params: AuthParams, task?: Task): Promise<any> {
    const { type, clientId, clientSecret, scopes, authEndpoint, tokenEndpoint, port, token, forceReauth } =
      validations.api.auth.runtime.validate(params);

    if (type !== 'oauth2') {
      throw new Error(
        `Authentication type "${type}" is not supported. Only 'oauth2' is currently supported.`
      );
    }

    const oauthClient = new OAuth2Client({
      clientId,
      clientSecret,
      scopes,
      authEndpoint,
      tokenEndpoint,
      port,
      signal: task ? DebugController.abortSignal(task.getCorrelationId()) : undefined,
    });
    return await oauthClient.authenticate(token, forceReauth);
  }

  /**
   * Base64-encodes a username/password pair for HTTP Basic Auth. Unlike `auth`'s OAuth2 flow,
   * this makes no network call — Basic Auth has no separate authentication step, since the
   * credential itself (not a server-issued token) is what gets sent on every request. Use the
   * result the same way an OAuth2 token is used, just with the "Basic" scheme instead of
   * "Bearer": `Authorization: 'Basic {{ _global.drupalBasicAuth }}'`.
   *
   * @param params - The input parameters.
   * @param params.username - Username for HTTP Basic Auth.
   * @param params.password - Password for HTTP Basic Auth.
   * @returns The base64-encoded "username:password" string (without the "Basic " prefix).
   * @example
   * ```yaml
   * # Build a Basic Auth header value and persist it for reuse across every call to the site
   * - group: api
   *   name: basicAuth
   *   params:
   *     username: '{{ _env.DRUPAL_USER }}'
   *     password: '{{ _env.DRUPAL_PASS }}'
   *   destination: _global.drupalBasicAuth
   * ```
   */
  static async basicAuth(params: BasicAuthParams): Promise<string> {
    const { username, password } = validations.api.basicAuth.runtime.validate(params);
    return Buffer.from(`${username}:${password}`).toString('base64');
  }
}
