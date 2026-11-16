import fs from 'fs';
import type { PushPlatform } from './PushDeviceService.js';

/**
 * Push notifications are optional: the Server sends them only when it is given the
 * credentials, from environment variables.
 *
 *  - iOS (Apple Push Notification service):
 *      TIPELINE_PUSH_APNS_KEY        the .p8 key's contents, or a path to the file
 *      TIPELINE_PUSH_APNS_KEY_ID     its key id
 *      TIPELINE_PUSH_APNS_TEAM_ID    the Apple developer team id
 *      TIPELINE_PUSH_APNS_TOPIC      the app's bundle id (default com.bananacore.tipeline.mobile)
 *      TIPELINE_PUSH_APNS_SANDBOX    "true" for development builds
 *  - Android (Firebase Cloud Messaging):
 *      TIPELINE_PUSH_FCM_SERVICE_ACCOUNT   the service account JSON, or a path to the file
 *  - Development: TIPELINE_PUSH_LOG=true logs every notification instead of sending it, for
 *    both platforms, so the whole path can be tried without Apple or Google accounts.
 */
export interface ApnsConfig {
  key: string;
  keyId: string;
  teamId: string;
  topic: string;
  sandbox: boolean;
}

export interface FcmConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
}

export interface PushConfig {
  apns: ApnsConfig | null;
  fcm: FcmConfig | null;
  log: boolean;
}

/** A value given inline, or the contents of the file it names. */
function inlineOrFile(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (v.startsWith('-----BEGIN') || v.startsWith('{')) return v;
  try {
    return fs.readFileSync(v, 'utf8');
  } catch {
    throw new Error(`Could not read ${v}`);
  }
}

export function pushConfigFrom(env: NodeJS.ProcessEnv = process.env): PushConfig {
  const log = env.TIPELINE_PUSH_LOG === 'true';

  let apns: ApnsConfig | null = null;
  const key = inlineOrFile(env.TIPELINE_PUSH_APNS_KEY);
  if (key && env.TIPELINE_PUSH_APNS_KEY_ID && env.TIPELINE_PUSH_APNS_TEAM_ID) {
    apns = {
      key,
      keyId: env.TIPELINE_PUSH_APNS_KEY_ID.trim(),
      teamId: env.TIPELINE_PUSH_APNS_TEAM_ID.trim(),
      topic: env.TIPELINE_PUSH_APNS_TOPIC?.trim() || 'com.bananacore.tipeline.mobile',
      sandbox: env.TIPELINE_PUSH_APNS_SANDBOX === 'true',
    };
  }

  let fcm: FcmConfig | null = null;
  const account = inlineOrFile(env.TIPELINE_PUSH_FCM_SERVICE_ACCOUNT);
  if (account) {
    const parsed = JSON.parse(account);
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error('TIPELINE_PUSH_FCM_SERVICE_ACCOUNT needs project_id, client_email and private_key');
    }
    fcm = {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
      tokenUri: parsed.token_uri || 'https://oauth2.googleapis.com/token',
    };
  }

  return { apns, fcm, log };
}

/** The platforms this Server can reach (both when logging). */
export function pushPlatforms(config: PushConfig): PushPlatform[] {
  if (config.log) return ['ios', 'android'];
  return [...(config.apns ? (['ios'] as const) : []), ...(config.fcm ? (['android'] as const) : [])];
}
