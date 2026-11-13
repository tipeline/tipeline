<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Plus, X } from 'lucide-vue-next';
import {
  generateIdentifier,
  PLAN_COMPONENT_TYPES,
  type AppComponentRef,
  type PlanComponentType,
  type PlanPage,
} from '@tipeline/utils';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * A planned app's pages and the components on them, each with the workflow it uses.
 * Saved with the plan; picking a workflow draws the planned line, and Create builds the
 * app from this list. Once the app is linked, components it doesn't have are marked.
 */
const props = defineProps<{
  pages: PlanPage[] | undefined;
  /** Workflows on the map a component can use (built or planned), by map key. */
  workflows: { key: string; name: string; planned: boolean }[];
  /** The linked app's components, to mark planned ones it doesn't have. */
  built?: AppComponentRef[];
  /** The map key a component's workflow is drawn under now (a planned one may have been built). */
  resolveKey: (ref: string) => string | undefined;
}>();

const emit = defineEmits<{
  (e: 'update', pages: PlanPage[] | undefined): void;
}>();

const { t } = useI18n();

const NONE = '__none__';
const newId = () => generateIdentifier().slice(0, 12);
const typeLabel = (type: string) => t(`builder.components.${type}`);

const copy = (): PlanPage[] => JSON.parse(JSON.stringify(props.pages ?? []));

function commit(pages: PlanPage[]) {
  emit('update', pages.length ? pages : undefined);
}

function addPage() {
  const pages = copy();
  pages.push({
    id: newId(),
    name: t('projectMap.contents.newPage', { n: pages.length + 1 }),
    components: [],
  });
  commit(pages);
}

function renamePage(p: number, name: string) {
  const pages = copy();
  if (!name.trim() || name.trim() === pages[p].name) return;
  pages[p].name = name.trim();
  commit(pages);
}

function removePage(p: number) {
  const pages = copy();
  pages.splice(p, 1);
  commit(pages);
}

function addComponent(p: number) {
  const pages = copy();
  pages[p].components.push({
    id: newId(),
    type: 'table',
    name: typeLabel('table'),
  });
  commit(pages);
}

function setComponent(
  p: number,
  c: number,
  patch: {
    type?: PlanComponentType;
    name?: string;
    workflow?: string | undefined;
  }
) {
  const pages = copy();
  const component = pages[p].components[c];
  if (patch.name !== undefined) {
    if (!patch.name.trim() || patch.name.trim() === component.name) return;
    component.name = patch.name.trim();
  }
  if (patch.type) {
    // A default name follows the type; a name someone wrote stays.
    if (component.name === typeLabel(component.type))
      component.name = typeLabel(patch.type);
    component.type = patch.type;
  }
  if ('workflow' in patch) {
    if (patch.workflow) component.workflow = patch.workflow;
    else delete component.workflow;
  }
  commit(pages);
}

function removeComponent(p: number, c: number) {
  const pages = copy();
  pages[p].components.splice(c, 1);
  commit(pages);
}

const loose = (text: string) => text.trim().toLocaleLowerCase();
const isBuilt = (page: string, name: string) =>
  !props.built ||
  props.built.some(
    (b) => loose(b.page) === loose(page) && loose(b.name) === loose(name)
  );
function selectedWorkflow(ref: string | undefined): string {
  const key = ref ? props.resolveKey(ref) : undefined;
  return key && props.workflows.some((w) => w.key === key) ? key : NONE;
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="text-xs font-semibold">
      {{ t('projectMap.contents.title') }}
    </div>
    <p class="text-xs text-muted-foreground">
      {{ t('projectMap.contents.hint') }}
    </p>

    <div
      v-for="(page, p) in pages ?? []"
      :key="page.id"
      class="flex flex-col rounded-lg border"
    >
      <div class="flex items-center gap-1 rounded-t-lg bg-muted/60 px-1.5 py-1">
        <Input
          :model-value="page.name"
          class="h-7 border-transparent bg-transparent px-1.5 text-xs font-semibold shadow-none hover:border-input focus-visible:bg-background"
          :aria-label="t('projectMap.contents.pageName')"
          @change="renamePage(p, ($event.target as HTMLInputElement).value)"
        />
        <button
          type="button"
          class="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
          :aria-label="t('projectMap.contents.removePage')"
          :title="t('projectMap.contents.removePage')"
          @click="removePage(p)"
        >
          <X class="size-3.5" />
        </button>
      </div>

      <div
        v-for="(c, i) in page.components"
        :key="c.id"
        class="flex flex-col gap-1.5 border-t px-2 py-2"
      >
        <div class="flex items-center gap-1.5">
          <Select
            :model-value="c.type"
            @update:model-value="
              setComponent(p, i, { type: $event as PlanComponentType })
            "
          >
            <SelectTrigger
              size="sm"
              class="w-28 shrink-0 text-xs"
              :aria-label="t('projectMap.contents.type')"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="type in PLAN_COMPONENT_TYPES"
                :key="type"
                :value="type"
                >{{ typeLabel(type) }}</SelectItem
              >
            </SelectContent>
          </Select>
          <Input
            :model-value="c.name"
            class="h-8 min-w-0 text-xs"
            :aria-label="t('projectMap.contents.componentName')"
            @change="
              setComponent(p, i, {
                name: ($event.target as HTMLInputElement).value,
              })
            "
          />
          <button
            type="button"
            class="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
            :aria-label="t('projectMap.contents.removeComponent')"
            :title="t('projectMap.contents.removeComponent')"
            @click="removeComponent(p, i)"
          >
            <X class="size-3.5" />
          </button>
        </div>
        <Select
          v-if="c.type !== 'text' || c.workflow"
          :model-value="selectedWorkflow(c.workflow)"
          @update:model-value="
            setComponent(p, i, {
              workflow: $event === NONE ? undefined : String($event),
            })
          "
        >
          <SelectTrigger
            size="sm"
            class="w-full text-xs"
            :aria-label="t('projectMap.contents.workflow')"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="NONE">{{
              t('projectMap.contents.noWorkflow')
            }}</SelectItem>
            <SelectItem v-for="w in workflows" :key="w.key" :value="w.key">
              {{ w.name
              }}<span v-if="w.planned" class="text-muted-foreground">
                · {{ t('projectMap.contents.planned') }}</span
              >
            </SelectItem>
          </SelectContent>
        </Select>
        <p
          v-if="!isBuilt(page.name, c.name)"
          class="text-xs text-amber-700 dark:text-amber-400"
        >
          {{ t('projectMap.contents.notInApp') }}
        </p>
      </div>

      <button
        type="button"
        class="flex items-center gap-1.5 border-t px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
        @click="addComponent(p)"
      >
        <Plus class="size-3.5" /> {{ t('projectMap.contents.addComponent') }}
      </button>
    </div>

    <button
      type="button"
      class="flex items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
      @click="addPage"
    >
      <Plus class="size-3.5" /> {{ t('projectMap.contents.addPage') }}
    </button>
  </div>
</template>
