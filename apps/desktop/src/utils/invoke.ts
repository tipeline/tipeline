import { generateIdentifier } from '@tipeline/utils';

// Electron prefixes any error thrown by an ipcMain.handle() handler with
// "Error invoking remote method '<channel>': Error: " before it reaches the
// renderer. That prefix is Electron's own artifact, not app content, so strip
// it here rather than showing it (or trying to translate it) to the user.
const ELECTRON_IPC_ERROR_PREFIX = /^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/;

/**
 * Sends an invoke call to the main process and returns the result.
 * Use this in Pinia stores and non-component contexts where Vue composables
 * (and their onMounted/onUnmounted hooks) are not available.
 *
 * For components, prefer useQuery() which adds isLoading and error refs.
 */
export async function invokeCore<T = any>(channel: string, payload: any = null): Promise<T> {
  try {
    return await window.ipcRenderer.invoke(channel, {
      correlationId: generateIdentifier(),
      payload,
    });
  } catch (error) {
    if (error instanceof Error) {
      error.message = error.message.replace(ELECTRON_IPC_ERROR_PREFIX, '');
    }
    throw error;
  }
}
