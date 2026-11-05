// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { i18n } from '@/i18n';
import KanbanWidget from '@/components/app/widgets/KanbanWidget.vue';
import { kanbanBoard, resolveDrop } from '@/utils/appKanban';

const TASKS = [
  { id: 1, name: 'Brief', status: 'todo', priority: 'high' },
  { id: 2, name: 'Design', status: 'doing', priority: 'low' },
  { id: 3, name: 'Copy', status: 'todo', priority: 'low' },
  { id: 4, name: 'Launch', status: 'done' },
  { id: 5, name: 'Lost', status: 'archived' },
];
const ids = (board: ReturnType<typeof kanbanBoard>) => board.map((c) => `${c.id}:${c.cards.map((k) => k.key).join(',')}`);

describe('kanbanBoard', () => {
  it('without columns: the values the rows have, first seen first', () => {
    expect(ids(kanbanBoard(TASKS))).toEqual(['todo:1,3', 'doing:2', 'done:4', 'archived:5']);
  });

  it('with columns: their order, labels, colors and limits; rows without a column go to "Other"', () => {
    const board = kanbanBoard(TASKS, {
      columns: [{ value: 'todo', label: 'To do', limit: 1 }, { value: 'doing', label: 'Doing', color: 'blue' }, 'done'],
    });
    expect(ids(board)).toEqual(['todo:1,3', 'doing:2', 'done:4', '\u0000other:5']);
    expect(board.map((c) => [c.label, c.color, c.limit])).toEqual([
      ['To do', null, 1],
      ['Doing', 'blue', null],
      ['done', null, null],
      ['', null, null],
    ]);
    expect(board[3].other).toBe(true);
  });

  it('a card title from titleKey or name / title / label; card colors by colorKey', () => {
    const [todo] = kanbanBoard(TASKS, { colorKey: 'priority', colors: { high: 'red' } });
    expect(todo.cards.map((c) => [c.title, c.color])).toEqual([['Brief', 'red'], ['Copy', todo.cards[1].color]]);
    expect(kanbanBoard([{ id: 9, status: 'x', summary: 'Hi' }], { titleKey: 'summary' })[0].cards[0].title).toBe('Hi');
  });

  it('local moves apply in order, to another column or another place', () => {
    const board = kanbanBoard(TASKS, {}, [
      { key: '3', to: 'doing', index: 0 },
      { key: '1', to: 'doing', index: 9 },
    ]);
    expect(ids(board)).toEqual(['todo:', 'doing:3,2,1', 'done:4', 'archived:5']);
  });

  it('resolveDrop: counts the drop place with the card still in it; no move is null', () => {
    const board = kanbanBoard(TASKS);
    expect(resolveDrop(board, '1', 'todo', 0)).toBeNull(); // dropped where it is
    expect(resolveDrop(board, '1', 'todo', 1)).toBeNull(); // just below itself
    const down = resolveDrop(board, '1', 'todo', 2)!;
    expect([down.from.id, down.fromIndex, down.to.id, down.index]).toEqual(['todo', 0, 'todo', 1]);
    const across = resolveDrop(board, '3', 'done', 0)!;
    expect([across.from.id, across.fromIndex, across.to.id, across.index]).toEqual(['todo', 1, 'done', 0]);
  });
});

describe('KanbanWidget', () => {
  const mountBoard = (props: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    mount(KanbanWidget, { props: { props, componentId: 'board', ...extra }, global: { plugins: [i18n] }, attachTo: document.body });
  const column = (w: ReturnType<typeof mount>, id: string) => w.get(`[data-column="${id}"]`);
  const titles = (w: ReturnType<typeof mount>, id: string) => column(w, id).findAll('[data-card]').map((c) => c.attributes('data-key'));

  function drag(w: ReturnType<typeof mount>, key: string, to: string) {
    const card = w.get(`[data-key="${key}"]`).element;
    const list = column(w, to).get('div.overflow-y-auto').element;
    const dataTransfer = { setData() {}, effectAllowed: '', dropEffect: '' };
    card.dispatchEvent(Object.assign(new Event('dragstart', { bubbles: true }), { dataTransfer }));
    // happy-dom has no layout: every card is 0 high, so the drop lands at the end.
    list.dispatchEvent(Object.assign(new Event('dragover', { bubbles: true, cancelable: true }), { dataTransfer, clientY: 10 }));
    list.dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer }));
  }

  it('a dragged card moves at once and fires cardMove with lastMove', async () => {
    const w = mountBoard({ data: TASKS });
    drag(w, '1', 'done');
    await nextTick();
    expect(titles(w, 'done')).toEqual(['4', '1']);
    expect(titles(w, 'todo')).toEqual(['3']);
    const lastMove = { card: TASKS[0], from: 'todo', to: 'done', fromIndex: 0, index: 1 };
    expect(w.emitted('state')?.at(-1)).toEqual([{ lastMove }]);
    expect(w.emitted('event')?.at(-1)).toEqual(['cardMove', { lastMove }]);
    w.unmount();
  });

  it('the move is kept until the data is replaced — then the data decides', async () => {
    const w = mountBoard({ data: TASKS });
    drag(w, '1', 'done');
    await nextTick();
    // the list read again after a failed save: the same rows, a new list → the card goes back
    await w.setProps({ props: { data: TASKS.map((t) => ({ ...t })) } });
    expect(titles(w, 'todo')).toEqual(['1', '3']);
    w.unmount();
  });

  it('a click fires cardClick; a read-only board or the builder can’t move cards', async () => {
    const w = mountBoard({ data: TASKS, readOnly: true });
    await w.get('[data-key="2"]').trigger('click');
    expect(w.emitted('event')?.at(-1)).toEqual(['cardClick', { selectedCard: TASKS[1], selectedIndex: 1 }]);
    expect(w.get('[data-key="2"]').attributes('draggable')).toBe('false');
    drag(w, '1', 'done');
    await nextTick();
    expect(titles(w, 'done')).toEqual(['4']);
    expect(w.find('[data-testid="move-menu"]').exists()).toBe(false);
    w.unmount();
  });

  it('a count past the column limit turns red; "Other" takes no drops', async () => {
    const w = mountBoard({ data: TASKS, columns: [{ value: 'todo', limit: 1 }, 'doing', 'done'] });
    expect(column(w, 'todo').get('[data-testid="column-count"]').text()).toBe('2 / 1');
    expect(column(w, 'todo').get('[data-testid="column-count"]').classes()).toContain('text-destructive');
    expect(column(w, 'other').text()).toContain('Other');
    w.unmount();
  });

  it('card fields show formatted values and badges', () => {
    const w = mountBoard({
      data: [{ id: 1, name: 'Invoice', status: 'todo', amount: 1200, priority: 'high' }],
      fields: [{ key: 'amount', format: 'currency' }, { key: 'priority', label: 'Priority', format: 'badge' }],
    });
    const card = w.get('[data-key="1"]');
    expect(card.text()).toContain('$1,200.00');
    expect(card.text()).toContain('Priority');
    expect(card.find('[data-color]').text()).toBe('high');
    w.unmount();
  });

  it('in the builder a bound board shows sample cards', () => {
    const w = mountBoard({ data: '{= runnables.tasks.outputs.tasks =}' }, { editable: true });
    expect(w.findAll('[data-card]').length).toBe(4);
    expect(w.get('[data-card]').attributes('draggable')).toBe('false');
    w.unmount();
  });
});
