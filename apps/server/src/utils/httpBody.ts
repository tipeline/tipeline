import type http from 'http';

export const MAX_BODY_BYTES = parseInt(process.env.TIPELINE_MAX_BODY_BYTES ?? '1048576', 10);

export function readBody(req: http.IncomingMessage, maxBytes: number = MAX_BODY_BYTES): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        const err: any = new Error(`Request body exceeds ${maxBytes} bytes`);
        err.code = 'PAYLOAD_TOO_LARGE';
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });

    req.on('error', reject);
  });
}
