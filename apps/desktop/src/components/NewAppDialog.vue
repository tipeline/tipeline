<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Loader2 } from 'lucide-vue-next';
import Dialog from '@/components/Dialog.vue';
import { Button } from '@/components/ui/button';
import NewAppForm from '@/components/forms/NewAppForm.vue';
import { newAppDialogOpen, newItemProject } from '@/composables/useNewItemDialogs';

const { t } = useI18n();
const formRef = ref<InstanceType<typeof NewAppForm> | null>(null);
</script>

<template>
  <Dialog
    v-model="newAppDialogOpen"
    :title="t('apps.new')"
    :description="t('apps.newDescription')"
  >
    <NewAppForm ref="formRef" :project="newItemProject" @created="newAppDialogOpen = false" />

    <template #footer>
      <Button :disabled="formRef?.isWaiting" @click="formRef?.submit()">
        <Loader2 v-if="formRef?.isWaiting" class="w-4 h-4 mr-2 animate-spin" />
        {{ formRef?.isWaiting ? t('common.creating') : t('common.create') }}
      </Button>
    </template>
  </Dialog>
</template>
