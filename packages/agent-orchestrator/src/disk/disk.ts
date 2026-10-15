/**
 * What the store takes on the disk, the pure half: its parts (`DISK_PARTS`), which part a name of the store's root is (`partOf`), the
 * kinds inside each part (`DISK_KINDS`) and the kind of a name by its parent's (`kindAt`, `kindIn`), which run a name under a part kept
 * by run is (`runOf`), a walk's answers summed into a reading by part, factory and kind (`readingOf`), what the
 * runtime keeps by task laid over it (`withKept`), the runs that take the most (`largestOf`), and the label sets said before that a
 * reading no longer has (`vanished`). The listing is `disk.store.ts`'s and the sweep `disk.verb.ts`'s.
 */

/**
 * The parts a reading is said by: the runs' worktrees, their records and files, the folder handed to the runtime, `sessions`, the
 * records the runtime's tasks left outside the store, which the runtime alone finds and measures, the checks' output, the series, and
 * `other` for every other name of the store's root and the root itself.
 */
export const DISK_PARTS = ['worktrees', 'runs', 'engine', 'sessions', 'checks', 'series', 'other'] as const;
export type DiskPart = (typeof DISK_PARTS)[number];

/** The parts whose names each belong to a run, and through it to a factory. */
export const PER_RUN: readonly DiskPart[] = ['worktrees', 'runs'];

/** How many runs a sweep names, the largest first. */
export const DISK_RUNS_NAMED = 10;

/** The part each folder of the store's root is, for those that are a part of their own. */
const PART_OF: Readonly<Record<string, DiskPart>> = {
  worktrees: 'worktrees',
  runs: 'runs',
  engine: 'engine',
  checks: 'checks',
  metrics: 'series',
};

/** The part a name of the store's root is: its own for a part's folder, `other` for any other. */
export const partOf = (name: string): DiskPart => (Object.hasOwn(PART_OF, name) ? PART_OF[name] : 'other');

/**
 * The kinds of each part, each kind inside one part, so a part's kinds add up to the part:
 *
 * - `worktrees`: a run's `checkout`, and its `dependencies`, everything under a name `node_modules`;
 * - `runs`: a step's handed files, `pictures` by their image type and the rest `handed`; the `agents` and `inputs` frozen for a run;
 *   its `records`; a person's words and `marks` beside them (`<id>.asks`, `.pruned`, `.cancelled`); and `runs-other`, any other name;
 * - `engine`, as the runtime says what each file is: a session's output (`session-output`) and a check's (`check-output`), the rest
 *   a session keeps (`session-files`), the `journals`, the `bodies`, and `engine-other`, what no task names;
 * - `sessions`: the harness's own records of the sessions (`harness-records`);
 * - `checks`, `series` and `other`: one kind each, of the part's name.
 */
export const DISK_KINDS = {
  worktrees: ['checkout', 'dependencies'],
  runs: ['pictures', 'handed', 'agents', 'inputs', 'records', 'marks', 'runs-other'],
  engine: ['session-output', 'check-output', 'session-files', 'journals', 'bodies', 'engine-other'],
  sessions: ['harness-records'],
  checks: ['checks'],
  series: ['series'],
  other: ['other'],
} as const satisfies Record<DiskPart, readonly string[]>;
export type DiskKind = (typeof DISK_KINDS)[DiskPart][number];

/** Every kind, in the parts' order. */
export const ALL_KINDS: readonly DiskKind[] = DISK_PARTS.flatMap((part): readonly DiskKind[] => DISK_KINDS[part]);

/** The kind a folder of a run's names its handed files, its frozen agents and its frozen inputs by. */
const RUN_FOLDERS: Readonly<Record<string, DiskKind>> = { artifacts: 'handed', agents: 'agents', inputs: 'inputs' };

/** The ends of a name that is a picture, by its image type, in lower case. */
const PICTURE_ENDS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.svg'];

/** Whether `name` is a picture's, by its end, whatever its case. */
const isPicture = (name: string): boolean => {
  const lower = name.toLowerCase();
  return PICTURE_ENDS.some((end) => lower.endsWith(end));
};

/**
 * The kind of a root of `part` (`DiskRoot`): `name` is its name under a part kept by run, absent for the part's folder itself or a
 * part walked whole. Under `runs`, a name with a dot is beside a record, `<id>.json` the record and any other a person's mark; a
 * name with none is a run's folder, whose own blocks are `runs-other` and whose names are each told by `kindIn`.
 */
export function kindAt(part: DiskPart, name?: string): DiskKind {
  if (part === 'worktrees') return name === 'node_modules' ? 'dependencies' : 'checkout';
  if (part === 'runs') {
    if (name === undefined || !name.includes('.')) return 'runs-other';
    return name.endsWith('.json') ? 'records' : 'marks';
  }
  if (part === 'engine') return 'engine-other';
  if (part === 'sessions') return 'harness-records';
  return part;
}

/**
 * The kind of the name `name` inside a folder of kind `kind`: under `runs-other`, a run's folder, `artifacts`, `agents` and `inputs`
 * are their kinds; under the handed files a picture by its end is `pictures` and any other name `handed`; under a checkout a name
 * `node_modules` is `dependencies`, and everything under it; any other name keeps its folder's kind.
 */
export function kindIn(kind: DiskKind, name: string): DiskKind {
  if (kind === 'runs-other') return Object.hasOwn(RUN_FOLDERS, name) ? RUN_FOLDERS[name] : 'runs-other';
  if (kind === 'handed' || kind === 'pictures') return isPicture(name) ? 'pictures' : 'handed';
  if (kind === 'checkout') return name === 'node_modules' ? 'dependencies' : 'checkout';
  return kind;
}

/**
 * The run a name under a part kept by run belongs to, among `ids`: the id the name is, else the longest id the name starts with before
 * a `.`, as the files beside a record are named. Undefined for a name of no run known.
 */
export function runOf(name: string, ids: ReadonlySet<string>): string | undefined {
  if (ids.has(name)) return name;
  for (let dot = name.lastIndexOf('.'); dot > 0; dot = name.lastIndexOf('.', dot - 1)) {
    if (ids.has(name.slice(0, dot))) return name.slice(0, dot);
  }
  return undefined;
}

/**
 * One thing a sweep sizes: its part, its kind (`kindAt`), its name where it is one name under a part kept by run, and its path. One
 * with `own` is a folder counted for itself alone, `own` its bytes, and not walked: the names under it are roots of their own.
 */
export type DiskRoot = {
  readonly part: DiskPart;
  readonly kind: DiskKind;
  readonly name?: string;
  readonly path: string;
  readonly own?: number;
};

/**
 * What was read of each root, in the roots' order: its bytes, the names under it that did not read, whether it read itself, and its
 * bytes by kind (`kinds`), which add up to its bytes; a root with no `kinds` holds its bytes in its own kind.
 */
export type Walked = {
  readonly bytes: readonly number[];
  readonly unread: readonly number[];
  readonly read: readonly boolean[];
  readonly kinds?: readonly (Readonly<Record<string, number>> | undefined)[];
};

/**
 * What one kind of a part holds for one factory, or for none: `bytes`, absent where none of its roots read, and the names that did
 * not read (`unread`), which are in no byte. A pass written before the kinds has none (`kind` absent).
 */
export type DiskEntry = { part: DiskPart; kind?: DiskKind; factory?: string; bytes?: number; unread: number };

/** One reading of the store's disk: when, the bytes free on its file system and the file system's size, and each part's entries. */
export type DiskReading = { at: string; free: number; size: number; entries: DiskEntry[] };

/** A run a reading names: its id, or the name of a folder of no run known; its factory where known; and its bytes over its parts. */
export type DiskRun = { run: string; factory?: string; bytes: number };

/**
 * The roots with what was read of each (`walked`), its bytes by kind among them, and the run and factory of each that has one
 * (`factoryOf`, by a run's id).
 */
const told = (roots: readonly DiskRoot[], walked: Walked, ids: ReadonlySet<string>, factoryOf: (id: string) => string | undefined) =>
  roots.map((root, k) => {
    const run = root.name === undefined ? undefined : runOf(root.name, ids);
    return {
      root,
      run,
      factory: run === undefined ? undefined : factoryOf(run),
      bytes: walked.bytes[k],
      kinds: Object.entries(walked.kinds?.[k] ?? { [root.kind]: walked.bytes[k] }) as [DiskKind, number][],
      unread: walked.unread[k],
      read: walked.read[k],
    };
  });

/**
 * The reading of `roots` as `walked` read them, at `at`, with `space` free: an entry a part, factory and kind met, in `DISK_PARTS`'
 * order and then the order met, each the sum of its roots' bytes of that kind. A root of a run among `ids` is its factory's
 * (`factoryOf`); any other is its part's alone. What did not read under a root is on its own kind's entry, and an entry none of whose
 * roots read has no `bytes`, never zero.
 */
export function readingOf(
  roots: readonly DiskRoot[],
  walked: Walked,
  runs: { ids: ReadonlySet<string>; factoryOf: (id: string) => string | undefined },
  space: { free: number; size: number },
  at: string,
): DiskReading {
  const entries = new Map<string, DiskEntry & { read: boolean }>();
  const add = (at: Pick<DiskEntry, 'part' | 'kind' | 'factory'>, bytes: number, unread: number, read: boolean) => {
    const entry = entries.get(entryKey(at)) ?? { ...at, bytes: 0, unread: 0, read: false };
    entries.set(entryKey(at), { ...entry, bytes: (entry.bytes ?? 0) + bytes, unread: entry.unread + unread, read: entry.read || read });
  };
  for (const { root, factory, kinds, unread, read } of told(roots, walked, runs.ids, runs.factoryOf)) {
    const at = (kind: DiskKind) => ({ part: root.part, kind, ...(factory === undefined ? {} : { factory }) });
    add(at(root.kind), 0, unread, read);
    for (const [kind, bytes] of kinds) add(at(kind), bytes, 0, read);
  }
  const said = [...entries.values()].map(({ read, bytes, ...entry }): DiskEntry => (read ? { ...entry, bytes } : entry));
  return { at, ...space, entries: DISK_PARTS.flatMap((part) => said.filter((entry) => entry.part === part)) };
}

/** The kinds of the folder handed to the runtime that the runtime names by task: all of `engine` but what no task names. */
export type EngineKind = Exclude<(typeof DISK_KINDS)['engine'][number], 'engine-other'>;

/**
 * What the runtime keeps of one task, as the sweep reads its answer: the bytes under the folder handed to the runtime by kind
 * (`engine`), the bytes of the records its sessions left outside the store, absent where none is kept, and how many things did not
 * read.
 */
export type TaskKept = {
  readonly taskId: string;
  readonly engine: Readonly<Partial<Record<EngineKind, number>>>;
  readonly sessions?: number;
  readonly unread: number;
};

/** `entry` with `bytes` more, absent where both are, and `unread` more names that did not read. */
const plus = (entry: DiskEntry, bytes: number | undefined, unread: number): DiskEntry => ({
  ...entry,
  ...(bytes === undefined ? {} : { bytes: (entry.bytes ?? 0) + bytes }),
  unread: entry.unread + unread,
});

/**
 * `entries` in order: by part in `DISK_PARTS`' order; within a part the entries of no factory first, then each factory in the order
 * first met; within a factory by kind, in `DISK_KINDS`' order.
 */
const inOrder = (entries: readonly DiskEntry[]): DiskEntry[] => {
  const met = new Map<string, number>();
  for (const entry of entries) if (!met.has(entry.factory ?? '')) met.set(entry.factory ?? '', entry.factory === undefined ? -1 : met.size);
  const rank = (entry: DiskEntry) => [
    DISK_PARTS.indexOf(entry.part),
    met.get(entry.factory ?? '') ?? 0,
    entry.kind === undefined ? -1 : ALL_KINDS.indexOf(entry.kind),
  ];
  return entries
    .map((entry) => ({ entry, rank: rank(entry) }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2])
    .map(({ entry }) => entry);
};

/**
 * `entries`, a walk's, with what the runtime keeps by task (`kept`) laid over them, each task its run's factory's (`factoryOf`, by a
 * task's id) or no factory's:
 *
 * - each kind of `engine` a task names (`TaskKept.engine`), by its factory or alone, the sum of its tasks' bytes of it; and
 *   `engine-other` alone, the walked whole less every byte the tasks named, never below zero since the two were read at two moments:
 *   what no task names;
 * - `sessions` (`harness-records`) by factory, the sum of its tasks' `sessions` bytes, and alone for the tasks of no factory; a task
 *   with no `sessions` adds to none, so with no record kept there is no `sessions` entry at all, never one at zero;
 * - a task's `unread` on its factory's `session-files`, or that kind alone, which holds no bytes for it.
 *
 * A kind a task holds nothing of adds no entry. With `kept` undefined, an ask that failed, `engine` stays whole in `engine-other` and
 * `sessions` is one entry with no bytes and one name unread. In order (`inOrder`).
 */
export function withKept(
  entries: readonly DiskEntry[],
  kept: readonly TaskKept[] | undefined,
  factoryOf: (taskId: string) => string | undefined,
): DiskEntry[] {
  const made = new Map<string, DiskEntry>(entries.map((entry) => [entryKey(entry), entry]));
  const add = (part: DiskPart, kind: DiskKind, factory: string | undefined, bytes: number | undefined, unread: number) => {
    const at = { part, kind, ...(factory === undefined ? {} : { factory }) };
    made.set(entryKey(at), plus(made.get(entryKey(at)) ?? { ...at, unread: 0 }, bytes, unread));
  };
  if (kept === undefined) add('sessions', 'harness-records', undefined, undefined, 1);
  let named = 0;
  for (const task of kept ?? []) {
    const factory = factoryOf(task.taskId);
    for (const [kind, bytes] of Object.entries(task.engine) as [EngineKind, number][]) {
      if (bytes > 0) add('engine', kind, factory, bytes, 0);
      named += bytes;
    }
    if (task.unread) add('engine', 'session-files', factory, undefined, task.unread);
    if (task.sessions !== undefined) add('sessions', 'harness-records', factory, task.sessions, 0);
  }
  const other = entryKey({ part: 'engine', kind: 'engine-other' });
  const whole = made.get(other);
  if (whole?.bytes !== undefined) made.set(other, { ...whole, bytes: Math.max(0, whole.bytes - named) });
  return inOrder([...made.values()]);
}

/**
 * The `DISK_RUNS_NAMED` runs that hold the most among `roots`, largest first: each named root's bytes summed by its run over the parts
 * kept by run, a name of no run among `ids` under its own name. One that holds nothing is left out.
 */
export function largestOf(
  roots: readonly DiskRoot[],
  walked: Walked,
  runs: { ids: ReadonlySet<string>; factoryOf: (id: string) => string | undefined },
): DiskRun[] {
  const sums = new Map<string, DiskRun>();
  for (const { root, run, factory, bytes } of told(roots, walked, runs.ids, runs.factoryOf)) {
    if (root.name === undefined) continue;
    const id = run ?? root.name;
    const sum = sums.get(id) ?? { run: id, ...(factory === undefined ? {} : { factory }), bytes: 0 };
    sums.set(id, { ...sum, bytes: sum.bytes + bytes });
  }
  return [...sums.values()]
    .filter((sum) => sum.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes || a.run.localeCompare(b.run))
    .slice(0, DISK_RUNS_NAMED);
}

/** An entry's part, factory and kind as one key, and back. */
export const entryKey = (entry: Pick<DiskEntry, 'part' | 'factory' | 'kind'>): string =>
  JSON.stringify([entry.part, entry.factory ?? null, entry.kind ?? null]);

/** The part, factory and kind a key of `entryKey` names. */
export const entryOf = (key: string): Pick<DiskEntry, 'part' | 'factory' | 'kind'> => {
  const [part, factory, kind] = JSON.parse(key) as [DiskPart, string | null, DiskKind | null];
  return { part, ...(factory === null ? {} : { factory }), ...(kind === null ? {} : { kind }) };
};

/**
 * The keys of `said` (`entryKey`) that no entry of `entries` has: the label sets said before and gone now. One whose entry is there and
 * did not read is not gone: it is unread, and keeps what was last said of it; nor is any kind of a part and factory one of whose entries
 * did not read, since what that root held, by kind, is not known.
 */
export const vanished = (said: ReadonlySet<string>, entries: readonly DiskEntry[]): string[] => {
  const now = new Set(entries.map(entryKey));
  const unknown = new Set(entries.filter((entry) => entry.bytes === undefined).map(({ part, factory }) => entryKey({ part, factory })));
  return [...said].filter((key) => {
    const { part, factory } = entryOf(key);
    return !now.has(key) && !unknown.has(entryKey({ part, factory }));
  });
};

/** The names that did not read in each part of `entries`, every part said, zero where all read. */
export const unreadByPart = (entries: readonly DiskEntry[]): Array<{ part: DiskPart; unread: number }> =>
  DISK_PARTS.map((part) => ({ part, unread: entries.reduce((n, entry) => n + (entry.part === part ? entry.unread : 0), 0) }));
