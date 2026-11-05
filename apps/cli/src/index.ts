#!/usr/bin/env node

import { maskDashIdentifiers, unmaskDashIdentifiers } from './dashIdentifiers';
import { Command } from 'commander';
import { createRequire } from 'module';
import CommandService from './CommandService';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();
program.name('tipeline').version(version).description('Tipeline CLI');

// Core Commands
program
  .command('install')
  .description('Initialize Tipeline folders and configuration')
  .option('--force', 'Overwrite existing configuration')
  .action((options) => CommandService.install(options));

program
  .command('start')
  .description('Start Tipeline service')
  .action(() => CommandService.start());

program
  .command('stop')
  .description('Stop Tipeline service')
  .option('--force', 'Kill all server processes without IPC (use when core is unresponsive)')
  .option('--remote', 'Stop the active remote core instead of the one on this machine')
  .action((options) => CommandService.stop(options));

program
  .command('status')
  .description('Show Tipeline service status')
  .action(() => CommandService.status());

const service = program
  .command('service')
  .description('Start Tipeline at login and after a crash');

service
  .command('install')
  .description('Turn auto-start on')
  .action(() => CommandService.service('install'));

service
  .command('uninstall')
  .description('Turn auto-start off (a running Core keeps running)')
  .action(() => CommandService.service('uninstall'));

service
  .command('status')
  .description('Show whether auto-start is on')
  .action(() => CommandService.service('status'));

// Workflow Commands — 'task' and 't' kept as aliases for existing scripts
const task = program
  .command('workflow')
  .aliases(['w', 'task', 't'])
  .description('Manage Tipeline workflows');

task
  .command('list')
  .description('List all installed workflows')
  .action(() => CommandService.taskList());

task
  .command('run')
  .description('Run a workflow without installing')
  .argument('<source>', 'Workflow name or path to YAML file')
  .option('-v, --verbose', 'Show detailed action information')
  .option('--var <pairs...>', 'Override variables (format: key=value)')
  .option('--no-cache', 'Run every step, without reading or writing cached results')
  .option('--refresh-cache', 'Run every step and replace its cached result')
  .action((source, options) => CommandService.taskRun(source, options));

task
  .command('exec')
  .description('Execute an installed workflow')
  .argument('<workflow-identifier>', 'Installed workflow identifier')
  .option('-v, --verbose', 'Show detailed action information')
  .option('--var <pairs...>', 'Override variables (format: key=value)')
  .option('--no-cache', 'Run every step, without reading or writing cached results')
  .option('--refresh-cache', 'Run every step and replace its cached result')
  .action((taskIdentifier, options) =>
    CommandService.taskExec(taskIdentifier, options)
  );

task
  .command('reload')
  .description('Reload workflow metadata and actions from a YAML file')
  .argument('<workflow-identifier>', 'Installed workflow identifier')
  .argument('<path-to-yaml>', 'Path to YAML file')
  .action((identifier, path) => CommandService.taskReload(identifier, path));

task
  .command('export')
  .description('Export workflow YAML to a file')
  .argument('<workflow-identifier>', 'Installed workflow identifier')
  .option('--output <path>', 'Output file or folder (defaults to <workflow-name>.yml in the current directory)')
  .option('--include-secrets', 'Also write secret values, in plain text')
  .action((taskIdentifier, options) => CommandService.taskExport(taskIdentifier, options));

task
  .command('export-all')
  .description('Export all installed workflows as a zip archive of YAML files')
  .option('--output <path>', 'Output zip file path (defaults to tipeline-workflows-export-<timestamp>.zip)')
  .option('--include-secrets', 'Also write secret values, in plain text')
  .action((options) => CommandService.taskExportAll(options));

task
  .command('validate')
  .description('Validate workflow YAML file')
  .argument('<path-to-yaml>', 'Path to YAML file')
  .action((path) => CommandService.taskValidate(path));

task
  .command('install')
  .description('Install workflow into the database')
  .argument('<path-to-yaml>', 'Path to YAML file')
  .action((path) => CommandService.taskInstall(path));

task
  .command('uninstall')
  .description('Uninstall a workflow from the database')
  .argument('<workflow-identifier>', 'Installed workflow identifier')
  .action((taskIdentifier) => CommandService.taskUninstall(taskIdentifier));

task
  .command('info')
  .description('Show workflow details')
  .argument('<workflow-identifier>', 'Installed workflow identifier')
  .action((taskIdentifier) => CommandService.taskInfo(taskIdentifier));

task
  .command('history')
  .description('Show workflow execution history')
  .argument('<workflow-identifier>', 'Installed workflow identifier')
  .action((taskIdentifier) => CommandService.taskHistory(taskIdentifier));

// Pipeline Commands
const pipeline = program.command('pipeline').description('Manage pipelines');

pipeline
  .command('list')
  .description('List all pipelines')
  .argument('<workflow-identifier>', `Pipeline's workflow identifier`)
  .action((taskIdentifier) => CommandService.pipelineList(taskIdentifier));

pipeline
  .command('info')
  .description('Show pipeline details')
  .argument('<pipeline-id>', 'Pipeline identifier')
  .action((pipelineId) => CommandService.pipelineInfo(pipelineId));

pipeline
  .command('clear')
  .description('Delete all runs for a workflow (running runs are kept)')
  .argument('<workflow-identifier>', `Workflow identifier`)
  .action((taskIdentifier) => CommandService.pipelineClear(taskIdentifier));

pipeline
  .command('cancel')
  .description('Cancel a run: it ends right away, including the step running now')
  .argument('<pipeline-id>', 'Pipeline identifier')
  .action((pipelineId) => CommandService.pipelineCancel(pipelineId));

pipeline
  .command('retention')
  .description('Show how long finished runs are kept, or set it (a number of days, or "off")')
  .argument('[days]', 'Days to keep finished runs, or "off" to keep them forever')
  .action((days) => CommandService.runRetention(days));

pipeline
  .command('approvals')
  .description('List runs waiting for an approval')
  .action(() => CommandService.approvalList());

pipeline
  .command('approve')
  .description('Approve a run waiting for an approval; it carries on')
  .argument('<pipeline-id>', 'Pipeline identifier')
  .option('--comment <text>', 'Why, kept with the decision')
  .action((pipelineId, options) => CommandService.approvalDecide(pipelineId, true, options));

pipeline
  .command('reject')
  .description('Reject a run waiting for an approval; it ends as canceled')
  .argument('<pipeline-id>', 'Pipeline identifier')
  .option('--comment <text>', 'Why, kept with the decision')
  .action((pipelineId, options) => CommandService.approvalDecide(pipelineId, false, options));

pipeline
  .command('resume')
  .description('Resume pipeline')
  .argument('<pipeline-id>', 'Pipeline identifier')
  .option('-v, --verbose', 'Show detailed action information')
  .option(
    '--var <pairs...>',
    'Override variables before resuming (format: key=value)'
  )
  .action((pipelineId, options) =>
    CommandService.pipelineResume(pipelineId, options)
  );

// Cache Commands
const cache = program.command('cache').description('Manage cached step results and workflow outputs');

cache
  .command('list')
  .description('List cached results, newest first')
  .option('--workflow <workflow-identifier>', "Only this workflow's entries")
  .action((options) => CommandService.cacheList(options));

cache
  .command('clear')
  .description("Delete cached results: one workflow's (--workflow) or all of them (--all)")
  .option('--workflow <workflow-identifier>', "Delete this workflow's entries")
  .option('--all', 'Delete every cached result')
  .action((options) => CommandService.cacheClear(options));

// Remote Commands
const remote = program
  .command('remote')
  .description('Manage remote Tipeline Core connections');

remote
  .command('list')
  .description('List all configured remote connections')
  .action(() => CommandService.remoteList());

remote
  .command('add')
  .description('Add a remote Core connection')
  .argument('<name>', 'A short name for the connection')
  .argument('<host>', 'WebSocket URL of the remote core (e.g. ws://192.168.1.10:4000)')
  .argument('<token>', "The remote core's API token, from its ~/Tipeline/.database/core.token")
  .action((name, host, token) => CommandService.remoteAdd(name, host, token));

remote
  .command('remove')
  .description('Remove a remote connection by ID')
  .argument('<id>', 'Connection ID')
  .action((id) => CommandService.remoteRemove(id));

remote
  .command('use')
  .description('Switch the active core (use connection name or ID, or "local" to go back to local)')
  .argument('<name-or-id>', 'Connection name, ID, or "local"')
  .action((id) => CommandService.remoteUse(id === 'local' ? null : id));

// Hub Commands
const hub = program
  .command('hub')
  .description('Manage hubs and install/update Workflows, Apps, and Plugins from them');

hub
  .command('list')
  .description('List all configured hubs')
  .action(() => CommandService.hubList());

hub
  .command('add')
  .description('Add a hub')
  .argument('<name>', 'A short name for the hub')
  .argument('<type>', 'Hub type: "remote" or "local_folder"')
  .argument('<target>', 'Base URL or GitHub repo link (remote), or absolute folder path (local_folder)')
  .option('--token <token>', 'Access token for a private remote hub (sent as a Bearer token to the hub\'s own host)')
  .action((name, type, target, options) => CommandService.hubAdd(name, type, target, options.token));

hub
  .command('token')
  .description('Set the access token of a remote hub, or remove it when no token is given')
  .argument('<id>', 'Hub ID')
  .argument('[token]', 'The new token (omit to remove the saved one)')
  .action((id, token) => CommandService.hubSetToken(id, token));

hub
  .command('remove')
  .description('Remove a hub by ID')
  .argument('<id>', 'Hub ID')
  .action((id) => CommandService.hubRemove(id));

hub
  .command('enable')
  .description('Enable a hub')
  .argument('<id>', 'Hub ID')
  .action((id) => CommandService.hubSetEnabled(id, true));

hub
  .command('disable')
  .description('Disable a hub')
  .argument('<id>', 'Hub ID')
  .action((id) => CommandService.hubSetEnabled(id, false));

hub
  .command('catalog')
  .description('List the Workflows/Apps/Plugins available on a hub')
  .argument('<id>', 'Hub ID')
  .action((id) => CommandService.hubCatalog(id));

hub
  .command('install')
  .description('Install a Workflow, App, or Plugin from a hub')
  .argument('<type>', '"workflow", "app", or "plugin" ("task" also accepted)')
  .argument('<hubId>', 'Hub ID')
  .argument('<itemIdentifier>', 'Item identifier as listed in the hub catalog')
  .action((type, hubId, itemIdentifier) => CommandService.hubInstall(type, hubId, itemIdentifier));

hub
  .command('check')
  .description('Check hub(s) for updates now, instead of waiting for the background sync')
  .argument('[id]', 'Hub ID (omit to check all enabled hubs)')
  .action((id) => CommandService.hubCheck(id));

hub
  .command('updates')
  .description('List hub updates: what needs you, and what was installed recently')
  .action(() => CommandService.hubUpdates());

hub
  .command('update')
  .description('Install the version a hub offers, such as a major version waiting for approval')
  .argument('<type>', '"workflow", "app", or "plugin" ("task" also accepted)')
  .argument('<identifier>', 'Identifier of the installed item')
  .action((type, identifier) => CommandService.hubUpdate(type, identifier));

// Plugin Commands
const plugin = program
  .command('plugin')
  .description('See installed plugins and turn them on or off');

plugin
  .command('list')
  .description('List installed plugins')
  .action(() => CommandService.pluginList());

plugin
  .command('enable')
  .description('Turn a plugin on. It runs its own code on this machine, so enable only ones you trust')
  .argument('<plugin>', 'Plugin identifier, group, or its name in the hub catalog')
  .action((identifier) => CommandService.pluginSetEnabled(identifier, true));

plugin
  .command('disable')
  .description('Turn a plugin off. Workflows that use it fail until it is on again')
  .argument('<plugin>', 'Plugin identifier, group, or its name in the hub catalog')
  .action((identifier) => CommandService.pluginSetEnabled(identifier, false));

// Schedule Commands
const schedule = program
  .command('schedule')
  .description('Manage workflow schedules');

schedule
  .command('list')
  .description('List all schedules')
  .action(() => CommandService.scheduleList());

schedule
  .command('set')
  .description('Schedule a workflow to run on its own')
  .argument('<workflow-identifier>', 'Workflow identifier')
  .option(
    '--when <words>',
    'When, in plain words: "every weekday at 9am", "every 30 seconds", "tomorrow at 8am"'
  )
  .option('--cron <expression>', 'Cron expression: 5 fields, or 6 with seconds first (e.g. "0 9 * * 1,3,5")')
  .addHelpText(
    'after',
    '\nExamples:\n' +
      '  tipeline schedule set sales-report --when "every day at 9am"\n' +
      '  tipeline schedule set sales-report --when "every 15 minutes between 9 and 17 on weekdays"\n' +
      '  tipeline schedule set sales-report --when "tomorrow at 8am"     (runs once)\n' +
      '  tipeline schedule set sales-report --cron "*/20 * * * * *"      (every 20 seconds)'
  )
  .action((taskIdentifier, options) => CommandService.scheduleSet(taskIdentifier, options));

schedule
  .command('remove')
  .description('Remove a schedule')
  .argument('<schedule-id>', 'Schedule ID or name')
  .action((scheduleId) => CommandService.scheduleRemove(scheduleId));

// Project Commands
const project = program.command('project').description('Manage projects');

project
  .command('delete')
  .description("Delete a project; its workflows and apps are kept unless you add --with-contents")
  .argument('<project>', 'Project name or identifier')
  .option('--with-contents', "Also move its workflows and apps to the Trash, except workflows used outside the project")
  .option('--include-used', 'With --with-contents, also delete the workflows used outside the project')
  .option('-y, --yes', 'Delete without asking for confirmation')
  .addHelpText(
    'after',
    '\nExamples:\n' +
      '  tipeline project delete Sales                   (keeps its workflows and apps)\n' +
      '  tipeline project delete Sales --with-contents\n' +
      '  tipeline project delete Sales --with-contents --include-used --yes'
  )
  .action((name, options) => CommandService.projectDelete(name, options));

// Agent Commands
const agent = program
  .command('agent')
  .alias('assistant')
  .description('Ask the Tipeline assistant for something in plain language (also: tipeline assistant)');

agent
  .command('prompt')
  .description('Ask the Tipeline agent for something; it finds the workflow, asks for missing values and runs it once you confirm')
  .argument('<text>', 'The instruction to send')
  .option('-y, --yes', 'Run without asking for confirmation (still asks for missing values)')
  .option('-p, --project <name>', "Also follow this project's assistant instructions (its name or identifier)")
  .action((text, options) => CommandService.agentPrompt(text, options));

program.hook('preAction', (_program, actionCommand) => unmaskDashIdentifiers(actionCommand as any));

program.parse(maskDashIdentifiers(process.argv));
