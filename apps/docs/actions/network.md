<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Network Actions

## General

### `waitPort`

Waits until a TCP port on a host is open, or until the timeout expires.

**Returns:** `true` when the port becomes open within the timeout.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `host` | string | ✓ | — | Hostname or IP address to connect to. |
| `port` | number | ✓ | — | TCP port number to wait for (1–65535). |
| `timeout` | number |  | 60000 | Maximum time to wait in milliseconds (default 60000). |

```yaml
# Wait for an SSH port to open before connecting
- group: network
  name: waitPort
  params:
    host: '{{ targetHost }}'
    port: 22
    timeout: 60000
```

## Port

### `resolveDNS`

Resolves DNS records for a hostname, optionally filtered by record type.

**Returns:** An array of DNS records matching the requested type.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `host` | string | ✓ | — | Hostname to resolve. |
| `type` | `A` \| `AAAA` \| `MX` \| `NS` \| `CNAME` \| `TXT` |  | — | DNS record type to query (A, AAAA, MX, NS, CNAME, or TXT). Defaults to A. |

```yaml
# Resolve A records for a target host
- group: network
  name: resolveDNS
  params:
    host: '{{ targetHost }}'
    type: A
```

## DNS

### `reverseDNS`

Performs a reverse DNS lookup to find the hostname(s) associated with an IP address.

**Returns:** An array of hostnames mapped to the given IP.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `ip` | string | ✓ | — | IP address to perform a reverse DNS lookup on. |

```yaml
# Reverse-lookup the hostname for a known IP address
- group: network
  name: reverseDNS
  params:
    ip: '{{ targetIp }}'
```

### `lookup`

Performs a general DNS lookup for a hostname, returning all resolved addresses.

**Returns:** An array of `{ address, family }` objects for the hostname.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `hostname` | string | ✓ | — | Hostname to look up. |

```yaml
# Look up all IP addresses (IPv4 and IPv6) for a hostname
- group: network
  name: lookup
  params:
    hostname: '{{ targetHost }}'
```

### `ping`

Sends an ICMP echo request (ping) to a host and returns whether it is reachable.

**Returns:** `true` if the host is alive and responds to ping, otherwise `false`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `host` | string | ✓ | — | Hostname or IP address to ping. |

```yaml
# Check whether a remote host is reachable via ICMP ping
- group: network
  name: ping
  params:
    host: '{{ targetHost }}'
```

## Connectivity

### `checkTlsCertificate`

Connects to a host over TLS and returns the server's certificate details.

**Returns:** An object containing the certificate's subject, issuer, validity dates, days remaining, and SANs.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `host` | string | ✓ | — | Server hostname to check the TLS certificate for. |
| `port` | number |  | 443 | Server port (default 443). |

```yaml
# Inspect the TLS certificate on a web server (defaults to port 443)
- group: network
  name: checkTlsCertificate
  params:
    host: '{{ serverHost }}'
```
