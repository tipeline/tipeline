export type DiffLine =
  | { kind: 'same' | 'added' | 'removed'; text: string; oldNo: number | null; newNo: number | null }
  | { kind: 'skip'; count: number; lines: DiffLine[] };

// Above this many lines on both sides the table (rows × columns) gets too big to
// build; the middle is then compared as one replaced block.
const MAX_CELLS = 4_000_000;

/**
 * Line diff of two texts (longest common subsequence), with runs of unchanged lines
 * longer than `context` × 2 folded into one `skip` entry that holds them, so a view
 * can show "12 unchanged lines" and expand it.
 */
export function lineDiff(before: string, after: string, context = 3): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');

  // Common start and end aren't part of the table.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const lines: DiffLine[] = [];
  for (let i = 0; i < start; i++) lines.push({ kind: 'same', text: a[i], oldNo: i + 1, newNo: i + 1 });

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if ((midA.length + 1) * (midB.length + 1) > MAX_CELLS) {
    midA.forEach((text, i) => lines.push({ kind: 'removed', text, oldNo: start + i + 1, newNo: null }));
    midB.forEach((text, j) => lines.push({ kind: 'added', text, oldNo: null, newNo: start + j + 1 }));
  } else {
    // lcs[i][j]: length of the common subsequence of midA[i..] and midB[j..].
    const cols = midB.length + 1;
    const lcs = new Uint32Array((midA.length + 1) * cols);
    for (let i = midA.length - 1; i >= 0; i--) {
      for (let j = midB.length - 1; j >= 0; j--) {
        lcs[i * cols + j] =
          midA[i] === midB[j] ? lcs[(i + 1) * cols + j + 1] + 1 : Math.max(lcs[(i + 1) * cols + j], lcs[i * cols + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length || j < midB.length) {
      if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
        lines.push({ kind: 'same', text: midA[i], oldNo: start + i + 1, newNo: start + j + 1 });
        i++;
        j++;
      } else if (i < midA.length && (j === midB.length || lcs[(i + 1) * cols + j] >= lcs[i * cols + j + 1])) {
        // Removed lines go before the lines that replace them.
        lines.push({ kind: 'removed', text: midA[i], oldNo: start + i + 1, newNo: null });
        i++;
      } else {
        lines.push({ kind: 'added', text: midB[j], oldNo: null, newNo: start + j + 1 });
        j++;
      }
    }
  }

  for (let k = 0; k < a.length - endA; k++) {
    lines.push({ kind: 'same', text: a[endA + k], oldNo: endA + k + 1, newNo: endB + k + 1 });
  }

  return fold(lines, context);
}

function fold(lines: DiffLine[], context: number): DiffLine[] {
  const result: DiffLine[] = [];
  let run: DiffLine[] = [];
  const flush = (atStart: boolean, atEnd: boolean) => {
    const keepBefore = atStart ? 0 : context;
    const keepAfter = atEnd ? 0 : context;
    if (run.length > keepBefore + keepAfter + 1) {
      result.push(...run.slice(0, keepBefore));
      const hidden = run.slice(keepBefore, run.length - keepAfter);
      result.push({ kind: 'skip', count: hidden.length, lines: hidden });
      result.push(...run.slice(run.length - keepAfter));
    } else {
      result.push(...run);
    }
    run = [];
  };
  let seenChange = false;
  for (const line of lines) {
    if (line.kind === 'same') {
      run.push(line);
    } else {
      flush(!seenChange, false);
      seenChange = true;
      result.push(line);
    }
  }
  if (seenChange) flush(false, true);
  else result.push(...run); // no changes: nothing to fold around
  return result;
}

export const countChanges = (lines: DiffLine[]) => ({
  added: lines.filter((l) => l.kind === 'added').length,
  removed: lines.filter((l) => l.kind === 'removed').length,
});
