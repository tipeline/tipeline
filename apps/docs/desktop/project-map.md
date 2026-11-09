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

Nodes from other projects that this project uses (a borrowed sub-workflow, say) show
faded, and are listed under **From other projects** in the left sidebar.

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
  its planned inputs and outputs.
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
| App | **Create the app** |
| Global | **Create the global**, with its type, in Variables |
| Schedule | **Create the schedule**, once it's connected to a built workflow: say when, in plain words ("every weekday at 8am") |

**Link to an existing one** links the node to something already built instead. When
that's from another project (or in none), the map brings in what it uses (the
sub-workflows it runs, the globals it writes or reads) but not the other apps and
schedules that use it. Its lines as they are go on the plan with it, so the
[Plan check](#plan-check) only lists what changes after that.
**Unlink from the plan** or **Remove from the plan** takes it back off.

A node from outside the project that isn't on the plan (a sub-workflow a linked
workflow runs, say) has a small arrow badge in its top-left corner: it's on the map only
because it's connected to something that is. Link it to a planned node to give it planned
inputs and outputs.

A workflow or app that's in no project shows with **Add to this project** in its
details. Adding a workflow or app to a project also brings in the sub-workflows it runs
that are in no project yet; ones that belong to another project stay there.

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

**Map of all projects** draws every project in its own box. A global or schedule only one
project uses sits in that project's box; anything more than one project uses, or that's
in no project, sits in a box of its own, so shared helpers and globals stand out.

Statuses noted on each project's plan still show. To plan, click a project in the list
beside the map to open its own map.

## Export and backup

The plan (planned nodes, hand-drawn lines, notes, owners, lanes and Ready sign-offs) goes
with the project in a [project export](/desktop/projects#export-and-import) and in a
[full backup](/desktop/backup). Importing with **Replace items that already exist** on
replaces the project's plan too.
