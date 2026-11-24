# Alerts

## Get alerted when something happens

A workflow can tell you that something happened with the [`alert.raise`](/actions/alert)
action: a report found a traffic spike, a disk is almost full, a check failed. The alert
shows up on the dashboard in **Needs you**, next to approvals, failed runs and missed
schedules. Unlike an approval, the run doesn't wait: it carries on and ends normally.

The usual pattern is an If: raise the alert when there's a problem, and resolve it with
[`alert.resolve`](/actions/alert) in the other branch, so a later run clears it once the
problem goes away.

```yaml
- group: flow
  name: ifConditional
  params:
    firstOperand: '{{ visits }}'
    compareAs: number
    operator: gt
    secondOperand: '{{ threshold }}'
    actions:
      - group: alert
        name: raise
        params:
          title: 'Traffic spike: {{ site }}'
          message: '{{ visits }} visits in the last hour (usual {{ baseline }})'
          level: warning
          key: 'spike-{{ site }}'
- group: flow
  name: elseConditional
  params:
    actions:
      - group: alert
        name: resolve
        params:
          key: 'spike-{{ site }}'
```

The full example is `examples/workflows/traffic-spike-alert.yml`.

## One alert per problem

Run on a schedule, a report finds the same problem again and again. Alerts don't pile up:
raising the same `key` from the same workflow updates the alert that's already there.

| Run   | Finds  | Step              | Needs you         |
| ----- | ------ | ----------------- | ----------------- |
| 09:00 | spike  | raise             | alert appears     |
| 10:00 | spike  | raise (same key)  | same alert, "×2"  |
| 11:00 | normal | resolve           | alert disappears  |

Each raise counts up, refreshes the message and level, and points the alert at the latest
run (**See run**). Without a `key`, the title is the key, so identical titles merge into one
alert. Use a key with the thing it's about (`spike-{{ site }}`) to get one alert per site.

`alert.raise` returns `{ id, key, count, isNew }`; `alert.resolve` returns `{ resolved }`,
which is `false` when there was nothing to close. The step is optional: without it, an
alert stays until someone dismisses or [resolves it by hand](#resolving-by-hand).

## Levels

| Level              | Needs you | Counted in the badge | Toast while Tipeline is in front | System notification |
| ------------------ | --------- | -------------------- | -------------------------------- | ------------------- |
| `info`             | yes       |                      |                                  |                     |
| `warning` (default)| yes       | yes                  | yes                              |                     |
| `critical`         | yes       | yes                  | yes                              | yes                 |

You're notified when an alert first appears, and again only if it gets louder (a warning
raised again as critical), not every time it's raised.

## Dismissing

**Dismiss** in Needs you means "I've seen it". The alert leaves the list and stays quiet
while the workflow keeps raising the same key at the same level (or lower); it closes for good
when the workflow resolves it. If it's raised at a higher level than before (a dismissed warning
raised as critical), it's back in Needs you and notifies you, since that isn't what you saw.

| Dismissed alert raised again as… | What happens                                  |
| -------------------------------- | --------------------------------------------- |
| the same level, or lower         | stays dismissed; the count goes up quietly    |
| a higher level                   | back in Needs you, with a notification        |

The workflow's **Overview** lists its open and dismissed alerts and says when a dismissed one
was raised again. **Reopen** puts a dismissed one back in Needs you. The page of a run that
raised a dismissed alert says it stayed quiet, with a Reopen link. Alerts nobody has raised for 30 days, and resolved ones
after 30 days, are removed.

The run page says when a run raised an alert. Deleting a workflow deletes its alerts.

Dismiss and Reopen confirm in a message at the bottom of the window; after a Dismiss,
**Undo** there puts the alert back.

## Resolving by hand

A workflow resolves its alert with `alert.resolve` on the first run that finds things
normal. When you've fixed the problem yourself, **Resolve** on the Alerts page closes it right away, without waiting for that run. It's the same as
the workflow resolving it: the alert moves to Resolved, marked "by you", and if the problem
comes back the next raise is a new alert that notifies you. The resolved one stays on the
Resolved tab with **Came back**, which leads to the new one.

| You…    | Means                         | When it's raised again                      |
| ------- | ----------------------------- | ------------------------------------------- |
| Dismiss | "I've seen it, keep it quiet" | stays quiet, unless it's raised louder      |
| Resolve | "It's fixed"                  | a new alert, in Needs you, with a notification |

Use Resolve for workflows without an `alert.resolve` step too: otherwise a dismissed alert
keeps a recurring problem quiet for up to 30 days.

## The Alerts page

Needs you shows what to act on now. **Alerts** in the sidebar (under Operate, with the number
of open warning and critical alerts) lists every alert in the workspace, in three tabs:

| Tab       | Shows                                                                     |
| --------- | ------------------------------------------------------------------------- |
| Open      | alerts in Needs you                                                       |
| Dismissed | alerts you've seen; **Still happening** marks those raised again since     |
| Resolved  | alerts closed by the workflow (`alert.resolve`) or with Resolve, 30 days  |

Each row has the level, the title with how many times it was raised, the first line of the
message (the arrow shows all of it), the workflow (with the start of its identifier when two
workflows have the same name), when it was last raised and, on Dismissed
and Resolved, when and by whom it was closed. Filter by level or workflow, or search titles.
**Open run** opens the latest run that raised it.

Tick rows to **Dismiss** them together on Open, or **Reopen** them together on Dismissed;
**Resolve** works on both. **All
alerts** in Needs you opens the page, and **See all alerts** on a workflow's Overview opens it on
that workflow. In the workflows list, the **With alerts** scope lists the workflows with an open
alert, and those workflows show a bell next to their name.

From the command line:

```bash
tipeline alert list            # open alerts (--all for dismissed and resolved too)
tipeline alert dismiss <id>    # or --all
tipeline alert reopen <id>
tipeline alert resolve <id...>
```

## Good to know

- Runs that aren't saved (a file run, an app runnable with `persist: false`) still raise
  the alert, without a run to link to.
- Testing a draft the Assistant wrote doesn't create real alerts: `alert.raise` returns
  `id: null` and nothing is saved until the draft is marked ready.
- On a Tipeline Server, you see alerts from the workflows you can see. Dismissing is shared:
  it dismisses the alert for everyone, and it's recorded in the audit log as `alert.dismiss`.
