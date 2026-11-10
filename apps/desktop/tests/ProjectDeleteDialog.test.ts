// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';

const invokeCore = vi.hoisted(() => vi.fn());
vi.mock('@/utils/invoke', () => ({ invokeCore }));
vi.mock('@/components/ui/sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import ProjectDeleteDialog from '@/components/project/ProjectDeleteDialog.vue';
import { SEND } from '@/ipc-channels';

const user = (identifier: string, name: string, project: string | null) => ({
  identifier,
  name,
  projects: project ? [{ identifier: project, name: project, color: null }] : [],
});

// CRM lookup is used by an app in Ops; Quote is used only by this project's app.
const PREVIEW = {
  identifier: 'p-sales',
  name: 'Sales',
  workflows: [
    { identifier: 'wf-crm', name: 'CRM lookup', apps: [user('app-desk', 'Desk', 'Ops')], workflows: [], schedules: [] },
    {
      identifier: 'wf-quote',
      name: 'Quote',
      apps: [user('app-deals', 'Deals', 'Sales')],
      workflows: [],
      schedules: [{ identifier: 's-1', cron: '0 9 * * *', run_at: null, every_seconds: null, enabled: true }],
    },
  ],
  apps: [{ identifier: 'app-deals', name: 'Deals' }],
};

let wrapper: ReturnType<typeof mount> | null = null;

async function openDialog(preview: any = PREVIEW) {
  invokeCore.mockImplementation(async (channel: string) => (channel === SEND.PROJECT_DELETE_PREVIEW ? preview : {}));
  wrapper = mount(ProjectDeleteDialog, {
    props: { identifier: 'p-sales', open: false },
    global: { plugins: [i18n] },
    attachTo: document.body,
  });
  await wrapper.setProps({ open: true });
  await flushPromises();
}

const body = () => document.body;
const buttonByText = (text: string) =>
  [...body().querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
const deleteCall = () => invokeCore.mock.calls.find(([channel]) => channel === SEND.PROJECT_DELETE);

describe('ProjectDeleteDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('keeps the workflows and apps by default', async () => {
    await openDialog();
    expect(body().textContent).toContain('Keep its workflows and apps');
    expect(body().textContent).not.toContain('CRM lookup');

    buttonByText('Delete').click();
    await flushPromises();
    expect(deleteCall()?.[1]).toEqual({ identifier: 'p-sales' });
  });

  it('when deleting the contents, leaves a workflow used elsewhere unticked and says what uses it', async () => {
    await openDialog();
    (body().querySelector('[role="radio"][value="delete"]') as HTMLElement).click();
    await flushPromises();

    expect(body().textContent).toContain('Kept: used by Desk · Ops');
    expect(body().textContent).toContain('1 schedule goes with it');
    expect(body().textContent).toContain('Anything unticked stays');

    buttonByText('Delete project and 2 items').click();
    await flushPromises();
    expect(deleteCall()?.[1]).toEqual({ identifier: 'p-sales', workflows: ['wf-quote'], apps: ['app-deals'] });
  });

  it('can delete a used workflow anyway, and says what breaks', async () => {
    await openDialog();
    (body().querySelector('[role="radio"][value="delete"]') as HTMLElement).click();
    await flushPromises();
    (body().querySelector('[role="checkbox"][data-state="unchecked"]') as HTMLElement).click();
    await flushPromises();

    expect(body().textContent).toContain('Will stop working: Desk · Ops');
    // Unticking the app makes Quote used again, by an app that stays.
    const checkboxes = [...body().querySelectorAll('[role="checkbox"]')] as HTMLElement[];
    checkboxes[checkboxes.length - 1].click();
    await flushPromises();
    expect(body().textContent).toContain('Will stop working: Deals · Sales');

    buttonByText('Delete project and 2 items').click();
    await flushPromises();
    expect(deleteCall()?.[1]).toEqual({ identifier: 'p-sales', workflows: ['wf-quote', 'wf-crm'], apps: [] });
  });

  it('never ticks an item that is also in another project, and says it is only taken out', async () => {
    const also = { alsoIn: [{ identifier: 'p-ops', name: 'Ops' }] };
    await openDialog({
      ...PREVIEW,
      workflows: [...PREVIEW.workflows, { identifier: 'wf-both', name: 'Both', apps: [], workflows: [], schedules: [], ...also }],
      apps: [...PREVIEW.apps, { identifier: 'app-board', name: 'Board', ...also }],
    });
    (body().querySelector('[role="radio"][value="delete"]') as HTMLElement).click();
    await flushPromises();
    expect(body().textContent).toContain('Also in Ops: kept, only taken out of this project');
    const disabled = [...body().querySelectorAll('[role="checkbox"][disabled], [role="checkbox"][data-disabled]')];
    expect(disabled).toHaveLength(2);

    buttonByText('Delete project and 2 items').click();
    await flushPromises();
    expect(deleteCall()?.[1]).toEqual({ identifier: 'p-sales', workflows: ['wf-quote'], apps: ['app-deals'] });
  });

  it('offers only the plain delete for an empty project', async () => {
    await openDialog({ identifier: 'p-sales', name: 'Sales', workflows: [], apps: [] });
    expect(body().textContent).toContain('The project has no workflows or apps.');
    expect(body().querySelector('[role="radio"]')).toBeNull();
  });

  it("says it couldn't check, rather than that the project is empty, when the preview fails", async () => {
    invokeCore.mockImplementation(async (channel: string) => {
      if (channel === SEND.PROJECT_DELETE_PREVIEW) throw new Error('No handler registered');
      return {};
    });
    wrapper = mount(ProjectDeleteDialog, { props: { identifier: 'p-sales', open: false }, global: { plugins: [i18n] }, attachTo: document.body });
    await wrapper.setProps({ open: true });
    await flushPromises();
    expect(body().textContent).toContain("Couldn't check its workflows and apps.");
    expect(body().textContent).not.toContain('The project has no workflows or apps.');
  });
});
