import { z } from 'zod';
import { createValidationPair } from './../createValidation';

const portInt = () => z.number().int().min(1).max(65535);

export const meta = {
  label: 'Network',
  icon: 'Network'
}

export const validations = {
  waitPort: createValidationPair(
    {
      runtime: z.object({
        host: z.string().min(1, 'host is required'),
        port: portInt(),
        timeout: z.number().int().min(1).default(60000),
      }),
      creation: z.object({
        host: z.string().min(1, 'host is required'),
        port: portInt(),
        timeout: z.number().int().min(1).default(60000),
      }),
    },
    {
      label: 'Wait for Port', icon: '⏳🔌', category: 'network', description: 'Wait until a TCP port is open.',
      fieldConfig: {
        host: { description: 'Hostname or IP address to connect to.' },
        port: { description: 'TCP port number to wait for (1–65535).' },
        timeout: { description: 'Maximum time to wait in milliseconds (default 60000).' },
      },
    }
  ),

  resolveDNS: createValidationPair(
    {
      runtime: z.object({
        host: z.string().min(1),
        type: z.enum(['A', 'AAAA', 'MX', 'NS', 'CNAME', 'TXT']).optional(),
      }),
      creation: z.object({
        host: z.string().min(1),
        type: z.enum(['A', 'AAAA', 'MX', 'NS', 'CNAME', 'TXT']).optional(),
      }),
    },
    {
      label: 'Resolve DNS', icon: '🧭', category: 'network', description: 'DNS resolution for a hostname.',
      returns: 'array',
      fieldConfig: {
        host: { description: 'Hostname to resolve.' },
        type: { description: 'DNS record type to query (A, AAAA, MX, NS, CNAME, or TXT). Defaults to A.' },
      },
    }
  ),

  lookup: createValidationPair(
    {
      runtime: z.object({ hostname: z.string().min(1) }),
      creation: z.object({ hostname: z.string().min(1) }),
    },
    {
      label: 'Lookup', icon: '🔍', category: 'network', description: 'General DNS lookup for a hostname.',
      returns: 'object',
      fieldConfig: { hostname: { description: 'Hostname to look up.' } },
    }
  ),

  reverseDNS: createValidationPair(
    {
      runtime: z.object({ ip: z.string().min(1) }),
      creation: z.object({ ip: z.string().min(1) }),
    },
    {
      label: 'Reverse DNS', icon: '🔄', category: 'network', description: 'Reverse-lookup a PTR record for an IP.',
      returns: 'array',
      fieldConfig: { ip: { description: 'IP address to perform a reverse DNS lookup on.' } },
    }
  ),

  ping: createValidationPair(
    {
      runtime: z.object({ host: z.string().min(1) }),
      creation: z.object({ host: z.string().min(1) }),
    },
    {
      label: 'Ping', icon: '📶', category: 'network', description: 'ICMP echo request to a host.',
      returns: 'boolean',
      fieldConfig: { host: { description: 'Hostname or IP address to ping.' } },
    }
  ),

  checkTlsCertificate: createValidationPair(
    {
      runtime: z.object({
        host: z.string().min(1, 'network.host.required'),
        port: portInt().default(443),
      }),
      creation: z.object({
        host: z.string().min(1, 'network.host.required'),
        port: portInt().default(443),
      }),
    },
    {
      label: 'Check TLS Certificate', icon: '🔐', category: 'network', description: 'Fetch and inspect a server TLS certificate.',
      returns: 'object',
      fieldConfig: {
        host: { description: 'Server hostname to check the TLS certificate for.' },
        port: { description: 'Server port (default 443).' },
      },
    }
  ),
};
