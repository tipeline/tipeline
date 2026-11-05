import { describe, it, expect, vi } from 'vitest';

// The unknown-action check asks the database whether a group is a plugin; tests have none.
vi.mock('@database/services/PluginService', () => ({
  PluginService: { getByGroup: vi.fn(async () => undefined) },
}));
// Installed workflows that sub-workflow steps are checked against.
const installed: Record<string, { name: string; source: string; metadata?: unknown }> = {
  'get-php-version': {
    name: 'Get PHP Version',
    source: JSON.stringify({
      pipeline: {
        variables: [
          { name: 'server', type: 'string', visibility: 'public', required: true, value: '' },
          { name: 'port', type: 'number', visibility: 'public', value: 22 },
          { name: 'connection', type: 'string', visibility: 'private', value: '' },
          { name: 'version', type: 'string', visibility: 'public', output: true, value: '' },
        ],
      },
    }),
  },
  'half-done': { name: 'Half Done', source: '{}', metadata: { draft: true } },
};
vi.mock('@database/services/TaskService', () => ({
  TaskService: { getByIdentifier: vi.fn(async (identifier: string) => installed[identifier]) },
}));
vi.mock('@database/services/GlobalVariableService', () => ({
  GlobalVariableService: { getAll: vi.fn(async () => [{ name: 'API_KEY', value: 'x' }]) },
}));
import {
  checkWorkflowYaml,
  describeActions,
  listActionGroups,
  readableFormatErrors,
  sandboxMisses,
  setWorkflowAuthor,
} from '@engine/WorkflowAuthoring';
import { Parser } from '@utils/Parser';
import { AUTHORING_GUIDE, GUIDE_EXAMPLES } from '@engine/AuthoringGuide';
import { isDraft, assertNotDraft, DraftWorkflowError } from '@task/Draft';

const header = `version: 1.0.0
name: Test
description: A test.
author: Tests
`;

describe('authoring guide', () => {
  it.each(GUIDE_EXAMPLES.map((e) => [e.title, e.yaml]))('example "%s" passes the check with no warnings', async (_title, yaml) => {
    expect(await checkWorkflowYaml(yaml)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('opens with the one-step example and tells the model to stay in scope', () => {
    expect(GUIDE_EXAMPLES[0].yaml).toContain('name: toUpperCase');
    expect(GUIDE_EXAMPLES[0].yaml.match(/- group:/g)).toHaveLength(1);
    expect(AUTHORING_GUIDE).toContain('## Do only what was asked');
  });

  it('shows how to reuse an installed workflow as a step', () => {
    expect(AUTHORING_GUIDE).toContain('## Reusing workflows the user already has');
    expect(AUTHORING_GUIDE).toContain('group: subtask');
  });

  it('includes every example', () => {
    for (const example of GUIDE_EXAMPLES) expect(AUTHORING_GUIDE).toContain(example.yaml);
  });
});

describe('listActionGroups', () => {
  it('lists built-in groups with each action and what it does', () => {
    const math = listActionGroups().find((g) => g.group === 'math');
    expect(math?.label).toBe('Math');
    expect(math?.actions).toContainEqual({ name: 'multiply', description: 'Product of two numbers.' });
  });

  it('stays small enough to send whole', () => {
    expect(JSON.stringify(listActionGroups()).length).toBeLessThan(40_000);
  });
});

describe('describeActions', () => {
  it('includes the example step from the action\'s docs', () => {
    const [upper] = describeActions(['string.toUpperCase']).actions;
    expect(upper.example).toContain('name: toUpperCase');
  });

  it('describes fields, required flags and return type', () => {
    const { actions, unknown } = describeActions(['math.multiply', 'array.push', 'nope.nothing', 'bad']);
    expect(unknown).toEqual(['nope.nothing', 'bad']);
    expect(actions[0]).toMatchObject({
      action: 'math.multiply',
      returns: 'number',
      fields: [
        { name: 'multiplier', type: 'number', required: true },
        { name: 'multiplicand', type: 'number', required: true },
      ],
    });
    expect(actions[1].fields.find((f) => f.name === 'position')).toMatchObject({
      type: '"start" | "end"',
      required: false,
    });
  });
});

describe('checkWorkflowYaml', () => {
  it('reports YAML that does not parse', async () => {
    const result = await checkWorkflowYaml('name: [unclosed');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Invalid YAML/);
  });

  it('reports missing top-level fields as sentences', async () => {
    const result = await checkWorkflowYaml('name: x\npipeline:\n  variables: []\n  actions: []\n');
    expect(result.errors).toContain('"description" is required.');
  });

  it('names the step and field of an unfinished step', async () => {
    const yaml = `${header}pipeline:
  variables: []
  actions:
    - group: math
      name: multiply
      label: Multiply
      params: {}
`;
    expect((await checkWorkflowYaml(yaml)).errors).toEqual([
      'pipeline.actions[0] "Multiply" (math.multiply): multiplier: Must be a number or a template variable (e.g., {{ var }}); multiplicand: Must be a number or a template variable (e.g., {{ var }})',
    ]);
  });

  it('reports unknown actions and an else without an if', async () => {
    const yaml = `${header}pipeline:
  variables: []
  actions:
    - group: flow
      name: elseConditional
      params: { actions: [] }
    - group: nope
      name: nothing
      params: {}
`;
    const { errors } = await checkWorkflowYaml(yaml);
    expect(errors).toContain('pipeline.actions[0] (flow.elseConditional): must come right after ifConditional or elseIfConditional.');
    expect(errors.some((e) => e.includes('nope.nothing'))).toBe(true);
  });

  it('checks steps nested in loops and warns about undeclared variables', async () => {
    const yaml = `${header}pipeline:
  variables:
    - { type: array, name: items, value: [], visibility: public }
  actions:
    - group: flow
      name: forEachLoop
      params:
        iterable: '{= items =}'
        currentItem: item
        actions:
          - group: math
            name: add
            params: { augend: '{= item =}', addend: '{= missing =}' }
            destination: total
          - group: math
            name: divide
            params: { dividend: 1 }
`;
    const result = await checkWorkflowYaml(yaml);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'pipeline.actions[0].params.actions[0] (math.add): writes to "total", which isn\'t declared under pipeline.variables.',
      expect.stringContaining('pipeline.actions[0].params.actions[1] (math.divide): divisor'),
    ]);
    expect(result.warnings).toEqual([
      'pipeline.actions[0].params.actions[0] (math.add): uses "missing", which isn\'t a variable of this workflow.',
    ]);
  });

  it('rejects a destination with a dot, since a run looks up the exact name', async () => {
    const yaml = `${header}pipeline:
  variables:
    - { type: object, name: global, value: {}, visibility: private }
  actions:
    - group: math
      name: add
      params: { augend: 1, addend: 2 }
      destination: global.total
`;
    const { errors } = await checkWorkflowYaml(yaml);
    expect(errors).toContainEqual(
      'pipeline.actions[0] (math.add): writes to "global.total", which isn\'t declared under pipeline.variables.'
    );
  });

  it('reports a destination whose type differs from what the action returns, as a run would', async () => {
    const yaml = `${header}pipeline:
  variables:
    - { type: object, name: browserInstance, value: {}, visibility: private }
  actions:
    - group: browser
      name: launch
      params: { headless: 'true' }
      destination: browserInstance
`;
    expect((await checkWorkflowYaml(yaml)).errors).toEqual([
      'pipeline.actions[0] (browser.launch): destination "browserInstance" must be declared with type "browser" (found "object").',
    ]);
  });

  it('accepts a destination of the returned type with no starting value, and checks nested steps', async () => {
    const yaml = `${header}pipeline:
  variables:
    - { type: browser, name: browserInstance, visibility: private }
    - { type: array, name: items, value: [], visibility: public }
    - { type: string, name: connection, value: '', visibility: private }
  actions:
    - group: browser
      name: launch
      params: { headless: 'true' }
      destination: browserInstance
    - group: flow
      name: forEachLoop
      params:
        iterable: '{= items =}'
        currentItem: item
        actions:
          - group: ssh
            name: connect
            params: { config: { host: example.com, username: me } }
            destination: connection
`;
    const { errors } = await checkWorkflowYaml(yaml);
    expect(errors).toEqual([
      'pipeline.actions[1].params.actions[0] (ssh.connect): destination "connection" must be declared with type "sshConnection" (found "string").',
    ]);
  });

  it('leaves destinations of actions returning any unchecked', async () => {
    const yaml = `${header}pipeline:
  variables:
    - { type: string, name: out, value: '', visibility: private }
  actions:
    - group: array
      name: get
      params: { array: [a, b], index: 0 }
      destination: out
`;
    const { errors } = await checkWorkflowYaml(yaml);
    expect(errors.filter((e) => e.includes('must be declared with type'))).toEqual([]);
  });

  it('reports a variable.set step with a destination, which would overwrite a value with true', async () => {
    const yaml = `${header}pipeline:
  variables:
    - { type: string, name: filePath, value: ~/a.txt, visibility: public }
    - { type: string, name: savedPath, value: '', visibility: public, output: true }
  actions:
    - group: variable
      name: set
      params: { name: savedPath, value: '{{ filePath }}' }
      destination: savedPath
`;
    expect((await checkWorkflowYaml(yaml)).errors).toEqual([
      'pipeline.actions[0] (variable.set): variable.set already writes to "savedPath". Leave out destination: it would be set to true.',
    ]);
  });

  it('accepts globals and environment values in templates', async () => {
    const yaml = `${header}pipeline:
  variables: []
  actions:
    - group: system
      name: message
      params: { text: '{{ _global.API_KEY }} {{ _env.HOME }}' }
`;
    expect((await checkWorkflowYaml(yaml)).warnings).toEqual([]);
  });

  it('warns about a global that does not exist, also inside a branch, without failing', async () => {
    const yaml = `${header}pipeline:
  variables: []
  actions:
    - group: flow
      name: ifConditional
      params:
        firstOperand: a
        compareAs: string
        operator: eq
        secondOperand: a
        actions:
          - group: system
            name: message
            params: { text: '{{ _global.SMTP_HOST }}' }
`;
    const result = await checkWorkflowYaml(yaml);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([
      `Global variable "SMTP_HOST" doesn't exist yet. The run fails until it's created on the Variables page.`,
    ]);
  });

  it.each([
    ['beside its params', '            elseConditional:\n              params:\n                actions: []\n'],
    ['inside its params', '              elseConditional:\n                params:\n                  actions: []\n'],
  ])('rejects an else written as a key of a nested If, %s', async (_where, stray) => {
    const yaml = `${header}pipeline:
  variables: []
  actions:
    - group: flow
      name: ifConditional
      params:
        firstOperand: a
        compareAs: string
        operator: eq
        secondOperand: a
        actions:
          - group: flow
            name: ifConditional
            params:
              firstOperand: a
              compareAs: string
              operator: eq
              secondOperand: a
              actions: []
${stray}`;
    const result = await checkWorkflowYaml(yaml);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toMatch(/"elseConditional" can't be a key of this step/);
  });
});

describe('script sandbox check', () => {
  it('reports Node.js features a runScript step cannot reach', async () => {
    const yaml = `${header}pipeline:
  variables:
    - { type: string, name: folderPath, value: ~/Photos, visibility: public }
  actions:
    - group: script
      name: runScript
      params:
        code: |
          const fs = require('fs');
          const dir = String(folderPath).replace(/^~/, process.env.HOME);
          return fs.readdirSync(dir);
        context: { folderPath: '{{ folderPath }}' }
`;
    const { errors } = await checkWorkflowYaml(yaml);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('the script uses require, process');
  });

  it('accepts plain JavaScript that only mentions them in text or comments', () => {
    expect(
      sandboxMisses(`// no require() here
const note = "call process.exit() or fetch(url)";
/* setTimeout(() => {}) */
return files.map((f) => f.name + note);`)
    ).toEqual([]);
  });

  it('finds imports and timers', () => {
    expect(sandboxMisses(`import fs from 'fs';\nreturn 1;`)).toEqual(['import']);
    expect(sandboxMisses(`const m = await import("os");`)).toEqual(['import']);
    expect(sandboxMisses(`await new Promise((r) => setTimeout(r, 10));`)).toEqual(['timers']);
    expect(sandboxMisses(`return await fetch(url);`)).toEqual(['fetch']);
  });
});

describe('checkWorkflowYaml sub-workflows', () => {
  const withStep = (step: string) => `${header}pipeline:
  variables:
    - { type: string, name: server, value: web1, visibility: public }
    - { type: string, name: phpVersion, value: '', visibility: private }
  actions:
${step}`;

  it('accepts a step that sets inputs and reads outputs of an installed workflow', async () => {
    const yaml = withStep(`    - group: subtask
      name: exec
      params:
        identifier: get-php-version
        props:
          server: '{{ server }}'
        outputs:
          phpVersion: version
`);
    expect(await checkWorkflowYaml(yaml)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('reports workflows that are not installed, on a hub only, or drafts', async () => {
    const yaml = withStep(`    - group: subtask
      name: exec
      params: { identifier: made-up }
    - group: subtask
      name: exec
      params: { identifier: 'hub:main:get-mysql-version' }
    - group: flow
      name: forEachLoop
      params:
        iterable: []
        currentItem: server
        actions:
          - group: subtask
            name: exec
            params: { identifier: half-done }
`);
    const { errors } = await checkWorkflowYaml(yaml);
    expect(errors).toContain(
      'pipeline.actions[0] (subtask.exec): there is no installed workflow "made-up". Use an identifier from search_workflows.'
    );
    expect(errors.some((e) => e.startsWith('pipeline.actions[1] (subtask.exec): "hub:main:get-mysql-version" is on a hub'))).toBe(true);
    expect(errors).toContain(
      'pipeline.actions[2].params.actions[0] (subtask.exec): "Half Done" is a draft and can\'t run as a sub-workflow until someone marks it ready.'
    );
  });

  it('reports props and outputs a run would refuse or quietly skip, and a missing required input', async () => {
    const yaml = withStep(`    - group: subtask
      name: exec
      params:
        identifier: get-php-version
        props:
          host: '{{ server }}'
          connection: x
          version: '8'
        outputs:
          phpVersion: phpVersion
          missing: connection
`);
    const { errors, warnings } = await checkWorkflowYaml(yaml);
    const what = '"Get PHP Version" (get-php-version)';
    expect(errors).toEqual([
      'pipeline.actions[0] (subtask.exec): writes to "missing", which isn\'t declared under pipeline.variables.',
      `pipeline.actions[0] (subtask.exec): ${what} has no input "host". Its inputs: server, port.`,
      `pipeline.actions[0] (subtask.exec): "connection" is private in ${what}, so it can't be set from here. Its inputs: server, port.`,
      `pipeline.actions[0] (subtask.exec): "version" is an output of ${what}, not an input. Read it with "outputs" instead.`,
      `pipeline.actions[0] (subtask.exec): ${what} needs the input "server" (text). Set it in props: a value, an input of this workflow, or an output of an earlier step.`,
      `pipeline.actions[0] (subtask.exec): ${what} has no variable "phpVersion" to read into "phpVersion". It returns: server, port, version.`,
      `pipeline.actions[0] (subtask.exec): "connection" is private in ${what}, so it can't be read from here. It returns: server, port, version.`,
    ]);
    expect(warnings).toEqual([]);
  });

  describe('types passed between workflows', () => {
    const typed = (props: string, outputs = '', extraVariables = '') => `${header}pipeline:
  variables:
    - { type: string, name: server, value: web1, visibility: public }
    - { type: string, name: portText, value: '22', visibility: public }
    - { type: number, name: portNumber, value: 22, visibility: public }
    - { type: array, name: hosts, value: [], visibility: public }
    - { type: number, name: count, value: 0, visibility: private }
${extraVariables}  actions:
    - group: subtask
      name: exec
      params:
        identifier: get-php-version
        props:
          server: '{{ server }}'
${props}${outputs}`;
    const at = 'pipeline.actions[0] (subtask.exec): input "port" of "Get PHP Version" (get-php-version)';

    it('accepts matching variables, fixed values a run can convert, and any variable as text', async () => {
      for (const port of ["'{= portNumber =}'", '2222', "'2222'", "'{{ portNumber }}'"]) {
        const result = await checkWorkflowYaml(typed(`          port: ${port}\n`));
        expect(result, port).toEqual({ valid: true, errors: [], warnings: [] });
      }
      // A text input takes a list written out with {{ }}.
      expect((await checkWorkflowYaml(typed('').replace("'{{ server }}'", "'{{ hosts }}'"))).errors).toEqual([]);
    });

    it('reports values that can never fit the input', async () => {
      const cases: Array<[string, string]> = [
        ["'{= hosts =}'", `${at}: "hosts" holds a list, but it needs a number.`],
        ['twenty', `${at}: "twenty" can't be used as a number.`],
        ["'port {{ portNumber }}'", `${at}: text mixing words and variables can't become a number.`],
      ];
      for (const [port, error] of cases) {
        expect((await checkWorkflowYaml(typed(`          port: ${port}\n`))).errors, port).toEqual([error]);
      }
    });

    it('warns when a value fits only if it reads as the input type at run time', async () => {
      const { errors, warnings } = await checkWorkflowYaml(typed("          port: '{= portText =}'\n"));
      expect(errors).toEqual([]);
      expect(warnings).toEqual([`${at}: "portText" holds text; the run stops unless it reads as a number.`]);
    });

    it('checks an output against the variable it is read into', async () => {
      const { errors, warnings } = await checkWorkflowYaml(
        typed(
          '',
          '        outputs:\n          page: version\n          count: version\n',
          '    - { type: browser, name: page, visibility: private }\n'
        )
      );
      expect(errors).toEqual([
        'pipeline.actions[0] (subtask.exec): "version" of "Get PHP Version" (get-php-version) is text, but "page" is declared as a browser.',
      ]);
      expect(warnings).toEqual([
        'pipeline.actions[0] (subtask.exec): "version" of "Get PHP Version" (get-php-version) is text; the run stops unless it reads as a number, the type of "count".',
      ]);
    });
  });

  it('reports outputs on a step that runs in the background', async () => {
    const yaml = withStep(`    - group: subtask
      name: exec
      params:
        identifier: get-php-version
        async: true
        props: { server: '{{ server }}' }
        outputs: { phpVersion: version }
`);
    const { errors } = await checkWorkflowYaml(yaml);
    expect(errors.some((e) => e.includes('"outputs" can\'t be used with "async"'))).toBe(true);
  });
});

describe('readableFormatErrors', () => {
  it('drops the heading key and turns field keys into sentences', () => {
    expect(readableFormatErrors('task.validationFailed\ntask.description.required\ntask.version.format')).toEqual([
      '"description" is required.',
      '"version" has the wrong format.',
    ]);
  });

  it('keeps messages that are already sentences', () => {
    expect(readableFormatErrors('Duplicate variable name "a"')).toEqual(['Duplicate variable name "a"']);
  });
});

describe('drafts', () => {
  it('reads the flag from object or JSON-string metadata', () => {
    expect(isDraft({ metadata: { draft: true } })).toBe(true);
    expect(isDraft({ metadata: '{"draft":true}' })).toBe(true);
    expect(isDraft({ metadata: { image: 'x.png' } })).toBe(false);
    expect(isDraft({ metadata: null })).toBe(false);
    expect(isDraft(null)).toBe(false);
  });

  it('refuses a draft unless the run was started directly', () => {
    const draft = { name: 'Annual salary', metadata: { draft: true } };
    expect(() => assertNotDraft(draft)).toThrow(DraftWorkflowError);
    expect(() => assertNotDraft(draft)).toThrow('"Annual salary" is a draft.');
    expect(() => assertNotDraft(draft, true)).not.toThrow();
    expect(() => assertNotDraft({ name: 'Ready', metadata: {} })).not.toThrow();
  });
});

describe('setWorkflowAuthor', () => {
  it('replaces the author and keeps the rest of the workflow', () => {
    const yaml = GUIDE_EXAMPLES[0].yaml;
    const result = Parser.importFromString(setWorkflowAuthor(yaml, 'Jose Daniel')) as any;
    const original = Parser.importFromString(yaml) as any;
    expect(result.author).toBe('Jose Daniel');
    expect({ ...result, author: original.author }).toEqual(original);
  });

  it('leaves the YAML alone without an author', () => {
    expect(setWorkflowAuthor('name: x\n', '')).toBe('name: x\n');
  });
});
