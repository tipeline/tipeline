import fs from 'fs';
import crypto from 'crypto';
import type { Hub } from '@database/models/Hub';
import type { HubCatalogItem } from '@/hub/HubProvider';

const CHECKSUM_FORMAT = /^sha256:([0-9a-f]{64})$/i;

function describeItem(hub: Hub, item: HubCatalogItem): string {
  const kind = item.type === 'task' ? 'Workflow' : item.type === 'app' ? 'App' : 'Plugin';
  return `${kind} "${item.identifier}" from hub "${hub.name}"`;
}

/**
 * The expected sha256 hex of an item's `file`, or null when the catalog has no
 * checksum (older hubs). Anything other than `sha256:<64 hex>` is refused, so a
 * catalog using an algorithm this build doesn't know is never silently trusted.
 */
export function expectedSha256(hub: Hub, item: HubCatalogItem): string | null {
  if (item.checksum === undefined || item.checksum === null || item.checksum === '') return null;
  const match = CHECKSUM_FORMAT.exec(String(item.checksum).trim());
  if (!match) {
    throw new Error(
      `${describeItem(hub, item)} has checksum "${item.checksum}", which this version of Tipeline can't check. ` +
        `Only "sha256:<hex>" is supported. Nothing was installed.`
    );
  }
  return match[1].toLowerCase();
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

/** Throws when the file's bytes don't match the item's catalog checksum. A missing checksum passes. */
export async function verifyHubFile(hub: Hub, item: HubCatalogItem, filePath: string): Promise<void> {
  const expected = expectedSha256(hub, item);
  if (!expected) return;
  const actual = await sha256File(filePath);
  if (actual !== expected) {
    throw new Error(
      `${describeItem(hub, item)} failed its checksum check, so nothing was installed. ` +
        `The file doesn't match what the hub catalog lists.\n` +
        `Expected: sha256:${expected}\n` +
        `Actual:   sha256:${actual}`
    );
  }
}
