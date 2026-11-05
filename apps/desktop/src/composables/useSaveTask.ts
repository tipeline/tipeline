import { ref, toRaw } from 'vue';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';

const isDirty = ref(false);

export function useSaveTask() {
  async function updateSource(identifier: string, parsedSource: any): Promise<any> {
    const result = await invokeCore(SEND.TASK_UPDATE_SOURCE, {
      identifier,
      source: JSON.stringify(toRaw(parsedSource)),
    });
    isDirty.value = false;
    return result;
  }

  return {
    updateSource,
    isDirty,
    markDirty: () => { isDirty.value = true; },
    clearDirty: () => { isDirty.value = false; },
  };
}
