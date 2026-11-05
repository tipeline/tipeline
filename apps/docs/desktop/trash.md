# Trash

Deleting a workflow or app moves it to the **Trash** (in the sidebar, under Resources). Right after a delete, the message at the bottom of the screen has an **Undo** button.

## What comes back

**Restore** puts the workflow or app back with the same identifier, so apps and sub-workflow steps that use it work again. It also brings back:

- its project, if the project still exists;
- its tags;
- its hub link, so hub updates keep coming, if the hub is still configured;
- its [versions](./builder.md#versions);
- its schedules, **turned off**, so nothing runs before you've checked. Turn them on again under Schedules.

A workflow's **runs are not kept**. They're deleted with the workflow, as before.

A restore fails when something else now has the same identifier, for example after restoring the same workflow from a backup.

## Deleting for good

Items stay in the Trash for 30 days, then they're deleted for good. The **Removed** column shows how long each one has left. **Delete forever** removes one item now, and **Empty Trash** removes them all.

## On a server

On a Tipeline Server only admins can open the Trash, since it holds every user's deleted items. A restored workflow keeps its owner.
