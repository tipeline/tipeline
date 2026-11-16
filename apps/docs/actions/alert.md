<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Alert Actions

## General

### `raise`

Tells the user something happened: the alert shows in **Needs you** on the
dashboard, next to approvals and failed runs. The run doesn't wait; it carries on.
`warning` (the default) also counts in the Needs you badge and shows a toast while
Tipeline is in front; `critical` also sends a system notification; `info` is only
listed. Raising the same `key` again from the same workflow updates the alert that
is still open instead of adding one: the count goes up (×2, ×3…), the message and
level are refreshed and it points to the latest run. Without a `key`, the title is
the key. Dismissing an alert acknowledges it: later raises keep it quiet until
`alert.resolve` closes it. Runs that aren't saved still raise it (with no run link);
a draft's test run doesn't save one.

**Returns:** `{ id, key, count, isNew }`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `title` | string | ✓ | — | What happened, in a few words — the alert’s headline. |
| `message` | string |  | — | More detail (optional). |
| `level` | `info` \| `warning` \| `critical` |  | — | info: listed only. warning (default): listed, counted and a toast. critical: also a system notification. |
| `key` | string |  | — | Which alert this is, e.g. `spike-{{ site }}`. Raising the same key again updates the open alert (×2, ×3…); alert.resolve closes it. Empty: the title is the key. |

```yaml
# Alert on a traffic spike; clear it once traffic is back to normal
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

## Raise

### `resolve`

Closes this workflow's alert with this `key` because the problem went away — open
or acknowledged, it leaves Needs you. Does nothing when there is none, so it can
run every time things are normal (typically in the other branch of the If that
raises it). A later raise with the same key opens a new alert. Without a `key` on
the raise step, use its title.

**Returns:** `{ resolved }`: whether there was an alert to close.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `key` | string | ✓ | — | The key the alert was raised with (the title, if the raise step had no key). |

```yaml
- group: alert
  name: resolve
  params:
    key: 'spike-{{ site }}'
```
