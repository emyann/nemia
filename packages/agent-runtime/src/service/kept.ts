/**
 * The engine's `kept` verb, and what refuses it: what the store and the harnesses keep on the disk for the sessions the engine
 * ran, in bytes, by task. It removes nothing.
 */
import { Effect, Schema } from 'effect';
import { nameFor, type State } from '../core/index.ts';
import { diskBytesOf, journalsKept, type Journal, type JournalError, type JournalKept, type StoreOps } from '../core/engine/index.ts';
import type { Runner, SessionKept } from '../harness/index.ts';
import type { SeamOps } from '../a2a/index.ts';
import type { EngineShape } from './engine.ts';
import { forgetVerbOf, journalBytesOf } from './forget.ts';

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
 * What is kept of `task`, measured: its journal's and bodies' bytes as the store gave them, and the paths its harness answered for
 * its sessions (`asked`), each counted once across the ask (`seen`). `asked` is the harness's answer, why it gave none, or, as a
 * string, the name of a harness this engine does not have; what could not be measured is said on `unread`.
 */
const taskKept = (task: JournalKept, asked: Asked | string | undefined, seen: Set<string>): KeptReport['tasks'][number] => {
  const unread = task.unread === undefined ? [] : [task.unread];
  const ran = task.attempts.length > 0;
  if (typeof asked === 'string' && ran)
    unread.push(`task ${task.taskId} ran on the ${asked} harness, which this engine does not have: its sessions' files are not counted`);
  if (typeof asked === 'object' && 'why' in asked && ran) unread.push(asked.why);
  const answered = typeof asked === 'object' && 'kept' in asked ? asked.kept : {};
  const sessions = task.attempts.flatMap((a) => {
    const name = nameFor(task.taskId, a.n);
    return Object.hasOwn(answered, name) ? [answered[name]] : [];
  });
  const files = bytesOf(
    sessions.flatMap((s) => s.files),
    seen,
    unread,
  );
  const records = sessions.flatMap((s) => s.records);
  return {
    taskId: task.taskId,
    journal: task.journal,
    bodies: task.bodies,
    files,
    ...(records.length ? { records: bytesOf(records, seen, unread) } : {}),
    ...(unread.length ? { unread } : {}),
  };
};

/**
 * `kept` over the engine's store `store`, its runners by harness, and `harnessNamed`, the harness that answers for a task filed
 * on one, `undefined` for a harness this engine does not have. Refuses any argument. Reads each journal as the store holds it,
 * so no body is read; asks each harness once, with every session of its tasks (`RunnerOps.kept`); a harness without the verb is
 * not asked, and one whose ask fails, or that this engine does not have, is said on each of its tasks' `unread`. Yields between
 * tasks.
 */
export const keptVerbOf = (store: StoreOps, runners: Record<string, SeamOps>, harnessNamed: (harness?: string) => string | undefined) => {
  const ask = (harness: string, sessions: readonly { name: string; nativeId?: string }[]) => {
    const kept = runners[harness].kept;
    if (!kept || !sessions.length) return Effect.succeed<Asked>({ kept: {} });
    return kept(sessions).pipe(
      Effect.map((answer): Asked => ({ kept: answer })),
      Effect.catchCause((cause) =>
        Effect.succeed<Asked>({ why: `the \`${harness}\` harness did not say what it keeps: ${String(cause)}` }),
      ),
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
      const harness = harnessNamed(task.harness);
      tasks.push(taskKept(task, harness === undefined ? `\`${task.harness}\`` : answers.get(harness), seen));
      yield* Effect.yieldNow;
    }
    return { tasks };
  });
};

/**
 * The engine's two verbs over what a task keeps, `forget` (`forgetVerbOf`) and `kept` (`keptVerbOf`), over `go`, the engine's store
 * and runners, its store as a plain value, `runners` by harness, `harnessOf`, the harness that answers for a task, and `fallback`,
 * the one that takes a task that names none: `kept` asks only a harness this engine has.
 */
export const keepingVerbsOf = (
  go: <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.Effect<A, E>,
  store: StoreOps,
  runners: Record<string, SeamOps>,
  harnessOf: (state: State) => string,
  fallback: string,
): Pick<EngineShape, 'forget' | 'kept'> => ({
  forget: forgetVerbOf(go, runners, harnessOf, journalBytesOf(store)),
  kept: keptVerbOf(store, runners, (harness = fallback) => (Object.hasOwn(runners, harness) ? harness : undefined)),
});
