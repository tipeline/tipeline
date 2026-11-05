<script setup lang="ts">
import HubCatalogBrowser from '@/components/hub/HubCatalogBrowser.vue';
import { SEND } from '@/ipc-channels';
</script>

<template>
  <HubCatalogBrowser
    item-type="task"
    :install-channel="SEND.HUB_INSTALL_TASK"
    :local-list-channel="SEND.TASK_LIST"
    hub-identifier-field="hub_task_identifier"
    empty-text-key="hub.tasksEmpty"
  />
</template>
