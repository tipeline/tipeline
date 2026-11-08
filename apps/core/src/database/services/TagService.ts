import { normalizeTagLabels } from '@tipeline/schemas';
import { Tag as TagModel } from '@/database/models/Tag';

export class TagService {
  /** Tags are lowercase: "Urgent" and "urgent" are the one tag `urgent` (see normalizeTagLabels). */
  static normalizeLabels(labels: string[]): string[] {
    return normalizeTagLabels(labels);
  }

  /** Finds or creates a `tag` row for each normalized label. */
  static async findOrCreateIds(labels: string[]): Promise<number[]> {
    const normalized = TagService.normalizeLabels(labels);
    if (!normalized.length) return [];

    const knex = TagModel.knex();
    const ids: number[] = [];
    for (const label of normalized) {
      // Insert-or-skip, then read: two saves creating the same new tag at once
      // would otherwise both miss it and the second hit the unique label.
      await knex('tag').insert({ label }).onConflict('label').ignore();
      const row = await knex('tag').where({ label }).first();
      ids.push(row.id);
    }
    return ids;
  }

  static async setTaskTags(taskId: number, tagIds: number[]) {
    const knex = TagModel.knex();
    await knex('task_tag').where({ task_id: taskId }).delete();
    if (tagIds.length) {
      await knex('task_tag').insert(tagIds.map((tagId) => ({ task_id: taskId, tag_id: tagId })));
    }
  }

  static async getAll() {
    const knex = TagModel.knex();
    const rows = await knex('tag')
      .leftJoin('task_tag', 'task_tag.tag_id', 'tag.id')
      .groupBy('tag.id')
      .select('tag.id', 'tag.label', 'tag.created_at')
      .count('task_tag.task_id as taskCount')
      .orderBy('tag.label');
    return rows.map((row: any) => ({ ...row, taskCount: Number(row.taskCount) }));
  }

  static async create(input: string) {
    const [label] = TagService.normalizeLabels([input]);
    if (!label) throw new Error('Tag label is required');

    const existing = await TagModel.query().findOne({ label });
    if (existing) throw new Error(`Tag "${label}" already exists`);

    const record = await TagModel.query().insert({ label });
    return { ...record, taskCount: 0 };
  }

  static async rename(id: number, input: string) {
    const [label] = TagService.normalizeLabels([input]);
    if (!label) throw new Error('Tag label is required');

    const tag = await TagModel.query().findById(id);
    if (!tag) throw new Error(`Tag not found: ${id}`);

    const conflict = await TagModel.query().findOne({ label }).whereNot('id', id);
    if (conflict) throw new Error(`Tag "${label}" already exists`);

    await TagModel.query().findById(id).patch({ label });
    return { ...tag, label };
  }

  static async delete(id: number) {
    const tag = await TagModel.query().findById(id);
    if (!tag) throw new Error(`Tag not found: ${id}`);

    await TagModel.query().deleteById(id);
    return { id };
  }
}
