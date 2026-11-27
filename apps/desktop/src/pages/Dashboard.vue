<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { format } from 'date-fns';
import Page from '@/components/Page.vue';
import HomeAsk from '@/components/home/HomeAsk.vue';
import HomeNeedsYou from '@/components/home/HomeNeedsYou.vue';
import HomeContinue from '@/components/home/HomeContinue.vue';
import HomeDayLine from '@/components/home/HomeDayLine.vue';
import HomeHubSuggestions from '@/components/home/HomeHubSuggestions.vue';
import { useConnectionStore } from '@/store/connectionStore';
import { ListChecksIcon, LayoutDashboardIcon } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { useQuery } from '@/composables/useQuery';
import { SEND } from '@/ipc-channels';
import type { TaskItem } from '@/config/tables/TasksList';
import type { ScheduleItem } from '@/config/tables/SchedulesList';
import { openNewAppDialog, openNewTaskDialog } from '@/composables/useNewItemDialogs';
import { useNewItemDefaults } from '@/composables/useNewItemDefaults';

// Home answers two questions at a glance: does anything need me, and how do I get back to
// what I was doing. A card at the bottom suggests things from the Hub until it's hidden.
// Today's numbers are one line under the greeting. How every workflow is doing lives on the Workflows list.
const { t } = useI18n();

const { data: tasks } = useQuery<TaskItem[]>(SEND.TASK_LIST, {});
const { data: schedules } = useQuery<ScheduleItem[]>(SEND.SCHEDULE_LIST, {});

const connectionStore = useConnectionStore();
const assistantAvailable = computed(() => connectionStore.assistantAvailable);

// The greeting uses the first name of the default author (Settings → Defaults) when one is set.
const { author } = useNewItemDefaults();
const firstName = computed(() => author().split(/\s+/)[0] ?? '');

const now = new Date();
const greeting = computed(() => {
  const hour = now.getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  return firstName.value
    ? t(`dashboard.greeting.${part}Name`, { name: firstName.value })
    : t(`dashboard.greeting.${part}`);
});
const todayLabel = format(now, 'EEEE d MMMM');
</script>

<template>
  <!-- The page scrolls as a whole when Needs you is long; the day's numbers sit under the
       greeting so they're always in view. -->
  <Page scrollable>
    <template #content>
      <div class="flex flex-col gap-7 w-full max-w-6xl mx-auto shrink-0 pb-2">
        <header class="flex flex-wrap items-end justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm text-muted-foreground m-0">{{ todayLabel }}</p>
            <h1 class="text-2xl font-semibold tracking-tight m-0 mt-0.5">{{ greeting }}</h1>
            <HomeDayLine :schedules="schedules" class="mt-1.5" />
          </div>
          <div class="flex items-center gap-2">
            <Button variant="outline" @click="openNewAppDialog()">
              <LayoutDashboardIcon class="w-4 h-4" />
              {{ t('dashboard.quickActions.newApp') }}
            </Button>
            <Button @click="openNewTaskDialog()">
              <ListChecksIcon class="w-4 h-4" />
              {{ t('dashboard.quickActions.newTask') }}
            </Button>
          </div>
        </header>

        <!-- The sidebar isn't offered on a remote workspace, so neither is the box. -->
        <HomeAsk v-if="assistantAvailable" />

        <HomeNeedsYou :tasks="tasks" :schedules="schedules" />

        <HomeContinue />

        <HomeHubSuggestions />
      </div>
    </template>
  </Page>
</template>
