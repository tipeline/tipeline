import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { orTemplateString } from './../templateValidation';

export const meta = {
  label: 'API',
  icon: 'Webhook'
}

export const validations = {
  // OAuth2 Authentication
  auth: createValidationPair(
    {
      runtime: z.object({
        type: z.literal('oauth2'),
        clientId: z.string(),
        clientSecret: z.string(),
        scopes: z.array(z.string()),
        authEndpoint: z.string().url(),
        tokenEndpoint: z.string().url(),
        port: z.number().int().optional(),
        token: z.any().optional(),
        forceReauth: z.boolean().optional().default(false),
      }),
      creation: z.object({
        type: orTemplateString(z.literal('oauth2')).default('oauth2'),
        clientId: z.string(),
        clientSecret: z.string(),
        scopes: orTemplateString(z.array(z.string())),
        authEndpoint: orTemplateString(z.string().url()),
        tokenEndpoint: orTemplateString(z.string().url()),
        port: orTemplateString(z.number().int()).optional(),
        token: z.any().optional(),
        forceReauth: orTemplateString(z.boolean()).optional(),
      }),
    },
    {
      label: 'OAuth2 Authentication',
      icon: '🔐',
      category: 'api',
      description: 'Authenticate using OAuth2 flow with client credentials and scopes.',
      returns: 'oauthToken',
      fieldConfig: {
        type: { description: 'Authentication type (currently only oauth2 is supported).' },
        clientId: { description: 'OAuth2 client ID issued by the provider.' },
        clientSecret: { description: 'OAuth2 client secret issued by the provider.' },
        scopes: { description: 'List of OAuth2 scopes to request.' },
        authEndpoint: { description: 'Authorization endpoint URL for the OAuth2 provider.' },
        tokenEndpoint: { description: 'Token exchange endpoint URL for the OAuth2 provider.' },
        port: { description: 'Local port to listen on for the OAuth2 redirect callback.' },
        token: {
          description:
            'Previously returned token to reuse (e.g. {= _global.googleGmailToken =}). Empty/missing, insufficient scopes, an unrefreshable expiry, or a refresh token the provider no longer accepts (invalid_grant: expired or revoked) all fall back to a fresh consent flow.',
        },
        forceReauth: {
          description: 'Ignore the passed-in token and always request fresh consent.',
        },
      },
    }
  ),

  // HTTP Basic Authentication — no network call, just base64-encodes
  // "username:password" for use in an "Authorization: Basic <value>" header,
  // the same way oauth2's access_token is used in "Authorization: Bearer <value>".
  basicAuth: createValidationPair(
    {
      runtime: z.object({
        username: z.string(),
        password: z.string(),
      }),
      creation: z.object({
        username: orTemplateString(z.string()),
        password: orTemplateString(z.string()),
      }),
    },
    {
      label: 'HTTP Basic Auth',
      icon: '🔑',
      category: 'api',
      description:
        'Base64-encodes a username/password pair for HTTP Basic Auth. No network call is made — use the result as "Authorization: Basic {{ yourVar }}" in any subsequent request.',
      returns: 'string',
      fieldConfig: {
        username: { description: 'Username for HTTP Basic Auth.' },
        password: { description: 'Password for HTTP Basic Auth.' },
      },
    }
  ),

  // Direct API Call
  request: createValidationPair(
    {
      runtime: z.object({
        url: z.string().url(),
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
        parameters: z.record(z.any()).optional(),
        headers: z.record(z.string()).optional(),
        body: z.any().optional(),
      }),
      creation: z.object({
        url: orTemplateString(z.string().url()),
        method: orTemplateString(z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])),
        parameters: orTemplateString(z.record(z.any())).optional(),
        headers: orTemplateString(z.record(z.string())).optional(),
        body: z.any().optional(),
      }),
    },
    {
      label: 'Direct API Call',
      icon: '🌐',
      category: 'api',
      description: 'Make a direct API call with authentication token and parameters.',
      returns: 'any',
      fieldConfig: {
        url: { description: 'Full URL of the API endpoint to call.' },
        method: { description: 'HTTP method to use (GET, POST, PUT, DELETE, PATCH).' },
        parameters: { description: 'Query string parameters to append to the URL.' },
        headers: { description: 'HTTP headers to include in the request.' },
        body: { component: 'record', anyJson: true, description: 'Request body payload (any type).' },
      },
    }
  ),

  // Load OpenAPI Schema
  load: createValidationPair(
    {
      runtime: z.object({
        url: z.string().url(),
        include: z.array(z.string()).optional(),
        exclude: z.array(z.string()).optional(),
        usePathAsId: z.boolean().optional(),
        idFormat: z.enum(['camelCase', 'snakeCase', 'kebabCase', 'pascalCase']).optional(),
      }),
      creation: z.object({
        url: orTemplateString(z.string().url()),
        include: orTemplateString(z.array(z.string())).optional(),
        exclude: orTemplateString(z.array(z.string())).optional(),
        usePathAsId: orTemplateString(z.boolean()).optional(),
        idFormat: orTemplateString(z.enum(['camelCase', 'snakeCase', 'kebabCase', 'pascalCase'])).optional(),
      }),
    },
    {
      label: 'Load OpenAPI Spec',
      icon: '📄',
      category: 'api',
      description: 'Load and parse OpenAPI schema from URL with optional filters.',
      returns: 'object',
      fieldConfig: {
        url: { description: 'URL pointing to the OpenAPI (Swagger) specification JSON or YAML.' },
        include: { description: 'Optional list of operation IDs or paths to include.' },
        exclude: { description: 'Optional list of operation IDs or paths to exclude.' },
        usePathAsId: { description: 'Use the URL path as the endpoint identifier instead of operationId.' },
        idFormat: { description: 'Casing format applied to generated endpoint IDs (camelCase, snakeCase, etc.).' },
      },
    }
  ),

  // Call Loaded Endpoint
  invoke: createValidationPair(
    {
      runtime: z.object({
        endpoints: z.any(), // Reference to loaded endpoints
        method: z.string(), // Method name from loaded endpoints
        args: z.record(z.any()).optional(),
        parameters: z.record(z.any()).optional(),
        headers: z.record(z.string()).optional(),
      }),
      creation: z.object({
        endpoints: z.any(), // Reference to loaded endpoints
        method: z.string(), // Method name from loaded endpoints
        args: orTemplateString(z.record(z.any())).optional(),
        parameters: orTemplateString(z.record(z.any())).optional(),
        headers: orTemplateString(z.record(z.string())).optional(),
      }),
    },
    {
      label: 'Call Loaded Endpoint',
      icon: '🔄',
      category: 'api',
      description: 'Call a method from previously loaded OpenAPI endpoints.',
      returns: 'object',
      fieldConfig: {
        endpoints: { description: 'Reference to the loaded OpenAPI endpoints object.' },
        method: { description: 'Name of the endpoint method to invoke.' },
        args: { description: 'Path arguments required by the endpoint.' },
        parameters: { description: 'Query parameters for the endpoint call.' },
        headers: { description: 'HTTP headers to include in the request.' },
      },
    }
  ),

};
