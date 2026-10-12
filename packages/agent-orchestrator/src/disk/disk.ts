/**
 * What the store takes on the disk, the pure half: its parts (`DISK_PARTS`), which part a name of the store's root is (`partOf`), which
 * run a name under a part kept by run is (`runOf`), a walk's answers summed into a reading by part and factory (`readingOf`), what the
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
 * One thing a sweep sizes: its part, its name where it is one name under a part kept by run, and its path. One with `own` is a folder
 * counted for itself alone, `own` its bytes, and not walked: the names under it are roots of their own.
 */
export type DiskRoot = { readonly part: DiskPart; readonly name?: string; readonly path: string; readonly own?: number };

/** What was read of each root, in the roots' order: its bytes, the names under it that did not read, and whether it read itself. */
export type Walked = { readonly bytes: readonly number[]; readonly unread: readonly number[]; readonly read: readonly boolean[] };

/**
 * What a part holds for one factory, or for none: `bytes`, absent where none of its roots read, and the names that did not read
 * (`unread`), which are in no byte.
 */
export type DiskEntry = { part: DiskPart; factory?: string; bytes?: number; unread: number };

/** One reading of the store's disk: when, the bytes free on its file system and the file system's size, and each part's entries. */
export type DiskReading = { at: string; free: number; size: number; entries: DiskEntry[] };

/** A run a reading names: its id, or the name of a folder of no run known; its factory where known; and its bytes over its parts. */
export type DiskRun = { run: string; factory?: string; bytes: number };

/** The roots with what was read of each (`walked`), and the run and factory of each that has one (`factoryOf`, by a run's id). */
const told = (roots: readonly DiskRoot[], walked: Walked, ids: ReadonlySet<string>, factoryOf: (id: string) => string | undefined) =>
  roots.map((root, k) => {
    const run = root.name === undefined ? undefined : runOf(root.name, ids);
    return {
      root,
      run,
      factory: run === undefined ? undefined : factoryOf(run),
      bytes: walked.bytes[k],
      unread: walked.unread[k],
      read: walked.read[k],
    };
  });

/**
 * The reading of `roots` as `walked` read them, at `at`, with `space` free: an entry a part and factory met, in `DISK_PARTS`' order and
 * then the order met, each the sum of its roots. A root of a run among `ids` is its factory's (`factoryOf`); any other is its part's
 * alone. An entry none of whose roots read has no `bytes`, never zero.
 */
export function readingOf(
  roots: readonly DiskRoot[],
  walked: Walked,
  runs: { ids: ReadonlySet<string>; factoryOf: (id: string) => string | undefined },
  space: { free: number; size: number },
  at: string,
): DiskReading {
  const entries = new Map<string, DiskEntry & { read: boolean }>();
  for (const { root, factory, bytes, unread, read } of told(roots, walked, runs.ids, runs.factoryOf)) {
    const key = JSON.stringify([root.part, factory ?? null]);
    const entry = entries.get(key) ?? { part: root.part, ...(factory === undefined ? {} : { factory }), bytes: 0, unread: 0, read: false };
    entries.set(key, { ...entry, bytes: (entry.bytes ?? 0) + bytes, unread: entry.unread + unread, read: entry.read || read });
  }
  const said = [...entries.values()].map(({ read, bytes, ...entry }): DiskEntry => (read ? { ...entry, bytes } : entry));
  return { at, ...space, entries: DISK_PARTS.flatMap((part) => said.filter((entry) => entry.part === part)) };
}

/**
 * What the runtime keeps of one task, as the sweep reads its answer: the bytes under the folder handed to the runtime (`engine`),
 * the bytes of the records its sessions left outside the store, absent where none is kept, and how many things did not read.
 */
export type TaskKept = { readonly taskId: string; readonly engine: number; readonly sessions?: number; readonly unread: number };

/** `entry` with `bytes` more and `unread` more names that did not read. */
const plus = (entry: DiskEntry, bytes: number, unread: number): DiskEntry => ({
  ...entry,
  bytes: (entry.bytes ?? 0) + bytes,
  unread: entry.unread + unread,
});

/**
 * `entries`, a walk's, with what the runtime keeps by task (`kept`) laid over them, each task its run's factory's (`factoryOf`, by a
 * task's id) or no factory's:
 *
 * - `engine` by factory, the sum of its tasks' `engine` bytes, and `engine` alone, the walked whole less what the factories were given,
 *   never below zero since the two were read at two moments; a task of no factory stays in `engine` alone;
 * - `sessions` by factory, the sum of its tasks' `sessions` bytes, and `sessions` alone for the tasks of no factory; a task with no
 *   `sessions` adds to none, so with no record kept there is no `sessions` entry at all, never one at zero;
 * - a task's `unread` on the `engine` entry it is counted in.
 *
 * With `kept` undefined, an ask that failed, `engine` stays whole and `sessions` is one entry with no bytes and one name unread.
 * In `DISK_PARTS`' order, and within a part the entry of no factory first.
 */
export function withKept(
  entries: readonly DiskEntry[],
  kept: readonly TaskKept[] | undefined,
  factoryOf: (taskId: string) => string | undefined,
): DiskEntry[] {
  const made = new Map<string, DiskEntry>(entries.map((entry) => [entryKey(entry), entry]));
  const add = (part: DiskPart, factory: string | undefined, bytes: number, unread: number) => {
    const at = { part, ...(factory === undefined ? {} : { factory }) };
    made.set(entryKey(at), plus(made.get(entryKey(at)) ?? { ...at, unread: 0 }, bytes, unread));
  };
  if (kept === undefined) made.set(entryKey({ part: 'sessions' }), { part: 'sessions', unread: 1 });
  let given = 0;
  for (const task of kept ?? []) {
    const factory = factoryOf(task.taskId);
    const alone = made.get(entryKey({ part: 'engine' }));
    if (factory === undefined) {
      if (alone || task.unread) made.set(entryKey({ part: 'engine' }), { part: 'engine', ...alone, unread: (alone?.unread ?? 0) + task.unread });
    } else {
      add('engine', factory, task.engine, task.unread);
      given += task.engine;
    }
    if (task.sessions !== undefined) add('sessions', factory, task.sessions, 0);
  }
  const whole = made.get(entryKey({ part: 'engine' }));
  if (whole?.bytes !== undefined) made.set(entryKey({ part: 'engine' }), { ...whole, bytes: Math.max(0, whole.bytes - given) });
  const said = [...made.values()];
  return DISK_PARTS.flatMap((part) => [
    ...said.filter((entry) => entry.part === part && entry.factory === undefined),
    ...said.filter((entry) => entry.part === part && entry.factory !== undefined),
  ]);
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

/** An entry's part and factory as one key, and back. */
export const entryKey = (entry: Pick<DiskEntry, 'part' | 'factory'>): string => JSON.stringify([entry.part, entry.factory ?? null]);

/** The part and factory a key of `entryKey` names. */
export const entryOf = (key: string): Pick<DiskEntry, 'part' | 'factory'> => {
  const [part, factory] = JSON.parse(key) as [DiskPart, string | null];
  return { part, ...(factory === null ? {} : { factory }) };
};

/**
 * The keys of `said` (`entryKey`) that no entry of `entries` has: the label sets said before and gone now. One whose entry is there and
 * did not read is not gone: it is unread, and keeps what was last said of it.
 */
export const vanished = (said: ReadonlySet<string>, entries: readonly DiskEntry[]): string[] => {
  const now = new Set(entries.map(entryKey));
  return [...said].filter((key) => !now.has(key));
};

/** The names that did not read in each part of `entries`, every part said, zero where all read. */
export const unreadByPart = (entries: readonly DiskEntry[]): Array<{ part: DiskPart; unread: number }> =>
  DISK_PARTS.map((part) => ({ part, unread: entries.reduce((n, entry) => n + (entry.part === part ? entry.unread : 0), 0) }));
