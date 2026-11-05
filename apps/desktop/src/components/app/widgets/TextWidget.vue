<script setup lang="ts">
import { computed } from 'vue';
import { renderMarkdown } from '@/utils/appMarkdown';

// Plain text, or — with `markdown` — rendered Markdown (see appMarkdown: raw HTML
// is shown as text, links open in the system browser). Font size, weight and color
// apply to the whole text either way.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();

const WEIGHTS: Record<string, number> = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

const style = computed(() => ({
  fontSize: `${Number(props.props.fontSize) || 14}px`,
  fontWeight: WEIGHTS[props.props.fontWeight] ?? 400,
  color: props.props.color || undefined,
}));

const html = computed(() => (props.props.markdown ? renderMarkdown(String(props.props.content ?? '')) : ''));
</script>

<template>
  <div class="h-full overflow-auto p-(--app-pad)">
    <!-- eslint-disable-next-line vue/no-v-html -- sanitized in renderMarkdown -->
    <div v-if="props.props.markdown" class="app-markdown" :style="style" v-html="html" />
    <p v-else class="m-0 whitespace-pre-wrap" :style="style">
      {{ props.props.content ?? '' }}
    </p>
  </div>
</template>
