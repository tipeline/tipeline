/**
 * Other users' private workflows, taken out of what a project shows. A project is only a
 * label: being in a shared project never lets someone see a workflow they can't open
 * from the Workflows list.
 *
 * On the project map such a workflow stays as a locked card (`hidden: true`, no name,
 * nothing about it) so the map keeps its shape and lines; everywhere else it's left out.
 */

type MapNode = { key: string; kind?: string; projects?: unknown; [field: string]: unknown };

const taskKey = (key: string) => (key.startsWith('task:') ? key.slice('task:'.length) : null);

/** A live map node the viewer may not see, with only what draws the card left in. */
export function lockedNode(node: MapNode): MapNode {
  return {
    key: node.key,
    // A helper would say more than "a workflow".
    kind: 'workflow',
    name: '',
    ref: '',
    description: null,
    projects: node.projects ?? [],
    ...(node.external ? { external: true } : {}),
    inputs: [],
    outputs: [],
    hidden: true,
  };
}

/** A `projectMap` answer (one project's, or every project's) without what `hidden` names. */
export function hideInProjectMap(answer: any, hidden: Set<string>): any {
  if (!answer || typeof answer !== 'object' || !hidden.size) return answer;
  const isHidden = (key: unknown) => typeof key === 'string' && hidden.has(taskKey(key) ?? '');
  const out = { ...answer };
  if (answer.live && Array.isArray(answer.live.nodes)) {
    out.live = {
      ...answer.live,
      nodes: answer.live.nodes.map((n: MapNode) => (isHidden(n?.key) ? lockedNode(n) : n)),
    };
  }
  // Nothing to link a planned card to that the viewer couldn't open.
  if (Array.isArray(answer.candidates)) out.candidates = answer.candidates.filter((c: any) => !isHidden(c?.key));
  return out;
}

/** A `projectDetail` answer without the workflows `hidden` names. */
export function hideInProjectDetail(answer: any, hidden: Set<string>): any {
  if (!answer || typeof answer !== 'object' || !hidden.size) return answer;
  const keep = (list: unknown) =>
    Array.isArray(list) ? list.filter((t: any) => !hidden.has(t?.identifier)) : list;
  return { ...answer, tasks: keep(answer.tasks), shared_tasks: keep(answer.shared_tasks) };
}
