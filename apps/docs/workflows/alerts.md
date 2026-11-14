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
which is `false` when there was nothing to close. Resolving is optional: without it, an
alert stays until someone dismisses it.

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
while the workflow keeps raising the same key; it closes for good when the workflow resolves
it. The workflow's **Overview** lists its open and dismissed alerts, and **Reopen** puts a
dismissed one back in Needs you. Alerts nobody has raised for 30 days, and resolved ones
after 30 days, are removed.

The run page says when a run raised an alert. Deleting a workflow deletes its alerts.

From the command line:

```bash
tipeline alert list            # open alerts (--all for dismissed and resolved too)
tipeline alert dismiss <id>    # or --all
tipeline alert reopen <id>
```

## Good to know

- Runs that aren't saved (a file run, an app runnable with `persist: false`) still raise
  the alert, without a run to link to.
- Testing a draft the Assistant wrote doesn't create real alerts: `alert.raise` returns
  `id: null` and nothing is saved until the draft is marked ready.
- On a Tipeline Server, you see alerts from the workflows you can see. Dismissing is shared:
  it dismisses the alert for everyone, and it's recorded in the audit log as `alert.dismiss`.
