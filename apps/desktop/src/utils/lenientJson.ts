// Quotes unquoted object keys (e.g. `{key: "value"}` -> `{"key": "value"}`) so
// JS-object-literal syntax parses as JSON. Used to keep live validation in sync
// with what submit handlers already accept.
function quoteUnquotedKeys(json: string): string {
  return json.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');
}

// Parses a JSON object string, tolerating unquoted keys. Returns null if the
// string isn't valid JSON (even after normalization) or doesn't parse to a
// plain object.
export function parseLenientJsonObject(value: string): Record<string, any> | null {
  for (const candidate of [value, quoteUnquotedKeys(value)]) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // try the next candidate
    }
  }
  return null;
}

// Parses a JSON array string. Returns null if the string isn't valid JSON or
// doesn't parse to an array.
export function parseLenientJsonArray(value: string): any[] | null {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
