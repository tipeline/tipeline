<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { IonToggle, IonIcon } from '@ionic/vue';
import { desktopOutline } from 'ionicons/icons';
import TextField from '@/components/TextField.vue';
import type { FormProblem, RunInput } from '@/lib/workflows';

/**
 * A workflow's run inputs as a form: text boxes, switches, and a "Set on Desktop" note for
 * types a phone can't fill in yet. Used by the workflow page and the Assistant's proposals.
 */
defineProps<{ inputs: RunInput[]; problems: FormProblem[] }>();
const values = defineModel<Record<string, unknown>>({ required: true });
const emit = defineEmits<{ submit: [] }>();

const { t } = useI18n();

function problemFor(problems: FormProblem[], inputName: string): string {
  const p = problems.find((x) => x.name === inputName);
  if (!p) return '';
  return p.problem === 'invalidJson' ? t('workflow.invalidJson') : t('workflow.required');
}
</script>

<template>
  <form class="inputs" @submit.prevent="emit('submit')">
    <div v-for="input in inputs" :key="input.variable.name">
      <div v-if="input.kind === 'desktopOnly'" class="tl-card desktop-only">
        <ion-icon :icon="desktopOutline" aria-hidden="true" />
        <div>
          <strong>{{ input.label }}</strong>
          <span class="tl-muted">{{ t('workflow.desktopOnlyInput') }}</span>
          <small class="tl-muted">{{ t('workflow.desktopOnlyInputHint') }}</small>
        </div>
      </div>

      <div v-else-if="input.kind === 'boolean'" class="tl-card toggle-card">
        <ion-toggle
          v-model="values[input.variable.name] as boolean"
          :name="input.variable.name"
          :disabled="input.variable.readonly"
          justify="space-between"
        >
          {{ input.label }}
        </ion-toggle>
        <p v-if="input.variable.description" class="tl-muted toggle-hint">{{ input.variable.description }}</p>
      </div>

      <text-field
        v-else
        v-model="values[input.variable.name] as string"
        :name="input.variable.name"
        :label="input.label"
        :required="input.variable.required"
        :readonly="input.variable.readonly"
        :multiline="input.kind === 'json'"
        :mono="input.kind === 'json'"
        :type="input.kind === 'number' ? 'number' : input.kind === 'date' ? 'date' : input.variable.secret ? 'password' : 'text'"
        :inputmode="input.kind === 'number' ? 'decimal' : undefined"
        :autocapitalize="input.kind === 'text' ? 'sentences' : 'off'"
        :hint="input.variable.description"
        :error="problemFor(problems, input.variable.name)"
      />
    </div>
    <p v-if="problems.length" class="tl-error" role="alert">{{ t('workflow.missingRequired') }}</p>
  </form>
</template>

<style scoped>
.inputs {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.toggle-card {
  padding: 14px 16px;
}
.toggle-card ion-toggle {
  display: flex;
  width: 100%;
  font-size: 15px;
}
.toggle-hint {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.4;
}
.desktop-only {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.desktop-only ion-icon {
  font-size: 22px;
  color: var(--tl-muted);
  flex: none;
  margin-top: 2px;
}
.desktop-only div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
