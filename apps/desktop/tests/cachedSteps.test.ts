import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { updateTimelineWithEvents } from '@/composables/useTimelineUpdater';
import { usePipelineResult } from '@/composables/usePipelineResult';

const ev = (type: string, timestamp: number, data?: any) => ({ type, timestamp, data, correlationId: 'c' });

describe('cached steps', () => {
  it('marks a live step served from the cache, and only that one', () => {
    const actions: any[] = [
      { identifier: 'a1', status: 'pending' },
      { identifier: 'a2', status: 'pending' },
    ];
    updateTimelineWithEvents(actions, [
      ev('action', 2, { identifier: 'a1', result: 5, cached: true, cachedAt: '2026-10-08T10:00:00Z' }),
      ev('action', 3, { identifier: 'a2', result: 6 }),
      ev('end_all', 4, {}),
    ]);
    expect(actions.map((a) => a.cached)).toEqual([true, false]);
  });

  it('marks a saved step served from the cache', () => {
    const timeline = ref<any[]>([]);
    usePipelineResult(
      {
        source: JSON.stringify({
          pipeline: {
            actions: [
              { identifier: 'a1', group: 'http', name: 'request', params: {} },
              { identifier: 'a2', group: 'math', name: 'sum', params: {} },
            ],
          },
        }),
        actions: [
          { identifier: 'a1', status: 'completed', result: '1', cached: 1 },
          { identifier: 'a2', status: 'completed', result: '2', cached: 0 },
        ],
      },
      timeline
    );
    expect(timeline.value.map((a) => a.cached)).toEqual([true, false]);
  });
});
