/**
 * The words a task's view is read into, pure: its phase (`phaseOfView`), whether it waits for a person's word (`waitsForWord`), how an
 * attempt ended (`endWords`), and the engine's word for it (`engineWord`, `wordOfView`). Over a view shape written out here (`WordView`),
 * since a pure file imports no runtime.
 */
import { type TaskPhase } from '../record/record.ts';
import { signedAndHeld, type AttemptClock, type TaskClock } from '../timeline/timeline.ts';

/**
 * An attempt as the words read it: its clock (`AttemptClock`), how it ended, whether the statement its task asked for came (`stated`),
 * and the closeout it carries, as the engine's `Attempt` keeps them.
 */
export type WordAttempt = AttemptClock & { ended: string | null; stated?: boolean; closeout?: unknown };

/**
 * A task as the words read it off the engine's view: its word, its brief, how it settled, its attempts, the answers it was given, whether it
 * is held open or closed, and the closeout it was asked for. Written out here because a pure file imports no runtime, a type included, as
 * `AdmissionView` in `cap/cap.ts` is.
 */
export type WordView = TaskClock & {
  phase: string;
  state: TaskClock['state'] & {
    settled: 'succeeded' | 'failed' | 'stopped' | null;
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
 * would read as running for ever, `wf cancel` claiming to stop steps nobody can find.
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
 * reports: its harness let the session go `done` with `stated: false`; or the runtime's own verdict `reason: 'unsigned'`, which a journal
 * may hold (an attempt it ended `failed`). An end with no `stated` key is not read as a missing statement: a `done` with no closeout on a
 * journal that says nothing of `stated` is not unsigned, and is never nudged.
 */
export const unsignedEnd = (state: WordView['state'], a: WordAttempt | undefined): boolean =>
  state.closeoutSchema !== undefined &&
  a !== undefined &&
  a.closeout === undefined &&
  (a.reason === 'unsigned' || (a.ended === 'done' && a.stated === false));

/**
 * How an attempt ended, in the words a person reads for it: an attempt its harness cut at its spend cap is `failed`, `budget` — off the
 * runtime's `limit: 'budget'`, a fact it carries and not an end it judges — one that ended without the statement its task asked for is
 * `failed`, `unsigned` — the orchestrator's word, off the runtime's `stated: false` (`unsignedEnd`) — and any other is as the runtime
 * recorded it. The one writer of those words for a surface that shows an attempt's end, so every surface says the same: never read an
 * attempt's raw `reason` for `unsigned` or `budget`.
 */
export const endWords = (state: WordView['state'], a: WordAttempt): { ended: string | null; reason: string | null } =>
  a.limit === 'budget'
    ? { ended: 'failed', reason: 'budget' }
    : unsignedEnd(state, a)
      ? { ended: 'failed', reason: 'unsigned' }
      : { ended: a.ended, reason: a.reason };

/**
 * The engine's own word for a task's phase, off views already read — but `unknown` for a task it has no record of, as `phaseOfView` has it:
 * the engine folds that task to the state of one filed and waiting for a slot, and calls it `pending`, which is in flight. What `wf ls`
 * prints beside a step, and what the feed words it from (`feedPhase`).
 */
export const engineWord =
  (views: ReadonlyMap<string, WordView>) =>
  (taskId: string): string =>
    wordOfView(views.get(taskId));

/**
 * The engine's word for one task (`engineWord`) — but `succeeded` for a task held open that was closed after it signed, which the engine
 * calls `between attempts` until its next pass settles it: `phaseOfView` reads it as settled already, and the tick files what follows on it,
 * so `wf ls` and the board saying a session still going would disagree with the run for that pass. Exported for the api's `wordOf`.
 */
export const wordOfView = (v: WordView | undefined): string =>
  !v?.state.brief ? 'unknown' : v.phase !== 'input-required' && signedAndHeld(v) ? 'succeeded' : v.phase;
