import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// examples/workflows/assistant-instructions: workflows whose inputs only the user's instructions can fill
// ("prod" is a server name only they know).
const dir = path.resolve(__dirname, '../../../../examples/workflows/assistant-instructions');
const files = ['check-disk-space.yml', 'restart-service.yml'];

// The unknown-action check asks the database whether a group is a plugin; tests have none.
vi.mock('@database/services/PluginService', () => ({
  PluginService: { getByGroup: vi.fn(async () => undefined) },
}));
import { checkWorkflowYaml } from '@engine/WorkflowAuthoring';

describe('assistant instructions examples', () => {
  it.each(files)('%s passes the check with no warnings', async (file) => {
    const yaml = fs.readFileSync(path.join(dir, file), 'utf8');
    expect(await checkWorkflowYaml(yaml)).toEqual({ valid: true, errors: [], warnings: [] });
  });
});
