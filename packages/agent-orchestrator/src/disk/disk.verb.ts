/**
 * The daemon's measure of what the store takes on the disk: one sweep (`diskOnce`) asks the runtime what it keeps by task, lists the
 * store's root, walks it in bursts, and says what each part holds, by factory where a part is kept by run or by task, what did not
 * read, what is free, and the runs that hold the most; `disk` is the loop the daemon forks. A controller: it reads the disk and the
 * engine on every sweep and decides on nothing it remembers.
 */
import { Cause, Effect, Metric, type Duration } from 'effect';
import { DEFAULT_FACTORY } from '../factory/factory.ts';
import { rootSpan } from '../meter/meter.verb.ts';
import { runTasks } from '../record/record.ts';
import { EngineService, HARNESSES, tried, type KeptReport } from '../runtime-client.ts';
import { walk } from '../prune/freed.store.ts';
import { firstPiece } from '../piece/piece.ts';
import type { Answered } from '../prune/prune.ts';
import { storeFree, storeRoots } from './disk.store.ts';
import {
  entryKey,
  entryOf,
  kindAt,
  kindIn,
  largestOf,
  readingOf,
  unreadByPart,
  vanished,
  withKept,
  type DiskReading,
  type DiskRoot,
  type DiskKind,
  type DiskRun,
  type TaskKept,
} from './disk.ts';

/** The sweep's pace, which no caller shortens: the disk moves slowly, and a sweep walks the whole store. */
export const DISK_EVERY: Duration.Input = '10 minutes';

/**
 * The metrics of the store's disk, in the registry of whoever runs the sweep: the bytes a kind of a part holds (`disk.bytes`, by `part`
 * and `kind`, `DISK_KINDS`, and by `factory` where the part is kept by run or by task: `worktrees`, `runs`, `engine` and `sessions`),
 * the names that did not read and are in no byte (`disk.unread`, by `part`), and the bytes free on the file system that holds the
 * store and its size (`disk.free`, `disk.size`). `sessions` is kept outside the store, perhaps on another file system than the two
 * describe.
 */
export const DISK_METRICS = {
  bytes: Metric.gauge('disk.bytes', { description: 'the bytes a kind of a part of the store holds on disk, as the last sweep read them' }),
  unread: Metric.gauge('disk.unread', { description: 'the names of a part of the store the last sweep could not read' }),
  free: Metric.gauge('disk.free', { description: 'the bytes free on the file system that holds the store' }),
  size: Metric.gauge('disk.size', { description: 'the size in bytes of the file system that holds the store' }),
};

/** The span each of the largest runs is traced as by a sweep, its name the one a dashboard reads. */
export const DISK_SPAN = 'disk.run';

/** The keys a large run's span carries beside its factory: the run and its bytes, neither of which a metric is kept by. */
export const DISK_SPAN_KEYS = ['run', 'value'] as const;

/**
 * What the sweeps of one daemon remember, to say a thing once and never to decide: the label sets of `disk.bytes` they said (`said`),
 * so one that is gone is said at zero. Lost at a restart, nothing is said of what went while the daemon was down.
 */
export type DiskMemory = { said: Set<string> };

/** What a daemon's sweeps remember when it starts: nothing. */
export const freshDiskMemory = (): DiskMemory => ({ said: new Set() });

/** What one sweep answers: the reading, the runs it named, and what the walk cost, the names it read and the bursts it yielded. */
export type Measured = { reading: DiskReading; largest: DiskRun[]; names: number; bursts: number };

/** `value` into `disk.bytes` for the part, kind and factory `key` names (`entryKey`), a key of no kind its part's own (`kindAt`). */
const bytesSaid = (key: string, value: number): Effect.Effect<void> => {
  const { part, kind = kindAt(part), factory } = entryOf(key);
  return factory === undefined
    ? Metric.update(Metric.withAttributes(DISK_METRICS.bytes, { part, kind }), value)
    : Metric.update(Metric.withAttributes(DISK_METRICS.bytes, { part, kind, factory }), value);
};

/**
 * The reading into the gauges (`DISK_METRICS`): each entry that holds bytes, each part's unread names, the room free and the size; and
 * each label set said before that the reading has no bytes of (`vanished`) at zero, once, since a gauge keeps its last value.
 */
const gauged = Effect.fnUntraced(function* (reading: DiskReading, memory: DiskMemory) {
  for (const key of vanished(memory.said, reading.entries)) {
    yield* bytesSaid(key, 0);
    memory.said.delete(key);
  }
  for (const entry of reading.entries) {
    if (entry.bytes === undefined) continue;
    yield* bytesSaid(entryKey(entry), entry.bytes);
    memory.said.add(entryKey(entry));
  }
  for (const { part, unread } of unreadByPart(reading.entries))
    yield* Metric.update(Metric.withAttributes(DISK_METRICS.unread, { part }), unread);
  yield* Metric.update(DISK_METRICS.free, reading.free);
  yield* Metric.update(DISK_METRICS.size, reading.size);
});

/** One of the largest runs into a span of its own (`DISK_SPAN`), a root of no length at `at`, with its factory where it has one. */
const named = (run: DiskRun, at: string): Effect.Effect<void> =>
  rootSpan(
    DISK_SPAN,
    at,
    at,
    { run: run.run, value: run.bytes } satisfies Record<(typeof DISK_SPAN_KEYS)[number], string | number>,
    run.factory === undefined ? {} : { factory: run.factory },
  );

/** The kind a task's output is: a check's where the task was filed on the checks' harness (`HARNESSES.check`), else a session's. */
const outputKind = (harness: string | undefined): DiskKind => (harness === HARNESSES.check.name ? 'check-output' : 'session-output');

/**
 * What the runtime answered of each task, as the pure half takes it: its journal, bodies, output (`outputKind`) and files as the
 * kinds of `engine`, its records as `sessions`.
 */
const keptOf = (report: KeptReport): TaskKept[] =>
  report.tasks.map((task) => ({
    taskId: task.taskId,
    engine: {
      journals: task.journal,
      bodies: task.bodies,
      [outputKind(task.harness)]: task.output,
      'session-files': task.files,
    },
    ...(task.records === undefined ? {} : { sessions: task.records }),
    unread: task.unread?.length ?? 0,
  }));

/**
 * What the runtime keeps by task, asked once (`kept`), or undefined where the ask failed: the sweep then says the engine whole and the
 * sessions unread, and measures the rest.
 */
const keptAsked = Effect.gen(function* () {
  const e = yield* EngineService;
  return yield* e.kept().pipe(
    Effect.map(keptOf),
    Effect.catch(() => Effect.succeed(undefined)),
  );
});

/**
 * One sweep over the store, given the runs the latest pass answered (`answers`) and what this daemon's sweeps remember (`memory`):
 *
 * - the runtime is asked what it keeps by task (`keptAsked`), each task its run's factory's (`runTasks`), or the default factory's: the
 *   engine's folder is said by factory, what belongs to no run answered left in the part alone, and the records its sessions left
 *   outside the store are the part `sessions` (`withKept`); a runtime that keeps no record of a session answers none, and none is said;
 * - the store's root is listed (`storeRoots`, or `given` where a caller listed it), each name under a part kept by run a root of its own;
 * - every root is walked in one walk (`walk`), a burst of names at a time, so a file with two names in the store is counted once, and
 *   one with a name outside it not at all, each name of its kind (`kindIn`) from its root's (`DiskRoot.kind`);
 * - each root of a run answered is its factory's, or the default factory's; a name of no run answered is its part's alone;
 * - the reading goes into the gauges (`DISK_METRICS`), and each of the largest runs into a span (`DISK_SPAN`), which may carry a run.
 *
 * A name that does not read is counted unread and in no byte, and an entry none of whose roots read has no bytes: never zero.
 * Level-triggered: every sweep reads the whole store again.
 *
 * Dies of what `storeRoots` or `storeFree` threw: a store whose root does not read has no reading.
 *
 * @returns The reading, the runs named, and the walk's cost.
 */
export const diskOnce = Effect.fn('diskOnce')(function* (answers: readonly Answered[], memory: DiskMemory, given?: readonly DiskRoot[]) {
  const kept = yield* keptAsked;
  const roots = given ?? (yield* tried(storeRoots));
  const factories = new Map(answers.map((a) => [a.run.id, a.run.factory ?? DEFAULT_FACTORY]));
  const runs = { ids: new Set(factories.keys()), factoryOf: (id: string) => factories.get(id) };
  const walking = roots.flatMap((root, k) => (root.own === undefined ? [{ root, k }] : []));
  const walked = yield* walk(
    walking.map(({ root }) => root.path),
    { kinds: walking.map(({ root }) => root.kind), kindIn: (kind, name) => kindIn(kind as DiskKind, name) },
  );
  const read = {
    bytes: roots.map((root) => root.own ?? 0),
    kinds: roots.map((): Record<string, number> | undefined => undefined),
    unread: roots.map(() => 0),
    read: roots.map(() => true),
  };
  for (const [at, { k }] of walking.entries()) {
    read.bytes[k] = walked.bytes[at] ?? 0;
    read.kinds[k] = walked.kinds[at];
    read.unread[k] = walked.unread[at] ?? 0;
    read.read[k] = walked.read[at] ?? false;
  }
  const at = new Date().toISOString();
  const tasks = new Map(answers.flatMap((a) => runTasks(a.run).map((taskId) => [taskId, a.run.factory ?? DEFAULT_FACTORY])));
  const walkedReading = readingOf(roots, read, runs, yield* tried(storeFree), at);
  const reading = { ...walkedReading, entries: withKept(walkedReading.entries, kept, (taskId) => tasks.get(taskId)) };
  const largest = largestOf(roots, read, runs);
  yield* gauged(reading, memory);
  for (const run of largest) yield* named(run, at);
  yield* Effect.annotateCurrentSpan({ names: walked.names, bursts: walked.bursts, roots: roots.length });
  return { reading, largest, names: walked.names, bursts: walked.bursts } satisfies Measured;
});

/** Why a sweep that failed did: its refusal's or its defect's own message, on one line. */
const whyOf = (cause: Cause.Cause<unknown>): string => {
  const err = Cause.squash(cause);
  return firstPiece(err instanceof Error ? err.message : String(err), '\n');
};

/**
 * The measure, for as long as the daemon runs: a sweep (`diskOnce`) over what `answers` gives then, its reading handed to `keep`, and a
 * rest of `DISK_EVERY`. A sweep that fails hands `keep` no reading, so nothing stale is said for the store, and is a warning, said once
 * while its words stand; the next is tried a rest later.
 */
export const disk = (answers: () => readonly Answered[], keep: (reading: DiskReading | undefined) => void) => {
  const memory = freshDiskMemory();
  let failed: string | undefined;
  const sweep = Effect.suspend(() => diskOnce(answers(), memory)).pipe(
    Effect.andThen(({ reading }) =>
      Effect.sync(() => {
        failed = undefined;
        keep(reading);
      }),
    ),
    Effect.catchCause((cause) => {
      keep(undefined);
      const why = whyOf(cause);
      if (why === failed) return Effect.void;
      failed = why;
      return Effect.logWarning(`What the store takes on the disk could not be measured this sweep: ${why}`);
    }),
  );
  return Effect.forever(sweep.pipe(Effect.andThen(Effect.sleep(DISK_EVERY))));
};
