import { descriptionSummary } from '@tipeline/utils';
import { normalizeTags } from '@/utils/taskTags';

export type SearchKind = 'task' | 'app' | 'project' | 'tag';

export interface SearchResult {
  kind: SearchKind;
  key: string;
  title: string;
  subtitle?: string;
  image?: string | null;
  color?: string | null;
  path: string;
}

export interface SearchSources {
  tasks: { identifier: string; name: string; description?: string | null; tags?: string[] | string; projects?: { name: string }[]; image?: string | null }[];
  apps: { identifier: string; name: string; description?: string | null; projects?: { name: string }[]; image?: string | null }[];
  projects: { identifier: string; name: string; description?: string | null; color?: string | null }[];
}

export const SEARCH_GROUPS: SearchKind[] = ['task', 'app', 'project', 'tag'];
const PER_GROUP = 6;

/**
 * Every word has to appear somewhere in the item (name, description, tags or project
 * name), so "billing invoice" finds the invoice workflow in the Billing project. Name
 * matches rank first: exact, then starts with, then contains.
 */
function score(terms: string[], query: string, name: string, other: string[]): number {
  const haystack = [name, ...other].join(' ').toLowerCase();
  if (!terms.every((term) => haystack.includes(term))) return 0;
  const n = name.toLowerCase();
  if (n === query) return 4;
  if (n.startsWith(query)) return 3;
  if (n.includes(query)) return 2;
  return 1;
}

function ranked<T>(items: T[], scoreOf: (item: T) => number, nameOf: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, s: scoreOf(item) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || nameOf(a.item).localeCompare(nameOf(b.item)))
    .slice(0, PER_GROUP)
    .map((x) => x.item);
}

/** Search results grouped by kind, in SEARCH_GROUPS order; empty for an empty query. */
export function searchAll(rawQuery: string, sources: SearchSources): SearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];
  const terms = query.split(/\s+/);

  const projectOf = (item: { projects?: { name: string }[] }) =>
    item.projects?.length ? item.projects.map((p) => p.name).join(', ') : undefined;
  const subtitle = (project: string | undefined, description: string | null | undefined) =>
    [project, description ? descriptionSummary(description) : ''].filter(Boolean).join(' · ') || undefined;

  const tasks = ranked(
    sources.tasks,
    (t) => score(terms, query, t.name, [t.description ?? '', ...normalizeTags(t.tags), projectOf(t) ?? '']),
    (t) => t.name
  ).map<SearchResult>((t) => ({
    kind: 'task',
    key: `task:${t.identifier}`,
    title: t.name,
    subtitle: subtitle(projectOf(t), t.description),
    image: t.image,
    path: `/tasks/${t.identifier}`,
  }));

  const apps = ranked(
    sources.apps,
    (a) => score(terms, query, a.name, [a.description ?? '', projectOf(a) ?? '']),
    (a) => a.name
  ).map<SearchResult>((a) => ({
    kind: 'app',
    key: `app:${a.identifier}`,
    title: a.name,
    subtitle: subtitle(projectOf(a), a.description),
    image: a.image,
    path: `/apps/${a.identifier}`,
  }));

  const projects = ranked(
    sources.projects,
    (p) => score(terms, query, p.name, [p.description ?? '']),
    (p) => p.name
  ).map<SearchResult>((p) => ({
    kind: 'project',
    key: `project:${p.identifier}`,
    title: p.name,
    subtitle: p.description ? descriptionSummary(p.description) : undefined,
    color: p.color,
    path: `/projects/${p.identifier}`,
  }));

  const tagCounts = new Map<string, number>();
  for (const t of sources.tasks) {
    for (const tag of normalizeTags(t.tags)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const tags = ranked(
    [...tagCounts.keys()],
    (tag) => score(terms, query, tag, []),
    (tag) => tag
  ).map<SearchResult>((tag) => ({
    kind: 'tag',
    key: `tag:${tag}`,
    title: tag,
    subtitle: String(tagCounts.get(tag)),
    path: `/tasks?tags=${encodeURIComponent(tag)}`,
  }));

  return [...tasks, ...apps, ...projects, ...tags];
}
