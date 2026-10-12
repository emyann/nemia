/**
 * What a store keeps of each task, measured: its journal, the bodies it is first to name, and the sessions its journal names,
 * read off the entries as the store holds them, so no body is read. Each call reads the world and carries nothing to the next.
 */
import fs from 'node:fs';
import { Effect } from 'effect';
import type { StoreOps } from './journal.ts';
import { refsOf, type BodyRef } from './bodies.ts';

/** One attempt a journal names: its number, and the id its harness knew its session by, when the journal says one. */
export type KeptAttempt = { n: number; nativeId?: string };

/**
 * What the store keeps of one task: its journal's bytes on disk, the bytes of the bodies it is first to name, the harness it
 * was filed on, when it names one, and its attempts; `unread`, in words, when its journal did not read.
 */
export type JournalKept = { taskId: string; journal: number; bodies: number; harness?: string; attempts: KeptAttempt[]; unread?: string };

/**
 * The bytes `file` takes on the disk, as the file system counts them (`lstat().blocks * 512`): a folder's with everything
 * under it, a link's own and never its target's. `undefined` for a path that is not there; `seen`, given, takes each path
 * counted, and one already there counts nothing.
 */
export const diskBytesOf = (file: string, seen?: Set<string>): number | undefined => {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return undefined;
  if (seen?.has(file)) return 0;
  seen?.add(file);
  let bytes = stat.blocks * 512;
  if (stat.isDirectory()) for (const name of fs.readdirSync(file)) bytes += diskBytesOf(`${file}/${name}`, seen) ?? 0;
  return bytes;
};

/** The harness and the attempts the stored entries `entries` name: an attempt by its `starting`, its id by its `ended` or the task's `settled`. */
const sessionsIn = (entries: readonly unknown[]): Pick<JournalKept, 'harness' | 'attempts'> => {
  const attempts: KeptAttempt[] = [];
  let harness: string | undefined;
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as { kind?: unknown; attempt?: unknown; nativeId?: unknown; harness?: unknown };
    const id = typeof e.nativeId === 'string' && e.nativeId !== '' ? e.nativeId : undefined;
    if (e.kind === 'filed' && typeof e.harness === 'string') harness = e.harness;
    if (e.kind === 'starting' && typeof e.attempt === 'number' && !attempts.some((a) => a.n === e.attempt)) attempts.push({ n: e.attempt });
    const named = e.kind === 'ended' ? attempts.find((a) => a.n === e.attempt) : e.kind === 'settled' ? attempts.at(-1) : undefined;
    if (named && id && (e.kind === 'ended' || named.nativeId === undefined)) named.nativeId = id;
  }
  return { ...(harness === undefined ? {} : { harness }), attempts };
};

/**
 * Every task `ops` lists, in its order, with what the store keeps of it (`JournalKept`). A body is counted once, for the first
 * task whose journal names it, by its file's bytes on disk where the store says where it keeps it, else by the size it lists;
 * a journal by its file's, and 0 from a store that says no place. A journal that does not read is named with its bytes and
 * `unread`, and stops no other. Yields between tasks.
 */
export const journalsKept = Effect.fn('journalsKept')(function* (ops: StoreOps) {
  const listed = ops.bodies ? yield* ops.bodies.list.pipe(Effect.catch(() => Effect.succeed([]))) : [];
  const sizes = new Map(listed.map((body) => [body.ref, body.bytes]));
  const at = ops.bodies?.located;
  const taken = new Set<BodyRef>();
  const bodyBytes = (ref: BodyRef): number => {
    if (taken.has(ref)) return 0;
    taken.add(ref);
    return (at ? diskBytesOf(at(ref)) : undefined) ?? sizes.get(ref) ?? 0;
  };
  const kept: JournalKept[] = [];
  for (const taskId of yield* ops.list) {
    const file = ops.located?.journal(taskId);
    const journal = (file ? diskBytesOf(file) : undefined) ?? 0;
    const read = yield* Effect.result(ops.read(taskId) as Effect.Effect<readonly unknown[], { message: string }>);
    if (read._tag === 'Failure') kept.push({ taskId, journal, bodies: 0, attempts: [], unread: read.failure.message });
    else {
      const bodies = read.success.flatMap(refsOf).reduce((sum, ref) => sum + bodyBytes(ref), 0);
      kept.push({ taskId, journal, bodies, ...sessionsIn(read.success) });
    }
    yield* Effect.yieldNow;
  }
  return kept;
});
