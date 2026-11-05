# Workflow Builder

The Workflow Builder is the visual editor for creating and editing automation workflows. It lets you compose a workflow's actions and variables without writing YAML by hand — though it also exposes the raw YAML if you prefer to edit it directly.

## Opening the Builder

- **New workflow:** Click **Workflows → New Workflow** in the sidebar, or the **+** button in the Workflows list
- **Edit existing:** Open a workflow's detail view and click **Edit**

<div class="screenshot-placeholder" style="height: 380px;">
  <span class="placeholder-icon">🔧</span>
  <span class="placeholder-label">Workflow Builder</span>
  <span>Action timeline on the left, configuration panel on the right, variables panel at the bottom</span>
</div>

## Layout

The builder is split into three panels:

**Action Timeline** — the ordered list of actions in your workflow. Click any action to select it. Drag to reorder. Use the **+ Add Action** button to insert new steps.

**Configuration Panel** — when an action is selected, this panel shows a form for every parameter that action accepts. Fields are validated in real time against the action's schema.

**Variables Panel** — lists all workflow variables. Add, remove, or edit variables here. Each variable has a name, type, default value, and optional flags (required, secret, readonly).

## Adding Actions

1. Click **+ Add Action** at the bottom of the timeline
2. Search or browse the action library by category (Browser, String, HTTP, AI, File, …)
3. Select the action — it appears at the end of the timeline
4. Fill in its parameters in the right panel

<div class="screenshot-placeholder" style="height: 300px;">
  <span class="placeholder-icon">➕</span>
  <span class="placeholder-label">Action Picker</span>
  <span>Searchable grid of all 30+ action categories, with action names listed under each group</span>
</div>

## Connecting Actions

Use the **Destination** field of any action to capture its result into a variable. Then reference that variable in a later action's parameters:

- Type `{{ variableName }}` in a text field to inject the value as a string
- Type `{= variableName =}` to pass the raw value (objects, arrays, browser handles)

Typing `{{` or `{=` lists the workflow's variables (↑/↓ to choose, Enter or Tab to insert), and the **{}** button inserts one from a menu. When you leave the field, references are highlighted; one that names a variable the workflow doesn't have gets a red underline, since it would silently resolve to an empty value. App builder bindings work the same way.

Some fields hold a value rather than text: a Run Script step's context, a sub-workflow's props, Set Variable's value, request params and body, and an app's workflow inputs. Picking a variable as the whole value of one of these inserts `{= variableName =}`, so the step gets the real list, object or number. Inside other text it inserts `{{ variableName }}`. If one of these fields holds only `{{ variableName }}` and that variable is a list, object, number or true/false, you'll see an amber note, because the step would get text. Click **Use {= variableName =}** to fix it.

## YAML Editor

Switch to the **YAML view** to edit the workflow source directly. The visual form and the YAML editor stay in sync — both are live views of the same underlying source. Changes in either one are immediately reflected in the other.

## Running from the Builder

Click **Run** to execute the current (possibly unsaved) workflow against the Core engine. Results stream live into the activity panel at the bottom of the screen. This lets you test your workflow as you build it, before saving.

## Saving

Click **Save** to persist the workflow. If the workflow is new, you'll be prompted for a name. Saving updates the workflow source in the database and makes it available for scheduling.

## Undo and Redo

**⌘Z** undoes your last change in the builder and **⇧⌘Z** redoes it. The arrow buttons next to Save do the same. Changes saved together count as one step, so a burst of edits undoes at once. Inside a text field or the YAML editor, ⌘Z undoes typing in that field instead.

Undo history lasts while the builder is open. For anything older, use the workflow's Versions tab.

## Versions

Each save keeps a copy of the workflow. Open the workflow's **Versions** tab to see them, newest first. Each version shows when it was saved, what saved it (an edit, a hub update, a reload from file, a backup restore) and what changed: steps added or removed, steps edited, variables or details changed. Saves a couple of minutes apart count as one version.

Pick a version to see it in one of three views:

- **Changes**: what changed from the version before it, line by line.
- **Compared to now**: what restoring it would change. Lines marked + come back, lines marked − go away.
- **YAML**: the whole workflow as it was saved.

Click **Restore** to put it back. Restoring saves it as a new version, so the version it replaced stays in the list and you can switch back. A version that uses a plugin which is no longer installed can't be restored until the plugin is back.

Every version from the last 30 days is kept. Older ones are thinned to the last one of each day. Versions are removed when you delete the workflow.
