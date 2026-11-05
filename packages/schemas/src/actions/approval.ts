import { z } from 'zod';
import { createValidationPair } from './../createValidation';

export const meta = {
  label: 'Approval',
  icon: 'ShieldCheck',
};

/** A wait such as `30m`, `48h`, `2d` or `1w` (minutes, hours, days, weeks). */
export const APPROVAL_TIMEOUT_PATTERN = /^\s*(\d+)\s*(m|h|d|w)\s*$/;

/** Milliseconds of an approval timeout like `48h`, or null when it isn't one. */
export function parseApprovalTimeout(value: string): number | null {
  const match = APPROVAL_TIMEOUT_PATTERN.exec(value);
  if (!match || Number(match[1]) <= 0) return null;
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[
    match[2] as 'm' | 'h' | 'd' | 'w'
  ];
  return Number(match[1]) * unit;
}

const timeoutMessage = 'use a duration such as 30m, 48h, 2d or 1w';
const isTemplate = (v: string) => v.includes('{{') || v.includes('{=');

export const validations = {
  // Human-in-the-loop: the run stops here (status "paused") until someone approves or
  // rejects it — from an app's Approvals component or the workflow's run history —
  // then continues from this step with the decision as its result.
  request: createValidationPair(
    {
      runtime: z.object({
        title: z.string().min(1),
        details: z.string().optional(),
        timeout: z
          .string()
          .refine((v) => parseApprovalTimeout(v) !== null, timeoutMessage)
          .optional(),
        onTimeout: z.enum(['reject', 'approve']).optional(),
        approvers: z.array(z.string().trim().min(1)).optional(),
        allowSelfApproval: z.boolean().optional(),
        onReject: z.enum(['stop', 'continue']).optional(),
      }),
      creation: z.object({
        title: z.string().min(1),
        details: z.string().optional(),
        timeout: z
          .string()
          .refine((v) => isTemplate(v) || parseApprovalTimeout(v) !== null, timeoutMessage)
          .optional(),
        onTimeout: z.enum(['reject', 'approve']).optional(),
        approvers: z.array(z.string().trim().min(1)).optional(),
        allowSelfApproval: z.boolean().optional(),
        onReject: z.enum(['stop', 'continue']).optional(),
      }),
    },
    {
      label: 'Request Approval',
      icon: '✅',
      category: 'approval',
      description:
        'Pause the workflow until a person approves or rejects it, or until the timeout. A rejection cancels the run unless onReject is continue. Returns { approved, comment, decidedAt, decidedBy } — decidedBy is "timeout" for an automatic decision.',
      returns: 'object',
      fieldConfig: {
        title: {
          component: 'codemirror-template',
          description: 'What is being approved — shown to the approver.',
        },
        details: {
          component: 'codemirror-template',
          description: 'More context for the approver (optional).',
        },
        timeout: {
          description:
            'Decide automatically if nobody has after this long, e.g. 30m, 48h, 2d or 1w (optional — waits forever when empty).',
        },
        onTimeout: {
          label: 'On timeout',
          description: 'What the automatic decision is: reject (default) or approve.',
        },
        onReject: {
          label: 'On reject',
          description:
            'stop (default): a rejection ends the run as canceled and the next steps never run. continue: the step returns the decision and the workflow handles it (check decision.approved).',
        },
        allowSelfApproval: {
          label: 'Requester can approve',
          description:
            'Turn off to require someone other than the person who started the run (four-eyes rule) on a server workspace. On by default.',
        },
        approvers: {
          description:
            'Who may decide on a server workspace: roles (editor, admin) and/or emails. Empty means anyone who can run this workflow. Not enforced on the local workspace, which has no users.',
        },
      },
    }
  ),
};
