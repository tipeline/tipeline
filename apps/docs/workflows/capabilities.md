# What a Workflow Can Access

Every workflow shows what it can do outside the run itself: change files, run programs, connect to servers, send data online. Tipeline works this out from the workflow's steps, so you can see it before you run a workflow someone else made.

It's a label, not a sandbox. Nothing is blocked. It tells you which steps to look at.

## Where you see it

- **Workflow Overview** — the About card has a **Can access** row with one chip per capability. Click a chip to see the steps behind it. A workflow with none of them says *Only works with data*.
- **Installing from a hub** — before a workflow is installed, a dialog lists what it can do. A workflow that only works with data installs right away. The assistant shows the same list when it suggests a hub workflow.
- **Restore and project import** — the restore dialog (Settings → Backup) and the project import dialog (Projects → Import) list what the workflows in the file can do, before anything is written.
- **Assistant drafts** — the draft banner shows what the draft can do. The assistant also mentions it in the draft summary ("It deletes the files it finds in Downloads").
- **Workflows list** — the **Can access** filter shows only the workflows that have every capability you pick. It's available when Desktop talks to its own Core, not on a Server connection yet.
- **CLI** — `tipeline workflow info <identifier>` has a *can access* row.

## The capabilities

The first four are highlighted when you're about to install or accept a workflow. The others are listed but not highlighted, because most workflows have one of them.

| Shown as | Highlighted | Comes from |
|---|---|---|
| Runs programs | Yes | `system.runApplication`, `system.terminateProcess` |
| Servers & databases | Yes | `ssh.connect`, `ssh.exec`, `database.connect`, `database.query` |
| Changes or deletes files | Yes | `file` and `folder` steps that write, copy, move, rename or remove; `compression`; `cryptography.*ToFile`; `http.downloadFile` and `browser.downloadFile`; browser screenshots, PDFs, screencasts and HAR files; the export and save steps of `image`, `audio`, `video`, `pdf`, `spreadsheet` and `qrcode.generate` |
| Runs add-on code | Yes | Any plugin step. A plugin is code you installed, so Tipeline can't tell more than that. |
| Sends data online | No | `http.request`, `api.*` (except `basicAuth`), `email.send`, `ai.prompt`, `browser.launch`, `browser.goTo`, `browser.uploadFile`, `browser.runLighthouseAudit` |
| Reads files | No | `file` and `folder` steps that read or check, `ocr.recognize`, `pdf.extractText` and `getPageCount`, the load and open steps of `image`, `audio`, `video` and `spreadsheet`, `cryptography.*File` |
| Runs a script | No | `script.runScript` (sandboxed: no files or network), `browser.runJavaScript` (runs inside the web page) |

Steps that only work on data — string, math, array, object, date, variable, flow, HTML, XML, approvals — add nothing.

## How it's worked out

- **From the saved steps.** A path built from an expression still counts as a file step. Disabled steps don't count.
- **Sub-workflows count.** A `subtask.exec` step adds everything its workflow can do, all the way down, and the chip says which sub-workflow a step is in. A sub-workflow that isn't installed, or that's picked by an expression or a file path, can't be looked at; it's listed under *Not included*.
- **Per step, not per group.** `file.read` reads files; `file.remove` changes them; `file.getFilePathPart` only works on text.

## For the assistant

`check_workflow` returns a `canAccess` list next to `errors` and `warnings`: each capability, whether it's highlighted (`review`), and the steps that cause it. The drafting assistant uses it to say what a draft does in its summary.
