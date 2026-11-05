import { describe, it, expect } from 'vitest';
import { taskSchema } from '@tipeline/schemas';
import {
  actionGroups,
  findabilityIssues,
  hubWorkflowId,
  parseHubWorkflowId,
  keywords,
  outputDetails,
  reportedOutputNames,
  searchWorkflows,
  toWorkflowSummary,
  workflowInputs,
  workflowOutputs,
  type WorkflowSummary,
} from '@engine/WorkflowCatalog';

const reportSource = {
  name: 'Monthly sales report',
  description: 'Builds the **sales** report for one month.\n\nLonger details here.',
  tags: ['reports', 'sales'],
  pipeline: {
    variables: [
      { type: 'date', name: 'month', label: 'Month', description: 'First day of the month', required: true, value: '', visibility: 'public' },
      { type: 'string', name: 'format', value: 'pdf', visibility: 'public' },
      { type: 'string', name: 'token', secret: true, value: 'abc', visibility: 'public' },
      { type: 'string', name: 'apiKey', valueFromEnv: 'API_KEY', visibility: 'public' },
      { type: 'string', name: 'region', valueFromGlobal: 'region', visibility: 'public' },
      { type: 'string', name: 'internal', visibility: 'private', value: 'x' },
      { type: 'string', name: 'helper', visibility: 'protected', value: 'y' },
      // No visibility is private, as the engine treats it.
      { type: 'object', name: 'scratch', value: {} },
      { type: 'browser', name: 'session', visibility: 'public' },
      { type: 'number', name: 'total', visibility: 'public', value: 0 },
    ],
    actions: [],
  },
};

function summary(name: string, extra: Partial<WorkflowSummary> = {}): WorkflowSummary {
  return { identifier: name.toLowerCase().replace(/\s+/g, '-'), name, inputs: [], ...extra };
}

describe('workflowInputs', () => {
  it('keeps public and protected, editable, non-secret variables only', () => {
    const names = workflowInputs(reportSource).map((i) => i.name);
    expect(names).toEqual(['month', 'format', 'helper', 'total']);
  });

  it('reports label, description, required and a non-empty default', () => {
    const [month, format, , total] = workflowInputs(reportSource);
    expect(month).toEqual({
      name: 'month',
      type: 'date',
      label: 'Month',
      description: 'First day of the month',
      required: true,
    });
    expect(format).toEqual({ name: 'format', type: 'string', default: 'pdf' });
    expect(total).toEqual({ name: 'total', type: 'number', default: 0 });
  });

  it('returns nothing for a workflow without variables or a broken source', () => {
    expect(workflowInputs({ pipeline: {} })).toEqual([]);
    expect(workflowInputs(null)).toEqual([]);
  });
});

// The same report, with its results marked as outputs.
const reportWithOutputs = {
  ...reportSource,
  pipeline: {
    variables: [
      ...reportSource.pipeline.variables.filter((v) => v.name !== 'total'),
      { type: 'number', name: 'total', label: 'Total sales', description: 'In euros.', visibility: 'public', output: true, value: 0 },
      { type: 'string', name: 'summary', visibility: 'public', output: true, value: '' },
      { type: 'string', name: 'hiddenOut', visibility: 'protected', output: true, value: '' },
      { type: 'string', name: 'secretOut', visibility: 'public', secret: true, output: true, value: '' },
    ],
    actions: [],
  },
};

describe('outputs', () => {
  it('leaves outputs out of the inputs', () => {
    expect(workflowInputs(reportWithOutputs).map((i) => i.name)).toEqual(['month', 'format', 'helper']);
  });

  it('lists the public and protected, non-secret outputs with their label and description', () => {
    expect(workflowOutputs(reportWithOutputs)).toEqual([
      { name: 'total', type: 'number', label: 'Total sales', description: 'In euros.' },
      { name: 'summary', type: 'string' },
      { name: 'hiddenOut', type: 'string' },
    ]);
    expect(workflowOutputs(reportSource)).toEqual([]);
  });

  it('puts outputs in the summary only when the workflow declares some', () => {
    const withOutputs = toWorkflowSummary({ identifier: 'r', name: 'R', source: reportWithOutputs });
    expect(withOutputs.outputs?.map((o) => o.name)).toEqual(['total', 'summary', 'hiddenOut']);
    expect(toWorkflowSummary({ identifier: 'r', name: 'R', source: reportSource })).not.toHaveProperty('outputs');
  });

  it('describes the returned outputs that have a label or description', () => {
    expect(outputDetails(reportWithOutputs)).toEqual({ total: { label: 'Total sales', description: 'In euros.' } });
    expect(outputDetails(reportSource)).toEqual({ month: { label: 'Month', description: 'First day of the month' } });
  });
});

describe('reportedOutputNames', () => {
  it('lists public non-secret variables, including ones with no default, but not protected ones', () => {
    expect(reportedOutputNames(reportSource)).toEqual(['month', 'format', 'apiKey', 'region', 'session', 'total']);
  });

  it('lists only the outputs, protected ones too, once the workflow marks some', () => {
    expect(reportedOutputNames(reportWithOutputs)).toEqual(['total', 'summary', 'hiddenOut']);
  });
});

describe('toWorkflowSummary', () => {
  it('reads name, one-line description, tags and inputs from a JSON source string', () => {
    const result = toWorkflowSummary({
      identifier: 'abc',
      name: 'Monthly sales report',
      source: JSON.stringify(reportSource),
    });
    expect(result.identifier).toBe('abc');
    expect(result.description).toBe('Builds the sales report for one month.');
    expect(result.tags).toEqual(['reports', 'sales']);
    expect(result.inputs.map((i) => i.name)).toEqual(['month', 'format', 'helper', 'total']);
  });

  it('marks a helper only when its source says helper: true', () => {
    const summaryOf = (source: object) => toWorkflowSummary({ identifier: 'h', name: 'H', source: JSON.stringify(source) });
    expect(summaryOf({ ...reportSource, helper: true }).helper).toBe(true);
    expect(summaryOf(reportSource)).not.toHaveProperty('helper');
    expect(summaryOf({ ...reportSource, helper: 'yes' })).not.toHaveProperty('helper');
  });

  it('keeps helper: true through validation, so installs and imports keep it', () => {
    const parsed = taskSchema.parse({ name: 'Data', description: 'Helper', helper: true, pipeline: { actions: [] } });
    expect(parsed.helper).toBe(true);
    expect(() => taskSchema.parse({ name: 'Data', description: 'Helper', helper: 'yes', pipeline: { actions: [] } })).toThrow(
      /task\.helper\.invalid/
    );
  });

  it('copes with a missing or unreadable source', () => {
    expect(toWorkflowSummary({ identifier: 'x', name: 'X', source: '{nope' })).toEqual({
      identifier: 'x',
      name: 'X',
      inputs: [],
    });
  });
});

describe('keywords', () => {
  it('drops short and filler words and plural endings', () => {
    expect(keywords('Give me the reports of April')).toEqual(['report', 'april']);
    expect(keywords('list all categories')).toEqual(['list', 'category']);
    expect(keywords('check the status of the analysis')).toEqual(['check', 'status', 'analysis']);
  });

  it('cuts common endings so related words match, and ignores "workflow"', () => {
    expect(keywords('run the deployment workflow')).toEqual(['deploy']);
    expect(keywords('deployed sites')).toEqual(['deploy', 'site']);
    expect(keywords('greeting cards')).toEqual(['greet', 'card']);
    // Too short a stem is left alone.
    expect(keywords('red sing')).toEqual(['red', 'sing']);
  });
});

describe('searchWorkflows', () => {
  const library = [
    summary('Weekly backup'),
    summary('Monthly sales report', { tags: ['reports'], description: 'Sales totals for one month' }),
    summary('Invoice sender', { description: 'Emails the monthly invoices' }),
    summary('Drupal cache check', { inputs: [{ name: 'siteUrl', type: 'string', label: 'Site URL' }] }),
  ];

  it('ranks name matches above description matches', () => {
    const result = searchWorkflows(library, 'monthly report');
    expect(result.matched).toBe(true);
    expect(result.workflows.map((w) => w.name)).toEqual(['Monthly sales report', 'Invoice sender']);
    expect(result.total).toBe(2);
  });

  it('matches input names and labels', () => {
    expect(searchWorkflows(library, 'site url').workflows[0].name).toBe('Drupal cache check');
  });

  it('matches input descriptions, below a name match', () => {
    const withDescribedInput = [
      summary('Monthly report', { inputs: [{ name: 'month', type: 'date', label: 'Month', description: "Which month's sales to report" }] }),
      summary('Sales dashboard'),
    ];
    const result = searchWorkflows(withDescribedInput, 'sales');
    expect(result.workflows.map((w) => w.name)).toEqual(['Sales dashboard', 'Monthly report']);
  });

  it('honours the limit', () => {
    expect(searchWorkflows(library, 'monthly', 1).workflows).toHaveLength(1);
  });

  it('falls back to the library by name, marked unmatched, when no keyword matches', () => {
    const result = searchWorkflows(library, 'annual salary of Maria');
    expect(result.matched).toBe(false);
    expect(result.total).toBe(4);
    expect(result.workflows.map((w) => w.name)).toEqual([
      'Drupal cache check',
      'Invoice sender',
      'Monthly sales report',
      'Weekly backup',
    ]);
  });

  it('lists everything as a match when there is no query', () => {
    const result = searchWorkflows(library, undefined);
    expect(result.matched).toBe(true);
    expect(result.workflows).toHaveLength(4);
  });
});

describe('hub workflow identifiers', () => {
  it('round-trips hub id and item identifier, including colons in the item', () => {
    const id = hubWorkflowId('h1', 'reports:monthly');
    expect(id).toBe('hub:h1:reports:monthly');
    expect(parseHubWorkflowId(id)).toEqual({ hubId: 'h1', itemIdentifier: 'reports:monthly' });
  });

  it('ignores installed identifiers and malformed ones', () => {
    expect(parseHubWorkflowId('abc123')).toBeNull();
    expect(parseHubWorkflowId('hub:')).toBeNull();
    expect(parseHubWorkflowId('hub:h1:')).toBeNull();
  });
});

describe('actionGroups', () => {
  it('collects groups from nested actions and condition statements', () => {
    const actions = [
      { group: 'string', name: 'upper' },
      { group: 'flow', name: 'loop', params: { actions: [{ group: 'drupal', name: 'get' }] } },
      { group: 'flow', name: 'if', params: { statements: [{ actions: [{ group: 'hubGreeting', name: 'hello' }] }] } },
    ];
    expect(actionGroups(actions).sort()).toEqual(['drupal', 'flow', 'hubGreeting', 'string']);
    expect(actionGroups(undefined as any)).toEqual([]);
  });
});

describe('searchWorkflows for a request that fits two workflows', () => {
  it('finds both deploy workflows for "the deployment workflow", so the model can ask which', () => {
    const library = [summary('Deploy app'), summary('Deploy website'), summary('Weekly backup')];
    const result = searchWorkflows(library, 'run the deployment workflow');
    expect(result.matched).toBe(true);
    expect(result.workflows.map((w) => w.name)).toEqual(['Deploy app', 'Deploy website']);
  });
});

describe('searchWorkflows and identifiers', () => {
  it('does not match a keyword inside a random identifier', () => {
    const library = [
      summary('Weekly backup', { identifier: 'xq7botk2LmR9vTz0aPwYc' }),
      summary('Traffic: Top IP addresses and bots'),
    ];
    expect(searchWorkflows(library, 'bots').workflows.map((w) => w.name)).toEqual([
      'Traffic: Top IP addresses and bots',
    ]);
  });
});

describe('searchWorkflows with hub workflows', () => {
  const hub = { id: 'h1', name: 'Team hub', itemIdentifier: 'sales', version: '1.0.0' };
  const library = [
    summary('Sales report', { identifier: 'hub:h1:sales', hub }),
    summary('Sales report', { identifier: 'local-sales' }),
    summary('Archive', { identifier: 'hub:h1:archive', hub: { ...hub, itemIdentifier: 'archive' } }),
    summary('Backup'),
  ];

  it('puts the installed workflow first when both match equally', () => {
    expect(searchWorkflows(library, 'sales report').workflows.map((w) => w.identifier)).toEqual([
      'local-sales',
      'hub:h1:sales',
    ]);
  });

  it('lists installed workflows before hub ones when nothing matches', () => {
    expect(searchWorkflows(library, 'payroll').workflows.map((w) => w.identifier)).toEqual([
      'backup',
      'local-sales',
      'hub:h1:archive',
      'hub:h1:sales',
    ]);
  });
});

describe('searchWorkflows with helpers', () => {
  const library = [
    summary('Data: Views and visits API for a customer', { identifier: 'data-views', helper: true }),
    summary('Traffic: Views and visits by month for a customer', { identifier: 'traffic-views' }),
    summary('Archive', { identifier: 'archive-data', helper: true }),
    summary('Backup'),
  ];

  it('puts the workflow that answers first when a helper matches as well', () => {
    expect(searchWorkflows(library, 'views and visits for a customer').workflows.map((w) => w.identifier)).toEqual([
      'traffic-views',
      'data-views',
    ]);
  });

  it('still ranks a helper first when it matches better, so drafts find it', () => {
    expect(searchWorkflows(library, 'views api').workflows[0].identifier).toBe('data-views');
  });

  it('lists helpers after the rest when nothing matches', () => {
    expect(searchWorkflows(library, 'payroll').workflows.map((w) => w.identifier)).toEqual([
      'backup',
      'traffic-views',
      'archive-data',
      'data-views',
    ]);
  });
});

describe('findabilityIssues', () => {
  const good = {
    name: 'Monthly sales report',
    source: JSON.stringify({
      description: 'Builds the sales report for one month.',
      tags: ['sales'],
      pipeline: { variables: [{ type: 'date', name: 'month', label: 'Month', description: 'First day', visibility: 'public' }] },
    }),
    metadata: null,
  };

  it('finds nothing wrong with a well-described workflow', () => {
    expect(findabilityIssues(good)).toEqual([]);
  });

  it('flags a draft as hidden, first', () => {
    expect(findabilityIssues({ ...good, metadata: '{"draft":true}' })).toEqual([{ code: 'draft', severity: 'hidden' }]);
  });

  it('flags a missing description and a generic name as important', () => {
    const issues = findabilityIssues({ name: 'Copy of Report', source: JSON.stringify({ tags: ['x'], pipeline: {} }) });
    expect(issues.map((i) => [i.code, i.severity])).toEqual([
      ['noDescription', 'important'],
      ['genericName', 'important'],
    ]);
  });

  it('flags a short description, no tags and inputs missing a label or description as minor', () => {
    const issues = findabilityIssues({
      name: 'Report',
      source: JSON.stringify({
        description: 'Makes a report.',
        pipeline: {
          variables: [
            { type: 'string', name: 'email', visibility: 'public' },
            { type: 'string', name: 'format', label: 'Format', visibility: 'public' },
            { type: 'string', name: 'internal', visibility: 'private' },
          ],
        },
      }),
    });
    expect(issues).toEqual([
      { code: 'shortDescription', severity: 'minor' },
      { code: 'noTags', severity: 'minor' },
      { code: 'inputsNeedDetail', severity: 'minor', inputs: ['email', 'Format'] },
    ]);
  });

  it.each(['New workflow', 'Untitled', 'Workflow 3', 'test', 'Report (copy)'])('treats "%s" as a generic name', (name) => {
    expect(findabilityIssues({ ...good, name }).map((i) => i.code)).toContain('genericName');
  });
});
