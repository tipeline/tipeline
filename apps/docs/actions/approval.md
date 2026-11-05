<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Approval Actions

## General

### `request`

Pauses the run until someone approves or rejects it — from the Approvals page, the
workflow's run history or an app's Approvals component. Once decided the run resumes
(completed steps are skipped). Approved: this step returns the decision. Rejected: the
run ends as canceled — or, with `onReject: continue`, the step returns the decision
for the workflow to handle (check `decision.approved`). With a `timeout`
(e.g. `48h`) nobody deciding in time decides automatically — rejected unless
`onTimeout: approve` — with `decidedBy: timeout`. On a server workspace, `approvers`
(roles and/or emails) limits who may decide, and `allowSelfApproval: false` keeps the
person who started the run from deciding it. Inside a loop each iteration is its
own request. Needs run history, so it fails in runs that aren't saved.

**Returns:** The decision: `{ approved, comment, decidedBy, decidedAt }`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `title` | string | ✓ | — | What is being approved — shown to the approver. |
| `details` | string |  | — | More context for the approver (optional). |
| `timeout` | string |  | — | Decide automatically if nobody has after this long, e.g. 30m, 48h, 2d or 1w (optional — waits forever when empty). |
| `onTimeout` | `reject` \| `approve` |  | — | What the automatic decision is: reject (default) or approve. |
| `approvers` | string[] |  | — | Who may decide on a server workspace: roles (editor, admin) and/or emails. Empty means anyone who can run this workflow. Not enforced on the local workspace, which has no users. |
| `allowSelfApproval` | boolean |  | — | Turn off to require someone other than the person who started the run (four-eyes rule) on a server workspace. On by default. |
| `onReject` | `stop` \| `continue` |  | — | stop (default): a rejection ends the run as canceled and the next steps never run. continue: the step returns the decision and the workflow handles it (check decision.approved). |

```yaml
# Ask before paying, then only pay when approved
- group: approval
  name: request
  params:
    title: 'Pay invoice {{ invoiceNumber }}?'
    details: '{{ amount }} to {{ supplier }}'
    timeout: 48h
    approvers: [admin, finance@acme.com]
    allowSelfApproval: false
  destination: decision
- group: flow
  name: ifConditional
  params:
    firstOperand: '{{ decision.approved }}'
    compareAs: boolean
    operator: isTrue
    actions:
      - group: system
        name: message
        params:
          text: Approved by {{ decision.decidedBy }}
```
