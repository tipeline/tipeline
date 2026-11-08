# Examples

Sample workflows, apps and plugins used for local development and manual testing. They are
not part of the shipped app or CLI package.

| Folder | What is in it |
|---|---|
| `actions/` | One folder per action group (`browser/`, `file/`, `ssh/`, …) exercising its actions |
| `workflows/` | Complete workflows, including `test/` (engine test workflows), `async-subtask/`, `assistant-instructions/`, `assistant-subworkflows/` and provisioning examples |
| `apps/` | Example apps; the workflows they bundle live in `apps/workflows/` |
| `projects/` | Whole projects as backup-archive folders (workflows, apps, schedules, globals, project map); zip one and use Settings → Restore. See `projects/roastery-ops/README.md` |
| `plugins/` | Example plugins |

Examples that need credentials use `CHANGE_ME_…` placeholders or `{{ _env.KEY }}`. Put your own
values in a `.env` file next to the workflow; `.env` files are git-ignored.

## File paths

File-action parameters in these YAMLs (e.g. `file/file.yml`'s `src`/`dest`,
`test-main.yml`'s subtask `path`) reference a `{{ _global.examplesDir }}`
global variable rather than a hardcoded path, since Tipeline's engine has no
built-in relative-path resolution for file actions — a literal relative path
would only resolve correctly by accident, depending on whatever directory
the core process happens to be running from.

To run these examples, create a global variable named `examplesDir` pointing
at this directory's absolute path (Desktop app → Global Variables →
New Variable), e.g.:

```
examplesDir = /path/to/tipeline/examples
```

## Async subtasks (`workflows/async-subtask/`)

This folder is self-contained — unlike the examples above, its files reference each other with
literal relative paths (`./test-async-subtask-child.yml`) instead of `{{ _global.examplesDir }}`,
so no global variable is required, and the parent task can be installed, not just run from a file.

- `test-async-subtask.yml` demonstrates `subtask.exec`'s `async: true` mode: it
  calls `test-async-subtask-child.yml` (a ~3s slow child task) once synchronously
  and once asynchronously, logging timestamps around each call so you can see the parent block
  on the sync call but return immediately on the async one. Check pipeline history afterwards to
  see the async child's own, separately tracked run finish a few seconds later.
- `test-async-subtask-invalid.yml` is a negative test — it pairs `async: true` with
  `outputs`, which the action rejects up front since the parent has already moved on before the
  child produces a result to read back.

Installing the parent auto-installs the child too, since `task install` resolves relative `path`
subtask references into an `identifier` at install time (`Core.resolveSubtaskPaths`); a templated
path can't be resolved that early, since variable interpolation only happens at run time.

```bash
tipeline task install examples/workflows/async-subtask/test-async-subtask.yml
# prints the installed record, including its identifier — grab it from there,
# or `tipeline task list` afterwards
tipeline task exec <identifier-from-above>
```

## Assistant reusing workflows (`workflows/assistant-subworkflows/`)

Three small workflows for testing that the Assistant reuses installed workflows as
sub-workflow steps when it drafts a new one, instead of rebuilding them from actions:

- `get-php-version.yml`: returns the PHP version, or "not installed".
- `get-mysql-version.yml`: returns the MySQL version, or "not installed".
- `create-email-draft.yml`: writes an email to `~/Desktop/tipeline-email-draft.eml` (marked unsent)
  and opens it in Mail or Outlook as a draft. Nothing is sent. macOS only.

Each declares one `output: true` variable, which is what lets the drafted workflow read its result.
To check another machine, change a version workflow's `command` input (e.g. `ssh web1 mysql --version`).

Install the three (they must be installed and not drafts), restart Core if it predates the feature,
then ask the Assistant:

```bash
tipeline workflow install examples/workflows/assistant-subworkflows/get-php-version.yml
tipeline workflow install examples/workflows/assistant-subworkflows/get-mysql-version.yml
tipeline workflow install examples/workflows/assistant-subworkflows/create-email-draft.yml
```

> Get the PHP and MySQL versions and create an email draft to me@example.com with both versions.

The Assistant should say no single workflow does this and offer **Draft this workflow**, naming the
three. The draft should have three `subtask.exec` steps: two reading `version` back into its own
variables, and one passing them to *Create Email Draft* as `to`, `subject` and `body`.
`tests/engine/AssistantSubworkflowExamples.test.ts` checks these files and a draft of that shape.

### Reusing a workflow from the hub (`workflows/system-info.yml`)

`System Info` is published to the local hub (`~/Tipeline/hub/tasks/system-info.yml`, v2.0.0). It reads
this Mac's system information and returns it as one `systemInfo` output. Leave it uninstalled and ask:

> Get my computer's system info and save it to a file named systemInfo.txt in my Documents folder.

The "Workflow to draft" card should list *System Info* under **Uses your workflows** with an **Install**
button. Install it, then draft: the draft runs it as a sub-workflow and writes its output with `file.write`.
