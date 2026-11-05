function withCause(message: string, cause: unknown): Error {
  return Object.assign(new Error(message), { cause });
}

/** Network failure codes from Node (and undici) that mean the other side was never reached. */
const NETWORK_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const CODE_REASONS: Record<string, string> = {
  ENOTFOUND: "its address couldn't be looked up",
  EAI_AGAIN: "its address couldn't be looked up",
  ECONNREFUSED: 'the connection was refused',
  ECONNRESET: 'the connection was dropped',
  ETIMEDOUT: 'the connection timed out',
  UND_ERR_CONNECT_TIMEOUT: 'the connection timed out',
  ENETUNREACH: 'the network is unreachable',
  EHOSTUNREACH: 'the network is unreachable',
  UND_ERR_SOCKET: 'the connection was dropped',
};

/** Walks an error and its causes for a network code and the host it was for. */
export function networkFailure(error: unknown): { code: string; host?: string } | null {
  let current: any = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current.code === 'string' && NETWORK_CODES.has(current.code)) {
      return { code: current.code, host: current.hostname ?? current.host };
    }
    current = current.cause;
  }
  // The OpenAI and Anthropic SDKs wrap these as APIConnectionError / APIConnectionTimeoutError.
  const name = (error as any)?.constructor?.name ?? (error as any)?.name ?? '';
  if (/Connection(Timeout)?Error$/.test(name)) return { code: 'connection' };
  return null;
}

function detail(failure: { code: string; host?: string }): string {
  const reason = CODE_REASONS[failure.code];
  if (!reason) return '';
  return failure.host ? ` (${failure.host}: ${reason})` : ` (${reason})`;
}

/**
 * Rewrites an error from the model's API so it says who failed and what to do.
 * "Connection error." becomes "Couldn't reach DeepSeek…", a rejected key points
 * at Settings; anything else keeps its message, prefixed with the provider.
 */
export function explainModelError(error: unknown, providerLabel: string): Error {
  const failure = networkFailure(error);
  if (failure) {
    return withCause(`Couldn't reach ${providerLabel}${detail(failure)}. Check your internet connection and try again.`, error);
  }
  const status = (error as any)?.status;
  if (status === 401 || status === 403) {
    return withCause(`${providerLabel} rejected the API key. Check it in Settings → Assistant.`, error);
  }
  if (status === 429) {
    return withCause(`${providerLabel} is rate-limiting requests or the account is out of credit. Try again shortly.`, error);
  }
  const message = (error as any)?.message ?? String(error);
  return withCause(`${providerLabel}: ${message}`, error);
}

/** Rewrites an error from Tipeline Core's MCP server the same way. */
export function explainCoreError(error: unknown, url: string): Error {
  if (networkFailure(error)) {
    return withCause(`Couldn't reach Tipeline Core at ${url}. Make sure it's running (tipeline start).`, error);
  }
  const message = (error as any)?.message ?? String(error);
  if (/\b401\b|unauthorized/i.test(message)) {
    return withCause('Tipeline Core refused the MCP token. Check it in Settings → Assistant.', error);
  }
  return error instanceof Error ? error : new Error(message);
}
