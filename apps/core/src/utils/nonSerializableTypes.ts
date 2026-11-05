import type { VariableType } from '@tipeline/types';

// These variable types hold live, non-JSON-serializable handles (open connections,
// browser instances, in-memory buffers) — persisting them to the DB would either
// throw or store a useless snapshot, so callers null them out before persisting.
const NON_SERIALIZABLE_TYPES = new Set<VariableType>(['browser', 'sshConnection', 'image', 'dbConnection']);

export function isNonSerializableVariableType(type: VariableType): boolean {
  return NON_SERIALIZABLE_TYPES.has(type);
}
