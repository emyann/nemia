/**
 * A three-way merge by line (`diff3Lines`): a longest common subsequence of the base against each side, cut into the runs both sides
 * keep as the base has them and the runs between, where a change on one side is taken, the same change on both is taken once, and
 * different changes are a conflict named by the base lines it spans. Pure: a line keeps its own `\n`, so the parts join back into the
 * bytes they came from.
 */

/** A run of the merge: lines taken as they are, or a conflict over the base lines `a`..`b`, 1-based, `b` = `a` − 1 where it spans none. */
export type Segment = { clean: string[] } | { conflict: { a: number; b: number; base: string[]; ours: string[]; theirs: string[] } };

/** `text` cut into its lines, each with its `\n`; the last without one where the text does not end in one. */
export function linesOf(text: string): string[] {
  const lines = text.split(/(?<=\n)/);
  return lines.length === 1 && lines[0] === '' ? [] : lines;
}

/** For each line of `a`, the index of the line of `b` a longest common subsequence pairs it with, or -1. */
function matched(a: readonly string[], b: readonly string[]): number[] {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  const cell = (i: number, j: number): number => table[i * cols + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i * cols + j] = a[i] === b[j] ? cell(i + 1, j + 1) + 1 : Math.max(cell(i + 1, j), cell(i, j + 1));
  const pairs: number[] = Array.from({ length: a.length }, () => -1);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) pairs[i++] = j++;
    else if (cell(i + 1, j) >= cell(i, j + 1)) i++;
    else j++;
  }
  return pairs;
}

/** Whether two runs of lines are the same. */
const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((line, i) => line === b[i]);

/** The run between stable lines, `base` against `ours` and `theirs`, as a segment: one side's change, both's same one, or a conflict. */
function chunkOf(at: number, base: string[], ours: string[], theirs: string[]): Segment {
  if (same(ours, base)) return { clean: theirs };
  if (same(theirs, base) || same(ours, theirs)) return { clean: ours };
  return { conflict: { a: at + 1, b: at + base.length, base, ours, theirs } };
}

/** `segments` with each run of clean lines joined into one, and empty ones dropped. */
function joined(segments: readonly Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const segment of segments) {
    const last = out.at(-1);
    if ('clean' in segment && !segment.clean.length) continue;
    if ('clean' in segment && last && 'clean' in last) last.clean.push(...segment.clean);
    else out.push('clean' in segment ? { clean: [...segment.clean] } : segment);
  }
  return out;
}

/** `base`, `ours` and `theirs`, each a file's lines, merged three ways: the clean runs and the conflicts, in the order of the file. */
export function diff3Lines(base: readonly string[], ours: readonly string[], theirs: readonly string[]): Segment[] {
  const toOurs = matched(base, ours);
  const toTheirs = matched(base, theirs);
  const segments: Segment[] = [];
  let i = 0;
  let j = 0;
  let k = 0;
  while (i < base.length || j < ours.length || k < theirs.length) {
    const line = base[i];
    if (line !== undefined && toOurs[i] === j && toTheirs[i] === k) {
      segments.push({ clean: [line] });
      i++;
      j++;
      k++;
      continue;
    }
    let s = i;
    while (s < base.length && (toOurs[s] === -1 || toTheirs[s] === -1)) s++;
    const o = toOurs[s] ?? ours.length;
    const t = toTheirs[s] ?? theirs.length;
    segments.push(chunkOf(i, base.slice(i, s), ours.slice(j, o), theirs.slice(k, t)));
    i = s;
    j = o;
    k = t;
  }
  return joined(segments);
}
