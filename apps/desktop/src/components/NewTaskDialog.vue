<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Loader2 } from 'lucide-vue-next';
import Dialog from '@/components/Dialog.vue';
import { Button } from '@/components/ui/button';
import NewTaskForm from '@/components/forms/NewTaskForm.vue';
import { newTaskDialogOpen, newItemProject } from '@/composables/useNewItemDialogs';

const { t } = useI18n();
const formRef = ref<InstanceType<typeof NewTaskForm> | null>(null);
</script>

<template>
  <Dialog
    v-model="newTaskDialogOpen"
    :title="t('tasks.new')"
    :description="t('tasks.newDescription')"
  >
    <NewTaskForm ref="formRef" :project="newItemProject" @created="newTaskDialogOpen = false" />

    <template #footer>
      <Button :disabled="formRef?.isWaiting" @click="formRef?.submit()">
        <Loader2 v-if="formRef?.isWaiting" class="w-4 h-4 mr-2 animate-spin" />
        {{ formRef?.isWaiting ? t('common.creating') : t('common.create') }}
      </Button>
    </template>
  </Dialog>
</template>
