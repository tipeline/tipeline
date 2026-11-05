<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Page from '@/components/Page.vue';
import HomeSimple from '@/components/home/HomeSimple.vue';
import HomeToday from '@/components/home/HomeToday.vue';
import HomeStarred from '@/components/home/HomeStarred.vue';
import HomeRecentItems from '@/components/home/HomeRecentItems.vue';
import HomeRecentActivity from '@/components/home/HomeRecentActivity.vue';
import HomeInbox from '@/components/home/HomeInbox.vue';
import HomeBrowse from '@/components/home/HomeBrowse.vue';
import { ListChecksIcon, LayoutDashboardIcon } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useQuery } from '@/composables/useQuery';
import { useInbox } from '@/composables/useInbox';
import { useRememberedChoice } from '@/composables/useRememberedChoice';
import { SEND } from '@/ipc-channels';
import type { TaskItem } from '@/config/tables/TasksList';
import { openNewAppDialog, openNewTaskDialog } from '@/composables/useNewItemDialogs';

const { t } = useI18n();

// Simple until the user asks for the full dashboard; remembered either way.
const MODES = ['simple', 'full'] as const;
const mode = useRememberedChoice('mode', MODES, 'simple');

const { data: tasks } = useQuery<TaskItem[]>(SEND.TASK_LIST, {});

// The badge opens the inbox; same count as its list, so the two always agree.
const inbox = useInbox(tasks);
const hasFailures = computed(() => inbox.failing.value.length > 0);
const inboxOpen = ref(false);
</script>

<template>
  <Page v-if="mode === 'simple'">
    <template #content>
      <div class="flex-1 min-h-0 overflow-y-auto scroll-fade w-full">
        <HomeSimple @show-full="mode = 'full'" />
      </div>
    </template>
  </Page>

  <Page v-else>
    <template #title>
      <div class="flex items-center gap-3">
        <span>{{ t('dashboard.title') }}</span>
        <!-- Kept mounted while open, so dismissing the last failure doesn't yank the list away. -->
        <Popover v-if="inbox.count.value > 0 || inboxOpen" v-model:open="inboxOpen">
          <PopoverTrigger as-child>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full transition-colors"
              :class="
                hasFailures
                  ? 'bg-destructive/10 text-destructive hover:bg-destructive/15'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15'
              "
            >
              <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="hasFailures ? 'bg-destructive' : 'bg-amber-500'" />
              {{ t('dashboard.inbox.badge', { count: inbox.count.value }) }}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" class="w-96 p-0">
            <HomeInbox :tasks="tasks" />
          </PopoverContent>
        </Popover>
      </div>
    </template>

    <template #menu>
      <Button variant="ghost" @click="mode = 'simple'">{{ t('dashboard.simpleView') }}</Button>
      <Button variant="outline" @click="openNewTaskDialog()">
        <ListChecksIcon class="w-4 h-4" /> {{ t('dashboard.quickActions.newTask') }}
      </Button>
      <Button @click="openNewAppDialog()">
        <LayoutDashboardIcon class="w-4 h-4" /> {{ t('dashboard.quickActions.newApp') }}
      </Button>
    </template>

    <template #content>
      <div class="flex-1 min-h-0 overflow-y-auto scroll-fade w-full space-y-6">
        <HomeToday :tasks="tasks" />
        <HomeStarred />

        <!-- Left: ways in (opened lately, projects and tags). Right: what happened, as tall
             as the left column and scrolling inside, so a long run list can't stretch the page. -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="flex flex-col gap-4 min-w-0">
            <HomeRecentItems />
            <HomeBrowse :tasks="tasks" />
          </div>
          <div class="relative min-w-0 lg:min-h-96">
            <HomeRecentActivity :limit="15" filterable class="h-96 lg:h-auto lg:absolute lg:inset-0" />
          </div>
        </div>
      </div>
    </template>
  </Page>
</template>
