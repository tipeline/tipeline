import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useSourceHistory } from '@/composables/useSourceHistory';

const workflow = (...steps: string[]) => ({ name: 'Flow', pipeline: { actions: steps.map((name) => ({ group: 'math', name })) } });
const steps = (source: any) => source.pipeline.actions.map((a: any) => a.name);

function setup() {
  const source = ref<any>(workflow('a'));
  const history = useSourceHistory(source);
  history.reset();
  return { source, history };
}

describe('useSourceHistory', () => {
  it('undoes and redoes saved changes', () => {
    const { source, history } = setup();
    source.value.pipeline.actions.push({ group: 'math', name: 'b' });
    history.record();
    source.value.pipeline.actions.push({ group: 'math', name: 'c' });
    history.record();

    expect(history.undo()).toBe(true);
    expect(steps(source.value)).toEqual(['a', 'b']);
    expect(history.undo()).toBe(true);
    expect(steps(source.value)).toEqual(['a']);
    expect(history.undo()).toBe(false);

    expect(history.redo()).toBe(true);
    expect(history.redo()).toBe(true);
    expect(steps(source.value)).toEqual(['a', 'b', 'c']);
    expect(history.canRedo.value).toBe(false);
  });

  it("undoes an edit that hasn't been recorded yet", () => {
    const { source, history } = setup();
    source.value.pipeline.actions.splice(0, 1);
    expect(history.canUndo.value).toBe(false); // the builder also counts unsaved edits
    expect(history.undo()).toBe(true);
    expect(steps(source.value)).toEqual(['a']);
  });

  it('drops the redo steps when something new is changed', () => {
    const { source, history } = setup();
    source.value.pipeline.actions.push({ group: 'math', name: 'b' });
    history.record();
    history.undo();
    source.value.pipeline.actions.push({ group: 'math', name: 'x' });
    history.record();
    expect(history.redo()).toBe(false);
    expect(steps(source.value)).toEqual(['a', 'x']);
  });

  it('records nothing for an unchanged save, or for the saved copy core sends back', () => {
    const { source, history } = setup();
    history.record();
    source.value = workflow('a'); // same content, new object
    history.sync();
    history.record();
    expect(history.canUndo.value).toBe(false);
  });

  it('starts over when a workflow is loaded', () => {
    const { source, history } = setup();
    source.value.pipeline.actions.push({ group: 'math', name: 'b' });
    history.record();
    source.value = workflow('z');
    history.reset();
    expect(history.canUndo.value).toBe(false);
    expect(history.undo()).toBe(false);
  });
});
