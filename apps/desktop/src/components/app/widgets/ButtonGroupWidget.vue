<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronDown, Loader2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useIcon } from '@/composables/useIcon';

// Several buttons as one component: side by side (display row), or one button
// opening them as a menu (display menu). Each fires its own `action:<id>` event — like
// a table's row actions — and `<id>.clicked` is the last one clicked. While a run they
// start is going, the one clicked shows a spinner and the group waits.
interface Item {
  id: string;
  label: string;
  icon?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary' | 'link';
  disabled?: unknown;
}

const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
}>();
const { t } = useI18n();
const { getIconComponent } = useIcon();

const items = computed<Item[]>(() =>
  Array.isArray(props.props.items) ? props.props.items.filter((i: any) => i && typeof i.id === 'string' && i.id) : []
);
const menu = computed(() => props.props.display === 'menu');
const isDisabled = (item: Item) => item.disabled === true || item.disabled === 'true';
const iconOf = (name?: string) => (name ? getIconComponent(String(name)) : null);
const spinning = (item: Item) => !!props.busy && props.state?.clicked === item.id;

function click(item: Item) {
  if (props.editable || isDisabled(item) || props.busy) return;
  emit('event', `action:${item.id}`, { clicked: item.id });
}
</script>

<template>
  <!-- row: the buttons share the width -->
  <div v-if="!menu" class="h-full flex items-center gap-2 px-(--app-pad) py-2" role="group">
    <Button
      v-for="item in items"
      :key="item.id"
      class="flex-1 min-w-0"
      :variant="item.variant ?? 'default'"
      :disabled="!editable && (isDisabled(item) || busy)"
      :data-item="item.id"
      @click="click(item)"
    >
      <Loader2 v-if="spinning(item)" class="size-4 animate-spin" />
      <component :is="iconOf(item.icon)" v-else-if="iconOf(item.icon)" class="size-4" />
      <span class="truncate">{{ item.label }}</span>
    </Button>
  </div>

  <!-- menu: one button, the items in a list -->
  <div v-else class="h-full flex items-center px-(--app-pad) py-2">
    <DropdownMenu>
      <DropdownMenuTrigger as-child :disabled="editable">
        <Button class="w-full" :variant="props.props.variant ?? 'outline'" data-testid="group-menu">
          <Loader2 v-if="busy" class="size-4 animate-spin" />
          <component :is="iconOf(props.props.icon)" v-else-if="iconOf(props.props.icon)" class="size-4" />
          <span class="truncate">{{ props.props.label || t('apps.buttonGroup.actions') }}</span>
          <ChevronDown class="size-4 ml-auto opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="min-w-(--reka-dropdown-menu-trigger-width)">
        <DropdownMenuItem
          v-for="item in items"
          :key="item.id"
          :disabled="isDisabled(item) || busy"
          :class="cn(item.variant === 'destructive' && 'text-destructive focus:text-destructive')"
          :data-item="item.id"
          @select="click(item)"
        >
          <component :is="iconOf(item.icon)" v-if="iconOf(item.icon)" class="size-4" />
          {{ item.label }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
