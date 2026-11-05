// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));
vi.mock('@/components/ui/sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { invokeCore } from '@/utils/invoke';
import { toast } from '@/components/ui/sonner';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import ScheduleForm from '@/components/schedule/ScheduleForm.vue';
import TaskSchedulesCard from '@/components/schedule/TaskSchedulesCard.vue';
import DraftBanner from '@/components/task/DraftBanner.vue';
import AgentDraftedCard from '@/components/agent/AgentDraftedCard.vue';
import type { ScheduleItem } from '@/config/tables/SchedulesList';

const global = { plugins: [i18n], stubs: { teleport: true } };

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(invokeCore).mockReset();
  vi.mocked(toast.warning).mockReset();
  vi.mocked(toast.success).mockReset();
  // useQuery (the workflow list and the chosen workflow) goes straight to ipcRenderer.
  (window as any).ipcRenderer = {
    invoke: vi.fn(async (channel: string) => {
      if (channel === SEND.TASK_LIST) return [{ identifier: 'wf-sales', name: 'Sales report' }];
      if (channel === SEND.TASK_DETAIL) return { source: JSON.stringify({ pipeline: { variables: [] } }) };
      return null;
    }),
    on: vi.fn(),
    off: vi.fn(),
    send: vi.fn(),
  };
});

afterEach(() => {
  delete (window as any).ipcRenderer;
});

function mountForm(props: Record<string, unknown> = {}) {
  return mount(ScheduleForm, {
    props: { mode: 'create', fixedTaskIdentifier: 'wf-sales', ...props },
    global,
    attachTo: document.body,
  });
}

async function typeWhen(wrapper: ReturnType<typeof mountForm>, text: string) {
  await wrapper.find('input[type="text"]').setValue(text);
  await flushPromises();
}

async function submit(wrapper: ReturnType<typeof mountForm>) {
  await wrapper.find('form').trigger('submit');
  // vee-validate checks the schema and runs the submit handler a little later.
  await new Promise((resolve) => setTimeout(resolve, 50));
  await flushPromises();
}

const calls = (channel: string) =>
  vi.mocked(invokeCore).mock.calls.filter(([c]) => c === channel).map(([, payload]) => payload);

describe('ScheduleForm', () => {
  it('reads plain words and shows what they mean, the cron and the next runs', async () => {
    const wrapper = mountForm();
    await typeWhen(wrapper, 'every weekday at 9am');

    const preview = wrapper.find('[data-testid="schedule-preview"]').text();
    expect(preview).toContain('At 09:00, Monday through Friday');
    expect(preview).toContain('Cron: 0 9 * * 1-5');
    expect(preview).toMatch(/Next: .+09:00 · .+09:00 · .+09:00/);
  });

  it('fills the box from a preset', async () => {
    const wrapper = mountForm();
    const preset = wrapper.findAll('button[type="button"]').find((b) => b.text() === 'every 30 seconds')!;
    await preset.trigger('click');
    await flushPromises();

    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('every 30 seconds');
    expect(wrapper.find('[data-testid="schedule-preview"]').text()).toContain('Every 30 seconds');
  });

  it('warns how many runs a day a frequent schedule makes', async () => {
    const wrapper = mountForm();
    await typeWhen(wrapper, 'every 20 seconds');
    expect(wrapper.find('[data-testid="schedule-preview"]').text()).toContain('Up to 4,320 runs a day');

    await typeWhen(wrapper, 'every day at 9');
    expect(wrapper.find('[data-testid="schedule-preview"]').text()).not.toContain('runs a day');
  });

  it('saves words as a cron, and a one-time date as runAt', async () => {
    vi.mocked(invokeCore).mockResolvedValue('sched-1');
    const wrapper = mountForm();
    await typeWhen(wrapper, 'every weekday at 9am');
    await submit(wrapper);
    expect(calls(SEND.SCHEDULE_SET)).toEqual([{ identifier: 'wf-sales', cron: '0 9 * * 1-5', variables: {} }]);

    const once = mountForm();
    await typeWhen(once, 'tomorrow at 8am');
    expect(once.find('[data-testid="schedule-preview"]').text()).toContain('Runs once:');
    await submit(once);
    const tomorrow8 = new Date();
    tomorrow8.setDate(tomorrow8.getDate() + 1);
    tomorrow8.setHours(8, 0, 0, 0);
    expect(calls(SEND.SCHEDULE_SET)[1]).toEqual({ identifier: 'wf-sales', runAt: tomorrow8.toISOString(), variables: {} });
  });

  it('saves an interval a cron cannot keep even as everySeconds', async () => {
    vi.mocked(invokeCore).mockResolvedValue('sched-1');
    const wrapper = mountForm();
    await typeWhen(wrapper, 'every 40 seconds');

    const preview = wrapper.find('[data-testid="schedule-preview"]').text();
    expect(preview).toContain('Every 40 seconds');
    expect(preview).toContain('Up to 2,160 runs a day');
    await submit(wrapper);
    expect(calls(SEND.SCHEDULE_SET)).toEqual([{ identifier: 'wf-sales', everySeconds: 40, variables: {} }]);
  });

  it('refuses a schedule closer than 10 seconds without saving', async () => {
    const wrapper = mountForm();
    await typeWhen(wrapper, 'every 5 seconds');
    await submit(wrapper);

    expect(wrapper.text()).toContain('Schedules can run at most every 10 seconds.');
    expect(calls(SEND.SCHEDULE_SET)).toEqual([]);
  });

  it('on edit, saves the new schedule before removing the old one', async () => {
    const order: string[] = [];
    vi.mocked(invokeCore).mockImplementation(async (channel: string) => {
      order.push(channel);
      return 'ok';
    });
    const wrapper = mountForm({
      mode: 'edit',
      initialData: { scheduleIdentifier: 'old', taskIdentifier: 'wf-sales', cron: '0 9 * * *', variables: {} },
    });
    await flushPromises();
    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('0 9 * * *');

    await typeWhen(wrapper, 'every day at 10');
    await submit(wrapper);
    expect(order).toEqual([SEND.SCHEDULE_SET, SEND.SCHEDULE_REMOVE]);
  });

  it('keeps the old schedule when the new one is refused', async () => {
    vi.mocked(invokeCore).mockImplementation(async (channel: string) => {
      if (channel === SEND.SCHEDULE_SET) throw new Error('nope');
      return 'ok';
    });
    const wrapper = mountForm({
      mode: 'edit',
      initialData: { scheduleIdentifier: 'old', taskIdentifier: 'wf-sales', cron: '0 9 * * *', variables: {} },
    });
    await typeWhen(wrapper, 'every day at 10');
    await submit(wrapper);
    expect(calls(SEND.SCHEDULE_REMOVE)).toEqual([]);
  });

  it('shows the workflow picker only when no workflow is chosen already', async () => {
    expect(mountForm().text()).not.toContain('Workflow');
    expect(mountForm({ fixedTaskIdentifier: undefined }).text()).toContain('Workflow');
  });
});

describe('TaskSchedulesCard', () => {
  const schedules: ScheduleItem[] = [
    {
      scheduleIdentifier: 's1',
      taskIdentifier: 'wf-sales',
      taskName: 'Sales report',
      cron: '0 9 * * 1-5',
      variables: {},
      enabled: true,
      nextRunAt: '2026-10-23T14:00:00.000Z',
    },
    {
      scheduleIdentifier: 's2',
      taskIdentifier: 'wf-sales',
      taskName: 'Sales report',
      cron: null,
      runAt: '2026-10-20T14:00:00.000Z',
      variables: {},
      enabled: false,
      nextRunAt: null,
      lastRunAt: '2026-10-20T14:00:01.000Z',
    },
    { scheduleIdentifier: 's3', taskIdentifier: 'other', taskName: 'Other', cron: '0 0 * * *', variables: {}, enabled: true },
  ];

  function mountCard(draft = false) {
    vi.mocked(invokeCore).mockImplementation(async (channel: string) =>
      channel === SEND.SCHEDULE_LIST ? schedules : undefined
    );
    return mount(TaskSchedulesCard, {
      props: { taskIdentifier: 'wf-sales', taskName: 'Sales report', draft },
      global,
    });
  }

  it("lists this workflow's schedules in words, with a finished one-time schedule as done", async () => {
    const wrapper = mountCard();
    await flushPromises();
    const rows = wrapper.findAll('li').map((li) => li.text());

    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('At 09:00, Monday through Friday');
    expect(rows[0]).toContain('Next run:');
    expect(rows[1]).toMatch(/^Once, /);
    expect(rows[1]).toContain('Ran ');
    expect(rows[1]).toContain('Done');
  });

  it('turns a schedule off from its switch', async () => {
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.find('li button[role="switch"]').trigger('click');
    await flushPromises();
    expect(calls(SEND.SCHEDULE_TOGGLE)).toEqual([{ scheduleIdentifier: 's1', enabled: false }]);
  });

  it("can't add a schedule to a draft", async () => {
    const wrapper = mountCard(true);
    await flushPromises();
    expect(wrapper.text()).toContain('Mark the draft as ready to schedule it.');
    const add = wrapper.findAll('button').find((b) => b.text().includes('Add schedule'))!;
    expect(add.attributes('disabled')).toBeDefined();
  });
});

describe('a schedule proposed with a draft', () => {
  const task = {
    identifier: 'wf-sales',
    metadata: { draft: true, draftSchedule: { when: 'every day at 9am', cron: '0 9 * * *', runAt: null } },
  };
  const noCapabilities = { capabilities: [], unknownWorkflows: [] };
  // Marking ready answers with `result`; the banner also asks what the draft can do.
  const answer = (result: unknown, capabilities: unknown = noCapabilities) =>
    vi.mocked(invokeCore).mockImplementation(async (channel: string) =>
      channel === SEND.TASK_CAPABILITIES ? capabilities : result
    );

  it('shows on the draft banner, and marking ready can turn it on', async () => {
    answer({ identifier: 'wf-sales', scheduleIdentifier: 'sched-1' });
    const wrapper = mount(DraftBanner, { props: { task }, global });

    expect(wrapper.find('[data-testid="draft-proposed-schedule"]').text()).toBe('Proposed schedule: At 09:00');
    const button = wrapper.findAll('button').find((b) => b.text() === 'Mark ready and schedule')!;
    await button.trigger('click');
    await flushPromises();

    expect(calls(SEND.TASK_MARK_READY)).toEqual([{ identifier: 'wf-sales', withSchedule: true }]);
    expect(toast.success).toHaveBeenCalledWith('Marked as ready and scheduled.');
    expect(wrapper.emitted('ready')).toHaveLength(1);
  });

  it('still marks the draft ready when the schedule could not start, and says why', async () => {
    answer({ identifier: 'wf-sales', scheduleError: 'That time has already passed.' });
    const wrapper = mount(DraftBanner, { props: { task }, global });
    await wrapper.findAll('button').find((b) => b.text() === 'Mark ready and schedule')!.trigger('click');
    await flushPromises();

    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("couldn't be turned on"), {
      description: 'That time has already passed.',
    });
    expect(wrapper.emitted('ready')).toHaveLength(1);
  });

  it('says what the draft can do, and asks to check those steps when one needs a look', async () => {
    answer(null, {
      capabilities: [
        { capability: 'files.write', review: true, steps: [{ action: 'file.remove', label: 'Remove' }] },
        { capability: 'network.send', review: false, steps: [{ action: 'http.request', label: 'HTTP Request' }] },
      ],
      unknownWorkflows: [],
    });
    const wrapper = mount(DraftBanner, { props: { task }, global });
    await flushPromises();

    expect(calls(SEND.TASK_CAPABILITIES)).toEqual([{ identifier: 'wf-sales' }]);
    const line = wrapper.find('[data-testid="draft-capabilities"]');
    expect(line.text()).toContain('This draft can');
    expect(line.text()).toContain('Changes or deletes files');
    expect(line.text()).toContain('Sends data online');
    expect(line.text()).toContain('Check those steps before marking it ready.');
  });

  it('has no capabilities line for a draft that only works with data', async () => {
    answer(null);
    const wrapper = mount(DraftBanner, { props: { task }, global });
    await flushPromises();
    expect(wrapper.find('[data-testid="draft-capabilities"]').exists()).toBe(false);
  });

  it('offers only plain "Mark as ready" when nothing was proposed', () => {
    const wrapper = mount(DraftBanner, { props: { task: { identifier: 'x', metadata: { draft: true } } }, global });
    expect(wrapper.findAll('button').map((b) => b.text())).toEqual(['Mark as ready']);
  });

  it('shows in the assistant chat as off until the draft is ready', () => {
    const wrapper = mount(AgentDraftedCard, {
      props: {
        turn: {
          id: 't1',
          prompt: 'sales report every weekday',
          phase: 'drafted',
          draft: {
            kind: 'drafted',
            identifier: 'wf-sales',
            name: 'Sales report',
            summary: '',
            todos: [],
            warnings: [],
            schedule: { when: 'every weekday at 9am', cron: '0 9 * * 1-5', runAt: null },
          },
        } as any,
      },
      global,
    });
    const text = wrapper.find('[data-testid="drafted-schedule"]').text();
    expect(text).toContain('Proposed schedule: At 09:00, Monday through Friday');
    expect(text).toContain('Off until you mark the draft as ready');
  });
});
