import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { extractActionExamples, renderGeneratedFile, OUTPUT_FILE } from '../../scripts/extractActionExamples';
import { ACTION_EXAMPLES } from '@engine/actionExamples.generated';
import { exampleIsUsable } from '@engine/WorkflowAuthoring';

describe('action examples', () => {
  it('match the JSDoc @example blocks (run `npm -w apps/core run generate:examples` if not)', () => {
    expect(fs.readFileSync(OUTPUT_FILE, 'utf8')).toBe(renderGeneratedFile(extractActionExamples()));
  });

  it('cover most actions', () => {
    expect(Object.keys(ACTION_EXAMPLES).length).toBeGreaterThan(300);
  });

  /**
   * An example that fails its action's own field check (or uses {{ env.X }}, which the
   * engine doesn't resolve) is not shown to the assistant. Fix the example — or the
   * schema, when the example is right — rather than adding to this list.
   */
  it('pass their own action\'s check, except the known ones', () => {
    const unusable = Object.entries(ACTION_EXAMPLES)
      .filter(([key, yaml]) => {
        const [group, name] = key.split('.');
        return !exampleIsUsable(group, name, yaml);
      })
      .map(([key]) => key);
    // html.extractData: the example passes `schema: '{= extractSchema =}'`, but the
    // creation schema takes only a literal object — the schema should accept a variable.
    expect(unusable).toEqual(['html.extractData']);
  });

  it('leave out examples that use {{ env.X }}', () => {
    expect(exampleIsUsable('system', 'message', "- group: system\n  name: message\n  params:\n    text: '{{ env.HOME }}'\n")).toBe(false);
    expect(exampleIsUsable('system', 'message', "- group: system\n  name: message\n  params:\n    text: '{{ _env.HOME }}'\n")).toBe(true);
  });
});
