import { createHash } from 'crypto';

/** The checked contents of a workflow file, the same however the file was read. */
export function workflowFingerprint(validatedTask: unknown) {
  return createHash('sha256').update(JSON.stringify(validatedTask)).digest('hex');
}

/** What a file install saved, to tell later whether the workflow was changed. */
export function sourceHash(source: string) {
  return createHash('sha256').update(source).digest('hex');
}
