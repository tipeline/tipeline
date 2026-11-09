import { shallowRef } from 'vue';
import type { PlanNode } from '@tipeline/utils';

/**
 * A copied map node, as an idea to paste: kept outside the editor so it can be pasted
 * on another project's map too. `from` is the node it was copied from, to paste beside it.
 */
export type MapClip = { node: Omit<PlanNode, 'id'>; from: string };

export const mapClipboard = shallowRef<MapClip | null>(null);
