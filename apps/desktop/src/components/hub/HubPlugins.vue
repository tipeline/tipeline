<script setup lang="ts">
import HubCatalogBrowser from '@/components/hub/HubCatalogBrowser.vue';
import { SEND } from '@/ipc-channels';
</script>

<template>
  <HubCatalogBrowser
    item-type="plugin"
    :install-channel="SEND.HUB_INSTALL_PLUGIN"
    :local-list-channel="SEND.PLUGIN_LIST"
    hub-identifier-field="hub_plugin_identifier"
    empty-text-key="hub.pluginsEmpty"
    :confirm-before-install="true"
  />
</template>
