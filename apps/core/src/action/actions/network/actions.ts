import waitPort from 'wait-port';
import { resolve, reverse, lookup } from 'node:dns/promises';
import ping from 'ping';
import tls from 'tls';
import { z } from 'zod';
import { validations } from '@tipeline/schemas';

type WaitPortParams = z.infer<typeof validations.network.waitPort.runtime.schema>;
type ResolveDNSParams = z.infer<typeof validations.network.resolveDNS.runtime.schema>;
type ReverseDNSParams = z.infer<typeof validations.network.reverseDNS.runtime.schema>;
type LookupParams = z.infer<typeof validations.network.lookup.runtime.schema>;
type PingParams = z.infer<typeof validations.network.ping.runtime.schema>;
type CheckTlsCertificateParams = z.infer<
  typeof validations.network.checkTlsCertificate.runtime.schema
>;

/**
 * @group Actions
 */
export class GroupNetwork {
  // --------------------------------------------------
  // Port
  // --------------------------------------------------

  /**
   * Waits until a TCP port on a host is open, or until the timeout expires.
   *
   * @param params - The input parameters.
   * @returns `true` when the port becomes open within the timeout.
   * @example
   * ```yaml
   * # Wait for an SSH port to open before connecting
   * - group: network
   *   name: waitPort
   *   params:
   *     host: '{{ targetHost }}'
   *     port: 22
   *     timeout: 60000
   * ```
   */
  static async waitPort(params: WaitPortParams): Promise<boolean> {
    const { host, port, timeout } = validations.network.waitPort.runtime.validate(params);

    await waitPort({
      host: host,
      port: port,
      timeout: timeout,
      output: 'silent',
    });

    return true;
  }

  // --------------------------------------------------
  // DNS
  // --------------------------------------------------

  /**
   * Resolves DNS records for a hostname, optionally filtered by record type.
   *
   * @param params - The input parameters.
   * @returns An array of DNS records matching the requested type.
   * @example
   * ```yaml
   * # Resolve A records for a target host
   * - group: network
   *   name: resolveDNS
   *   params:
   *     host: '{{ targetHost }}'
   *     type: A
   * ```
   */
  static async resolveDNS(params: ResolveDNSParams): Promise<any> {
    const { host, type } = validations.network.resolveDNS.runtime.validate(params);

    if (type) {
      return await resolve(host, type);
    } else {
      return await resolve(host);
    }
  }

  /**
   * Performs a reverse DNS lookup to find the hostname(s) associated with an IP address.
   *
   * @param params - The input parameters.
   * @returns An array of hostnames mapped to the given IP.
   * @example
   * ```yaml
   * # Reverse-lookup the hostname for a known IP address
   * - group: network
   *   name: reverseDNS
   *   params:
   *     ip: '{{ targetIp }}'
   * ```
   */
  static async reverseDNS(params: ReverseDNSParams): Promise<any> {
    const { ip } = validations.network.reverseDNS.runtime.validate(params);

    return reverse(ip);
  }

  /**
   * Performs a general DNS lookup for a hostname, returning all resolved addresses.
   *
   * @param params - The input parameters.
   * @returns An array of `{ address, family }` objects for the hostname.
   * @example
   * ```yaml
   * # Look up all IP addresses (IPv4 and IPv6) for a hostname
   * - group: network
   *   name: lookup
   *   params:
   *     hostname: '{{ targetHost }}'
   * ```
   */
  static async lookup(params: LookupParams): Promise<any> {
    const { hostname } = validations.network.lookup.runtime.validate(params);

    return lookup(hostname, {
      all: true,
    });
  }

  // --------------------------------------------------
  // Connectivity
  // --------------------------------------------------

  /**
   * Sends an ICMP echo request (ping) to a host and returns whether it is reachable.
   *
   * @param params - The input parameters.
   * @returns `true` if the host is alive and responds to ping, otherwise `false`.
   * @example
   * ```yaml
   * # Check whether a remote host is reachable via ICMP ping
   * - group: network
   *   name: ping
   *   params:
   *     host: '{{ targetHost }}'
   * ```
   */
  static async ping(params: PingParams): Promise<boolean> {
    const { host } = validations.network.ping.runtime.validate(params);

    const result = await ping.promise.probe(host);
    return result.alive;
  }

  // --------------------------------------------------
  // TLS
  // --------------------------------------------------

  /**
   * Connects to a host over TLS and returns the server's certificate details.
   *
   * @param params - The input parameters.
   * @returns An object containing the certificate's subject, issuer, validity dates, days remaining, and SANs.
   * @example
   * ```yaml
   * # Inspect the TLS certificate on a web server (defaults to port 443)
   * - group: network
   *   name: checkTlsCertificate
   *   params:
   *     host: '{{ serverHost }}'
   * ```
   */
  static async checkTlsCertificate(params: CheckTlsCertificateParams): Promise<any> {
    const { port, host } = validations.network.checkTlsCertificate.runtime.validate(params);

    return new Promise((resolve, reject) => {
      const socket = tls.connect(port, host, { servername: host }, () => {
        const cert = socket.getPeerCertificate();
        socket.end();

        if (!cert || !Object.keys(cert).length) {
          return reject(new Error('No certificate found'));
        }

        const validTo = new Date(cert.valid_to as string);
        const daysRemaining = Math.ceil((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        const subjectAltNames = cert.subjectaltname?.replace(/^DNS:/g, '').split(', DNS:');

        resolve({
          subjectCN: cert.subject?.CN ?? null,
          issuerCN: cert.issuer?.CN ?? null,
          valid_from: cert.valid_from,
          valid_to: cert.valid_to,
          days_remaining: daysRemaining,
          subject_alt_names: subjectAltNames,
        });
      });

      socket.on('error', reject);
    });
  }
}
