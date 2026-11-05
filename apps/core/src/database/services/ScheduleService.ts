import { generateIdentifier } from '@tipeline/utils';
import { Schedule as ScheduleModel } from '@database/models/Schedule.js';
import { Task as TaskModel } from '@database/models/Task.js';

export class ScheduleService {
  /** `timing` has a cron (repeats), an everySeconds interval, or a runAt ISO time (runs once). */
  static async create(
    taskIdentifier: string,
    timing: { cron?: string | null; runAt?: string | null; everySeconds?: number | null },
    variables: Record<string, any> = {}
  ): Promise<ScheduleModel> {
    const task = await TaskModel.query().findOne({ identifier: taskIdentifier });
    if (!task) throw new Error(`Workflow not found: ${taskIdentifier}`);

    return await ScheduleModel.query().insert({
      identifier: generateIdentifier(),
      task_id: task.id,
      cron: timing.cron ?? null,
      run_at: timing.runAt ?? null,
      every_seconds: timing.everySeconds ?? null,
      variables: JSON.stringify(variables),
      enabled: true,
    });
  }

  static async remove(scheduleIdentifier: string): Promise<void> {
    const count = await ScheduleModel.query().delete().where({ identifier: scheduleIdentifier });
    if (count === 0) throw new Error(`Schedule "${scheduleIdentifier}" not found`);
  }

  static async list(): Promise<ScheduleModel[]> {
    return await ScheduleModel.query().withGraphFetched('task').where({ enabled: true });
  }

  static async listAll(): Promise<ScheduleModel[]> {
    return await ScheduleModel.query().withGraphFetched('task');
  }

  static async toggle(scheduleIdentifier: string, enabled: boolean): Promise<void> {
    // updated_at marks when an interval schedule starts counting again.
    await ScheduleModel.query()
      .patch({ enabled, updated_at: new Date().toISOString() } as any)
      .where({ identifier: scheduleIdentifier });
  }

  static async getByIdentifier(scheduleIdentifier: string): Promise<ScheduleModel | undefined> {
    return await ScheduleModel.query()
      .withGraphFetched('task')
      .findOne({ identifier: scheduleIdentifier });
  }

  /** Records that the schedule just started a run; a one-time schedule also turns off. */
  static async markLastRun(scheduleIdentifier: string): Promise<void> {
    const schedule = await ScheduleModel.query().findOne({ identifier: scheduleIdentifier });
    if (!schedule) return;
    await ScheduleModel.query()
      .patch({
        last_run_at: new Date().toISOString(),
        ...(schedule.run_at ? { enabled: false } : {}),
      } as any)
      .where({ identifier: scheduleIdentifier });
  }
}
