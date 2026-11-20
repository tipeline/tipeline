<script setup lang="ts">
// Card's slots without the card: for a card's content shown inside a dialog, whose own
// title replaces the card title. Actions sit on the right above the content.
</script>

<template>
  <div class="flex flex-col gap-3">
    <div v-if="$slots.actions" class="flex items-center justify-end gap-2">
      <slot name="actions" />
    </div>
    <slot name="content" />
    <div v-if="$slots.footer"><slot name="footer" /></div>
  </div>
</template>
