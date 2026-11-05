/**
 * A templated factory's upgrade, merged three ways over its tree (`mergeTrees`): the base is the template as last applied, ours the tree
 * now, theirs the template rendered at the new version. Each file is compared whole first — one side's change taken, the same change on
 * both taken once — and a file both sides changed merges by its kind: `factory.json` by key, its `workflows` as a set and its `hires` by
 * step; a markdown file's frontmatter by key and its body by line; any other text by line (`diff3Lines`). A conflict is named by its
 * address, its id on the command line: `<path>` for the whole file, `<path>#<key>` for a frontmatter key, `factory.json#hires.<w>/<s>`
 * for a hire, `<path>:<a>-<b>` for base lines. The person's choices are composed into the tree's files (`compose`), and the merge said as
 * `nemia factory diff` prints it (`planLines`). Pure.
 */
import { diff2Lines, diff3Lines, linesOf } from './lines.ts';
import type { BaseTemplateOf, MergeBaseOf, UnrelatedKey, UnrelatedSet } from '../../contracts/switch.contract.ts';

/** One file of a tree: its path in it, its bytes, and its mode where it keeps one. */
export type TreeFile = { path: string; bytes: Buffer; mode?: number };

/** A conflict: its address, and the text of each side over it, null where that side has none (a file deleted, a key absent). */
export type Conflict = { at: string; base: string | null; ours: string | null; theirs: string | null };

/** A person's choice for a conflict: one side's text, or text of their own. */
export type Choice = 'ours' | 'theirs' | { text: string };

/** A file's merge: its conflicts, and its bytes built with the person's choice for each, by address; null where the file is deleted. */
type FileMerge = {
  path: string;
  mode?: number;
  conflicts: Conflict[];
  build: (choices: ReadonlyMap<string, Choice>) => Buffer | null;
};

/** Where a merged file's change came from: the template's side, the factory's, or both alike. */
export type Merged = { at: string; from: 'template' | 'factory' | 'both' };

/**
 * A tree's merge: whether it had a common base (`none` for a template switch), each file's, what merged cleanly and from which side, and
 * each conflict, in the order of the paths.
 */
export type TreeMerge = { base: 'common' | 'none'; files: FileMerge[]; merged: Merged[]; conflicts: Conflict[] };

/** The file merged as `bytes`, with no conflict. */
const fixed = (path: string, bytes: Buffer | null, mode?: number): FileMerge => ({ path, mode, conflicts: [], build: () => bytes });

/** Whether two sides of a file hold the same bytes, null for none. */
const sameBytes = (a: Buffer | null, b: Buffer | null): boolean => (a === null || b === null ? a === b : a.equals(b));

/** The bytes as text, or null where they are not text a person can read (a NUL, or not UTF-8). */
function textOf(bytes: Buffer | null): string | null {
  if (bytes === null || bytes.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** A side as a conflict quotes it: its text, or a line saying what it is when it is not text. */
const quoted = (bytes: Buffer | null): string | null => (bytes === null ? null : (textOf(bytes) ?? `(${bytes.length} bytes, not text)`));

/** Whether a mode makes its file executable. */
const runs = (mode: number | undefined): number => (mode ?? 0) & 0o111;

/** The mode of a merged file: theirs where ours kept base's, else ours; theirs where ours has none. */
function modeOf(base: TreeFile | undefined, ours: TreeFile | undefined, theirs: TreeFile | undefined): number | undefined {
  if (ours === undefined) return theirs?.mode;
  if (theirs !== undefined && base !== undefined && runs(ours.mode) === runs(base.mode)) return theirs.mode;
  return ours.mode;
}

/** A merge of text: what it built from its parts, given the text chosen for each conflict. */
type Part = string | Conflict;

/** The text `parts` build, each conflict given the text its choice gives it. */
function built(parts: readonly Part[], choices: ReadonlyMap<string, Choice>): string {
  return parts.map((part) => (typeof part === 'string' ? part : (chosenText(part, choices.get(part.at)) ?? ''))).join('');
}

/** The three sides' lines merged by `diff3Lines`, each conflict addressed `<path>:<a>-<b>` with `offset` base lines before them. */
function lineParts(path: string, base: string, ours: string, theirs: string, offset: number): Part[] {
  return diff3Lines(linesOf(base), linesOf(ours), linesOf(theirs)).map((segment) => {
    if ('clean' in segment) return segment.clean.join('');
    const { a, b } = segment.conflict;
    return {
      at: `${path}:${a + offset}-${b + offset}`,
      base: segment.conflict.base.join(''),
      ours: segment.conflict.ours.join(''),
      theirs: segment.conflict.theirs.join(''),
    };
  });
}

/** A frontmatter's entries by key, in order: a line `key:` at the start opens one, and the lines under it belong to it; `''` before any. */
function entriesOf(head: string): Map<string, string> {
  const entries = new Map<string, string>();
  let key = '';
  for (const line of linesOf(head)) {
    const [, opened] = /^([A-Za-z_][\w-]*)\s*:/.exec(line) ?? [];
    if (opened !== undefined) key = opened;
    entries.set(key, (entries.get(key) ?? '') + line);
  }
  return entries;
}

/** A markdown text cut into its frontmatter (between its `---` lines) and its body, or none where it opens with none. */
function frontmatterOf(text: string): { head: string; body: string; lines: number } | undefined {
  const lines = linesOf(text);
  if (lines[0] !== '---\n') return undefined;
  const end = lines.indexOf('---\n', 1);
  if (end < 0) return undefined;
  return { head: lines.slice(1, end).join(''), body: lines.slice(end + 1).join(''), lines: end + 1 };
}

/** The value of a key merged three ways: taken where the sides agree or one side kept base's, else a conflict addressed `at`. */
function keyed<T>(at: string, base: T | undefined, ours: T | undefined, theirs: T | undefined, same: (a?: T, b?: T) => boolean) {
  if (same(ours, theirs) || same(theirs, base)) return { value: ours };
  if (same(ours, base)) return { value: theirs };
  return { conflict: at };
}

/** The keys of `ours`, then each key `theirs` adds, placed after the key it follows in theirs. */
function keyOrder(ours: readonly string[], theirs: readonly string[]): string[] {
  const order = [...ours];
  theirs.forEach((key, i) => {
    if (order.includes(key)) return;
    const after = theirs
      .slice(0, i)
      .reverse()
      .find((k) => order.includes(k));
    order.splice(after === undefined ? 0 : order.indexOf(after) + 1, 0, key);
  });
  return order;
}

/** A frontmatter merged by key into `parts`, each conflict addressed `<path>#<key>`. */
function headParts(path: string, base: string, ours: string, theirs: string): Part[] {
  const [b, o, t] = [entriesOf(base), entriesOf(ours), entriesOf(theirs)];
  const parts: Part[] = [];
  for (const key of keyOrder([...o.keys()], [...t.keys()])) {
    const merged = keyed(`${path}#${key}`, b.get(key), o.get(key), t.get(key), (x, y) => x === y);
    if ('value' in merged) parts.push(merged.value ?? '');
    else parts.push({ at: merged.conflict, base: b.get(key) ?? null, ours: o.get(key) ?? null, theirs: t.get(key) ?? null });
  }
  return parts;
}

/** A text both sides changed merged into parts: by frontmatter key and body line where all three open with frontmatter, else by line. */
function textParts(path: string, base: string, ours: string, theirs: string): Part[] {
  const [b, o, t] = [frontmatterOf(base), frontmatterOf(ours), frontmatterOf(theirs)];
  if (b === undefined || o === undefined || t === undefined) return lineParts(path, base, ours, theirs, 0);
  return ['---\n', ...headParts(path, b.head, o.head, t.head), '---\n', ...lineParts(path, b.body, o.body, t.body, b.lines)];
}

/** A JSON object, or none where the text is not one. */
function objectOf(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** The names of a list, or none where it is not one. */
const namesIn = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

/** A set merged three ways: each name both keep, or one adds; none a side removed. Sorted. */
function setMerged(base: unknown, ours: unknown, theirs: unknown): string[] {
  const [b, o, t] = [new Set(namesIn(base)), new Set(namesIn(ours)), new Set(namesIn(theirs))];
  return [...new Set([...o, ...t])].filter((name) => (o.has(name) && t.has(name)) || !b.has(name)).sort();
}

/** A map of strings, or an empty one. */
const mapOf = (value: unknown): Record<string, string> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, string>) : {};

/** A value of `factory.json` as a conflict quotes it: a hire's agent by name, any other value as JSON. */
const jsonQuoted = (value: unknown, hire: boolean): string | null =>
  value === undefined ? null : hire && typeof value === 'string' ? value : JSON.stringify(value, null, 2);

/**
 * The value a choice gives a key of `factory.json`: a side's, or the person's, a hire's agent by name, else JSON (as words where it is
 * none).
 */
function jsonChosen(slot: Slot, choice: Choice | undefined): unknown {
  if (choice === undefined) return undefined;
  if (choice === 'ours') return slot.sides?.[1];
  if (choice === 'theirs') return slot.sides?.[2];
  const text = choice.text;
  if (slot.hire) return text.trim();
  try {
    return JSON.parse(text);
  } catch {
    return text.trim();
  }
}

/** A slot of the merged `factory.json`: a value, or a conflict to fill with the person's choice. */
type Slot = { key: string; hire: boolean; value?: unknown; conflict?: Conflict; sides?: [unknown, unknown, unknown] };

/** `factory.json` merged by key, its workflows as a set, its hires by step, any other key whole; none where a side is no object. */
function wiringMerge(base: string, ours: string, theirs: string): FileMerge | undefined {
  const [b, o, t] = [objectOf(base), objectOf(ours), objectOf(theirs)];
  if (b === undefined || o === undefined || t === undefined) return undefined;
  const slots: Slot[] = [];
  const same = (x?: unknown, y?: unknown) => JSON.stringify(x) === JSON.stringify(y);
  const add = (key: string, hire: boolean, sides: [unknown, unknown, unknown]) => {
    const at = hire ? `factory.json#hires.${key}` : `factory.json#${key}`;
    const merged = keyed(at, ...sides, same);
    if ('value' in merged) slots.push({ key, hire, value: merged.value });
    else slots.push({ key, hire, conflict: { at, ...sidesQuoted(sides, hire) }, sides });
  };
  for (const key of keyOrder(Object.keys(o), Object.keys(t))) {
    if (key === 'workflows') slots.push({ key, hire: false, value: setMerged(b[key], o[key], t[key]) });
    else if (key !== 'hires') add(key, false, [b[key], o[key], t[key]]);
    else
      for (const step of keyOrder(Object.keys(mapOf(o.hires)), Object.keys(mapOf(t.hires))))
        add(step, true, [mapOf(b.hires)[step], mapOf(o.hires)[step], mapOf(t.hires)[step]]);
  }
  const conflicts = slots.flatMap((slot) => (slot.conflict ? [slot.conflict] : []));
  return { path: 'factory.json', conflicts, build: (choices) => Buffer.from(wiringText(slots, choices)) };
}

/** The three sides of a key of `factory.json` as a conflict quotes them. */
const sidesQuoted = (sides: [unknown, unknown, unknown], hire: boolean): Omit<Conflict, 'at'> => ({
  base: jsonQuoted(sides[0], hire),
  ours: jsonQuoted(sides[1], hire),
  theirs: jsonQuoted(sides[2], hire),
});

/** The text of the merged `factory.json`, each conflict's slot given the chosen value; a key with none left out. */
function wiringText(slots: readonly Slot[], choices: ReadonlyMap<string, Choice>): string {
  const out: Record<string, unknown> = {};
  const hires: Record<string, unknown> = {};
  for (const slot of slots) {
    const value = slot.conflict ? jsonChosen(slot, choices.get(slot.conflict.at)) : slot.value;
    if (slot.hire && !('hires' in out)) out.hires = hires;
    if (value === undefined) continue;
    if (slot.hire) hires[slot.key] = value;
    else out[slot.key] = value;
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** A text file both sides changed, merged by its parts. */
function partsMerge(path: string, parts: readonly Part[], mode: number | undefined): FileMerge {
  const conflicts = parts.filter((part): part is Conflict => typeof part !== 'string');
  return { path, mode, conflicts, build: (choices) => Buffer.from(built(parts, choices)) };
}

/**
 * A text file both sides changed and neither deleted, merged by its kind: `factory.json` by key where all three read, markdown by
 * frontmatter.
 */
function bothChanged(path: string, sides: [string, string, string], mode: number | undefined): FileMerge {
  const [base, ours, theirs] = sides;
  if (path === 'factory.json') {
    const merged = wiringMerge(base, ours, theirs);
    if (merged) return merged;
  }
  const parts = path.endsWith('.md') ? textParts(path, base, ours, theirs) : lineParts(path, base, ours, theirs, 0);
  return partsMerge(path, parts, mode);
}

/** The whole file conflicting: its address the path, each side's bytes kept for a choice of one, or the person's text. */
function wholeConflict(path: string, sides: [Buffer | null, Buffer | null, Buffer | null], mode: number | undefined): FileMerge {
  const conflict: Conflict = { at: path, base: quoted(sides[0]), ours: quoted(sides[1]), theirs: quoted(sides[2]) };
  const build = (choices: ReadonlyMap<string, Choice>): Buffer | null => {
    const choice = choices.get(path);
    if (choice === 'ours') return sides[1];
    if (choice === 'theirs') return sides[2];
    return choice === undefined ? null : Buffer.from(choice.text);
  };
  return { path, mode, conflicts: [conflict], build };
}

/** One path merged: taken whole where one side kept base's or both agree, else merged by kind, or conflicting whole. */
function mergeFile(path: string, base?: TreeFile, ours?: TreeFile, theirs?: TreeFile): { file: FileMerge; merged?: Merged } {
  const [b, o, t] = [base?.bytes ?? null, ours?.bytes ?? null, theirs?.bytes ?? null];
  const mode = modeOf(base, ours, theirs);
  if (sameBytes(o, t)) return { file: fixed(path, o, mode), merged: sameBytes(o, b) ? undefined : { at: path, from: 'both' } };
  if (sameBytes(o, b)) return { file: fixed(path, t, theirs?.mode), merged: { at: path, from: 'template' } };
  if (sameBytes(t, b)) return { file: fixed(path, o, mode), merged: { at: path, from: 'factory' } };
  const texts = [textOf(b), textOf(o), textOf(t)];
  const file = texts.every((text) => text !== null)
    ? bothChanged(path, texts as [string, string, string], mode)
    : wholeConflict(path, [b, o, t], mode);
  return { file, merged: file.conflicts.length ? undefined : { at: path, from: 'both' } };
}

/**
 * The tree `ours` merged three ways with `base` and `theirs`, each a tree's files: every path in any of them, in order, its file's
 * merge; what merged cleanly and from which side; and each conflict with its three sides.
 */
export function mergeTrees(base: readonly TreeFile[], ours: readonly TreeFile[], theirs: readonly TreeFile[]): TreeMerge {
  const index = (files: readonly TreeFile[]) => new Map(files.map((file) => [file.path, file]));
  const [b, o, t] = [index(base), index(ours), index(theirs)];
  const paths = [...new Set([...b.keys(), ...o.keys(), ...t.keys()])].sort();
  const out: TreeMerge = { base: 'common', files: [], merged: [], conflicts: [] };
  for (const path of paths) {
    const { file, merged } = mergeFile(path, b.get(path), o.get(path), t.get(path));
    out.files.push(file);
    if (merged) out.merged.push(merged);
    out.conflicts.push(...file.conflicts);
  }
  return out;
}

/** Two sides' lines merged two ways by `diff2Lines`, each conflict addressed `<path>:<a>-<b>` by the tree's lines after `offset`. */
function unrelatedLines(path: string, ours: string, theirs: string, offset: number): Part[] {
  return diff2Lines(linesOf(ours), linesOf(theirs)).map((segment) => {
    if ('clean' in segment) return segment.clean.join('');
    const { a, b } = segment.conflict;
    return {
      at: `${path}:${a + offset}-${b + offset}`,
      base: null,
      ours: segment.conflict.ours.join(''),
      theirs: segment.conflict.theirs.join(''),
    };
  });
}

/** A frontmatter merged by key with no base (`unrelatedKey`), each conflict addressed `<path>#<key>`. */
function unrelatedHead(path: string, ours: string, theirs: string): Part[] {
  const [o, t] = [entriesOf(ours), entriesOf(theirs)];
  return keyOrder([...o.keys()], [...t.keys()]).map((key): Part => {
    const merged = unrelatedKey(o.get(key), t.get(key));
    return 'taken' in merged ? merged.taken : { at: `${path}#${key}`, base: null, ours: o.get(key) ?? null, theirs: t.get(key) ?? null };
  });
}

/** A text both sides hold differently, merged with no base: by frontmatter key and body line where both open with one, else by line. */
function unrelatedText(path: string, ours: string, theirs: string): Part[] {
  const [o, t] = [frontmatterOf(ours), frontmatterOf(theirs)];
  if (!path.endsWith('.md') || o === undefined || t === undefined) return unrelatedLines(path, ours, theirs, 0);
  return ['---\n', ...unrelatedHead(path, o.head, t.head), '---\n', ...unrelatedLines(path, o.body, t.body, o.lines)];
}

/**
 * `factory.json` merged by key with no base: its workflows as a set (`unrelatedSet`), its hires by step, any other key whole
 * (`unrelatedKey`).
 */
function unrelatedWiring(ours: string, theirs: string): FileMerge | undefined {
  const [o, t] = [objectOf(ours), objectOf(theirs)];
  if (o === undefined || t === undefined) return undefined;
  const slots: Slot[] = [];
  const json = (value: unknown): string | undefined => (value === undefined ? undefined : JSON.stringify(value));
  const add = (key: string, hire: boolean, sides: [unknown, unknown, unknown], asked: boolean) => {
    const at = hire ? `factory.json#hires.${key}` : `factory.json#${key}`;
    if (!asked) slots.push({ key, hire, value: sides[2] });
    else slots.push({ key, hire, conflict: { at, ...sidesQuoted(sides, hire) }, sides });
  };
  for (const key of keyOrder(Object.keys(o), Object.keys(t))) {
    if (key === 'workflows') {
      const merged = unrelatedSet(namesIn(o[key]), namesIn(t[key]));
      if ('taken' in merged) slots.push({ key, hire: false, value: [...merged.taken].sort() });
      else add(key, false, [undefined, o[key], t[key]], true);
    } else if (key !== 'hires') add(key, false, [undefined, o[key], t[key]], 'ask' in unrelatedKey(json(o[key]), json(t[key])));
    else
      for (const step of keyOrder(Object.keys(mapOf(o.hires)), Object.keys(mapOf(t.hires)))) {
        const sides: [unknown, unknown, unknown] = [undefined, mapOf(o.hires)[step], mapOf(t.hires)[step]];
        add(step, true, sides, 'ask' in unrelatedKey(json(sides[1]), json(sides[2])));
      }
  }
  const conflicts = slots.flatMap((slot) => (slot.conflict ? [slot.conflict] : []));
  return { path: 'factory.json', conflicts, build: (choices) => Buffer.from(wiringText(slots, choices)) };
}

/**
 * One path merged with no base: the same on both sides taken, one only the template holds added, one only the tree holds a conflict
 * whose template side is none, and two texts merged by kind, two ways; a binary that differs conflicts whole.
 */
function switchFile(path: string, ours?: TreeFile, theirs?: TreeFile): { file: FileMerge; merged?: Merged } {
  const [o, t] = [ours?.bytes ?? null, theirs?.bytes ?? null];
  const mode = ours === undefined ? theirs?.mode : ours.mode;
  if (sameBytes(o, t)) return { file: fixed(path, o, mode) };
  if (o === null) return { file: fixed(path, t, mode), merged: { at: path, from: 'template' } };
  const [ot, tt] = [textOf(o), textOf(t)];
  if (ot === null || tt === null) return { file: wholeConflict(path, [null, o, t], mode) };
  const wiring = path === 'factory.json' ? unrelatedWiring(ot, tt) : undefined;
  const file = wiring ?? partsMerge(path, unrelatedText(path, ot, tt), mode);
  return { file, merged: file.conflicts.length ? undefined : { at: path, from: 'both' } };
}

/**
 * The tree `ours` merged with `theirs`, a render of another template than the one its base holds, with no common base: every path of
 * either, in order, its file's merge (`switchFile`); what merged cleanly and from which side; and each conflict, its base side none.
 */
export function switchTrees(ours: readonly TreeFile[], theirs: readonly TreeFile[]): TreeMerge {
  const index = (files: readonly TreeFile[]) => new Map(files.map((file) => [file.path, file]));
  const [o, t] = [index(ours), index(theirs)];
  const out: TreeMerge = { base: 'none', files: [], merged: [], conflicts: [] };
  for (const path of [...new Set([...o.keys(), ...t.keys()])].sort()) {
    const { file, merged } = switchFile(path, o.get(path), t.get(path));
    out.files.push(file);
    if (merged) out.merged.push(merged);
    out.conflicts.push(...file.conflicts);
  }
  return out;
}

/**
 * Whether a conflict is of lines or of a frontmatter key, whose text the person writes ends in a newline: neither a whole file nor
 * JSON.
 */
const ofLines = (at: string): boolean => /:\d+-\d+$/.test(at) || (at.includes('#') && !at.startsWith('factory.json#'));

/** The text a choice gives a conflict: one side's, or the person's, given its newline where the conflict is of lines. */
function chosenText(conflict: Conflict, choice: Choice | undefined): string | null {
  if (choice === undefined) return null;
  if (choice === 'ours') return conflict.ours;
  if (choice === 'theirs') return conflict.theirs;
  return ofLines(conflict.at) && choice.text && !choice.text.endsWith('\n') ? `${choice.text}\n` : choice.text;
}

/**
 * The merge `merge` composed with the person's `choices`, by address: the tree's files where every conflict has one, else those
 * pending.
 */
export function compose(merge: TreeMerge, choices: Readonly<Record<string, Choice>>): { entries: TreeFile[] } | { pending: Conflict[] } {
  const pending = merge.conflicts.filter((conflict) => !Object.hasOwn(choices, conflict.at));
  if (pending.length) return { pending };
  const chosen = new Map<string, Choice>();
  for (const conflict of merge.conflicts) {
    const choice = choices[conflict.at];
    if (choice !== undefined) chosen.set(conflict.at, choice);
  }
  const entries: TreeFile[] = [];
  for (const file of merge.files) {
    const bytes = file.build(chosen);
    if (bytes !== null) entries.push({ path: file.path, bytes, ...(file.mode === undefined ? {} : { mode: file.mode }) });
  }
  return { entries };
}

/** Two versions, each x.y.z, compared by number: below zero where `a` is lower, zero where equal, above zero where higher. */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [a.split('.').map(Number), b.split('.').map(Number)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

/** The line that resolves the conflict `at` of the factory `name`, as a person types it. */
export const resolveLine = (name: string, at: string): string => `nemia factory resolve ${name} '${at}' --ours|--theirs|--file <path>`;

/** The most lines of a side a status keeps of a conflict. */
export const KEPT_LINES = 200;

/** A side cut to its first `max` lines, saying how many more it holds and where it is read whole. */
function cutSide(text: string | null, max: number, where: string): string | null {
  if (text === null) return null;
  const lines = linesOf(text);
  if (lines.length <= max) return text;
  return `${lines.slice(0, max).join('')}… ${lines.length - max} more lines: read ${where}\n`;
}

/** A conflict as a status keeps it: each side cut to `max` lines, pointing to its file in the tree, the base or the template. */
export const conflictCut = (conflict: Conflict, max = KEPT_LINES): Conflict => {
  const file = conflict.at.replace(/(#.*|:\d+-\d+)$/, '');
  return {
    at: conflict.at,
    base: cutSide(conflict.base, max, `applied/${file}`),
    ours: cutSide(conflict.ours, max, `tree/${file}`),
    theirs: cutSide(conflict.theirs, max, `${file} as the template renders it (nemia factory diff)`),
  };
};

/** Where a clean change came from, as the plan says it. */
const FROM: Record<Merged['from'], string> = { template: 'the template', factory: 'your tree', both: 'both, merged' };

/** A side as the plan quotes it: each line indented under its name, or that it has none. */
function sideLines(name: string, text: string | null): string[] {
  if (text === null) return [`    ${name}: none`];
  return [`    ${name}:`, ...linesOf(text).map((line) => `      | ${line.replace(/\n$/, '')}`)];
}

/** What files the upgrade a preview printed: its line, the plan's digest, and the parameters it drops from the factory's file. */
export type PlanNext = { line: string; digest: string; dropped: readonly string[] };

/** The templates of a switch, by name: the one the base holds, and the one it switches onto. */
export type Switched = { from: string; to: string };

/**
 * What `nemia factory diff` prints of the merge of `name`'s upgrade from `from` to `to`: where it is a switch (`switched`), both templates
 * and that it has no common base; what merges cleanly, then each conflict, its base side where it has one, the parameters the upgrade
 * drops where any, the plan's digest, and `next`'s line, which files it.
 */
export function planLines(name: string, from: string, to: string, merge: TreeMerge, next: PlanNext, switched?: Switched): string[] {
  const lines =
    switched === undefined
      ? [from === to ? `${name}: its parameters at ${to}` : `${name}: ${from} → ${to}`]
      : [
          `${name}: ${switched.from} ${from} → ${switched.to} ${to}`,
          `switch: ${switched.to} is another template than ${switched.from}, the one ${name}'s base was rendered from, so the merge has no common base: nothing tells your own work from what ${switched.from} left, and each conflict below, a file only your tree holds among them, asks your choice`,
        ];
  lines.push(`merges cleanly: ${merge.merged.length}`);
  for (const merged of merge.merged) lines.push(`  ${merged.at}  from ${FROM[merged.from]}`);
  lines.push(`conflicts: ${merge.conflicts.length}`);
  for (const conflict of merge.conflicts)
    lines.push(
      `  ${conflict.at}`,
      ...(merge.base === 'none' ? [] : sideLines('base', conflict.base)),
      ...sideLines('ours', conflict.ours),
      ...sideLines('theirs', conflict.theirs),
      `    ${resolveLine(name, conflict.at)}`,
    );
  if (next.dropped.length) lines.push(`dropped: ${next.dropped.join(', ')}`);
  lines.push(
    `plan: ${next.digest}`,
    merge.conflicts.length
      ? `${next.line} files it; the daemon merges once each conflict is resolved.`
      : `${next.line} files it; the daemon merges it on its next pass.`,
  );
  return lines;
}

/** Whether an upgrade from a base of the template `recorded` onto the template `now`, each by name, has a common base. */
export const mergeBaseOf: MergeBaseOf = (recorded, now) => (recorded === undefined || recorded === now ? 'common' : 'none');

/**
 * The name of the template a base holds, from what a pass has seen of it: the render's, where the base is the render; else the name
 * recorded; else, where no upgrade is under way, the template the factory's file names, which wrote the base; else none.
 */
export const baseTemplateOf: BaseTemplateOf = (seen) => {
  if (seen.rendered !== undefined) return seen.rendered;
  if (seen.recorded !== undefined) return seen.recorded;
  return seen.idle ? seen.named : undefined;
};

/** A key merged with no base: taken where the sides agree or only the template sets it, else asked. */
export const unrelatedKey: UnrelatedKey = (ours, theirs) => {
  if (ours === theirs) return { taken: theirs ?? '' };
  if (ours === undefined && theirs !== undefined) return { taken: theirs };
  return { ask: true };
};

/** A set of names merged with no base: the template's where it holds every name the tree's does, else asked. */
export const unrelatedSet: UnrelatedSet = (ours, theirs) =>
  ours.every((name) => theirs.includes(name)) ? { taken: theirs } : { ask: true };
