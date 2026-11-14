import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// examples/workflows/traffic-spike-alert.yml: the guide's "Get alerted when something happens" example.
const file = path.resolve(__dirname, '../../../../examples/workflows/traffic-spike-alert.yml');

// The unknown-action check asks the database whether a group is a plugin; tests have none.
vi.mock('@database/services/PluginService', () => ({
  PluginService: { getByGroup: vi.fn(async () => undefined) },
}));
import { checkWorkflowYaml } from '@engine/WorkflowAuthoring';

describe('alert example', () => {
  it('traffic-spike-alert.yml passes the check with no warnings', async () => {
    const yaml = fs.readFileSync(file, 'utf8');
    expect(await checkWorkflowYaml(yaml)).toEqual({ valid: true, errors: [], warnings: [] });
  });
});
