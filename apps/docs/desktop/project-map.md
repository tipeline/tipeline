# Project Map

The **map** draws a project as a picture: its workflows, apps, globals and schedules, and
the lines between them. Use it to see how a project fits together, and to plan what it
still needs before anything is built.

- **Map** on a [project's](/desktop/projects) page opens that project's map, full page like
  the workflow builder. This is where you plan.
- **Map of all projects** on the **Projects** page shows every project at once. It's
  read-only.

## What's on the map

| Node | What it is |
|---|---|
| Workflow | A workflow in the project. A sub-workflow and a helper workflow are marked as such |
| App | An app in the project |
| Global | A [global variable](/desktop/variables) the project's workflows write or read |
| Schedule | A [schedule](/desktop/schedules) that starts one of the project's workflows |

Nodes this project uses that aren't in it (a sub-workflow from another project, say) show
faded, and are listed under **Used, not in this project** in the left sidebar.

On [Tipeline Server](/server/), a workflow on the map that you don't have access to
(someone else's private one) shows as a locked **Hidden workflow** card: its lines stay, so
the map still makes sense, but its name and details don't show.

### Lines

Each line goes from what does something to what it does it to, so it reads as a sentence:
"Order Form **runs** Create Order".

| Line | Meaning |
|---|---|
| runs (app → workflow) | An app runs a workflow |
| runs (workflow → workflow) | A workflow runs another as a sub-workflow |
| writes | A workflow sets a global (filled arrow) |
| reads | A workflow or app reads a global (open arrow, still pointing at the global) |
| starts | A schedule starts a workflow |

For what exists, the lines come from the definitions themselves, every time the map
opens, so they can't go stale. A workflow that builds a global's name while it runs
(`_global[...]`) can't show those globals; its details say so.

An app's **runs** line also names what in the app uses the workflow: the component when
it's one ("Orders · 4 ways" for a table whose row and bulk actions all run it), or how many
("8 components"). Click the line, or select the app, to see them listed by page in its
details, each with how it uses the workflow: shows its results, runs it on submit, on a
row action, when the page opens. An app's card counts its pages and components.

Workflows that only connect to one node (an app's own workflows, say) fold into one card
beside it. **Show them** opens the card; **Fold them into one card** closes it again.

## Planning

Anything you add to the map that doesn't exist yet is **planned**: drawn dashed, an idea
until it's built. The plan is saved with the project as you work.

- **Add to the map** in the left sidebar: click a tile (Workflow, Helper, App, Global,
  Schedule, Note) to add it beside what's selected, or drag it onto the map.
- **Connect two nodes**: drag from the dot on a node's right edge to another node. A line
  drawn by hand is planned too. To show that something reads a global, drag from the
  global to it.
- **Details**: click a node to name it, describe what it should do, set an owner, and list
  its planned inputs and outputs. Once the workflow is built, it changes in the workflow
  builder (**Open in the workflow builder**); its details then list what was planned
  (inputs, outputs and lines), ticked green when the workflow has it and amber when not.
- **Pages and components**: a planned app's details list the pages it will have and the
  components on each (table, KPI, chart, details, form, button, select, text), each with
  the workflow it uses, built or planned. Picking a workflow draws the planned line; a
  line's planned components show on it like a real app's. Once the app is made with
  **Create**, it changes in the app builder (**Open in the app builder**); its details then
  list what was planned (components and lines), ticked green when the app has it and amber
  when not.
- **Notes**: a Note tile is a sticky note on the map (yellow, blue, green or pink), for
  decisions, open questions and links. A node also has a note of its own in its details.
- **Show ideas** off hides planned nodes and lines, to see only what exists. Notes stay.

A schedule starts one workflow, so drawing a planned schedule to a second workflow gives
that workflow a planned schedule of its own.

Selecting a real schedule shows its details: when it runs, the workflow it starts, its
next and last run, and a switch to turn it on or off. **Edit** changes it without leaving
the map.

### Turning ideas into real things

A planned node's details offer a way to make it real:

| Planned | Action |
|---|---|
| Workflow or helper | **Build this with the Assistant**: the [Assistant](/assistant/) drafts it from the description and planned inputs and outputs, and the draft is linked to the node |
| App | **Create the app**: with planned pages and components, it builds them, each connected to its workflow (see below) |
| Global | **Create the global**, with its type, in Variables |
| Schedule | **Create the schedule**, once it's connected to a built workflow: say when, in plain words ("every weekday at 8am") |

Create builds an app from its planned pages as a starting point, without the Assistant: the
same plan always makes the same app. Each component comes with its type, name and a
default size, laid out left to right:

| Component | Connected to its workflow like this |
|---|---|
| Table, chart, details, select | Shows the workflow's first output (rows, options); everything on a page showing the same workflow shares one run when the page opens |
| KPI, text | Shows the first output as its value |
| Form | One field per workflow input; submitting runs it, then shows a message and clears the form |
| Button | Clicking runs it, then shows a message |

A workflow you connected to the app idea with a line drawn by hand, but didn't pick on any
component, is added to the app too, ready to connect to a component in the builder.
A component whose workflow is still planned is added without one. Once that workflow is
built, the plan check lists its line as missing until it's wired in the app builder.

**Link to an existing one** links the node to something already built instead. A linked
workflow or app **joins the project** (and stays in any other projects it's in), so its
owner, lane and status work like any other node's. The map brings in what it uses (the
sub-workflows it runs, the globals it writes or reads) but not the other apps and
schedules that use it. The idea gives way to what's built: its planned inputs and outputs
become the workflow's real ones, a planned app's pages and components go (the app's own are
what it has), and planned lines to other built things that it doesn't have are dropped.
Lines to things still planned stay. Its real lines go on the plan as they are, so the
[Plan check](#plan-check) only lists what changes after linking. The owner, lane, note and
Ready sign-off stay. (Made from the card with **Create** or **Build**, it's the other way
round: the plan stays, and the Plan check compares the result with it.)

In the list, workflows and apps already on this map come first, marked "on this map".
**Unlink from the plan** turns the node back into an idea; the workflow stays in the
project. **Remove from project** on a workflow or app takes it out of the project (asked
first): its card leaves the map, and the workflow itself is kept, in any other projects.

A node from outside the project that isn't on the plan (a sub-workflow a linked
workflow runs, say) has a small arrow badge in its top-left corner: it's on the map only
because it's connected to something that is. Link it to a planned node to give it planned
inputs and outputs.

A workflow or app the project uses but that isn't in it shows with **Add to this
project** in its details. Adding a workflow or app to a project also brings in the
sub-workflows it runs that are in no project yet; ones already in a project are left as
they are (add them too if you want).

## Status

Every node has a status. It's worked out from facts, never typed in, and the details say
why a node has it.

| Status | Means |
|---|---|
| Idea | Only on the map so far, or a global workflows use that hasn't been created |
| Drafting | An Assistant draft nobody has marked ready yet |
| Built | Exists, but hasn't run successfully since its last change |
| Tested | Ran successfully after its last change |
| Ready | Tested, and signed off by someone with **Mark ready** |

- An **app** is tested when every workflow it runs is tested. A **schedule** is tested
  when it's on and the workflow it starts is tested.
- A **global** can be marked ready once it exists and you've checked its value.
- **Ready** holds only while nothing changes: a later change, or a run that stops passing,
  undoes it. The node then shows "changed since Ready" until you check it again.

The map's header counts how many of the project's own nodes are ready ("4 of 9 ready");
click it to go back to the overview.
**Needs attention** in the sidebar lists the nodes that changed since Ready, drafts,
workflows never run or changed since their last run, and globals that don't exist.

## Plan check

Once something is built, its real connections can differ from what you planned. The
**Plan check**, in the right panel when no node is selected, compares them and lists each
mismatch:

| Mismatch | Example |
|---|---|
| Missing link | The plan says Order Form runs Create Order, but nothing in the app is wired to it |
| Not on the plan | Create Order writes `lastOrderId`, which isn't on the plan |
| Inputs or outputs changed | Planned with the inputs `email, amount`; the workflow has `email` |
| Link broken | The node was linked to something that was deleted |
| Components missing | The plan lists the "Price list" table on Catalog, but the app has no component with that name on that page |

In a built workflow's or app's own details, each planned item it doesn't have (amber) also
has a **×** to take it off the plan, for a feature you decided against. Only missing items
can be removed, and nothing can be added: a built workflow or app changes in its builder.

For each one you can update the plan to match (**Add to plan**, **Remove from plan**,
**Update the plan**) or **Ignore** it. On the map, amber lines are mismatches and orange
lines exist but aren't on the plan. Ideas aren't checked until they're built.

## Layout

| Layout | Arrangement |
|---|---|
| Flow | Left to right, following the lines. Drag nodes where you like; the map remembers |
| Lanes | Rows, top to bottom, grouped by **Owner**, **Status**, **Kind** or **Custom** lanes |

- **Owner**: one lane per owner. Dragging a node to another lane changes its owner.
- **Status** and **Kind**: lanes follow each node, so dragging between them changes nothing.
- **Custom**: add, reorder and remove lanes in the left sidebar, then drag nodes into them
  or pick a node's lane in its details.

**Reset layout** forgets where nodes were dragged and arranges them again. **Search the
map** in the sidebar finds a node by name.

## Map of all projects

**Map of all projects** draws every project in its own box. A workflow or app in one
project, and a global or schedule only one project uses, sits in that project's box;
anything in or used by more than one project, or in none, sits in a box of its own, so
shared helpers and globals stand out.

Statuses noted on each project's plan still show. To plan, click a project in the list
beside the map to open its own map.

## Export and backup

The plan (planned nodes, hand-drawn lines, notes, owners, lanes, planned app pages and
Ready sign-offs) goes
with the project in a [project export](/desktop/projects#export-and-import) and in a
[full backup](/desktop/backup). Importing with **Replace items that already exist** on
replaces the project's plan too.
