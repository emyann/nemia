/**
 * The engine's `forget` verb, and what refuses it: settled tasks' journals, the files their harness keeps of each session, and
 * their lines in the feed, removed together, or, without `yes`, counted.
 */
import type { Harnessed } from './harnessed.ts';
import fs from 'node:fs';
import { Effect, Schema } from 'effect';
import { atWorkState, fold, nameFor, own, waitsForInput, type Event, type Sighting, type State } from '../core/index.ts';
import { Journal, type JournalError, type StoreOps } from '../core/engine/index.ts';
import type { RunnerError, Runner } from '../harness/index.ts';
import type { SeamOps } from '../a2a/index.ts';
import { TaskId } from '../core/model.ts';

/** Why `forget` removed nothing: an argument it does not take, or a task it cannot forget, named by `taskId`. */
export class ForgetRefused extends Schema.TaggedError<ForgetRefused>()('ForgetRefused', {
  taskId: Schema.optional(Schema.String),
  message: Schema.String,
}) {}

/**
 * What `forget` removed, or without `yes` would remove: per task its journal's bytes, its lines in the feed, and per session the
 * files its harness keeps and what it leaves that is not the runtime's to remove; and, once removed, what the feed lost in bytes
 * where the store keeps it so.
 */
export type ForgetReport = {
  forgotten: boolean;
  tasks: {
    taskId: string;
    journalBytes: number;
    feedLines: number;
    sessions: { name: string; files: string[]; left: string[] }[];
  }[];
  feed?: { linesForgotten: number; bytesBefore: number; bytesAfter: number };
};

const NOTHING = 'nothing was forgotten';

const refuse = (message: string, taskId?: string) => Effect.fail(new ForgetRefused({ taskId, message }));

type Go = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.Effect<A, E>;

/** A task every guard let through: its record, folded, and the harness that ran it. */
type Held = { taskId: string; state: State; events: readonly Event[]; harness: string; runner: SeamOps };

/** Why `forget` will not take `args`, or `undefined` for a list of one or more task ids and nothing or `{ yes }`, a boolean. */
const argumentRefusal = (args: readonly unknown[]): string | undefined => {
  const [taskIds, options] = args;
  const ids = Array.isArray(taskIds) && taskIds.length > 0 && taskIds.every((id) => typeof id === 'string' && id !== '');
  const yes = (options as { yes?: unknown } | null | undefined)?.yes;
  const taken =
    options === undefined ||
    (typeof options === 'object' &&
      options !== null &&
      Object.keys(options).every((key) => key === 'yes') &&
      (yes === undefined || typeof yes === 'boolean'));
  if (args.length >= 1 && args.length <= 2 && ids && taken) return undefined;
  return `takes the ids of settled tasks, a list of one or more strings, and \`{ yes: true }\` to remove them, or nothing more to count what would go; it was handed ${args.map((a) => JSON.stringify(a)).join(', ')}: ${NOTHING}.`;
};

/** Where `state` stands, in words, for a task that has not settled. */
const unsettledWords = (state: State): string => {
  const last = state.attempts.at(-1);
  if (waitsForInput(state)) return 'held open, waiting for an answer';
  if (!last) return 'not started';
  return last.ended === null ? `at work on attempt ${last.n}` : `between attempts, after attempt ${last.n}`;
};

/**
 * The size of a task's journal: the file's, where the store says where it keeps it (`located`), else its entries' as JSON lines.
 * @param ops the engine's store.
 */
export const journalBytesOf =
  (ops: StoreOps) =>
  (taskId: string, events: readonly Event[]): number => {
    const file = 'located' in ops ? ops.located?.journal(taskId) : undefined;
    if (file && fs.existsSync(file)) return fs.statSync(file).size;
    return events.reduce((n, e) => n + Buffer.byteLength(JSON.stringify(e)) + 1, 0);
  };

/** A task's count in `counts`, 0 where it has none. */
const countOf = (counts: Readonly<Record<string, number>> | undefined, taskId: string): number => (counts && own(counts, taskId)) ?? 0;

/**
 * Each task of `ids`' lines in the feed, read once, for a `forget` that removes nothing (`dry`) or one that removes them: off the
 * store's own count (`feedLines`) when it removes nothing, and `undefined` when it removes them, for the store's `forget` answers
 * them (`linesByTask`) off the one read it makes; off the whole feed, read and decoded, from a store with no count of its own.
 */
const feedCountsOf = (go: Go, ids: readonly string[], dry: boolean) =>
  Effect.gen(function* () {
    const counted = yield* go(Effect.map(Journal, (j) => j.feedLines));
    if (counted) return dry ? yield* go(counted(ids.map(TaskId.read))) : undefined;
    const { entries } = yield* go(Effect.flatMap(Journal, (j) => j.feed(0)));
    return Object.fromEntries(ids.map((id) => [id, entries.filter((e) => e.taskId === id).length]));
  });

/** Whether a session its harness lists is still held: at work, or its process kept (`held`). One listed ended is let go. */
const stillHeld = (seen: Sighting | undefined): boolean => seen !== undefined && (atWorkState(seen.state) || seen.held === true);

/**
 * A refusal of `held` when its harness still holds a session of it (`stillHeld`), or could not be read for one: a look told the
 * attempts' names (`observeFor`), else the full listing, a failed read leaving every name unread.
 */
const sessionsHeld = (go: Go, held: Held) =>
  Effect.gen(function* () {
    const names = held.state.attempts.map((a) => nameFor(held.taskId, a.n));
    if (!names.length) return;
    const { observeFor, observe } = held.runner;
    const look = observeFor
      ? observeFor(names.map((name) => ({ name, harness: held.state.harness })))
      : observe.pipe(Effect.map((seen) => ({ seen, unread: new Set<string>() })));
    const { seen, unread } = yield* go(look).pipe(
      Effect.catch(() => Effect.succeed({ seen: new Map<string, Sighting>(), unread: new Set(names) })),
    );
    const still = names.find((name) => stillHeld(seen.get(name)));
    const unseen = names.find((name) => unread.has(name));
    if (still)
      return yield* refuse(
        `task ${held.taskId}'s harness, \`${held.harness}\`, still holds session ${still}; the next pass lets a finished session go; forget it after: ${NOTHING}.`,
        held.taskId,
      );
    if (unseen)
      return yield* refuse(
        `task ${held.taskId}'s harness, \`${held.harness}\`, could not be read for session ${unseen}, so whether it still holds it cannot be told; forget it once \`ae ls\` reads it: ${NOTHING}.`,
        held.taskId,
      );
  });

/**
 * `forget` over `go`, the engine's store and runners, `runners` by harness, and `harnessOf`, the harness that answers for a task.
 * Refuses, every id asked before anything is touched, each in words that end "nothing was forgotten": an argument it does not
 * take; a store with no `forget`; an id the store does not list; a journal that cannot be read; a task not settled; a task filed on
 * a harness this engine does not have; and a session its harness still lists, or could not be read for. Without `yes` it counts;
 * with it, it removes each session's files through its harness (`RunnerOps.forget`), then the journals and the feed's lines in one
 * call to the store, the journal last, so a forget cut short is finished by the next.
 */
export const forgetVerbOf = (
  go: Go,
  runners: Record<string, SeamOps>,
  harnessOf: (state: State) => Harnessed,
  bytesOf: (taskId: string, events: readonly Event[]) => number,
) => {
  const heldOf = (taskId: string, listed: ReadonlySet<string>) =>
    Effect.gen(function* () {
      if (!listed.has(taskId)) return yield* refuse(`no task ${taskId} in this store; \`ae ls\` lists them: ${NOTHING}.`, taskId);
      const events = yield* go(Effect.flatMap(Journal, (j) => j.read(TaskId.read(taskId)))).pipe(
        Effect.catch((e: JournalError) =>
          refuse(
            `${e.message}: whether it settled cannot be told, and forgetting it would lose a record nobody has read: ${NOTHING}.`,
            taskId,
          ),
        ),
      );
      const state = fold(taskId, events);
      if (state.settled === null)
        return yield* refuse(
          `task ${taskId} is ${unsettledWords(state)}: forgetting it would lose its journal while a session may still write to it; stop it with \`ae stop ${taskId}\`, wait for it to settle, then forget it: ${NOTHING}.`,
          taskId,
        );
      if (state.harness !== undefined && !Object.hasOwn(runners, state.harness))
        return yield* refuse(
          `task ${taskId} ran on the \`${state.harness}\` harness, which this engine does not have, so its session files cannot be found; give the engine the \`${state.harness}\` harness again: ${NOTHING}.`,
          taskId,
        );
      const { name: harness, runner } = harnessOf(state);
      return { taskId, state, events, harness, runner } satisfies Held;
    });

  const sessionsOf = (held: Held, dry: boolean) =>
    Effect.forEach(held.state.attempts, (a) => {
      const name = nameFor(held.taskId, a.n);
      const forget = held.runner.forget;
      if (!forget)
        return Effect.succeed({ name, files: [], left: [`whatever the \`${held.harness}\` harness keeps of ${name}: it has no forget`] });
      return go(forget({ name, ...(a.nativeId ? { nativeId: a.nativeId } : {}) }, { dry })).pipe(Effect.map((f) => ({ name, ...f })));
    });

  return Effect.fn('Engine.forget')(function* (taskIds: readonly string[], options?: { yes?: boolean }) {
    const refused = argumentRefusal([...arguments]);
    if (refused) return yield* refuse(refused);
    const forgetStore = yield* go(Effect.map(Journal, (j) => j.forget));
    if (!forgetStore) return yield* refuse(`this store keeps no way to forget a task: ${NOTHING}.`);
    const ids = [...new Set(taskIds)];
    const listed = new Set(yield* go(Effect.flatMap(Journal, (j) => j.list)));
    const held: Held[] = [];
    for (const taskId of ids) held.push(yield* heldOf(taskId, listed));
    for (const h of held) yield* sessionsHeld(go, h);
    const dry = options?.yes !== true;
    const before = yield* feedCountsOf(go, ids, dry);
    const tasks: ForgetReport['tasks'] = [];
    for (const h of held) {
      const journalBytes = bytesOf(h.taskId, h.events);
      tasks.push({ taskId: h.taskId, journalBytes, feedLines: countOf(before, h.taskId), sessions: yield* sessionsOf(h, dry) });
    }
    if (dry) return { forgotten: false, tasks } satisfies ForgetReport;
    const feed = yield* go(forgetStore(ids.map(TaskId.read)));
    const counts = before ?? feed?.linesByTask;
    return {
      forgotten: true,
      tasks: tasks.map((t) => ({ ...t, feedLines: countOf(counts, t.taskId) })),
      ...(feed ? { feed: { linesForgotten: feed.linesForgotten, bytesBefore: feed.bytesBefore, bytesAfter: feed.bytesAfter } } : {}),
    } satisfies ForgetReport;
  });
};

/** What `forget` fails with besides its refusal: the store's error, or a harness's that could not remove a session's files. */
export type ForgetFailure = ForgetRefused | JournalError | RunnerError;
