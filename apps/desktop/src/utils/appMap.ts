import { badgeColor, type BadgeColor } from './appBadge';
import { valueAt } from './appFormat';

// A map component's markers: one per row with a usable latitude and longitude. The
// keys may be paths (`address.lat`); without them the usual names are tried. A row's
// color comes from `colorKey` — the same status → color rule as badges.

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  color: BadgeColor;
  row: Record<string, unknown>;
  index: number;
}

export interface MarkerOptions {
  latKey?: string;
  lngKey?: string;
  labelKey?: string;
  colorKey?: string;
  colors?: Record<string, unknown> | null;
  defaultColor?: unknown;
}

const LAT_KEYS = ['lat', 'latitude'];
const LNG_KEYS = ['lng', 'lon', 'long', 'longitude'];

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function coordinate(row: Record<string, unknown>, key: string | undefined, fallbacks: string[]): number | null {
  if (key) return num(valueAt(row, key));
  for (const k of fallbacks) {
    const hit = Object.keys(row).find((name) => name.toLowerCase() === k);
    if (hit !== undefined) return num(row[hit]);
  }
  return null;
}

export function markersFrom(data: unknown, options: MarkerOptions = {}): MapMarker[] {
  const rows = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : [];
  const markers: MapMarker[] = [];
  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const r = row as Record<string, unknown>;
    const lat = coordinate(r, options.latKey, LAT_KEYS);
    const lng = coordinate(r, options.lngKey, LNG_KEYS);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    const label = options.labelKey ? valueAt(r, options.labelKey) : (r.name ?? r.title ?? r.label);
    markers.push({
      lat,
      lng,
      label: label === undefined || label === null ? '' : String(label),
      color: options.colorKey
        ? badgeColor(valueAt(r, options.colorKey), options.colors, options.defaultColor)
        : badgeColor('', null, options.defaultColor ?? 'blue'),
      row: r,
      index,
    });
  });
  return markers;
}

/** Marker fill colors, per badge color. */
export { BADGE_HEX as MARKER_HEX } from './appBadge';
