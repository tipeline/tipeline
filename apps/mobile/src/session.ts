import { defineStore } from 'pinia';
import { markRaw, ref, shallowRef } from 'vue';
import {
  TipelineClient,
  ServerHttpError,
  login,
  loginMfa,
  me,
  type ConnectionStatus,
  type ServerUser,
} from '@tipeline/client';
import { clearSession, loadSession, rememberServer, saveSession } from './storage';

/** Adds https:// when the person typed a bare host. */
export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^(https?|wss?):\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export type SignInResult = { status: 'ok' } | { status: 'mfa_required'; challengeId: string };

/**
 * Who is signed in, to which Server, and the one client every screen shares.
 */
export const useSession = defineStore('mobile-session', () => {
  const serverUrl = ref('');
  const token = ref('');
  const user = ref<ServerUser | null>(null);
  const status = ref<ConnectionStatus>('idle');
  const client = shallowRef<TipelineClient | null>(null);
  let stopStatus: (() => void) | null = null;

  const signedIn = () => !!client.value && !!token.value;

  function openClient(url: string, newToken: string) {
    stopStatus?.();
    client.value?.close();
    const c = markRaw(new TipelineClient({ url, token: newToken }));
    stopStatus = c.onStatusChange((s) => (status.value = s));
    client.value = c;
    c.connect();
  }

  async function finish(url: string, newToken: string) {
    user.value = await me(url, newToken);
    serverUrl.value = url;
    token.value = newToken;
    saveSession({ serverUrl: url, token: newToken });
    rememberServer(url);
    openClient(url, newToken);
  }

  async function signIn(server: string, email: string, password: string): Promise<SignInResult> {
    const url = normalizeServerUrl(server);
    const result = await login(url, email.trim(), password);
    if (result.status === 'mfa_required') return result;
    await finish(url, result.token);
    return { status: 'ok' };
  }

  async function completeMfa(server: string, challengeId: string, code: string): Promise<void> {
    const url = normalizeServerUrl(server);
    const newToken = await loginMfa(url, challengeId, code.trim());
    await finish(url, newToken);
  }

  /** At launch: reuse the saved sign-in. A refused token signs out; an unreachable server
   *  keeps the session so the app opens offline and reconnects later. */
  async function restore(): Promise<boolean> {
    const saved = loadSession();
    if (!saved) return false;
    serverUrl.value = saved.serverUrl;
    token.value = saved.token;
    try {
      user.value = await me(saved.serverUrl, saved.token);
    } catch (err) {
      if (err instanceof ServerHttpError && err.status === 401) {
        signOut();
        return false;
      }
    }
    openClient(saved.serverUrl, saved.token);
    return true;
  }

  function signOut() {
    stopStatus?.();
    stopStatus = null;
    client.value?.close();
    client.value = null;
    token.value = '';
    user.value = null;
    status.value = 'idle';
    clearSession();
  }

  /** The shared client; screens only render once signed in. */
  function api(): TipelineClient {
    if (!client.value) throw new Error('Not signed in');
    return client.value;
  }

  return { serverUrl, token, user, status, client, signedIn, signIn, completeMfa, restore, signOut, api };
});
