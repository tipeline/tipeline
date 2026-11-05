// Counts an item plus all of its nested actions/steps, recursively. Shared by
// TaskPipelineCanvas's row-number gutter and the "Go to Row" resolver below so
// both walk the pipeline tree in exactly the same order and never drift apart.
export function countWithDescendants(item: any): number {
  const children = item.params?.actions ?? item.params?.steps;
  if (!Array.isArray(children)) return 1;
  return 1 + children.reduce((sum: number, child: any) => sum + countWithDescendants(child), 0);
}

// Total number of rows (including nested) in a pipeline's action tree — used
// to validate a "Go to Row" number before attempting to resolve it.
export function countTotalRows(actions: any[]): number {
  return actions.reduce((sum, item) => sum + countWithDescendants(item), 0);
}

// Resolves a flattened row number, as shown in the canvas's row-number gutter,
// to the identifier of the action at that position — walking the same
// depth-first, numbered-from-1 order the canvas renders in.
export function findIdentifierByRowNumber(
  actions: any[],
  rowNumber: number,
  startNumber = 1
): string | undefined {
  let current = startNumber;
  for (const item of actions) {
    if (current === rowNumber) return item.identifier;
    const children = item.params?.actions ?? item.params?.steps;
    if (Array.isArray(children)) {
      const childCount = countWithDescendants(item) - 1;
      if (rowNumber > current && rowNumber <= current + childCount) {
        return findIdentifierByRowNumber(children, rowNumber, current + 1);
      }
    }
    current += countWithDescendants(item);
  }
  return undefined;
}
