import type { IncomingMessage } from 'http';

/**
 * The subprotocol a browser client asks for. A browser (or a phone's WebView) cannot set
 * headers on a WebSocket, so it sends its token as a second subprotocol instead:
 *
 *   new WebSocket(url, ['tipeline', 'bearer.<token>'])
 *
 * The Server answers with 'tipeline' only, so the token is never sent back. Desktop and the
 * CLI keep sending an `Authorization: Bearer` header, which wins when both are present.
 */
export const WS_PROTOCOL = 'tipeline';
const BEARER_PROTOCOL_PREFIX = 'bearer.';

/** The protocol to answer with, or false when the client asked for others only. */
export function chooseProtocol(protocols: Set<string>): string | false {
  return protocols.has(WS_PROTOCOL) ? WS_PROTOCOL : false;
}

/** The client's token: from the Authorization header, else from a `bearer.` subprotocol. */
export function tokenFromRequest(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) return auth.slice(7) || null;

  const offered = req.headers['sec-websocket-protocol'];
  if (typeof offered !== 'string') return null;
  for (const protocol of offered.split(',')) {
    const value = protocol.trim();
    if (value.startsWith(BEARER_PROTOCOL_PREFIX)) {
      return value.slice(BEARER_PROTOCOL_PREFIX.length) || null;
    }
  }
  return null;
}
