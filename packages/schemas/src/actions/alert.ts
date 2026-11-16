import { z } from 'zod';
import { createValidationPair } from './../createValidation';

export const meta = {
  label: 'Alert',
  icon: 'BellRing',
};

export const ALERT_LEVELS = ['info', 'warning', 'critical'] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

const raiseShape = {
  title: z.string().trim().min(1),
  message: z.string().optional(),
  level: z.enum(ALERT_LEVELS).optional(),
  key: z.string().trim().optional(),
};

const resolveShape = {
  key: z.string().trim().min(1),
};

export const validations = {
  // Tells the user something happened. Saved in its own table, not the run, so the same
  // key keeps one alert open across runs (×N) until resolve or the user dismisses it.
  // Never waits: the run carries on.
  raise: createValidationPair(
    {
      runtime: z.object(raiseShape),
      creation: z.object(raiseShape),
    },
    {
      label: 'Raise Alert',
      icon: '🔔',
      category: 'alert',
      description:
        'Show an alert in Needs you (and notify, for warning and critical). The run carries on. The same key from the same workflow updates the open alert instead of adding one. Returns { id, key, count, isNew }.',
      returns: 'object',
      fieldConfig: {
        title: {
          description: 'What happened, in a few words — the alert’s headline.',
        },
        message: {
          component: 'codemirror-template',
          description: 'More detail (optional).',
        },
        level: {
          description:
            'info: listed only. warning (default): listed, counted and a toast. critical: also a system notification.',
        },
        key: {
          description:
            'Which alert this is, e.g. `spike-{{ site }}`. Raising the same key again updates the open alert (×2, ×3…); alert.resolve closes it. Empty: the title is the key.',
        },
      },
    }
  ),
  resolve: createValidationPair(
    {
      runtime: z.object(resolveShape),
      creation: z.object(resolveShape),
    },
    {
      label: 'Resolve Alert',
      icon: '✅',
      category: 'alert',
      description:
        'Close this workflow’s alert with this key, because the problem went away. Does nothing when there is none. Returns { resolved }.',
      returns: 'object',
      fieldConfig: {
        key: {
          description:
            'The key the alert was raised with (the title, if the raise step had no key).',
        },
      },
    }
  ),
};
