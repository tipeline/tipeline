<script setup lang="ts">
import { computed, inject, provide } from 'vue';
import { APP_CANVAS, APP_ITEM_SCOPE } from '../appCanvasKey';

// One item of a list view: its template's components, drawn for this item. Everything
// inside sees it by the list's names — `item` / `index` unless it sets itemName /
// indexName (through APP_ITEM_SCOPE).
const props = defineProps<{ listId: string; item: unknown; index: number; itemName: string; indexName: string }>();

const canvas = inject(APP_CANVAS, null);
provide(
  APP_ITEM_SCOPE,
  computed(() => ({
    listId: props.listId,
    item: props.item,
    index: props.index,
    itemName: props.itemName,
    indexName: props.indexName,
  }))
);
</script>

<template>
  <component :is="canvas.grid" v-if="canvas" :parent-id="listId" />
</template>
