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
| | **Home** | Starred items, what you opened lately, today's runs, your projects and your inbox, on one screen |
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

Home is the first page you see. It fits in one window: the page itself never scrolls, and
each list scrolls inside its own card. On a narrow window the columns stack and the page
scrolls instead.

At the top, a light blue banner:

- **A greeting** and today's date, with **New Workflow** and **New App** on the right. When
  something needs you, an **inbox** badge sits next to the date. It counts approvals you can
  decide and workflows whose latest run failed. Click it to see the list. Dismiss a failure
  with the ✕ on its row. It comes back only if the workflow fails again, and leaves on its
  own when the next run succeeds.
- **Ask the Assistant**: type what you want built or run and press Enter. The Assistant
  panel opens with your request. (Not shown when connected to a server workspace. To find
  something, use **Search** or ⌘J at the top.)
- **Today**, four numbers. Click one to open the page with the details:
  - **Runs today**, with a bar for each of the last 7 days (hover a bar for its count).
    Opens the Runs page.
  - **Failed today**, with the workflows whose latest run failed today. Opens the Runs page
    filtered to failures.
  - **Waiting for you**: approvals you can decide. Opens the Approvals page.
  - **Next run**: how soon the next scheduled run starts (hover for the exact wording), and
    which workflow. Opens the Schedules page.

  Days start at midnight in your own time zone. The numbers show — until Core is restarted
  after an update that adds them.

Below, three columns fill the rest of the window:

- **On the left**, **Starred**: a card for each workflow and app you
  starred, with the project it's in. Star one with the ☆ in the Workflows or Apps list, at
  the top of its page, on its row in Recently opened, or with **Add to Starred** at the end
  of the cards. Drag cards to reorder them. When you have both kinds starred, filter with
  **All / Apps / Workflows**.
- **In the middle**, **Recently opened**: a table of the workflows, apps and projects you
  opened, grouped into **Today**, **Yesterday**, **Earlier this week** and **Older**. Each row
  shows the project under the name, when you opened it and, for a workflow, a dot with how
  its last run went. Filter with **All / Workflows / Apps**.
- **On the right**, **Recent runs** and **Projects**, two cards that share the column's
  height.
  - Recent runs is the same kind of table, grouped by day: each run's workflow with how it
    went (**Running**, **Completed**, **Failed**…) and when it ran. Click one to open it;
    **View all** opens the Runs page.
  - Projects lists each project with its initials in its color, its counts and the one thing
    worth knowing: **failed**, **waiting** (approvals), **running** or **All good** (a project
    where nothing has run yet shows nothing). Projects you opened lately come first, then the
    biggest; **New project** at the end creates one.

Each filter remembers your last choice. Starred items, recent items and dismissed
failures are kept per workspace.

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
  opened lists the newest first.
- **Sort** by name, last run or recently opened for workflows; by name, newest or recently
  opened for apps.
- Three views: **Table**, **Cards** (picture, description and more on each tile) and
  **Compact list** (one line each, actions on hover). Tick items in any view to delete them
  together.
- Search and **source** filter every view; workflows also filter by **Tags** and
  **Can access**.

Each list remembers its view and sort.

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
