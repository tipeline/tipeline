import { describe, expect, it } from 'vitest';
import { repeatsOnATimer } from '@task/Draft';
import { Parser } from '@utils/Parser';

// The draft the assistant wrote for "run the random numbers every 30 seconds": it
// proposed the schedule and also looped with a 30-second wait inside the workflow.
const loopingDraft = `
name: Random Numbers Every 30 Seconds
pipeline:
  actions:
    - group: flow
      name: conditionalLoop
      params:
        firstOperand: '{= keepRunning =}'
        compareAs: boolean
        operator: isTrue
        actions:
          - group: subtask
            name: exec
            params:
              identifier: t8KhjSki2Owc9hH8ONMtM
          - group: flow
            name: wait
            params:
              timeout: 30000
`;

describe('repeatsOnATimer', () => {
  it('finds a wait inside a loop, however deep', () => {
    expect(repeatsOnATimer(Parser.importFromString(loopingDraft))).toBe(true);
    expect(
      repeatsOnATimer({
        pipeline: {
          actions: [
            {
              group: 'flow',
              name: 'ifConditional',
              params: {
                actions: [{ group: 'flow', name: 'simpleLoop', actions: [{ group: 'flow', name: 'wait' }] }],
              },
            },
          ],
        },
      })
    ).toBe(true);
  });

  it('leaves alone a workflow that runs once, a wait outside a loop, and a loop without a wait', () => {
    expect(repeatsOnATimer({ pipeline: { actions: [{ group: 'subtask', name: 'exec' }] } })).toBe(false);
    expect(repeatsOnATimer({ pipeline: { actions: [{ group: 'flow', name: 'wait' }] } })).toBe(false);
    expect(
      repeatsOnATimer({
        pipeline: { actions: [{ group: 'flow', name: 'forEachLoop', params: { actions: [{ group: 'file', name: 'write' }] } }] },
      })
    ).toBe(false);
    expect(repeatsOnATimer(null)).toBe(false);
  });
});
