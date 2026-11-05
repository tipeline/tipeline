<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Bot, Eraser, SendHorizontal, TriangleAlert } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { renderMarkdown } from '@/utils/appMarkdown';
import type { ChatMessage } from '@/composables/useAppRuntime';
import { APP_PAGE_GRID } from '../appCanvasKey';

// A conversation: each message runs the chat's runnable and its `reply` output comes
// back as the answer (Markdown). The conversation lives in the runtime
// (`<id>.messages`), so it survives the widget being hidden. Enter sends,
// Shift+Enter adds a line.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{ reset: [] }>();
const { t, locale } = useI18n();
const pageGrid = inject(APP_PAGE_GRID, null);

const SAMPLE: ChatMessage[] = [
  { role: 'assistant', text: 'Hi! Ask me anything about **your records**.', at: '' },
  { role: 'user', text: 'How many are still pending?', at: '' },
  { role: 'assistant', text: 'Two are pending: *Globex* and *Soylent*.', at: '' },
];
const messages = computed<ChatMessage[]>(() =>
  props.editable ? SAMPLE : Array.isArray(props.state?.messages) ? props.state!.messages : []
);
const waiting = computed(() => !props.editable && !!props.state?.waiting);
const suggestions = computed<string[]>(() =>
  Array.isArray(props.props.suggestions) ? props.props.suggestions.filter((s: unknown) => typeof s === 'string' && s) : []
);
const onlyWelcome = computed(() => !messages.value.some((m) => m.role === 'user'));

const draft = ref('');
const list = ref<HTMLElement | null>(null);
const box = ref<HTMLTextAreaElement | null>(null);

async function send(text = draft.value) {
  if (props.editable || waiting.value || !text.trim()) return;
  const sent = pageGrid?.runtime.sendChat(props.componentId, text);
  if (text === draft.value) draft.value = '';
  await sent;
  await nextTick();
  box.value?.focus();
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    void send();
  }
}

// Newest message in view.
watch(
  () => [messages.value.length, waiting.value],
  async () => {
    await nextTick();
    list.value?.scrollTo({ top: list.value.scrollHeight });
  },
  { immediate: true }
);

const time = (iso: string) =>
  iso ? new Intl.DateTimeFormat(locale.value, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '';
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div class="flex items-center gap-2 border-b px-(--app-pad) py-2 text-xs shrink-0">
      <Bot class="size-3.5 text-muted-foreground" />
      <span class="font-medium truncate mr-auto">{{ props.props.title || t('apps.chat.title') }}</span>
      <Button
        variant="ghost"
        size="icon"
        class="size-6"
        :disabled="editable || waiting || onlyWelcome"
        :title="t('apps.chat.clear')"
        :aria-label="t('apps.chat.clear')"
        @click="emit('reset')"
      >
        <Eraser class="size-3.5" />
      </Button>
    </div>

    <div ref="list" class="flex-1 min-h-0 overflow-y-auto px-(--app-pad) py-3 flex flex-col gap-3" role="log" aria-live="polite">
      <div
        v-for="(m, i) in messages"
        :key="i"
        class="flex flex-col max-w-[85%]"
        :class="m.role === 'user' ? 'self-end items-end' : 'self-start items-start'"
        :data-role="m.role"
      >
        <div
          v-if="m.role === 'user'"
          class="rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap break-words"
        >
          {{ m.text }}
        </div>
        <div
          v-else-if="m.role === 'error'"
          class="rounded-2xl rounded-bl-sm border border-destructive/40 bg-destructive/5 text-destructive px-3 py-2 text-sm flex gap-2"
        >
          <TriangleAlert class="size-4 shrink-0 mt-0.5" />
          <span class="whitespace-pre-wrap break-words">{{ m.text }}</span>
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -- sanitized in renderMarkdown -->
        <div v-else class="app-markdown rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm" v-html="renderMarkdown(m.text)" />
        <span v-if="m.at" class="mt-0.5 text-[10px] text-muted-foreground">{{ time(m.at) }}</span>
      </div>

      <div v-if="waiting" class="self-start rounded-2xl rounded-bl-sm bg-muted px-3 py-2.5 flex gap-1" data-testid="chat-thinking" :aria-label="t('apps.chat.thinking')">
        <span v-for="n in 3" :key="n" class="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce" :style="{ animationDelay: `${n * 120}ms` }" />
      </div>

      <div v-if="onlyWelcome && suggestions.length && !waiting" class="mt-auto flex flex-wrap gap-1.5 justify-end">
        <button
          v-for="s in suggestions"
          :key="s"
          type="button"
          class="rounded-full border px-3 py-1 text-xs hover:bg-accent disabled:opacity-60"
          :disabled="editable"
          @click="send(s)"
        >
          {{ s }}
        </button>
      </div>
    </div>

    <form class="flex items-end gap-2 border-t p-(--app-pad-tight) shrink-0" @submit.prevent="send()">
      <textarea
        ref="box"
        v-model="draft"
        rows="1"
        class="flex-1 resize-none max-h-32 min-h-9 rounded-md border bg-transparent px-3 py-2 text-sm field-sizing-content focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        :placeholder="props.props.placeholder || t('apps.chat.placeholder')"
        :disabled="editable"
        data-testid="chat-input"
        @keydown="onKey"
      />
      <Button type="submit" size="icon" :disabled="editable || waiting || !draft.trim()" :aria-label="t('apps.chat.send')">
        <SendHorizontal class="size-4" />
      </Button>
    </form>
  </div>
</template>
