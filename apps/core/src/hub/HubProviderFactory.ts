import type { Hub } from '@database/models/Hub';
import type { HubProvider } from '@/hub/HubProvider';
import { RemoteHubProvider } from '@/hub/RemoteHubProvider';
import { LocalFolderHubProvider } from '@/hub/LocalFolderHubProvider';

export class HubProviderFactory {
  static getProvider(hub: Hub): HubProvider {
    switch (hub.type) {
      case 'remote':
        return new RemoteHubProvider();
      case 'local_folder':
        return new LocalFolderHubProvider();
      default:
        throw new Error(`Unknown hub type: "${hub.type}"`);
    }
  }
}
