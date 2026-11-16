// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '@/i18n';
import KanbanWidget from '@/components/app/widgets/KanbanWidget.vue';

// Touch drag: native drag and drop never starts from a finger, so a phone held a card and
// nothing moved. Holding a card picks it up; moving before that is a swipe (scroll).
const data = [
  { id: 1, title: 'Brief', status: 'todo' },
  { id: 2, title: 'Form', status: 'doing' },
];
const columns = [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'Doing' },
];

function mountBoard() {
  return mount(KanbanWidget, {
    props: { props: { data, columns, groupKey: 'status' } },
    global: { plugins: [i18n] },
    attachTo: document.body,
  });
}

function pointer(type: string, x: number, y: number) {
  return new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true });
}

describe('KanbanWidget touch drag', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('holding a card picks it up and dropping it on another column moves it', async () => {
    const wrapper = mountBoard();
    const card = wrapper.find('[data-key="1"]').element as HTMLElement;
    const doing = wrapper.find('[data-kanban-list="doing"]').element as HTMLElement;
    document.elementFromPoint = () => doing;

    card.dispatchEvent(pointer('pointerdown', 10, 10));
    vi.advanceTimersByTime(400);
    window.dispatchEvent(pointer('pointermove', 300, 200));
    window.dispatchEvent(pointer('pointerup', 300, 200));
    card.click();

    const moves = wrapper.emitted('event')!.filter(([name]) => name === 'cardMove');
    expect(moves).toHaveLength(1);
    expect((moves[0][1] as any).lastMove).toMatchObject({ from: 'todo', to: 'doing', index: 1 });
    // The tap that ends the drag doesn't also open the card.
    expect(wrapper.emitted('event')!.some(([name]) => name === 'cardClick')).toBe(false);
    wrapper.unmount();
  });

  it('a swipe before the hold ends scrolls instead of picking the card up', async () => {
    const wrapper = mountBoard();
    const card = wrapper.find('[data-key="1"]').element as HTMLElement;
    document.elementFromPoint = () => wrapper.find('[data-kanban-list="doing"]').element;

    card.dispatchEvent(pointer('pointerdown', 10, 10));
    window.dispatchEvent(pointer('pointermove', 10, 60));
    vi.advanceTimersByTime(400);
    window.dispatchEvent(pointer('pointerup', 300, 200));

    expect(wrapper.emitted('event')?.some(([name]) => name === 'cardMove') ?? false).toBe(false);
    expect(document.body.querySelectorAll('[data-card]')).toHaveLength(2);
    wrapper.unmount();
  });
});
