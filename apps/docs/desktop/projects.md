# Projects

A **project** groups workflows and apps that belong together — everything for billing, a
client, or a team. Open **Projects** in the sidebar to create one, then add workflows and
apps to it from the project's page.

- A workflow or app is in **one project at most**. Adding it to another project moves it.
- The project's name shows in lists and on each workflow's page, and search matches it:
  `billing invoice` finds the invoice workflows in the Billing project.
- Deleting a project keeps its workflows and apps by default; they stay, without a
  project. See [Deleting a project](#deleting-a-project) to delete them too.

## Assistant instructions

A project's **Edit** dialog has **Assistant instructions**: facts the assistant follows when you ask it
from the project's page, or from one of its workflows or apps ("Prod is acme-web-01"). They're
shown on the project's page and go with the project in exports. See
[Instructions for the Assistant](/assistant/instructions).

## Used by, and used from other projects

- A workflow's **Overview** shows **Used by**: the apps that use it, and the project each one
  is in.
- A project's page lists the workflows its apps use from **other projects** (or from no
  project), and which apps use them. They stay where they are; the list shows what the
  project depends on.
- A workflow's **Overview** also lists, under **Used by**, the workflows that run it as a
  sub-workflow.
- Deleting a workflow warns you first: which apps will stop working, which workflows run it
  as a sub-workflow (and will fail), and which schedules go to the Trash with it.

## Deleting a project

**Delete** on a project's page asks what happens to its workflows and apps:

- **Keep its workflows and apps** (the default): only the project is deleted. Its
  workflows and apps stay, without a project.
- **Also delete its workflows and apps**: each one is listed with a tick. The ticked ones
  move to the Trash, where you can restore them for 30 days; the unticked ones stay,
  without a project.

A workflow that something outside what you're deleting still uses (an app or workflow in
another project or in none, or one you've unticked) starts **unticked**, and says what
uses it. You can tick it anyway; the dialog then says what will stop working. A ticked
workflow's schedules go to the Trash with it.

A restored workflow or app comes back without a project, since the project is gone.

## Export and import

**Export** on a project's page saves one zip with:

- the project's workflows and apps,
- the workflows they use from other projects,
- the global variables they reference.

Secret values are left out unless you tick **Include secret values** — they're then written
in plain text, so keep that file safe. Schedules and run history aren't included.

To bring a project into another Tipeline, click **Import** on the **Projects** page and pick
the zip. Items keep their identifiers, so the apps stay linked to their workflows.

| Replace items that already exist | Result |
|---|---|
| Off (default) | Workflows, apps and variables already here are kept as they are; only new ones are added |
| On | They're overwritten with the export's version |

To move everything at once instead, use a [full backup](/desktop/backup).
