/**
 * The engine's `kept` verb, and what refuses it: what the store and the harnesses keep on the disk for the sessions the engine
 * ran, in bytes, by task. It removes nothing.
 */
import { Effect, Schema } from 'effect';
import { nameFor } from '../core/index.ts';
import { diskBytesOf, journalsKept, type JournalError, type JournalKept, type StoreOps } from '../core/engine/index.ts';
import type { SessionKept } from '../harness/index.ts';
import type { SeamOps } from '../a2a/index.ts';

/** Why `kept` measured nothing: an argument, where it takes none. */
export class KeptRefused extends Schema.TaggedError<KeptRefused>()('KeptRefused', { message: Schema.String }) {}

/**
 * What is kept on the disk for each task the store lists, in the store's order, in bytes as the file system counts them
 * (`lstat().blocks * 512`): `journal`, its journal's file; `bodies`, the bodies it is the first task to name; `files`, what its
 * harness keeps of its sessions and `forget` would remove; and `records`, the harness's own record of each session its journal
 * names by id, which `forget` leaves, absent where the harness keeps none or none was found. A path is counted once, for the
 * first task that names it. `unread` says, in words, what could not be measured of the task, and is absent when all was.
 */
export type KeptReport = {
  tasks: { taskId: string; journal: number; bodies: number; files: number; records?: number; unread?: string[] }[];
};

/** A harness's answer for its sessions, or why it gave none. */
type Asked = { kept: Record<string, SessionKept> } | { why: string };

/** The sessions of `tasks` by the harness that answers for each (`harnessNamed`), each by its name and the id its journal says. */
const sessionsByHarness = (tasks: readonly JournalKept[], harnessNamed: (harness?: string) => string | undefined) => {
  const by = new Map<string, { name: string; nativeId?: string }[]>();
  for (const task of tasks) {
    const harness = harnessNamed(task.harness);
    if (harness === undefined) continue;
    const sessions = by.get(harness) ?? [];
    for (const a of task.attempts) sessions.push({ name: nameFor(task.taskId, a.n), ...(a.nativeId ? { nativeId: a.nativeId } : {}) });
    by.set(harness, sessions);
  }
  return by;
};

/** The bytes of `paths` on the disk, each counted once across the ask (`seen`), and what did not read, put into `unread`. */
const bytesOf = (paths: readonly string[], seen: Set<string>, unread: string[]): number => {
  let bytes = 0;
  for (const file of paths) {
    try {
      bytes += diskBytesOf(file, seen) ?? 0;
    } catch (cause) {
      unread.push(`${file}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
  return bytes;
};

/**
 * `kept` over the engine's store `store`, its runners by harness, and `harnessNamed`, the harness that answers for a task filed
 * on one, `undefined` for a harness this engine does not have. Refuses any argument. Reads each journal as the store holds it,
 * so no body is read; asks each harness once, with every session of its tasks (`RunnerOps.kept`); a harness without the verb is
 * not asked, and one whose ask fails, or that this engine does not have, is said on each of its tasks' `unread`. Yields between
 * tasks.
 */
export const keptVerbOf = (
  store: StoreOps,
  runners: Record<string, SeamOps>,
  harnessNamed: (harness?: string) => string | undefined,
) => {
  const ask = (harness: string, sessions: readonly { name: string; nativeId?: string }[]) => {
    const kept = runners[harness].kept;
    if (!kept || !sessions.length) return Effect.succeed<Asked>({ kept: {} });
    return kept(sessions).pipe(
      Effect.map((answer): Asked => ({ kept: answer })),
      Effect.catchCause((cause) => Effect.succeed<Asked>({ why: `the \`${harness}\` harness did not say what it keeps: ${String(cause)}` })),
    );
  };

  return Effect.fn('Engine.kept')(function* (): Effect.fn.Return<KeptReport, KeptRefused | JournalError> {
    if (arguments.length > 0) {
      return yield* Effect.fail(
        new KeptRefused({
          message: `takes nothing, and measures every task the store lists; it was handed ${[...arguments].map((a) => JSON.stringify(a)).join(', ')}: nothing was measured.`,
        }),
      );
    }
    const journals = yield* journalsKept(store);
    const answers = new Map<string, Asked>();
    for (const [harness, sessions] of sessionsByHarness(journals, harnessNamed)) answers.set(harness, yield* ask(harness, sessions));
    const seen = new Set<string>();
    const tasks: KeptReport['tasks'] = [];
    for (const task of journals) {
      const unread = task.unread === undefined ? [] : [task.unread];
      const harness = harnessNamed(task.harness);
      const asked = harness === undefined ? undefined : answers.get(harness);
      if (harness === undefined && task.attempts.length)
        unread.push(`task ${task.taskId} ran on the \`${task.harness}\` harness, which this engine does not have: its sessions' files are not counted`);
      if (asked && 'why' in asked && task.attempts.length) unread.push(asked.why);
      const sessions = task.attempts.flatMap((a) => {
        const kept = asked && 'kept' in asked ? asked.kept[nameFor(task.taskId, a.n)] : undefined;
        return kept ? [kept] : [];
      });
      const files = bytesOf(sessions.flatMap((s) => s.files), seen, unread);
      const records = sessions.flatMap((s) => s.records);
      tasks.push({
        taskId: task.taskId,
        journal: task.journal,
        bodies: task.bodies,
        files,
        ...(records.length ? { records: bytesOf(records, seen, unread) } : {}),
        ...(unread.length ? { unread } : {}),
      });
      yield* Effect.yieldNow;
    }
    return { tasks };
  });
};
