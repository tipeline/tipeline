# Backup & Restore

**Settings → Backup** saves everything you've built in Tipeline to one zip file, and brings it back on the same machine or a new one.

## What's in a backup

| Included | Not included |
|----------|--------------|
| Workflows, with their tags, project and image | Run history |
| Apps, with their project and image | Plugins |
| Projects | Hubs |
| Schedules (on or off) | Remote connections |
| Global variables | Settings |

Secret variables are left out unless you tick **Include secret values**. When you include them, they're written to the zip **in plain text**, so keep that file somewhere safe.

## Creating a backup

1. Open **Settings → Backup**.
2. Click **Create Full Backup**.
3. Decide whether to include secret values, then pick where to save the zip.

## Restoring a backup

1. Open **Settings → Backup**.
2. Click **Restore from Backup** and choose the zip.
3. Choose what happens to items that already exist, then click **Restore**:
   - **Off** (default): items already here are kept as they are. Only missing items are added.
   - **On**: items already here are overwritten with the backup's version.

   The dialog also lists what the workflows in the file can do (change files, run programs, connect to servers…) — see [What a Workflow Can Access](/workflows/capabilities). Check it before restoring a file someone else gave you.

Workflows, apps, projects and schedules are matched by their identifier. Global variables are matched by name.

Everything keeps its identifier, so after a restore your apps still use the right workflows, and schedules still run the right workflow. Schedules that were on start running straight away, with no restart needed.

A few things to know:

- **Secrets left out:** if the backup didn't include secret values, a restore never clears a secret you already have. Secrets that are new to this machine are created without a value; the restore message lists them so you can set them in **Variables**.
- **Hub items:** workflows and apps that came from a hub are restored as local copies.
- **Nothing half-done:** the whole file is checked before anything is written. If any part is broken, nothing is restored.
- **Older backups:** backups with files named by identifier, and backups made before apps were included (workflows and variables only), still restore.

## What's inside the zip

The archive is plain files, so you can open it and read it:

```
manifest.json              # format version, counts, and details for each item
tasks/<workflow-name>.yml  # one file per workflow, e.g. tasks/invoice-report.yml
apps/<app-name>.yml        # one file per app
globals.yml                # global variables
assets/workflows/…, assets/apps/…   # workflow and app images
```

Files are named after the workflow or app. When two have the same name, each gets the start of its identifier added (`invoice-report-a1b2c3.yml`). Each workflow file is the same YAML you get from **Export**, so you can also install a single workflow from a backup by hand.

## Export and import one project

To move or share a single project, use a project export instead of a full backup.

**Export:** open the project and click **Export**. The zip holds:

- the project itself
- its workflows and apps, with their images
- workflows that aren't in the project but that its apps use or its workflows call, so the apps still work on the other machine
- the global variables any of those workflows or apps reference. Secret values are left out unless you tick **Include secret values**.

Schedules and run history aren't included.

**Import:** on the **Projects** page, click **Import** and choose the zip. As with a restore, you choose whether items that already exist are kept (default) or replaced. The dialog lists what the project's workflows can do, as for a restore. Items keep their identifiers, so importing the same export twice doesn't create duplicates. A workflow or app goes into every project it was in that exists here (the imported project, and any others already on this machine). An item that's replaced keeps the projects it's in here too.

The import only accepts project exports. To restore a full backup, use **Settings → Backup**. A full restore also accepts a project export.
