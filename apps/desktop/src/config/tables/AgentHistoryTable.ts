import { h } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import type { Router } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import type { AgentRunRecord } from '@/store/agentStore';

export function createColumns(t: (key: string) => string, router: Router): ColumnDef<AgentRunRecord>[] {
  const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
    running: { label: t('agent.history.running'), class: 'bg-blue-500/10 text-blue-500 border border-blue-500/20' },
    proposed: { label: t('agent.history.proposed'), class: 'bg-amber-500/10 text-amber-600 border border-amber-500/20' },
    done: { label: t('agent.history.done'), class: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' },
    error: { label: t('agent.history.error'), class: 'bg-red-500/10 text-red-500 border border-red-500/20' },
  };

  return [
    {
      accessorKey: 'prompt',
      header: () => t('agent.history.prompt'),
      cell: (info) => {
        const row = info.row.original;
        return h('span', { class: 'text-sm truncate max-w-[320px] block', title: row.prompt }, row.prompt);
      },
    },
    {
      id: 'status_badge',
      accessorKey: 'status',
      header: () => t('agent.history.status'),
      cell: (info) => {
        const row = info.row.original;
        const cfg = STATUS_CONFIG[row.status] ?? {
          label: row.status,
          class: 'bg-gray-400/10 text-gray-500 border border-gray-400/20',
        };
        return h(
          'span',
          { class: `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.class}` },
          cfg.label
        );
      },
    },
    {
      id: 'task',
      header: () => t('agent.history.task'),
      cell: (info) => {
        const row = info.row.original;
        if (!row.task_identifier) return h('span', { class: 'text-muted-foreground text-sm' }, '—');
        return h('span', { class: 'text-sm' }, row.task_name ?? row.task_identifier);
      },
    },
    {
      id: 'result',
      header: () => t('agent.history.result'),
      cell: (info) => {
        const row = info.row.original;
        const text = row.status === 'error' ? row.error : row.answer;
        if (!text) return h('span', { class: 'text-muted-foreground text-sm' }, '—');
        return h('span', { class: 'text-sm text-muted-foreground truncate max-w-[320px] block', title: text }, text);
      },
    },
    {
      accessorKey: 'created_at',
      header: () => t('agent.history.started'),
      cell: (info) => {
        const row = info.row.original;
        return h(
          'span',
          { class: 'text-sm text-muted-foreground whitespace-nowrap' },
          `${formatDistanceToNow(new Date(row.created_at))} ago`
        );
      },
    },
    {
      id: 'run_link',
      header: () => t('agent.history.run'),
      cell: (info) => {
        const row = info.row.original;
        // No task_identifier at all means the tool call never got far enough to run
        // anything (e.g. the agent couldn't find a matching task) — nothing to link to.
        if (!row.task_identifier) return h('span', { class: 'text-muted-foreground text-sm' }, '—');
        const isExactRun = !!row.pipeline_identifier;
        return h(
          'a',
          {
            href: '#',
            class: 'text-xs text-primary hover:underline whitespace-nowrap',
            onClick: (e: Event) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(
                isExactRun
                  ? `/tasks/${row.task_identifier}/pipelines/${row.pipeline_identifier}`
                  : `/tasks/${row.task_identifier}`
              );
            },
          },
          isExactRun ? t('agent.viewLiveRun') : t('agent.viewTaskHistory')
        );
      },
    },
  ];
}
