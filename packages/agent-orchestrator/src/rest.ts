/**
 * A run at rest: one whose pass would read the same things and decide the same nothing until one of its inputs changes — the pure half of
 * the tick's memo of such runs (`restMemo` in tick.ts). What makes a run at rest (`atRest`), which task ids name a run on the engine's feed
 * (`evictedBy`). Whether its result branches still stand where it saw them is `tipsSeen`'s, as a full pass asks it.
 *
 * The memo is a cache of a pure function, never a source of truth: a pass answers a run at rest from it only while the run's inputs are as
 * they were when a pass last judged it — its record and every file a person keeps beside it (`restStamps` in store.ts), each of its tasks'
 * journals (the engine's feed), and its result branches' tips — and a restarted daemon starts with none, and judges every run afresh. Nothing
 * is written for it, and no verb, `wf ls` or the api reads it. Pure: it reads no disk, spawns nothing and imports no runtime.
 */
import type { Assessment, Run } from './run.ts';

/**
 * What one pass of a run read and did, as `advance` knows it once it has decided — every fact that says the next pass, with the same inputs,
 * would decide the same and do nothing.
 */
export type RestFacts = {
  run: Pick<Run, 'workflow' | 'pruned' | 'hold'>;
  status: Assessment['status'];
  /** What the pass found due: a step to file, a check, a try, a round, or one the repository's checkout holds back. */
  due: Pick<Assessment, 'ready' | 'check' | 'retry' | 'round' | 'held'>;
  /** Whether the engine had settled every task of the run the pass read. A task at work, or waiting for a word, moves on its own. */
  settled: boolean;
  /** What the pass did: filed, checked, tried or looped anything, or wrote the record. */
  acted: boolean;
  /** Its notes, which `wf up` prints on every pass that has them. */
  notes: readonly string[];
  /** Steps whose hand-off is still due: one git refused is tried again on the next pass, with no note. */
  handOffDue: readonly string[];
  /** Whether an ending that lands on its check has not written down how it landed: a merge in the checkout that is not its own waits. */
  landingOwed: boolean;
  /** Whether the pass read other runs' claims on the repository's checkout (`checkoutHold`): what they say moves with them, not with this run. */
  checkoutAsked: boolean;
  /** The runs it waits on (`waitsOf`): whether they shipped is theirs. */
  waiting: readonly unknown[];
  /** Whether it counts against the cap on runs in flight, or the cap holds it: both read other runs. */
  inFlight: boolean;
  held: boolean;
};

/** The statuses a run rests in: it stopped, and only a person's word, or a change in its tasks, moves it. */
const FINAL: ReadonlySet<Assessment['status']> = new Set(['succeeded', 'failed', 'cancelled']);

/**
 * Whether a run is at rest after the pass that read `f`: its status is final — succeeded, failed (a gate waiting on a person included) or
 * cancelled — or it is pruned; its workflow is frozen on its record (an older record reads its folder, which is not an input the memo
 * watches); every task it has is settled; nothing is due and nothing was done; it has no notes; and nothing it was judged by is another
 * run's — no hold, no claim on the checkout read, no run waited on, no slot. Pure.
 */
export const atRest = (f: RestFacts): boolean =>
  (FINAL.has(f.status) || Boolean(f.run.pruned)) && Boolean(f.run.workflow) && !f.run.hold && f.settled && !f.acted
  && !f.due.ready.length && !f.due.check.length && !f.due.retry.length && !f.due.round.length && !f.due.held.length
  && !f.notes.length && !f.handOffDue.length && !f.landingOwed && !f.checkoutAsked && !f.waiting.length && !f.inFlight && !f.held;

/**
 * The runs among `ids` whose tasks the engine's feed names: a task's id is its run's id and a dash, then the step (`stepTaskId`,
 * `checkTaskId`), so every id a run's task could have — a try, a check, one a pass filed and died before writing down — starts with it. Each
 * prefix of the task id that ends before a dash is looked up, so a run whose id is a prefix of another's (`a-b`, `a-b-c`) is evicted by
 * that one's tasks too: more work, never less. Pure.
 */
export function evictedBy(taskIds: Iterable<string>, ids: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const taskId of taskIds) {
    for (let at = taskId.indexOf('-'); at > 0; at = taskId.indexOf('-', at + 1)) {
      const id = taskId.slice(0, at);
      if (ids.has(id)) out.add(id);
    }
  }
  return out;
}

