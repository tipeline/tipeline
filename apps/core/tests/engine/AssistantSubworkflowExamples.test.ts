import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Parser } from '@utils/Parser';

// examples/workflows/assistant-subworkflows: three workflows the assistant should reuse when asked to
// "get the PHP and MySQL versions and create an email draft with them".
const dir = path.resolve(__dirname, '../../../../examples/workflows/assistant-subworkflows');
const files = ['get-php-version.yml', 'get-mysql-version.yml', 'create-email-draft.yml'];
// The hub's System Info workflow, for "get my system info and save it to a file".
const systemInfo = path.resolve(__dirname, '../../../../examples/workflows/system-info.yml');
const read = (file: string) =>
  fs.readFileSync(file === 'system-info.yml' ? systemInfo : path.join(dir, file), 'utf8');

// The unknown-action check asks the database whether a group is a plugin; tests have none.
vi.mock('@database/services/PluginService', () => ({
  PluginService: { getByGroup: vi.fn(async () => undefined) },
}));
// The examples, installed under their file names.
vi.mock('@database/services/TaskService', () => ({
  TaskService: {
    getByIdentifier: vi.fn(async (identifier: string) => {
      const file = `${identifier}.yml`;
      if (!files.includes(file) && file !== 'system-info.yml') return undefined;
      const source = Parser.importFromString(read(file)) as any;
      return { name: source.name, source: JSON.stringify(source) };
    }),
  },
}));
import { checkWorkflowYaml } from '@engine/WorkflowAuthoring';
import { toWorkflowSummary } from '@engine/WorkflowCatalog';

describe('assistant sub-workflow examples', () => {
  it.each(files)('%s passes the check with no warnings', async (file) => {
    expect(await checkWorkflowYaml(read(file))).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('each shows the assistant what it returns', () => {
    for (const file of files) {
      const source = Parser.importFromString(read(file)) as any;
      const summary = toWorkflowSummary({ identifier: file, name: source.name, source: JSON.stringify(source) });
      expect(summary.outputs?.length, file).toBe(1);
    }
  });

  it('a draft that chains all three passes the check', async () => {
    const draft = `version: 1.0.0
name: Email Server Versions
description: Gets the PHP and MySQL versions and puts them in an email draft.
author: Tipeline Assistant
pipeline:
  variables:
    - { type: string, name: to, label: To, value: me@example.com, visibility: public, required: true }
    - { type: string, name: phpVersion, value: '', visibility: private }
    - { type: string, name: mysqlVersion, value: '', visibility: private }
  actions:
    - group: subtask
      name: exec
      params: { identifier: get-php-version, outputs: { phpVersion: version } }
    - group: subtask
      name: exec
      params: { identifier: get-mysql-version, outputs: { mysqlVersion: version } }
    - group: subtask
      name: exec
      params:
        identifier: create-email-draft
        props:
          to: '{{ to }}'
          subject: Server versions
          body: 'PHP: {{ phpVersion }}, MySQL: {{ mysqlVersion }}'
`;
    expect(await checkWorkflowYaml(draft)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('the hub System Info workflow passes the check and returns its text as an output', async () => {
    expect(await checkWorkflowYaml(read('system-info.yml'))).toEqual({ valid: true, errors: [], warnings: [] });
    const source = Parser.importFromString(read('system-info.yml')) as any;
    const summary = toWorkflowSummary({ identifier: 'system-info', name: source.name, source: JSON.stringify(source) });
    expect(summary.outputs?.map((o) => o.name)).toEqual(['systemInfo']);
  });

  it('a draft that runs System Info and writes the file passes the check', async () => {
    const draft = `version: 1.0.0
name: Save System Info
description: Saves this computer's system information to a text file.
author: Tipeline Assistant
pipeline:
  variables:
    - { type: string, name: filePath, label: File, value: ~/Documents/systemInfo.txt, visibility: public }
    - { type: string, name: info, value: '', visibility: private }
  actions:
    - group: subtask
      name: exec
      params: { identifier: system-info, outputs: { info: systemInfo } }
    - group: file
      name: write
      params: { src: '{{ filePath }}', data: '{{ info }}' }
`;
    expect(await checkWorkflowYaml(draft)).toEqual({ valid: true, errors: [], warnings: [] });
  });
});
