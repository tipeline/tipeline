<script setup lang="ts">
import { computed, useId } from 'vue';
import { IonInput, IonTextarea } from '@ionic/vue';

/**
 * A label above a plain box, with a hint or an error under it (the designs' field).
 * Ionic's own label and helper text sit inside the box and crowd the value, so this keeps
 * them outside and uses Ionic only for the native input.
 */
const props = withDefaults(
  defineProps<{
    label: string;
    name: string;
    type?: string;
    inputmode?: string;
    autocomplete?: string;
    placeholder?: string;
    hint?: string;
    error?: string;
    required?: boolean;
    readonly?: boolean;
    multiline?: boolean;
    mono?: boolean;
    autocapitalize?: string;
  }>(),
  { type: 'text', autocapitalize: 'off' }
);

const model = defineModel<string | number | null | undefined>();
const id = useId();
const noteId = computed(() => `${id}-note`);
const note = computed(() => props.error || props.hint || '');
</script>

<template>
  <div class="field" :class="{ invalid: !!error, mono }">
    <label :for="id" class="label">
      {{ label }}<span v-if="required" class="required" aria-hidden="true"> *</span>
    </label>
    <ion-textarea
      v-if="multiline"
      :id="id"
      v-model="model as string"
      class="box"
      :name="name"
      :aria-label="label"
      :aria-invalid="!!error"
      :aria-describedby="note ? noteId : undefined"
      :aria-required="required"
      :readonly="readonly"
      :auto-grow="true"
      :rows="3"
      :autocapitalize="autocapitalize"
      :spellcheck="false"
      :placeholder="placeholder"
    />
    <ion-input
      v-else
      :id="id"
      v-model="model"
      class="box"
      :name="name"
      :type="type as any"
      :inputmode="inputmode as any"
      :autocomplete="autocomplete as any"
      :aria-label="label"
      :aria-invalid="!!error"
      :aria-describedby="note ? noteId : undefined"
      :aria-required="required"
      :readonly="readonly"
      :autocapitalize="autocapitalize"
      :placeholder="placeholder"
    />
    <p v-if="note" :id="noteId" class="note" :class="{ problem: !!error }">{{ note }}</p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.label {
  font-size: 13px;
  font-weight: 600;
}
.required {
  color: var(--tl-muted);
}
.box {
  --background: var(--tl-card);
  --color: var(--tl-ink);
  --placeholder-color: var(--tl-muted);
  --placeholder-opacity: 0.8;
  --padding-start: 14px;
  --padding-end: 14px;
  --padding-top: 12px;
  --padding-bottom: 12px;
  --highlight-height: 0;
  min-height: 48px;
  border: 1px solid #cdd3dc;
  border-radius: 10px;
  overflow: hidden;
  font-size: 15px;
}
@media (prefers-color-scheme: dark) {
  .box {
    border-color: var(--tl-border);
  }
}
.box.has-focus {
  border-color: var(--tl-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tl-accent) 20%, transparent);
}
.invalid .box {
  border-color: var(--tl-failed-ink);
}
.mono .box {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
}
.note {
  margin: 0 2px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--tl-muted);
}
.note.problem {
  color: var(--tl-failed-ink);
  font-weight: 600;
}
</style>
