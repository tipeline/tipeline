import type { MapNodeKind } from '@tipeline/utils';

/** What the left sidebar's tiles carry when dragged onto the map. */
export const MAP_DRAG_TYPE = 'application/x-tipeline-map-item';

/** A tile: a planned node of a kind, or a sticky note. */
export type MapDropKind = MapNodeKind | 'note';
