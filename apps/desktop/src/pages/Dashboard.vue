<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { format } from 'date-fns';
import Page from '@/components/Page.vue';
import HomeToday from '@/components/home/HomeToday.vue';
import HomeStarred from '@/components/home/HomeStarred.vue';
import HomeRecentItems from '@/components/home/HomeRecentItems.vue';
import HomeRecentActivity from '@/components/home/HomeRecentActivity.vue';
import HomeProjects from '@/components/home/HomeProjects.vue';
import HomeInbox from '@/components/home/HomeInbox.vue';
import HomeAsk from '@/components/home/HomeAsk.vue';
import { useConnectionStore } from '@/store/connectionStore';
import { ListChecksIcon, LayoutDashboardIcon } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useQuery } from '@/composables/useQuery';
import { useInbox } from '@/composables/useInbox';
import { SEND } from '@/ipc-channels';
import type { TaskItem } from '@/config/tables/TasksList';
import { openNewAppDialog, openNewTaskDialog } from '@/composables/useNewItemDialogs';

const { t } = useI18n();

const { data: tasks } = useQuery<TaskItem[]>(SEND.TASK_LIST, {});

// The badge opens the inbox; same count as its list, so the two always agree.
const inbox = useInbox(tasks);
const hasFailures = computed(() => inbox.failing.value.length > 0);
const inboxOpen = ref(false);

const connectionStore = useConnectionStore();
const assistantAvailable = computed(() => !connectionStore.isRemote);

const now = new Date();
const greeting = computed(() => {
  const hour = now.getHours();
  return t(
    hour < 12
      ? 'dashboard.greeting.morning'
      : hour < 18
        ? 'dashboard.greeting.afternoon'
        : 'dashboard.greeting.evening'
  );
});
const todayLabel = format(now, 'EEEE d MMMM');
</script>

<template>
  <Page>
    <template #content>
      <!-- Two bands on a 3-column grid: the banner (greeting, Ask box, the day's numbers),
           then three equal columns that fill the window: Starred, Recently opened, and
           Recent runs over Projects (two cards sharing the height) on the right. Their
           lists scroll inside. On a narrow window everything stacks and the page scrolls. -->
      <div
        class="grid grid-cols-1 gap-5 h-full min-h-0 w-full overflow-y-auto lg:overflow-hidden lg:grid-cols-3 lg:grid-rows-[auto_minmax(0,1fr)]"
      >
        <!-- A light blue banner: the greeting and the buttons on one row, then the Ask box and the
             day's four numbers side by side on the column lines below (a third | two thirds), the box
             as tall as the chips so their edges line up. -->
        <header
          class="lg:col-span-3 flex flex-col gap-4 rounded-xl border border-blue-100 bg-blue-50 p-5 dark:border-blue-900/50 dark:bg-blue-950/30"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
              <h1 class="text-2xl font-semibold tracking-tight m-0">
                {{ greeting }}
              </h1>
              <span class="text-sm text-muted-foreground">{{ todayLabel }}</span>
              <!-- Kept mounted while open, so dismissing the last failure doesn't yank the list away. -->
              <Popover v-if="inbox.count.value > 0 || inboxOpen" v-model:open="inboxOpen">
                <PopoverTrigger as-child>
                  <button
                    type="button"
                    class="self-center inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full transition-colors"
                    :class="
                      hasFailures
                        ? 'bg-destructive/10 text-destructive hover:bg-destructive/15'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15'
                    "
                  >
                    <span
                      class="w-1.5 h-1.5 rounded-full shrink-0"
                      :class="hasFailures ? 'bg-destructive' : 'bg-amber-500'"
                    />
                    {{ t('dashboard.inbox.badge', { count: inbox.count.value }) }}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" class="w-96 p-0">
                  <HomeInbox :tasks="tasks" />
                </PopoverContent>
              </Popover>
            </div>
            <div class="flex items-center gap-2">
              <Button variant="outline" @click="openNewTaskDialog()">
                <ListChecksIcon class="w-4 h-4" />
                {{ t('dashboard.quickActions.newTask') }}
              </Button>
              <Button @click="openNewAppDialog()">
                <LayoutDashboardIcon class="w-4 h-4" />
                {{ t('dashboard.quickActions.newApp') }}
              </Button>
            </div>
          </div>
          <!-- Side by side only when the chips fit in one row (xl); narrower, the box sits above
               them at its normal height instead of stretching to two rows of chips. -->
          <div class="grid gap-x-5 gap-y-3 xl:grid-cols-3">
            <!-- The sidebar isn't offered on a remote workspace, so neither is the box. -->
            <HomeAsk v-if="assistantAvailable" />
            <HomeToday
              :tasks="tasks"
              :class="assistantAvailable ? 'xl:col-span-2' : 'xl:col-span-3'"
            />
          </div>
        </header>

        <HomeStarred class="h-[28rem] lg:h-auto" />

        <HomeRecentItems class="h-[32rem] lg:h-auto" />

        <div class="flex flex-col gap-5 min-h-0 h-[40rem] lg:h-auto">
          <HomeRecentActivity class="flex-1 basis-0" />
          <HomeProjects :tasks="tasks" class="flex-1 basis-0" />
        </div>
      </div>
    </template>
  </Page>
</template>
