# Desktop App Overview

The Tipeline Desktop app provides a visual interface for building, running, and monitoring automation workflows — no terminal required. It connects to the Core engine running in the background and gives you a live view of everything happening in your pipelines.

<div class="screenshot-placeholder" style="height: 420px;">
  <span class="placeholder-icon">🖥️</span>
  <span class="placeholder-label">Home</span>
  <span>Overview of recent pipeline activity, workflow status, and quick-run shortcuts</span>
</div>

## Sections

The sidebar groups every part of the app:

| Group | Section | What you'll find there |
|-------|---------|----------------------|
| | **Home** | What needs you (approvals, failed and missed runs), your starred and recent items, today's runs |
| **Build** | **Workflows** | Every installed workflow — run, edit, see its runs ([builder](/desktop/builder)) |
| | **Apps** | Dashboards and tools built on your workflows ([Apps](/apps/)) |
| | **Projects** | Workflows and apps grouped by project ([Projects](/desktop/projects)) |
| | **Assistant** | Past requests, drafts and remembered picks ([Assistant](/assistant/)) |
| **Operate** | **Runs** | Every run of every workflow, live ([Runs](/desktop/pipelines)) |
| | **Approvals** | Runs waiting for someone to approve or reject them ([Approvals](/workflows/approvals)) |
| | **Schedules** | When workflows run on their own ([Schedules](/desktop/schedules)) |
| **Resources** | **Global Variables** | Values every workflow can read ([Global Variables](/desktop/variables)) |
| | **Tags** | Create, rename and delete the tags used on workflows |
| | **Plugins** | Extra action groups ([Plugins](/hub/plugins)) |
| | **Hub** | Workflows, apps and plugins to install from your hubs ([Hubs](/hub/)) |
| | **Trash** | Deleted workflows and apps, kept 30 days to restore ([Trash](/desktop/trash)) |
| | **Settings** | Appearance, defaults, assistant, hubs, cache, connections, backup ([Settings](/desktop/settings)) |
| | **Help** | Opens this documentation |

The **Bot** icon in the top bar (⌘K) opens the [assistant](/assistant/) on any page.

## Home

Home answers two questions at a glance: does anything need me, and how do I get back to
what I was doing. How every workflow is doing is on the [Workflows list](#the-workflows-and-apps-lists).
From top to bottom:

- **A greeting** and today's date, with **New App** and **New Workflow** on the right.
  Under the greeting, one line with today's numbers: runs today, how many failed (opens
  the failed runs), the next scheduled run (opens Schedules) and **All runs**. Days start
  at midnight in your own time zone; the numbers show — until Core is restarted after an
  update that adds them.
- **Ask the Assistant**: type what you want built or run and press Enter. The Assistant
  panel opens with your request. (Not shown when connected to a server workspace. To find
  something, use **Search** or ⌘J at the top.)
- **Needs you**, with how many things are waiting. Newest first, each row says what
  happened and has a button for it:
  - **Approval**: a run waiting for your decision. **Review** opens the Approvals page.
  - **Failed**: a workflow whose latest run failed, and how many times in a row.
    **Open run** shows that run; **Dismiss** hides it until the workflow fails again (it also
    leaves on its own when the next run succeeds). **All failing workflows** opens the
    Workflows list filtered to them.
  - **Missed**: a scheduled run that didn't happen because Tipeline wasn't running at that
    time. **Run now** runs it with the schedule's variables; **Dismiss** hides it until the
    schedule misses again. Only repeating (cron) schedules can miss.

  When nothing needs you, a green **All clear** box says so and lists the next scheduled runs.
- **Continue**: a tile for each workflow and app you starred, in the order you keep them,
  then the ones you opened lately. Each tile shows the project it's in, when the workflow
  last ran (with a dot for how it went) or when you opened it. Star or unstar with the ☆ on
  a tile, or pick one with **Add to Starred**. Two rows show at first; **Show all** lists
  the rest.

When Needs you is long, the whole page scrolls.

Starred items, recent items and dismissed failures and missed runs are kept per workspace.

### Search

Press **⌘J** (or click **Search…**) to search workflows, apps, projects and tags. Every
word you type must match the name, description, tags or project, so `billing invoice`
finds the invoice workflows in the Billing project. Before you type, search lists your
starred and recently opened items.

## The Workflows and Apps lists

Both lists work the same way:

- **Recently opened**: the workflows (or apps) you opened last, from their page or the
  builder, as one row of tiles above the list. **See all** switches the list to them;
  **Clear** empties the row (Recently opened on Home keeps the other kinds). The row
  hides while you search or filter.
- **All / Starred / Recently opened** narrows the list, with a count for each. Recently
  opened lists the newest first. Workflows also have **Failing** (the latest run failed)
  and **Scheduled** (a schedule is turned on).
- **Sort** by name, last run or recently opened for workflows; by name, newest or recently
  opened for apps.
- Three views: **Table**, **Cards** (picture, description and more on each tile) and
  **Compact list** (one line each, actions on hover). Tick items in any view to delete them
  together.
- Search and **source** filter every view; workflows also filter by **Tags** and
  **Can access**.

Each list remembers its view and sort.

The Workflows list also shows how they're doing. Above it, four numbers for the last 7 days:
**Runs**, **Failed** (click either to open the Runs page), the **Failure rate** and the
**Average run time**. In the table, each workflow has:

- **Last 10 runs**: a small bar per run, oldest on the left. Green succeeded, red failed
  (and taller, so a bad streak stands out), amber waiting, grey canceled. Hover for a count.
- **Last run**: how it went and how long ago.
- **Next run**: when its next schedule fires, or — when it has none turned on.

## Running Workflows

From the **Workflows** list, click any workflow to open its detail view. From there you can:

- **Run** — execute the workflow immediately with its default variables
- **Run (Debug)** — execute in step-through mode, pausing before each action
- **Edit** — open the workflow in the visual builder
- **View history** — see all past pipeline runs for this workflow

<div class="screenshot-placeholder" style="height: 320px;">
  <span class="placeholder-icon">▶️</span>
  <span class="placeholder-label">Workflow Detail View</span>
  <span>Workflow description, variables panel, run buttons, and pipeline history list</span>
</div>

## Runs

**Runs** lists every run of every workflow, newest first, and updates live. Filter by status,
open a run to see each step, its result and the final variable values, and cancel or resume
it. See [Runs](/desktop/pipelines).

## Separate windows

A few pages can open in their own window with **Open in window**, to keep them in view
while you work in the main window:

- an **app**, run-only — from the app's page, or the icon in the apps list;
- a **run's detail**, updating live — from the run's page, or the icon next to a run in
  Runs or a workflow's Runs tab — to watch a long run while you do something else.

Opening the same page again focuses its window. Editors and settings stay in the main
window, so there's only ever one copy of each to save. Switching workspace closes these
windows, since they show items of the previous workspace; Tipeline says how many it
closed.

## Remote workspaces

By default, the Desktop app talks to the local Core engine. To work on a
[Tipeline Server](/server/), add it with **Manage workspaces…** in the sidebar's **workspace switcher** and sign in, then
switch to it there (see [Workspaces](/desktop/settings#workspaces)). Each connection is a
separate **workspace**: its own workflows, apps, runs and settings. Switching workspace closes
windows that belong to the previous one.

On a server workspace, what you can do depends on your role (viewer, editor or admin), and
admins manage accounts on the workspace's **Users** tab. The assistant only works with the local
workspace for now.
