import { validations } from '@tipeline/schemas';
import { Task as TaskModel } from '@database/models/Task';
import { AlertService } from '@database/services/AlertService';
import { PipelineService } from '@database/services/PipelineService';
import { isDraft } from '@task/Draft';
import type { Task } from '@task/Task';

export interface AlertRaised {
  /** The alert's identifier; null when nothing was saved (a draft's test run). */
  id: string | null;
  key: string;
  count: number;
  isNew: boolean;
}

/** What a run page shows: the alerts this run raised (kept on the run's metadata). */
export interface RunAlertNote {
  id: string;
  title: string;
  level: string;
}

/**
 * A draft is a workflow the assistant wrote that nobody has checked yet. A person
 * testing it in the builder mustn't fill Needs you with real alerts.
 */
async function isDraftRun(task: Task): Promise<boolean> {
  const identifier = task.getIdentifier();
  if (!identifier) return false;
  const record = await TaskModel.query().findOne({ identifier }).select('metadata');
  return isDraft(record);
}

/** Notes the alert on the run, so its page can say it raised one. */
async function noteOnRun(task: Task, note: RunAlertNote) {
  const pipeline = task.getPipeline();
  if (!task.getShouldSave() || !pipeline.getId()) return;
  const record = await PipelineService.getById(pipeline.getId());
  const notes = ((record?.metadata as any)?.alerts ?? []) as RunAlertNote[];
  if (notes.some((n) => n.id === note.id)) return;
  await PipelineService.mergeMetadata(pipeline.getId(), { alerts: [...notes, note] });
}

/**
 * @group Actions
 */
export class GroupAlert {
  // --------------------------------------------------
  // Raise
  // --------------------------------------------------

  /**
   * Tells the user something happened: the alert shows in **Needs you** on the
   * dashboard, next to approvals and failed runs. The run doesn't wait; it carries on.
   * `warning` (the default) also counts in the Needs you badge and shows a toast while
   * Tipeline is in front; `critical` also sends a system notification; `info` is only
   * listed. Raising the same `key` again from the same workflow updates the alert that
   * is still open instead of adding one: the count goes up (×2, ×3…), the message and
   * level are refreshed and it points to the latest run. Without a `key`, the title is
   * the key. Dismissing an alert acknowledges it: later raises keep it quiet until
   * `alert.resolve` closes it, unless one is louder than before (a dismissed warning
   * raised as critical), which puts it back in Needs you. Runs that aren't saved still raise it (with no run link);
   * a draft's test run doesn't save one.
   *
   * @param params - The input parameters.
   * @returns `{ id, key, count, isNew }`.
   * @example
   * ```yaml
   * # Alert on a traffic spike; clear it once traffic is back to normal
   * - group: flow
   *   name: ifConditional
   *   params:
   *     firstOperand: '{{ visits }}'
   *     compareAs: number
   *     operator: gt
   *     secondOperand: '{{ threshold }}'
   *     actions:
   *       - group: alert
   *         name: raise
   *         params:
   *           title: 'Traffic spike: {{ site }}'
   *           message: '{{ visits }} visits in the last hour (usual {{ baseline }})'
   *           level: warning
   *           key: 'spike-{{ site }}'
   * - group: flow
   *   name: elseConditional
   *   params:
   *     actions:
   *       - group: alert
   *         name: resolve
   *         params:
   *           key: 'spike-{{ site }}'
   * ```
   */
  static async raise(params: unknown, task: Task): Promise<AlertRaised> {
    const parsed = validations.alert.raise.runtime.validate(params);
    const key = parsed.key?.trim() || parsed.title.trim();

    if (await isDraftRun(task)) {
      return { id: null, key, count: 1, isNew: true };
    }

    const pipeline = task.getPipeline();
    const saved = task.getShouldSave() && !!pipeline.getId();
    const { alert, isNew } = await AlertService.raise({
      taskIdentifier: task.getIdentifier(),
      pipelineIdentifier: saved ? pipeline.getIdentifier() : null,
      key,
      title: parsed.title.trim(),
      message: parsed.message ?? null,
      level: parsed.level ?? 'warning',
    });
    await noteOnRun(task, { id: alert.id, title: alert.title, level: alert.level });
    return { id: alert.id, key: alert.key, count: alert.count, isNew };
  }

  // --------------------------------------------------
  // Resolve
  // --------------------------------------------------

  /**
   * Closes this workflow's alert with this `key` because the problem went away — open
   * or acknowledged, it leaves Needs you. Does nothing when there is none, so it can
   * run every time things are normal (typically in the other branch of the If that
   * raises it). A later raise with the same key opens a new alert. Without a `key` on
   * the raise step, use its title.
   *
   * @param params - The input parameters.
   * @returns `{ resolved }`: whether there was an alert to close.
   * @example
   * ```yaml
   * - group: alert
   *   name: resolve
   *   params:
   *     key: 'spike-{{ site }}'
   * ```
   */
  static async resolve(params: unknown, task: Task): Promise<{ resolved: boolean }> {
    const parsed = validations.alert.resolve.runtime.validate(params);
    if (await isDraftRun(task)) return { resolved: false };
    const resolved = await AlertService.resolve(
      task.getIdentifier(),
      parsed.key.trim(),
      'workflow'
    );
    return { resolved };
  }
}
