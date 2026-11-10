/**
 * One color per kind of thing, used everywhere it appears: icons, tiles, badges, map
 * cards, map lines. Warnings keep amber's stronger shade plus an alert icon.
 *
 * Classes are written out in full so Tailwind finds them.
 */
export type Entity = 'workflow' | 'subworkflow' | 'app' | 'schedule' | 'global' | 'project';

type EntityColor = {
  /** An icon or text on the page background. */
  text: string;
  /** A soft square behind an icon (home tiles). */
  tint: string;
  /** A small labelled badge (trigger column). */
  badge: string;
  /** A card's border and fill (project map). */
  card: string;
  /** Just the border, for a planned (empty) card. */
  border: string;
  /** Just the fill, for a card whose border says something else (a warning). */
  fill: string;
  /** For SVG lines and the minimap. */
  hex: string;
};

export const ENTITY_COLORS: Record<Entity, EntityColor> = {
  workflow: {
    text: 'text-blue-600 dark:text-blue-400',
    tint: 'bg-blue-500/10 text-blue-500',
    badge: 'bg-blue-500/10 text-blue-600 border border-blue-500/20',
    card: 'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950',
    border: 'border-blue-300 dark:border-blue-800',
    fill: 'bg-blue-50 dark:bg-blue-950',
    hex: '#3b82f6',
  },
  subworkflow: {
    text: 'text-violet-600 dark:text-violet-400',
    tint: 'bg-violet-500/10 text-violet-500',
    badge: 'bg-violet-500/10 text-violet-600 border border-violet-500/20',
    card: 'border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950',
    border: 'border-violet-300 dark:border-violet-800',
    fill: 'bg-violet-50 dark:bg-violet-950',
    hex: '#8b5cf6',
  },
  app: {
    text: 'text-amber-600 dark:text-amber-400',
    tint: 'bg-amber-500/10 text-amber-500',
    badge: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
    card: 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950',
    border: 'border-amber-300 dark:border-amber-800',
    fill: 'bg-amber-50 dark:bg-amber-950',
    hex: '#f59e0b',
  },
  schedule: {
    text: 'text-cyan-600 dark:text-cyan-400',
    tint: 'bg-cyan-500/10 text-cyan-500',
    badge: 'bg-cyan-500/10 text-cyan-600 border border-cyan-500/20',
    card: 'border-cyan-300 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950',
    border: 'border-cyan-300 dark:border-cyan-800',
    fill: 'bg-cyan-50 dark:bg-cyan-950',
    hex: '#06b6d4',
  },
  global: {
    text: 'text-lime-600 dark:text-lime-400',
    tint: 'bg-lime-500/10 text-lime-500',
    badge: 'bg-lime-500/10 text-lime-600 border border-lime-500/20',
    card: 'border-lime-300 dark:border-lime-800 bg-lime-50 dark:bg-lime-950',
    border: 'border-lime-300 dark:border-lime-800',
    fill: 'bg-lime-50 dark:bg-lime-950',
    hex: '#84cc16',
  },
  // Each project has its own color; as a kind it stays neutral.
  project: {
    text: 'text-zinc-500 dark:text-zinc-400',
    tint: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400',
    badge: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border border-zinc-500/20',
    card: 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900',
    border: 'border-zinc-300 dark:border-zinc-700',
    fill: 'bg-zinc-50 dark:bg-zinc-900',
    hex: '#71717a',
  },
};

/**
 * Who started a run (Server's audit log: user, webhook, schedule, app). Schedules and
 * apps take their own color; a person or a webhook isn't one of these kinds.
 */
export const TRIGGER_BADGE: Record<string, string> = {
  schedule: ENTITY_COLORS.schedule.badge,
  app: ENTITY_COLORS.app.badge,
  user: ENTITY_COLORS.project.badge,
  webhook: 'bg-orange-500/10 text-orange-600 border border-orange-500/20',
};
