// What a person using an app reads when a run fails. The engine may start an error
// with the action that raised it — "[script.runScript] No owner yet" — which helps when
// fixing a workflow, not when using an app: the tag is dropped there. The Run Console
// keeps the full text.

const ACTION_TAG = /^\s*\[[a-z][\w-]*\.[a-z][\w-]*\]\s*/i;

export function appErrorText(message: string): string {
  return message
    .split('\n')
    .map((line) => line.replace(ACTION_TAG, ''))
    .join('\n');
}
