/**
 * The words a task's view is read into, pure: its phase (`phaseOfView`), whether it waits for a person's word (`waitsForWord`), how an
 * attempt ended (`endWords`), and the engine's word for it (`engineWord`, `wordOfView`). Over a view shape written out here (`WordView`),
 * since a pure file imports no runtime.
 */
import { type TaskPhase } from '../record/record.ts';
import { signedAndHeld, type AttemptClock, type AttemptReason, type EngineOutcome, type TaskClock } from '../timeline/index.ts';
import type { AttemptMemory, KilledAtLimit } from '../../contracts/out-of-memory.contract.ts';
import type { AttemptEnd, EnginePhase } from 'objects';

export type { AttemptMemory, AttemptReason, EngineOutcome, KilledAtLimit };

/**
 * How an attempt ended, in the words a person reads for it (`endWords`): the runtime's reason (`AttemptReason`), or the orchestrator's
 * own judging of an end the runtime only carries the fact of — `budget`, cut at the step's spend cap, and `unsigned`, ended without the
 * statement its task asked for.
 */
export type { AttemptEnd };

/**
 * The runtime's task phases, the closed set a task's view stands in: objects' words (`ENGINE_PHASES`), since a pure file imports no
 * runtime, a type included. Held equal to the runtime's `TaskPhase` by a type-level check in `runtime-client.ts`, so a word added or
 * dropped there fails the typecheck here. Named apart from the orchestrator's own `TaskPhase` (`record/record.ts`), which is what a run
 * makes of it.
 */
export type { EnginePhase };

/**
 * An attempt as the words read it: its clock (`AttemptClock`), how it ended, whether the statement its task asked for came
 * (`closedOut`), the reason an old journal ended it with that is no end the runtime records today (`former`, `'unsigned'`), and the
 * closeout it carries, as the engine's `Attempt` keeps them.
 */
export type WordAttempt = AttemptClock & {
  ended: EngineOutcome | null;
  parked?: { calling?: { tool: string } };
  closedOut?: boolean;
  former?: 'unsigned';
  closeout?: unknown;
  /** What its cgroup said of its memory, for an attempt run under a memory limit (`AttemptMemory`). */
  memory?: AttemptMemory;
};

/**
 * A task as the words read it off the engine's view: its word, its brief, how it settled, its attempts, the answers it was given, whether
 * it is held open or closed, and the closeout it was asked for. Written out here because a pure file imports no runtime's
 * behaviour, a type included.
 */
export type WordView = TaskClock & {
  phase: EnginePhase;
  heldBack?: { since: string; after?: { tool: string } };
  state: TaskClock['state'] & {
    settled: EngineOutcome | null;
    attempts: readonly WordAttempt[];
    inputs?: readonly unknown[];
    holdOpen?: boolean;
    closeoutSchema?: object;
  };
};

/**
 * The engine's task phases, narrowed to what a run cares about.
 *
 * A task the engine has never heard of is `unknown`, NOT `pending`. It folds to the same empty
 * state as one that is filed and waiting for a slot — `settled: null`, zero attempts — and the one
 * thing that tells them apart is that a filed task has the brief it was filed with.
 *
 * Worth the line, because `pending` counts as in flight: a run whose engine board has been cleared
 * would read as running for ever, `nemia cancel` claiming to stop steps nobody can find.
 *
 * A task held open whose turn signed (`signedAndHeld`) is `succeeded`: waiting on a person with no
 * process running, its session is over, and the run reads its closeout, check and gate as a settled
 * task's; closed after it signed, it is read as the `succeeded` the engine settles it at on its next
 * pass, never `running` for the pass between.
 *
 * Exported, log-free, so a consumer narrows a view as the tick does. No view at all is `unknown` too.
 */
export const phaseOfView = (v: WordView | undefined): TaskPhase => {
  if (!v) return 'unknown';
  if (v.state.settled) return v.state.settled;
  if (signedAndHeld(v)) return 'succeeded';
  if (v.state.attempts.length) return 'running';
  return v.state.brief ? 'pending' : 'unknown';
};

/**
 * Whether a task held open waits for a person's word now — `input-required`: its turn signed, nobody closed it, and nothing runs. What the
 * tick answers (`e.answer`) or closes (`e.close`), and nothing else is. Off views already read.
 */
export const waitsForWord =
  (views: ReadonlyMap<string, WordView>) =>
  (taskId: string): boolean =>
    views.get(taskId)?.phase === 'input-required';

/**
 * Whether a task's attempt ended without the closing statement its task asked for — the orchestrator's judgement, off what the runtime
 * reports: its harness let the session go `succeeded` with `closedOut: false`; or an old journal ended it `failed` for that, which the
 * runtime reads back as `former: 'unsigned'`. A `failed` end with `closedOut: false` and no `former` is a session that broke, not a
 * missing statement, and is never continued; nor is an end with no `closedOut` key: a `succeeded` with no closeout on a journal that says
 * nothing of it is not unsigned.
 */
export const unsignedEnd = (state: WordView['state'], a: WordAttempt | undefined): boolean =>
  state.closeoutSchema !== undefined &&
  a !== undefined &&
  a.closeout === undefined &&
  (a.former === 'unsigned' || (a.ended === 'succeeded' && a.closedOut === false));

/**
 * How an attempt ended, in the words a person reads for it: an attempt its harness cut at its spend cap is `failed`, `budget` — off the
 * runtime's `limit: 'budget'`, a fact it carries and not an end it judges — one that ended without the statement its task asked for is
 * `failed`, `unsigned` — the orchestrator's word, off the runtime's `closedOut: false` (`unsignedEnd`) — and any other is as the runtime
 * recorded it. The one writer of those words for a surface that shows an attempt's end, so every surface says the same: never read an
 * attempt's raw `reason` for `unsigned` or `budget`.
 */
export const endWords = (state: WordView['state'], a: WordAttempt): { ended: EngineOutcome | null; reason: AttemptEnd | null } =>
  a.limit === 'budget'
    ? { ended: 'failed', reason: 'budget' }
    : unsignedEnd(state, a)
      ? { ended: 'failed', reason: 'unsigned' }
      : { ended: a.ended, reason: a.reason };

/**
 * The engine's own word for a task's phase, off views already read — but `unknown` for a task it has no record of, as `phaseOfView` has it:
 * the engine folds that task to the state of one filed and waiting for a slot, and calls it `pending`, which is in flight. What `nemia ls`
 * prints beside a step, and what the feed words it from (`feedPhase`).
 */
export const engineWord =
  (views: ReadonlyMap<string, WordView>) =>
  (taskId: string): EnginePhase | 'unknown' =>
    wordOfView(views.get(taskId));

/**
 * The engine's word for one task (`engineWord`) — but `succeeded` for a task held open that was closed after it signed, which the engine
 * calls `between-attempts` until its next pass settles it: `phaseOfView` reads it as settled already, and the tick files what follows on
 * it, so `nemia ls` and the board saying a session still going would disagree with the run for that pass. Exported for the api's `wordOf`.
 */
export const wordOfView = (v: WordView | undefined): EnginePhase | 'unknown' =>
  !v?.state.brief ? 'unknown' : v.phase !== 'input-required' && signedAndHeld(v) ? 'succeeded' : v.phase;

/**
 * A session the runtime holds parked at a tool call's end under the store's pause, beside its phase and never inside it: held back at
 * its hook (`heldBack`, with the call it stopped `after` where its harness kept it), or ended parked with the call it `cut`, its
 * continuation not yet started. Undefined for a task that is neither, or settled.
 */
export const parkedOf = (v: WordView | undefined): { after?: string; cut?: string } | undefined => {
  if (!v || v.state.settled) return undefined;
  if (v.heldBack) return v.heldBack.after ? { after: v.heldBack.after.tool } : {};
  const attempts: readonly WordAttempt[] = v.state.attempts;
  const last = attempts.at(-1);
  if (!last?.parked) return undefined;
  return last.parked.calling ? { cut: last.parked.calling.tool } : {};
};

/**
 * The attempts of a task's current turn: every attempt of a task not held open, and of one held open those since the last answer a
 * person gave it (`answer`). What says how the step's session stands now — its closeout, whether it signed, what it was denied, whether
 * it was killed at its memory limit — since an answered task keeps the attempts of the turns before it, and the turn it answered signed
 * `blocked`.
 */
export const currentTurn = <A extends { turn?: number }>(state: { attempts: readonly A[]; inputs?: readonly unknown[] }): A[] =>
  state.attempts.filter((a) => (a.turn ?? 0) === (state.inputs?.length ?? 0));

/**
 * The memory record of the last attempt of a task's current turn (`currentTurn`) in which the kernel killed a process at its limit
 * (`oomKills` of 1 or more); undefined where none was, or the attempts carry no record — a former journal, or a task under no limit. Read
 * off the view on every pass, never off a transition.
 */
export const killedMemoryOf = (v: WordView | undefined): AttemptMemory | undefined =>
  v
    ? currentTurn(v.state)
        .reverse()
        .find((a) => (a.memory?.oomKills ?? 0) >= 1)?.memory
    : undefined;
