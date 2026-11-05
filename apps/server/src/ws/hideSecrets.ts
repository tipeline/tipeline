// What a Core answer shows depends on who asked. Core has one token and no idea who's behind
// the gateway, so this is the only place that can tell an admin from a viewer.

// Wider than the settings Core encrypts, because leaving something readable is the costly mistake.
const CREDENTIAL_SETTING = /(api_?key|token|secret|password)/i;

/** Settings without the credentials, for anyone but an admin. */
export function withoutCredentialSettings(settings: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(settings).filter(([key]) => !CREDENTIAL_SETTING.test(key)));
}

/** Global variables with secret values blanked. */
export function withoutSecretValues(variables: any[]): any[] {
  return variables.map((variable) => (variable?.secret ? { ...variable, value: null } : variable));
}

/** A workflow source, a JSON string or an object, with values typed into secret variables blanked. */
export function withoutWrittenInSecrets<T>(source: T): T {
  let parsed: any = source;
  if (typeof source === 'string') {
    try {
      parsed = JSON.parse(source);
    } catch {
      return source;
    }
  }
  const variables = parsed?.pipeline?.variables;
  if (!Array.isArray(variables)) return source;
  const cleaned = {
    ...parsed,
    pipeline: {
      ...parsed.pipeline,
      variables: variables.map((variable: any) => (variable?.secret ? { ...variable, value: '' } : variable)),
    },
  };
  return (typeof source === 'string' ? JSON.stringify(cleaned) : cleaned) as T;
}
