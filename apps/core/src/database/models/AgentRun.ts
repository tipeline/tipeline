import { Model } from 'objection';

export class AgentRun extends Model {
  id!: number;
  correlation_id!: string;
  prompt!: string;
  answer?: string | null;
  status!: 'running' | 'proposed' | 'done' | 'error';
  task_identifier?: string | null;
  task_name?: string | null;
  pipeline_identifier?: string | null;
  error?: string | null;
  created_at!: Date;
  finished_at?: Date | null;

  static get tableName() {
    return 'agent_run';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['correlation_id', 'prompt'],
      properties: {
        id: { type: 'integer' },
        correlation_id: { type: 'string' },
        prompt: { type: 'string' },
        answer: { type: ['string', 'null'] },
        status: { type: 'string' },
        task_identifier: { type: ['string', 'null'] },
        task_name: { type: ['string', 'null'] },
        pipeline_identifier: { type: ['string', 'null'] },
        error: { type: ['string', 'null'] },
        created_at: { type: 'string', format: 'date-time' },
        finished_at: { type: ['string', 'null'], format: 'date-time' },
      },
    };
  }
}
