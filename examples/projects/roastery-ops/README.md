# Roastery Ops

A complete project for a small coffee roastery ("Bean & Brew Roastery"). Restore it to see
how a project's pieces fit together: workflows, sub-workflows, apps, schedules, global
variables, assistant instructions and a project map.

The folder holds what a backup archive holds: `manifest.json`, `globals.yml`, `tasks/` and `apps/`.

## Restore it

```bash
cd examples/projects/roastery-ops
zip -r /tmp/roastery-ops.zip manifest.json globals.yml tasks apps
```

Then in Desktop go to **Settings → Restore**, pick `/tmp/roastery-ops.zip` and choose **Skip**
(anything already there stays as it is) or **Replace**. Use Restore, not **Projects → Import**:
Import leaves schedules out.

Open **Roastery Manager** once. Its Dashboard runs **Roastery: Setup**, which creates the SQLite
store at `~/Tipeline/output/roastery/roastery.db` with 8 coffees and about six weeks of orders.
Delete that folder to start over.

## What's in it

| Kind | Items |
|---|---|
| Workflows | Setup, Dashboard, List Inventory, Record Roast, List Orders, Add Order, Set Order Status, Low Stock Check, Daily Sales Report, Simulate Orders, Data: Roastery Alerts |
| Helper | Roastery: Notify Team (`helper: true`): saves an alert, and posts it to a webhook when one is set |
| Sub-workflow calls | Low Stock Check and Daily Sales Report call Notify Team; Simulate Orders calls Add Order |
| Apps | **Roastery Manager**: Dashboard, Orders (bulk status, New order drawer), Inventory (roast form, origin map), Alerts (run buttons, runs list). **Order Desk**: a one-page counter app |
| Schedules | Low stock check every hour (on), daily sales report at 8:00 (on), order simulator every 20 minutes (off) |
| Globals | `roasteryShopName`, `roasteryLowStockKg`, `roasteryAlertWebhook` (secret, empty), `roasteryLastStockCheck` (written by Low Stock Check) |
| Project map | Owners and lanes, four planned items not built yet (wholesale invoices, their schedule, a mail global, a green-bean reorder) and a sticky note |

Set `roasteryAlertWebhook` to a Slack incoming-webhook URL to get alerts in chat as well.

## Editing

Restore copies these files into the database as they are, so:

- Every step needs a unique `identifier`, including steps inside `if` blocks. An install adds
  these for you; a restore doesn't, and a step without one fails the run.
- App files leave out `name`, `description` and `author`. Those come from `manifest.json`.
  Keep each workflow's `name` and `description` the same in its file and in the manifest.

`apps/core/tests/validation/ProjectExamples.test.ts` checks all of this and restores the
folder into an empty database.
