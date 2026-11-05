import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { useRecentItemsStore } from '@/store/recentItems';
import { useStarredItemsStore } from '@/store/starredItems';
import { useInboxStore } from '@/store/inbox';

// Lists the user keeps per workspace follow the active connection.
function switchWorkspaceLists(id: string | null): void {
  useRecentItemsStore().switchConnection(id);
  useStarredItemsStore().switchConnection(id);
  useInboxStore().switchConnection(id);
}

export interface Connection {
  id: string;
  name: string;
  host: string;
  token: string;
}

export interface ServerMe {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface TaskOwnershipInfo {
  task_identifier: string;
  user_id: string;
  user_email: string;
  user_name: string;
  visibility: 'shared' | 'private';
}

export const useConnectionStore = defineStore('connection', () => {
  const connections = ref<Connection[]>([]);
  const activeId = ref<string | null>(null);
  const isSwitching = ref(false);
  const serverMe = ref<ServerMe | null>(null);
  const taskOwnerships = ref<Map<string, TaskOwnershipInfo>>(new Map());
  /** Set when the last attempt to load/refresh the server session or ownerships failed. */
  const serverContextError = ref<string | null>(null);

  const activeConnection = computed<Connection | null>(() =>
    activeId.value ? (connections.value.find((c) => c.id === activeId.value) ?? null) : null
  );

  /** True when connected to a remote server (not local Core). */
  const isRemote = computed(() => activeId.value !== null);

  /** True if the current server user owns the given task, or if local (no ownership concept). */
  function isOwner(taskIdentifier: string): boolean {
    if (!serverMe.value) return true; // local mode — always can edit
    const ownership = taskOwnerships.value.get(taskIdentifier);
    if (!ownership) return true; // no ownership record yet — allow (legacy/untracked tasks)
    return ownership.user_id === serverMe.value.id || serverMe.value.role === 'admin';
  }

  async function load() {
    const [list, active] = await Promise.all([
      invokeCore<Connection[]>(SEND.CONNECTION_LIST),
      invokeCore<{ activeId: string | null }>(SEND.CONNECTION_GET_ACTIVE),
    ]);
    connections.value = list;
    activeId.value = active.activeId;
    switchWorkspaceLists(active.activeId);
    if (active.activeId) {
      await loadServerContext();
    }
  }

  async function loadServerContext(): Promise<void> {
    const conn = activeConnection.value;
    if (!conn) return;
    try {
      const [me, ownerships] = await Promise.all([
        window.ipcRenderer.invoke(SEND.SERVER_ME, { host: conn.host, token: conn.token }),
        window.ipcRenderer.invoke(SEND.SERVER_TASK_OWNERSHIP_LIST, { host: conn.host, token: conn.token }),
      ]);
      serverMe.value = me as ServerMe;
      taskOwnerships.value = new Map(
        (ownerships as TaskOwnershipInfo[]).map((o) => [o.task_identifier, o])
      );
      serverContextError.value = null;
    } catch (e: any) {
      serverMe.value = null;
      taskOwnerships.value = new Map();
      serverContextError.value = e?.message ?? 'Failed to load server session';
    }
  }

  /** Refreshes just the ownership map — call after creating/deleting tasks on a server. */
  async function refreshOwnerships(): Promise<void> {
    const conn = activeConnection.value;
    if (!conn) return;
    try {
      const ownerships = await window.ipcRenderer.invoke(SEND.SERVER_TASK_OWNERSHIP_LIST, {
        host: conn.host,
        token: conn.token,
      });
      taskOwnerships.value = new Map(
        (ownerships as TaskOwnershipInfo[]).map((o) => [o.task_identifier, o])
      );
      serverContextError.value = null;
    } catch (e: any) {
      // Ownership data stays stale on failure, but the failure itself is no longer silent.
      serverContextError.value = e?.message ?? 'Failed to refresh workflow ownership';
    }
  }

  async function add(name: string, host: string, token: string): Promise<Connection> {
    const connection = await invokeCore<Connection>(SEND.CONNECTION_ADD, { name, host, token });
    connections.value.push(connection);
    return connection;
  }

  async function update(id: string, name: string, host: string, token: string): Promise<Connection> {
    const connection = await invokeCore<Connection>(SEND.CONNECTION_UPDATE, { id, name, host, token });
    const idx = connections.value.findIndex((c) => c.id === id);
    if (idx !== -1) connections.value[idx] = connection;
    return connection;
  }

  async function remove(id: string): Promise<void> {
    await invokeCore(SEND.CONNECTION_REMOVE, { id });
    connections.value = connections.value.filter((c) => c.id !== id);
    if (activeId.value === id) activeId.value = null;
  }

  async function setActive(id: string | null): Promise<void> {
    isSwitching.value = true;
    try {
      await invokeCore(SEND.CONNECTION_SET_ACTIVE, { id });
      activeId.value = id;
      switchWorkspaceLists(id);
      if (id) {
        await loadServerContext();
      } else {
        serverMe.value = null;
        taskOwnerships.value = new Map();
        serverContextError.value = null;
      }
    } finally {
      isSwitching.value = false;
    }
  }

  function getActiveName(): string {
    if (!activeId.value) return 'Local';
    return connections.value.find((c) => c.id === activeId.value)?.name ?? 'Local';
  }

  return {
    connections,
    activeId,
    isSwitching,
    serverMe,
    taskOwnerships,
    serverContextError,
    activeConnection,
    isRemote,
    isOwner,
    load,
    loadServerContext,
    refreshOwnerships,
    add,
    update,
    remove,
    setActive,
    getActiveName,
  };
});
