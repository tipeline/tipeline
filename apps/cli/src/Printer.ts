import chalk from 'chalk';
import Table from 'cli-table3';
import { createRequire } from 'module';
import { isActionErrorData } from '@tipeline/types';
import type { ActionErrorData } from '@tipeline/types';
import type { ChoiceOption, DraftOutcome, ReusedWorkflow, RunProposal, RunResult } from '@tipeline/agent';
import type { CapabilityReport, HubTaskPreview } from './CommandService';
import {
  describeCron,
  describeInterval,
  descriptionSummary,
  markdownToText,
  type MarkdownTextStyle,
} from '@tipeline/utils';

const require = createRequire(import.meta.url);
const validationMessages: Record<string, string> = require('@tipeline/i18n/locales/en/validation.json');
const capabilityLabels: Record<string, string> = require('@tipeline/i18n/locales/en/ui.json').capabilities.label;

// "files.write" → "Changes or deletes files", the words Desktop uses.
const capabilityLabel = (capability: string) =>
  capabilityLabels[capability.replace(/\.(\w)/g, (_, letter: string) => letter.toUpperCase())] ?? capability;

/** One line per capability: its name (review ones in yellow) and the steps that cause it. */
function capabilityLines(report: CapabilityReport | undefined): string[] {
  if (!report) return [];
  const lines = report.capabilities.map((entry) => {
    const steps = [
      ...new Set(entry.steps.map((step) => (step.workflow ? `${step.label} in ${step.workflow}` : step.label))),
    ];
    const name = capabilityLabel(entry.capability);
    return `${entry.review ? chalk.yellow(name) : name}${chalk.dim(` (${steps.join(', ')})`)}`;
  });
  if (report.unknownWorkflows.length > 0) {
    lines.push(chalk.dim(`Not included: ${report.unknownWorkflows.join(', ')} (not installed, or chosen while running)`));
  }
  return lines;
}

// Replaces any line matching a known validation key (e.g. "task.version.invalid",
// coming straight from core's raw Zod issues) with its English text. Lines that
// don't match a key (plain-English errors like "Task not found: x") pass through
// unchanged, so this is safe to run on every error message unconditionally.
function translateErrorMessage(message: string): string {
  return message
    .split('\n')
    .map((line) => validationMessages[line.trim()] ?? line)
    .join('\n');
}

const MAX_WIDTH = Math.min(process.stdout.columns || 80, 100);

// Descriptions are Markdown; `workflow info` shows them with terminal styling.
const TERMINAL_MARKDOWN: MarkdownTextStyle = {
  strong: (text) => chalk.bold(text),
  em: (text) => chalk.italic(text),
  code: (text) => chalk.cyan(text),
  heading: (text) => chalk.bold.underline(text),
  link: (text, href) =>
    !text || text === href ? chalk.underline(href) : `${chalk.underline(text)} ${chalk.dim(`(${href})`)}`,
};

/** The closing box of a run, by how it ended (no status from Core means it completed). */
const TASK_END_STYLES: Record<string, { color: typeof chalk.green; icon: string; label: string; hint?: string }> = {
  completed: { color: chalk.green, icon: '✔', label: 'Finished' },
  failed: { color: chalk.red, icon: '✖', label: 'Failed' },
  canceled: { color: chalk.yellow, icon: '■', label: 'Canceled' },
  paused: {
    color: chalk.yellow,
    icon: '⏸',
    label: 'Paused',
    hint: 'Waiting for an approval. Decide with: tipeline pipeline approve (or reject)',
  },
};

function hline(char = '─', width = MAX_WIDTH): string {
  return char.repeat(width);
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ` +
      `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`
    );
  }
  // Both SQLite's "YYYY-MM-DD HH:MM:SS" and ISO strings already represent UTC wall-clock time,
  // so just normalize the separator/strip millis+offset rather than re-parsing as local time.
  const match = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : value;
}

function flattenActionDefs(actions: any[], map: Record<string, string> = {}): Record<string, string> {
  if (!Array.isArray(actions)) return map;

  actions.forEach((action) => {
    if (action?.identifier && action.group && action.name) {
      map[action.identifier] = `${action.group}.${action.name}`;
    }
    if (Array.isArray(action?.params?.actions)) {
      flattenActionDefs(action.params.actions, map);
    }
    if (Array.isArray(action?.params?.statements)) {
      action.params.statements.forEach((stmt: any) => {
        if (Array.isArray(stmt?.actions)) flattenActionDefs(stmt.actions, map);
      });
    }
  });

  return map;
}

function statusBadge(status: string | undefined): string {
  const styles: Record<string, (s: string) => string> = {
    completed: (s) => chalk.green(`✓ ${s}`),
    failed: (s) => chalk.red(`✖ ${s}`),
    running: (s) => chalk.blue(`▶ ${s}`),
    pending: (s) => chalk.yellow(`○ ${s}`),
    paused: (s) => chalk.yellow(`⏸ ${s}`),
    canceled: (s) => chalk.dim(`⊘ ${s}`),
  };
  const fn = styles[(status ?? '').toLowerCase()] ?? ((s: string) => s);
  return fn(status ?? '');
}

function failureReason(metadata: any): string | null {
  if (!metadata?.reason) return null;
  if (metadata.reason === 'crashed') return 'Crashed — safe to resume';
  if (metadata.reason === 'action_error') return metadata.message ? `Error: ${metadata.message}` : 'Action error';
  // Canceled: by someone (user_canceled), or by a rejected approval — the message says who.
  if (metadata.reason === 'user_canceled' || metadata.reason === 'approval_rejected')
    return metadata.message ?? null;
  return null;
}

function failureReasonTag(metadata: any): string | null {
  if (metadata?.reason === 'crashed') return 'crashed';
  if (metadata?.reason === 'action_error') return 'action error';
  if (metadata?.reason === 'user_canceled')
    return metadata.canceledBy ? `by ${metadata.canceledBy}` : null;
  if (metadata?.reason === 'approval_rejected') return 'rejected';
  return null;
}

const explainsStatus = (status: string) => status === 'failed' || status === 'canceled';

function wrapText(text: string, maxLen: number): string[] {
  const lines: string[] = [];
  text.split('\n').forEach((line) => {
    if (line.length <= maxLen) {
      lines.push(line);
    } else {
      for (let i = 0; i < line.length; i += maxLen) {
        lines.push(line.slice(i, i + maxLen));
      }
    }
  });
  return lines.length ? lines : [''];
}

export default class Printer {
  static printTaskList(data: any) {
    if (!Array.isArray(data) || data.length === 0) {
      Printer.printMessage('No workflows found.');
      return;
    }

    const table = new Table({
      head: [
        'Identifier',
        'Name',
        'Description',
        'Author',
        'Version',
        'Created',
      ],
      colWidths: [28, 20, 30, 20, 10, 22],
      wordWrap: true,
      style: { head: ['cyan'], border: ['dim'] },
    });

    data.forEach((task) => {
      table.push([
        chalk.yellow(task.identifier ?? ''),
        chalk.bold.white(task.name ?? ''),
        chalk.dim(truncate(descriptionSummary(task.description), 28)),
        task.author ?? '',
        chalk.cyan(task.version ?? ''),
        chalk.dim(formatDate(task.created_at)),
      ]);
    });

    console.log('\n  ' + chalk.bold.white('Workflows') + '\n' + chalk.dim(hline()));
    console.log(table.toString());
  }

  static printTaskInfo(task: any) {
    let actionCount = 0;
    let variableCount = 0;
    if (task.source) {
      try {
        const parsed = typeof task.source === 'string' ? JSON.parse(task.source) : task.source;
        actionCount = parsed?.pipeline?.actions?.length ?? 0;
        variableCount = parsed?.pipeline?.variables?.length ?? 0;
      } catch {
        // ignore malformed source
      }
    }

    const table = new Table({
      colWidths: [14, MAX_WIDTH - 16],
      wordWrap: true,
      style: { border: ['dim'] },
    });

    table.push(
      [chalk.dim('identifier'), chalk.yellow(task.identifier ?? '')],
      [chalk.dim('name'), chalk.bold.white(task.name ?? '')],
      [chalk.dim('description'), markdownToText(task.description, TERMINAL_MARKDOWN)],
      [chalk.dim('author'), task.author ?? ''],
      [chalk.dim('version'), chalk.cyan(task.version ?? '')],
      [chalk.dim('tags'), Array.isArray(task.tags) && task.tags.length ? task.tags.join(', ') : ''],
      [chalk.dim('source'), task.source_type ?? ''],
      [chalk.dim('projects'), Array.isArray(task.projects) ? task.projects.map((p: any) => p.name).join(', ') : ''],
      [chalk.dim('actions'), String(actionCount)],
      [chalk.dim('variables'), String(variableCount)],
      ...(task.capabilities
        ? [[chalk.dim('can access'), capabilityLines(task.capabilities).join('\n') || chalk.dim('Only works with data')]]
        : []),
      [chalk.dim('created'), chalk.dim(formatDate(task.created_at))],
      [chalk.dim('updated'), chalk.dim(formatDate(task.updated_at))]
    );

    console.log('\n  ' + chalk.bold.white('Workflow') + '\n' + chalk.dim(hline()));
    console.log(table.toString());
  }

  static printPipelineList(data: any) {
    if (!Array.isArray(data) || data.length === 0) {
      Printer.printMessage('No pipelines found.');
      return;
    }

    const table = new Table({
      head: ['Identifier', 'Status', 'Started at', 'Finished at'],
      colWidths: [28, 16, 24, 24],
      wordWrap: true,
      style: { head: ['cyan'], border: ['dim'] },
    });

    data.forEach((pipeline) => {
      const tag = explainsStatus(pipeline.status) ? failureReasonTag(pipeline.metadata) : null;
      const status = tag
        ? `${statusBadge(pipeline.status)}\n${chalk.dim(`(${tag})`)}`
        : statusBadge(pipeline.status);
      table.push([
        chalk.yellow(pipeline.identifier ?? ''),
        status,
        chalk.dim(formatDate(pipeline.started_at)),
        chalk.dim(formatDate(pipeline.finished_at)),
      ]);
    });

    console.log(
      '\n  ' + chalk.bold.white('Pipelines') + '\n' + chalk.dim(hline())
    );
    console.log(table.toString());
  }

  static printPipelineInfo(pipeline: any) {
    const header = new Table({
      colWidths: [14, MAX_WIDTH - 16],
      style: { border: ['dim'] },
    });

    const reason = explainsStatus(pipeline.status) ? failureReason(pipeline.metadata) : null;

    header.push(
      [chalk.dim('identifier'), chalk.yellow(pipeline.identifier ?? '')],
      [chalk.dim('status'), statusBadge(pipeline.status)],
      ...(reason ? [[chalk.dim('reason'), chalk.dim(reason)]] : []),
      [chalk.dim('started'), chalk.dim(formatDate(pipeline.started_at))],
      [chalk.dim('finished'), chalk.dim(formatDate(pipeline.finished_at))]
    );

    console.log('\n  ' + chalk.bold.white('Pipeline') + '\n' + chalk.dim(hline()));
    console.log(header.toString());

    const actions = Array.isArray(pipeline.actions) ? pipeline.actions : [];
    if (actions.length === 0) {
      Printer.printMessage('No actions recorded for this pipeline.');
      return;
    }

    let actionLabels: Record<string, string> = {};
    if (pipeline.source) {
      try {
        const parsed = typeof pipeline.source === 'string' ? JSON.parse(pipeline.source) : pipeline.source;
        actionLabels = flattenActionDefs(parsed?.pipeline?.actions ?? []);
      } catch {
        // ignore malformed source
      }
    }

    const table = new Table({
      head: ['#', 'Action', 'Status', 'Started at', 'Finished at'],
      colWidths: [4, 24, 14, 22, 22],
      wordWrap: true,
      style: { head: ['cyan'], border: ['dim'] },
    });

    actions.forEach((action: any, idx: number) => {
      table.push([
        String(idx + 1),
        chalk.white(actionLabels[action.identifier] ?? action.identifier ?? ''),
        statusBadge(action.status),
        chalk.dim(formatDate(action.started_at)),
        chalk.dim(formatDate(action.finished_at)),
      ]);
    });

    console.log(table.toString());

    const failed = actions.filter((a: any) => a.status === 'failed' && a.error);
    if (failed.length > 0) {
      console.log('\n  ' + chalk.bold.red('Errors'));
      failed.forEach((a: any) => {
        const label = actionLabels[a.identifier] ?? a.identifier;
        console.log('  ' + chalk.yellow(label) + chalk.dim('  →  ') + chalk.white(a.error));
      });
      console.log('');
    }
  }

  static printTaskStart(task: any, verbose = false) {
    const iw = MAX_WIDTH - 2;
    const descWidth = iw - 1;
    const prefixLen = 23;
    const name = truncate(task.name, iw - prefixLen);
    const padding = ' '.repeat(Math.max(0, iw - prefixLen - name.length));

    console.log('\n' + chalk.blue('╭' + hline('─', iw) + '╮'));
    console.log(
      chalk.blue('│') +
        chalk.bold(' ▶') +
        chalk.dim('  Starting workflow: ') +
        chalk.bold.yellow(name) +
        padding +
        chalk.blue('│')
    );
    if (task.description) {
      const emptyPad = ' '.repeat(iw);
      console.log(chalk.blue('│') + emptyPad + chalk.blue('│'));
      const lines = verbose
        ? wrapText(markdownToText(task.description), descWidth)
        : [truncate(descriptionSummary(task.description), descWidth)];
      lines.forEach((line) => {
        const linePad = ' '.repeat(Math.max(0, descWidth - line.length));
        console.log(chalk.blue('│') + ' ' + chalk.dim(line) + linePad + chalk.blue('│'));
      });
    }
    console.log(chalk.blue('╰' + hline('─', iw) + '╯') + '\n');
  }

  static printTaskEnd(task: any, verbose = false) {
    const { color, icon, label, hint } = TASK_END_STYLES[task.status] ?? TASK_END_STYLES.completed;
    const iw = MAX_WIDTH - 2;
    const descWidth = iw - 1;
    const prefix = `  ${label} workflow: `;
    const name = truncate(task.name, iw - 2 - prefix.length);
    const padding = ' '.repeat(Math.max(0, iw - 2 - prefix.length - name.length));

    console.log('\n' + color('╭' + hline('─', iw) + '╮'));
    console.log(
      color('│') +
        color.bold(` ${icon}`) +
        chalk.dim(prefix) +
        chalk.bold.yellow(name) +
        padding +
        color('│')
    );
    if (task.description) {
      const emptyPad = ' '.repeat(iw);
      console.log(color('│') + emptyPad + color('│'));
      const lines = verbose
        ? wrapText(markdownToText(task.description), descWidth)
        : [truncate(descriptionSummary(task.description), descWidth)];
      lines.forEach((line) => {
        const linePad = ' '.repeat(Math.max(0, descWidth - line.length));
        console.log(color('│') + ' ' + chalk.dim(line) + linePad + color('│'));
      });
    }
    console.log(color('╰' + hline('─', iw) + '╯') + '\n');
    if (hint) console.log(chalk.dim(`  ${hint} ${task.pipelineIdentifier}\n`));
  }

  static printAction(data: any, verbose: boolean) {
    if (verbose) {
      console.log('  ' + chalk.bold.cyan(data.name));

      if (data.params && Object.keys(data.params).length > 0) {
        Object.entries(data.params).forEach(([key, value]) => {
          if (typeof value === 'string' && value.includes('\n')) {
            const lines = value.split('\n');
            if (lines[lines.length - 1] === '') lines.pop();
            console.log('  ' + chalk.dim('├─ ') + chalk.dim(key + ':'));
            lines.forEach((line: string) => {
              console.log('  ' + chalk.dim('│   ') + chalk.white(line));
            });
          } else {
            const val = truncate(JSON.stringify(value), 200);
            console.log(
              '  ' + chalk.dim('├─ ') + chalk.dim(key + ':') + ' ' + chalk.white(val)
            );
          }
        });
      }

      if (typeof data.result === 'string' && data.result.includes('\n')) {
        const lines = data.result.split('\n');
        if (lines[lines.length - 1] === '') lines.pop();
        console.log('  ' + chalk.dim('└─ ') + chalk.green('✓ ') + chalk.dim('result:'));
        lines.forEach((line: string) => {
          console.log('      ' + chalk.white(line));
        });
        console.log('');
      } else {
        const formattedResult =
          typeof data.result === 'object' ? JSON.stringify(data.result) : String(data.result);
        console.log(
          '  ' +
            chalk.dim('└─ ') +
            chalk.green('✓ ') +
            chalk.dim('result: ') +
            chalk.white(formattedResult) +
            '\n'
        );
      }
    } else {
      const result = this.formatCompactResult(data.result);
      console.log(
        '  ' +
          chalk.green('✓') +
          '  ' +
          chalk.bold.white(data.name) +
          (data.cached ? '  ' + chalk.magenta('cached') : '') +
          '  ' +
          chalk.dim('→ ') +
          chalk.dim(result)
      );
    }
  }

  static printCacheList(data: {
    entries: Array<{
      kind: 'action' | 'workflow';
      owner: string | null;
      label: string;
      sizeBytes: number;
      hits: number;
      createdAt: string;
      expiresAt: string;
    }>;
    count: number;
    sizeBytes: number;
    maxSizeBytes: number;
  }) {
    if (!data?.entries?.length) {
      this.printMessage('Nothing is cached.');
      return;
    }
    const table = new Table({
      head: ['What', 'Workflow', 'Size', 'Hits', 'Stored', 'Expires'].map((h) => chalk.bold(h)),
      style: { head: [], border: ['dim'] },
      wordWrap: true,
    });
    for (const entry of data.entries) {
      table.push([
        entry.kind === 'workflow' ? chalk.yellow(entry.label) + chalk.dim(' (outputs)') : entry.label,
        chalk.dim(entry.owner ?? ''),
        formatBytes(entry.sizeBytes),
        String(entry.hits),
        chalk.dim(formatDate(entry.createdAt)),
        chalk.dim(formatDate(entry.expiresAt)),
      ]);
    }
    console.log(table.toString());
    console.log(
      chalk.dim(
        `  ${data.count} cached result(s), ${formatBytes(data.sizeBytes)} of ${formatBytes(data.maxSizeBytes)}`
      )
    );
  }

  private static formatCompactResult(result: any, maxLength = 100): string {
    const str =
      typeof result === 'object' ? JSON.stringify(result) : String(result);
    if (str.length > maxLength) {
      return str.slice(0, maxLength) + chalk.gray(' … (-v for full output)');
    }
    return str;
  }

  static printStatus(data: {
    status: string;
    pid: number;
    uptime: number;
    version?: string;
    cliVersion?: string;
    connectedTo?: string;
  }) {
    const isRunning = data.status === 'running';
    const statusText = isRunning
      ? chalk.green(`● ${data.status}`)
      : chalk.yellow(`○ ${data.status}`);

    const table = new Table({
      colWidths: [14, Math.max(24, Math.min(MAX_WIDTH - 17, (data.connectedTo?.length ?? 0) + 2))],
      wordWrap: true,
      style: { border: ['dim'] },
    });

    table.push(
      ...(data.connectedTo ? [[chalk.dim('connected to'), chalk.white(data.connectedTo)]] : []),
      [chalk.dim('status'), statusText],
      [chalk.dim('pid'), chalk.white(String(data.pid))],
      [chalk.dim('uptime'), chalk.white(`${(data.uptime ?? 0).toFixed(2)}s`)],
      [chalk.dim('cli'), chalk.white(data.cliVersion ?? 'unknown')],
      [chalk.dim('core'), chalk.white(data.version ?? 'unknown')]
    );

    console.log('\n  ' + chalk.bold.white('Service Status'));
    console.log(table.toString());
  }

  static printAgentAnswer(text: string) {
    console.log('\n' + indent(markdownToText(text, TERMINAL_MARKDOWN)) + '\n');
  }

  /** The workflow the agent picked and the values it will run with; missing required ones are flagged. */
  static printAgentProposal(proposal: RunProposal, values: Record<string, unknown>, message: string) {
    if (message) console.log('\n' + indent(markdownToText(message, TERMINAL_MARKDOWN)));
    console.log('\n  ' + chalk.bold(proposal.name) + chalk.dim(`  ${proposal.identifier}`));
    for (const input of proposal.inputs) {
      const value = values[input.name];
      const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
      const shown = empty
        ? input.required
          ? chalk.yellow('needed')
          : chalk.dim('—')
        : chalk.white(typeof value === 'string' ? value : JSON.stringify(value));
      const fromRequest = Object.prototype.hasOwnProperty.call(proposal.variables, input.name);
      console.log(`  ${chalk.dim((input.label ?? input.name).padEnd(18))} ${shown}${fromRequest ? chalk.blue('  from your request') : ''}`);
    }
    if (proposal.alternatives.length > 0) {
      console.log(chalk.dim(`\n  Also possible: ${proposal.alternatives.map((a) => a.name).join(', ')}`));
    }
    console.log('');
  }

  /** No workflow fits: what the assistant says, and the workflow it would draft. */
  static printAgentNoMatch(message: string, request: string, reuse: ReusedWorkflow[] = [], schedule?: string) {
    console.log('\n' + indent(markdownToText(message, TERMINAL_MARKDOWN)));
    console.log('\n  ' + chalk.bold('Workflow to draft'));
    console.log(indent(chalk.dim(request), '    '));
    if (schedule) {
      console.log('\n  ' + chalk.bold('Runs on its own') + '  ' + schedule);
      console.log(chalk.dim('    Proposed with the draft; off until you mark it ready.'));
    }
    if (reuse.length > 0) {
      console.log('\n  ' + chalk.bold('Uses your workflows'));
      for (const workflow of reuse) {
        if (workflow.hub) {
          console.log(`    - ${workflow.name}` + chalk.yellow(`  on ${workflow.hub.name}, not installed`));
          console.log(chalk.dim(`      tipeline hub install workflow ${workflow.hub.id} ${workflow.hub.itemIdentifier}`));
        } else {
          console.log(`    - ${workflow.name}` + chalk.dim(`  ${workflow.identifier}`));
        }
      }
      if (reuse.some((w) => w.hub)) {
        console.log(chalk.dim("    Install it first to reuse it. If you don't, the draft builds that part itself."));
      }
    }
    console.log('');
  }

  /** The saved draft and what's left to do. */
  static printAgentDraft(draft: Extract<DraftOutcome, { kind: 'drafted' }>) {
    const incomplete = draft.incomplete ?? [];
    const mark = incomplete.length > 0 ? chalk.yellow('!') : chalk.green('✓');
    const badge = incomplete.length > 0 ? chalk.yellow('  incomplete draft') : chalk.yellow('  draft');
    console.log('\n  ' + mark + ' ' + chalk.bold(draft.name) + badge + chalk.dim(`  ${draft.identifier}`));
    if (incomplete.length > 0) {
      console.log('\n  ' + chalk.yellow.bold('Not included'));
      for (const part of incomplete) console.log(`    - ${part}`);
    }
    if (draft.summary) console.log('\n' + indent(markdownToText(draft.summary, TERMINAL_MARKDOWN)));
    if (draft.todos.length > 0) {
      console.log('\n  ' + chalk.bold('Still to do'));
      for (const todo of draft.todos) console.log(`    - ${todo}`);
    }
    if (draft.schedule) {
      console.log('\n  ' + chalk.bold('Proposed schedule') + '  ' + Printer.scheduleWhen(draft.schedule));
      console.log(chalk.dim('    Off until you mark the draft ready in Desktop and choose to turn it on.'));
    }
    console.log(
      chalk.dim('\n  Open it in the Desktop builder to test it, then mark it ready. Until then only a direct run starts it.\n')
    );
  }

  /** Drafting stopped before writing: what can't be done, and what the rest would do. */
  static printAgentDraftGap(missing: string[], possible: string) {
    console.log('\n  ' + chalk.yellow.bold("It can't do all of this"));
    for (const part of missing) console.log(`    - ${part}`);
    if (possible) console.log(chalk.dim(`\n    Without it, the workflow would: ${possible}`));
    console.log('');
  }

  /** A "which one?" question with numbered options. */
  static printAgentChoice(question: string, options: ChoiceOption[]) {
    console.log('\n  ' + chalk.bold(question || 'Which one do you mean?'));
    options.forEach((option, i) => {
      const from = option.hub ? chalk.dim(`  from ${option.hub.name} · not installed`) : '';
      console.log(`  ${chalk.blue(String(i + 1))}. ${chalk.white(option.name)}${from}`);
      if (option.description) console.log(`     ${chalk.dim(option.description)}`);
    });
    console.log('');
  }

  /** A hub workflow before it's installed: where it's from and the values the agent read. */
  static printAgentHubProposal(proposal: RunProposal, preview: HubTaskPreview, message: string) {
    if (message) console.log('\n' + indent(markdownToText(message, TERMINAL_MARKDOWN)));
    console.log('\n  ' + chalk.bold(proposal.name) + chalk.dim(`  from ${proposal.hub?.name} · not installed`));
    if (preview.description) console.log('  ' + chalk.dim(preview.description));
    for (const input of preview.inputs) {
      if (!Object.prototype.hasOwnProperty.call(proposal.variables, input.name)) continue;
      const value = proposal.variables[input.name];
      console.log(`  ${chalk.dim((input.label ?? input.name).padEnd(18))} ${typeof value === 'string' ? value : JSON.stringify(value)}${chalk.blue('  from your request')}`);
    }
    const capabilities = capabilityLines(preview.capabilities);
    if (capabilities.length > 0) {
      console.log('\n  ' + chalk.dim('This workflow can access:'));
      capabilities.forEach((line) => console.log('    ' + line));
    }
    console.log('');
  }

  /** The model's short answer, then the run line and every public output. */
  static printAgentResult(workflowName: string, result: RunResult, answer: string) {
    if (answer) console.log('\n' + indent(markdownToText(answer, TERMINAL_MARKDOWN)));
    const icon =
      result.status === 'completed' ? chalk.green('✓') : result.status === 'failed' ? chalk.red('✕') : chalk.yellow('●');
    const seconds = (result.durationMs / 1000).toFixed(1);
    console.log(`\n  ${icon} ${chalk.bold(workflowName)} ${chalk.dim(`${result.status} · ${seconds} s`)}`);
    if (result.pipelineIdentifier) console.log(chalk.dim(`    run ${result.pipelineIdentifier}`));
    if (result.error) console.log('    ' + chalk.red(result.error));
    for (const [name, value] of Object.entries(result.outputs ?? {})) {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      const short = text.length > 200 ? `${text.slice(0, 200)}…` : text;
      const label = result.outputDetails?.[name]?.label ?? name;
      console.log(`    ${chalk.dim(label.padEnd(16))} ${short}`);
    }
    console.log('');
  }

  static printMessage(message: string) {
    console.log(
      '\n  ' + chalk.bold.blue('ℹ') + '  ' + chalk.white(message) + '\n'
    );
  }

  static printError(error: string | ActionErrorData | Error | undefined | null) {
    if (isActionErrorData(error)) {
      Printer.printActionError(error);
      return;
    }

    const rawMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : error !== undefined && error !== null
            ? JSON.stringify(error, null, 2)
            : String(error);
    const message = translateErrorMessage(rawMessage);

    const iw = MAX_WIDTH - 2;
    const textWidth = iw - 4;
    const header = '  ✖  Error';
    const errorLines = wrapText(message, textWidth);

    console.log('\n' + chalk.red('╭' + hline('─', iw) + '╮'));
    const headerPad = ' '.repeat(Math.max(0, iw - header.length));
    console.log(chalk.red('│') + chalk.bold.red(header) + headerPad + chalk.red('│'));
    console.log(chalk.red('├' + hline('─', iw) + '┤'));

    errorLines.forEach((line) => {
      const content = '  ' + line;
      const linePad = ' '.repeat(Math.max(0, iw - content.length));
      console.log(chalk.red('│') + chalk.white(content) + linePad + chalk.red('│'));
    });

    console.log(chalk.red('╰' + hline('─', iw) + '╯'));

    if (error instanceof Error && error.stack) {
      console.log('\n' + chalk.dim('  Stack trace:'));
      console.log(chalk.dim(error.stack) + '\n');
    }
  }

  /** A schedule in words: "At 09:00, Monday through Friday (0 9 * * 1-5)" or "Once, Thu 23 Oct 08:00". */
  static scheduleWhen(entry: { cron?: string | null; runAt?: string | null; everySeconds?: number | null }): string {
    if (entry.cron) return `${describeCron(entry.cron)} (${entry.cron})`;
    if (entry.everySeconds) return describeInterval(entry.everySeconds);
    if (entry.runAt) return `Once, ${Printer.formatScheduleTime(entry.runAt)}`;
    return '—';
  }

  private static formatScheduleTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  static printApprovalList(approvals: any[]) {
    if (approvals.length === 0) {
      Printer.printMessage('Nothing is waiting for an approval.');
      return;
    }
    for (const approval of approvals) {
      console.log(`\n  ${chalk.yellow('⏸')} ${chalk.bold(approval.title || 'Approval')}  ${chalk.dim(approval.workflowName ?? '')}`);
      console.log(chalk.dim(`    run       ${approval.pipelineIdentifier}`));
      console.log(chalk.dim(`    asked     ${formatDate(approval.requestedAt)}`));
      if (approval.expiresAt) {
        const onTimeout = approval.onTimeout === 'approve' ? 'approved' : 'rejected';
        console.log(chalk.dim(`    expires   ${formatDate(approval.expiresAt)} (then ${onTimeout})`));
      }
      if (approval.details) {
        const details = typeof approval.details === 'string' ? approval.details : JSON.stringify(approval.details);
        console.log(`    ${truncate(details, MAX_WIDTH - 4)}`);
      }
    }
    console.log(chalk.dim('\n  Decide with: tipeline pipeline approve <run>, or reject <run>. Add --comment to say why.\n'));
  }

  static printScheduleList(data: any) {
    if (!Array.isArray(data) || data.length === 0) {
      console.log(chalk.dim('No schedules configured.'));
      return;
    }

    const table = new Table({
      head: ['Schedule ID', 'Workflow', 'When', 'Next run'],
      colWidths: [24, 24, 40, 20],
      wordWrap: true,
      style: { head: ['cyan'], border: ['dim'] },
    });

    data.forEach((entry: any) => {
      const done = entry.runAt && entry.lastRunAt && !entry.enabled;
      const next = entry.nextRunAt
        ? Printer.formatScheduleTime(entry.nextRunAt)
        : chalk.dim(done ? 'done' : 'paused');
      table.push([
        entry.scheduleIdentifier ?? '—',
        entry.taskName ?? entry.taskIdentifier ?? '—',
        Printer.scheduleWhen(entry),
        next,
      ]);
    });

    console.log(table.toString());
  }

  private static printActionError(data: ActionErrorData) {
    const iw = MAX_WIDTH - 2;
    const textWidth = iw - 4;
    const header = '  ✖  Error';
    const tag = `  ${data.group}.${data.action}`;
    const headerPad = ' '.repeat(Math.max(0, iw - header.length - tag.length));

    console.log('\n' + chalk.red('╭' + hline('─', iw) + '╮'));
    console.log(
      chalk.red('│') + chalk.bold.red(header) + headerPad + chalk.dim(tag) + chalk.red('│')
    );
    console.log(chalk.red('├' + hline('─', iw) + '┤'));

    if (data.issues.length > 0) {
      data.issues.forEach((issue) => {
        const label = issue.path
          ? chalk.yellow(`  ${issue.path}`) + chalk.dim('  →  ') + chalk.white(issue.message)
          : chalk.white('  ' + issue.message);
        // Measure visible length (strip chalk for padding calc)
        const visibleLen = (issue.path ? `  ${issue.path}  →  ${issue.message}` : `  ${issue.message}`).length;
        const linePad = ' '.repeat(Math.max(0, iw - visibleLen));
        console.log(chalk.red('│') + label + linePad + chalk.red('│'));
      });
    } else {
      wrapText(data.message, textWidth).forEach((line) => {
        const content = '  ' + line;
        const linePad = ' '.repeat(Math.max(0, iw - content.length));
        console.log(chalk.red('│') + chalk.white(content) + linePad + chalk.red('│'));
      });
    }

    console.log(chalk.red('╰' + hline('─', iw) + '╯'));
  }
}

function indent(text: string, by = '  '): string {
  return text
    .split('\n')
    .map((line) => (line ? by + line : line))
    .join('\n');
}
