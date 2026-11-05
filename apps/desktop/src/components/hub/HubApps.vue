<script setup lang="ts">
import HubCatalogBrowser from '@/components/hub/HubCatalogBrowser.vue';
import { SEND } from '@/ipc-channels';
</script>

<template>
  <HubCatalogBrowser
    item-type="app"
    :install-channel="SEND.HUB_INSTALL_APP"
    :local-list-channel="SEND.APP_LIST"
    hub-identifier-field="hub_app_identifier"
    empty-text-key="hub.appsEmpty"
  />
</template>
