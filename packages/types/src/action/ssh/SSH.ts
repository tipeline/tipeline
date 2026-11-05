// packages/types/src/ssh.ts
import { z } from 'zod';
import type { NodeSSH } from 'node-ssh';

// Type guard for NodeSSH instance
export const isSSHInstance = (val: unknown): val is NodeSSH => {
  return (
    typeof val === 'object' &&
    val !== null &&
    typeof (val as NodeSSH).execCommand === 'function' &&
    typeof (val as NodeSSH).dispose === 'function' &&
    typeof (val as NodeSSH).isConnected === 'function'
  );
};

// Schema using NodeSSH type with the type guard
export const sshSchema = z.custom<NodeSSH>(isSSHInstance, {
  message: 'Invalid SSH connection instance (NodeSSH instance expected)',
});

// Re-export the type for convenience
export type { NodeSSH } from 'node-ssh';
