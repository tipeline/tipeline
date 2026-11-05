# Approvals

A workflow can stop and wait for a person with the
[`approval.request`](/actions/approval) action. The run is saved as **Awaiting approval**;
once someone decides:

- **Approved** — the run continues from that step, which returns the decision (`approved`,
  `comment`, `decidedBy`, `decidedAt`).
- **Rejected** — the run ends as **Canceled** right there: the following steps never run, and
  the run shows who rejected it and why. A request rejected by its timeout ends the same way.
  To handle rejections yourself (notify the requester, record it…), set `onReject: continue`:
  the step then returns the decision and the workflow checks `decision.approved`.

```yaml
- group: approval
  name: request
  params:
    title: 'Refund order {{ orderId }}?'
    onReject: continue
  destination: decision
- group: flow
  name: ifConditional
  params:
    firstOperand: '{{ decision.approved }}'
    compareAs: boolean
    operator: isFalse
    actions:
      - group: system
        name: message
        params:
          text: 'Refund rejected by {{ decision.decidedBy }}: {{ decision.comment }}'
```

## Deciding

Decide from:

- the **Approvals** page in the sidebar: **Waiting** lists every waiting run (the sidebar
  badge shows how many you can decide), **Decided** is the history of who approved or
  rejected what, when and with which comment, including automatic decisions. New requests
  show a notification — a system notification when Tipeline isn't in front — and clicking it
  opens the page. The inbox badge next to the title of Home's full view lists the ones waiting for you;
- the workflow's **Runs** tab (Approve / Reject on the run); or
- an `approvals` component in an app, which lists pending approvals of the app's workflows
  with an optional comment. Apps can only see and decide runs of workflows they declare.

## Timeouts

With a `timeout` (`30m`, `48h`, `2d`, `1w`), a request nobody decides in time is decided
automatically — rejected, or approved with `onTimeout: approve` — and the decision has
`decidedBy: timeout`. Core checks every 30 seconds, and catches up on requests that expired
while it was stopped:

```yaml
- group: approval
  name: request
  params:
    title: 'Pay invoice {{ invoiceNumber }}?'
    timeout: 48h
    onTimeout: reject
  destination: decision
```

See [Apps → Approvals](/apps/#approvals) for approvals inside an app: the `approvals`
component and what a runnable does while its run waits (`onPaused`).

## Who can approve on a server

On a server workspace every decision is recorded under the signed-in user's email (an app
decision as `ed@acme.com (app:Expenses)`) and written to the audit log as
`approval.approve` / `approval.reject`. Who may decide:

| `approvers` on the request | Who can decide |
|---|---|
| not set | editors and admins who can see the workflow |
| roles, e.g. `[editor]` | that role and the roles above it |
| emails, e.g. `[finance@acme.com]` | those users — even viewers, e.g. a manager who only approves |

Admins can always decide. Runs of private workflows owned by someone else don't appear.

**Four-eyes rule** — add `allowSelfApproval: false` and the person who started the run
(directly or through an app) can't decide it, admins included; the request shows "started
by …" and someone else has to decide. It's off by default so a single-person server isn't
left with requests nobody can approve. Runs started by a schedule or webhook have no
requester, so anyone allowed by `approvers` can decide them.
Everyone else sees the request with a note saying who can decide it. The badge and
notifications count only requests you can decide.

```yaml
- group: approval
  name: request
  params:
    title: 'Pay invoice {{ invoiceNumber }}?'
    approvers: [admin, finance@acme.com]
    allowSelfApproval: false
  destination: decision
```

On the local workspace there are no users, so `approvers` is shown but not enforced, and
`allowSelfApproval` has no effect.
