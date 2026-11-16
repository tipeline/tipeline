import crypto from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { FcmSender, signJwt } from '../src/push/senders.js';
import { pushConfigFrom, pushPlatforms } from '../src/push/pushConfig.js';
import { mergePreferences, DEFAULT_PREFERENCES } from '../src/push/PushDeviceService.js';

const verify = (jwt: string, publicKey: crypto.KeyObject, alg: 'ES256' | 'RS256') => {
  const [h, p, s] = jwt.split('.');
  const data = Buffer.from(`${h}.${p}`);
  const sig = Buffer.from(s, 'base64url');
  return alg === 'ES256'
    ? crypto.verify('sha256', data, { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig)
    : crypto.verify('RSA-SHA256', data, publicKey, sig);
};

describe('signJwt', () => {
  it("signs Apple's ES256 and Google's RS256 provider tokens", () => {
    const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const es = signJwt({ alg: 'ES256', kid: 'K' }, { iss: 'T', iat: 1 }, ec.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, 'ES256');
    expect(verify(es, ec.publicKey, 'ES256')).toBe(true);
    expect(JSON.parse(Buffer.from(es.split('.')[0], 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'K' });

    const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const rs = signJwt({ alg: 'RS256' }, { iss: 'x' }, rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, 'RS256');
    expect(verify(rs, rsa.publicKey, 'RS256')).toBe(true);
  });
});

describe('FcmSender', () => {
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const config = {
    projectId: 'tipeline-test',
    clientEmail: 'push@tipeline-test.iam.gserviceaccount.com',
    privateKey: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    tokenUri: 'https://oauth2.googleapis.com/token',
  };
  const message = { title: 'A run failed', body: 'x', data: { kind: 'failed', pipelineIdentifier: 'p1' }, threadId: 'failed' };

  it('signs in once, then sends the message to the device', async () => {
    const fetchImpl = vi.fn(async (url: string, init: any) => {
      if (url === config.tokenUri) return new Response(JSON.stringify({ access_token: 'at-1', expires_in: 3600 }));
      return new Response('{}', { status: 200 });
    });
    const sender = new FcmSender(config, fetchImpl as any);
    expect(await sender.send({ token: 'dev-1' }, message)).toBe('sent');
    expect(await sender.send({ token: 'dev-2' }, message)).toBe('sent');
    const calls = fetchImpl.mock.calls.map((c) => c[0]);
    expect(calls.filter((u) => u === config.tokenUri)).toHaveLength(1);
    const sent = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(sent.message).toMatchObject({ token: 'dev-1', notification: { title: 'A run failed' }, data: { pipelineIdentifier: 'p1' } });
    expect(fetchImpl.mock.calls[1][0]).toBe('https://fcm.googleapis.com/v1/projects/tipeline-test/messages:send');
  });

  it('reports a token Google no longer knows', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url === config.tokenUri
        ? new Response(JSON.stringify({ access_token: 'at' }))
        : new Response(JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }), { status: 404 })
    );
    expect(await new FcmSender(config, fetchImpl as any).send({ token: 'gone' }, message)).toBe('invalid');
  });
});

describe('push configuration', () => {
  it('is off unless given credentials', () => {
    expect(pushPlatforms(pushConfigFrom({}))).toEqual([]);
    expect(pushPlatforms(pushConfigFrom({ TIPELINE_PUSH_LOG: 'true' }))).toEqual(['ios', 'android']);
  });

  it('reads Apple and Google credentials given inline', () => {
    const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const config = pushConfigFrom({
      TIPELINE_PUSH_APNS_KEY: ec,
      TIPELINE_PUSH_APNS_KEY_ID: 'ABC123',
      TIPELINE_PUSH_APNS_TEAM_ID: 'TEAM42',
      TIPELINE_PUSH_FCM_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'p', client_email: 'e', private_key: 'k' }),
    });
    expect(config.apns).toMatchObject({ keyId: 'ABC123', teamId: 'TEAM42', topic: 'com.bananacore.tipeline.mobile', sandbox: false });
    expect(config.fcm).toMatchObject({ projectId: 'p', tokenUri: 'https://oauth2.googleapis.com/token' });
    expect(pushPlatforms(config)).toEqual(['ios', 'android']);
  });

  it('keeps only the known switches when a device changes its choices', () => {
    expect(mergePreferences(DEFAULT_PREFERENCES, { finished: true, details: 'yes', admin: true })).toEqual({
      ...DEFAULT_PREFERENCES,
      finished: true,
    });
  });
});
