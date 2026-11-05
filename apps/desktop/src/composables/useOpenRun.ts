// Opens another run from a run's page: a sub-workflow's run, or the run that called it.
// On the workflow's Runs tab it's the same page; a detached run window opens it in a
// window of its own (that window only ever shows the run it was opened for, and window
// paths take no query, so the step isn't picked there).
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { openInWindow, windowPaths } from '@/utils/detachedWindows';

export function useOpenRun() {
  const route = useRoute();
  const router = useRouter();
  const { t } = useI18n();

  /** `step`: the step to show, opened and scrolled to. */
  return function openRun(taskIdentifier: string, pipelineIdentifier: string, step?: string | null) {
    if (route.name === 'RunWindow') {
      openInWindow(windowPaths.run(taskIdentifier, pipelineIdentifier), t('runWindow.title', { id: pipelineIdentifier }));
      return;
    }
    router.push({
      name: 'PipelineDetail',
      params: { tid: taskIdentifier, pipelineId: pipelineIdentifier },
      query: step ? { step } : {},
    });
  };
}
