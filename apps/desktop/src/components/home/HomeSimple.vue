<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { AppWindow, Compass, SparklesIcon, Workflow } from 'lucide-vue-next';
import HomeItemTile from '@/components/home/HomeItemTile.vue';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAgentStore } from '@/store/agentStore';
import { useConnectionStore } from '@/store/connectionStore';
import { useRecentItemsStore, recentItemPath } from '@/store/recentItems';
import { useLiveItems } from '@/composables/useLiveItems';
import { openNewAppDialog, openNewTaskDialog } from '@/composables/useNewItemDialogs';

// The calm first dashboard: one question, three ways to start, and the last few things
// opened. The box only hands the request to the Assistant sidebar; the conversation
// carries on there. "Show the full dashboard" switches to Starred, runs and Browse.
const emit = defineEmits<{ showFull: [] }>();

const MAX_RECENT = 4;
const BOX_ID = 'dashboard-ask';

const { t } = useI18n();
const router = useRouter();
const agentStore = useAgentStore();
const connectionStore = useConnectionStore();
const recentItemsStore = useRecentItemsStore();
const { loaded, keepLive } = useLiveItems();

// The sidebar isn't offered on a remote workspace, so neither is the box.
const assistantAvailable = computed(() => !connectionStore.isRemote);

const request = ref('');
const ideas = computed(() => [
  t('dashboard.simple.ideas.photos'),
  t('dashboard.simple.ideas.attachments'),
  t('dashboard.simple.ideas.uptime'),
  t('dashboard.simple.ideas.pdf'),
]);

const recent = computed(() =>
  loaded.value ? keepLive(recentItemsStore.recent(undefined, Infinity)).slice(0, MAX_RECENT) : []
);

const starts = computed(() => [
  {
    key: 'workflow',
    icon: Workflow,
    tint: 'bg-blue-500/10 text-blue-500',
    title: t('dashboard.simple.newWorkflow.title'),
    description: t('dashboard.simple.newWorkflow.description'),
    open: () => openNewTaskDialog(),
  },
  {
    key: 'hub',
    icon: Compass,
    tint: 'bg-emerald-500/10 text-emerald-600',
    title: t('dashboard.simple.hub.title'),
    description: t('dashboard.simple.hub.description'),
    open: () => router.push('/hub'),
  },
  {
    key: 'app',
    icon: AppWindow,
    tint: 'bg-amber-500/10 text-amber-500',
    title: t('dashboard.simple.newApp.title'),
    description: t('dashboard.simple.newApp.description'),
    open: () => openNewAppDialog(),
  },
]);

// An idea fills the box rather than sending, so it can be changed first.
async function fillIdea(idea: string) {
  request.value = idea;
  await nextTick();
  (document.getElementById(BOX_ID) as HTMLTextAreaElement | null)?.focus();
}

async function ask() {
  const text = request.value.trim();
  if (!text || agentStore.busyThinking) return;
  if (await agentStore.ask(text)) request.value = '';
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    void ask();
  }
}
</script>

<template>
  <div class="w-full max-w-3xl mx-auto flex flex-col items-center gap-10 pt-10 pb-6">
    <div class="w-full flex flex-col items-center gap-4 text-center">
      <h1 class="text-3xl font-semibold tracking-tight m-0">{{ t('dashboard.simple.title') }}</h1>
      <p class="text-muted-foreground max-w-xl m-0">{{ t('dashboard.simple.description') }}</p>

      <template v-if="assistantAvailable">
        <form
          class="w-full rounded-xl border bg-card p-3 text-left shadow-xs space-y-2 focus-within:ring-[3px] focus-within:ring-ring/30"
          @submit.prevent="ask"
        >
          <label :for="BOX_ID" class="sr-only">{{ t('dashboard.simple.label') }}</label>
          <Textarea
            :id="BOX_ID"
            v-model="request"
            rows="3"
            :placeholder="t('dashboard.simple.placeholder')"
            class="min-h-20 max-h-60 resize-none border-0 shadow-none bg-transparent dark:bg-transparent px-1 focus-visible:ring-0 md:text-base"
            @keydown="onKeydown"
          />
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs text-muted-foreground">{{ t('agent.sidebar.hint') }}</span>
            <Button type="submit" :disabled="!request.trim() || agentStore.busyThinking">
              <SparklesIcon class="w-4 h-4" /> {{ t('dashboard.simple.ask') }}
            </Button>
          </div>
        </form>

        <div class="flex flex-wrap justify-center gap-2">
          <Button
            v-for="idea in ideas"
            :key="idea"
            type="button"
            variant="outline"
            size="sm"
            class="rounded-full font-normal"
            @click="fillIdea(idea)"
          >
            {{ idea }}
          </Button>
        </div>
      </template>
    </div>

    <section class="w-full space-y-3" :aria-label="t('dashboard.simple.startYourself')">
      <div class="flex items-center gap-3 text-xs text-muted-foreground">
        <span class="flex-1 h-px bg-border" />
        <span>{{ t('dashboard.simple.startYourself') }}</span>
        <span class="flex-1 h-px bg-border" />
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <button
          v-for="start in starts"
          :key="start.key"
          type="button"
          class="flex flex-col gap-2 p-5 border border-border rounded-xl bg-card hover:bg-muted/50 transition-colors text-left"
          @click="start.open()"
        >
          <span class="flex items-center justify-center w-9 h-9 rounded-md" :class="start.tint">
            <component :is="start.icon" class="w-4.5 h-4.5" />
          </span>
          <span class="font-semibold">{{ start.title }}</span>
          <span class="text-sm text-muted-foreground">{{ start.description }}</span>
        </button>
      </div>
    </section>

    <section class="w-full space-y-2">
      <h3 class="text-sm font-semibold text-muted-foreground m-0">{{ t('dashboard.recentItems.title') }}</h3>
      <div v-if="recent.length" class="grid gap-2.5 grid-cols-2 sm:grid-cols-4">
        <HomeItemTile
          v-for="item in recent"
          :key="`${item.type}:${item.identifier}`"
          :type="item.type"
          :identifier="item.identifier"
          :name="item.name"
          :image="item.image"
          @open="router.push(recentItemPath(item))"
        />
      </div>
      <p v-else-if="loaded" class="border border-dashed border-border rounded-md px-4 py-3 text-sm text-muted-foreground text-center m-0">
        {{ t('dashboard.recentItems.empty') }}
      </p>
    </section>

    <p class="text-sm text-muted-foreground m-0">
      {{ t('dashboard.simple.knowYourWay') }}
      <Button variant="link" class="h-auto p-0 font-medium" @click="emit('showFull')">
        {{ t('dashboard.simple.showFull') }}
      </Button>
    </p>
  </div>
</template>
