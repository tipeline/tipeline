import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { orTemplateString } from './../templateValidation';

export const meta = {
  label: 'HTTP',
  icon: 'Globe'
}

export const validations = {
  request: createValidationPair(
    {
      runtime: z.object({
        url: z.string(),
        method: z.enum(['get', 'post', 'put', 'delete', 'patch', 'head', 'options']).optional(),
        baseURL: z.string().optional(),
        headers: z.record(z.string(), z.string()).optional(),
        params: z.record(z.any(), z.any()).optional(),
        data: z.any().optional(),
        timeout: z.number().nonnegative().optional(),
        withCredentials: z.boolean().optional(),
        auth: z
          .object({
            username: z.string().optional(),
            password: z.string().optional(),
          })
          .optional(),
        responseType: z
          .enum(['arraybuffer', 'document', 'json', 'text', 'stream', 'blob'])
          .optional(),
        responseEncoding: z.string().optional(),
        failOnHttpError: z.boolean().optional(),
        // Deliberately a plain boolean, never orTemplateString — see the note on the
        // creation schema below for why this must stay a static literal.
        allowPrivateNetwork: z.boolean().optional(),
      }),
      creation: z.object({
        url: z.string(),
        method: z.enum(['get', 'post', 'put', 'delete', 'patch', 'head', 'options']).optional(),
        baseURL: z.string().optional(),
        headers: z.record(z.string(), z.string()).optional(),
        params: z.record(z.any(), z.any()).optional(),
        data: z.any().optional(),
        timeout: orTemplateString(z.number().nonnegative()).optional(),
        withCredentials: z.boolean().optional(),
        auth: z
          .object({
            username: z.string().optional(),
            password: z.string().optional(),
          })
          .optional(),
        responseType: z
          .enum(['arraybuffer', 'document', 'json', 'text', 'stream', 'blob'])
          .optional(),
        responseEncoding: z.string().optional(),
        failOnHttpError: z.boolean().optional(),
        // Not orTemplateString: this flag must be set directly in the task source by
        // whoever has edit rights to the workflow, not sourced from a runtime variable
        // (webhook payload, a previous step's result, etc). TaskValidator additionally
        // rejects a task whose raw source has this as a template string — see
        // apps/core/src/validation/TaskValidation.ts.
        allowPrivateNetwork: z.boolean().optional(),
      }),
    },
    {
      label: 'HTTP Request', icon: '🌐', category: 'http', description: 'Make an HTTP request (Axios-like options). Returns status, headers and data.',
      returns: 'object',
      fieldConfig: {
        url: { description: 'Request URL.' },
        method: { description: 'HTTP method (get, post, put, delete, patch, etc.).' },
        baseURL: { label: 'Base URL', description: 'Optional base URL prepended to the url.' },
        headers: { description: 'HTTP headers as key-value pairs.' },
        params: { description: 'URL query parameters as key-value pairs.' },
        data: { component: 'record', anyJson: true, description: 'Request body payload.' },
        timeout: { description: 'Request timeout in milliseconds.' },
        withCredentials: { description: 'Whether to send cookies with cross-site requests.' },
        auth: { description: 'Basic authentication credentials (username and password).' },
        responseType: { description: 'Expected response type: arraybuffer, document, json, text, stream, or blob.' },
        responseEncoding: { description: 'Encoding used to decode the response (e.g. utf8).' },
        failOnHttpError: {
          label: 'Fail on HTTP error',
          description: 'Fail the step when a request gets a 4xx or 5xx response or no response at all. On by default. Turn it off to check the result in a later step: with no response, status is 0 and error says why.',
        },
        allowPrivateNetwork: {
          description: 'Allow this specific call to reach private/internal addresses (localhost, LAN, cloud metadata). Off by default to prevent SSRF via a templated url. Must be set to a fixed true/false here — it cannot reference a variable.',
        },
      },
    }
  ),

  downloadFile: createValidationPair(
    {
      runtime: z.object({
        browser: z.any(),
        url: z.string().url(),
        path: z.string().min(1),
        allowPrivateNetwork: z.boolean().optional(),
      }),
      creation: z.object({
        browser: z.any(),
        url: z.string().url(),
        path: z.string().min(1),
        allowPrivateNetwork: z.boolean().optional(),
      }),
    },
    {
      label: 'Download File', icon: '📥', category: 'http', description: 'Download a URL to a local path.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'Browser instance to use for the download.' },
        url: { description: 'URL of the file to download.' },
        path: { description: 'Local file path to save the downloaded file.' },
        allowPrivateNetwork: {
          description: 'Allow this specific call to reach private/internal addresses (localhost, LAN, cloud metadata). Off by default to prevent SSRF via a templated url. Must be set to a fixed true/false here — it cannot reference a variable.',
        },
      },
    }
  ),
};
