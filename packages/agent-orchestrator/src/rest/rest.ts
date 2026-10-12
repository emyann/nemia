/**
 * A run at rest: one whose pass would read the same things and decide the same nothing until one of its inputs changes — the pure half of
 * the tick's memo of such runs (`restMemo` in tick.verb.ts). What makes a run at rest (`atRest`), which task ids name a run on the engine's
 * feed (`evictedBy`), and which tasks the feed says settled (`settledIn`). Whether its result branches still stand where it saw them is
 * `tipsSeen`'s, as a full pass asks it.
 *
 * The memo is a cache of a pure function, never a source of truth: a pass answers a run at rest from it only while the run's inputs are as
 * they were when a pass last judged it — its record and every file a person keeps beside it (`restStamps` in record.store.ts), each of its
 * tasks' journals (the engine's feed), and its result branches' tips — and a restarted daemon starts with none, and reads and judges every
 * run afresh. While a run's stamp holds, the memo answers it from the run it read, and its record is not read again until the stamp moves.
 * Nothing is written for it, and no verb, `nemia ls` or the api reads it. Pure: it reads no disk, spawns nothing and imports no runtime.
 */
import type { Run } from '../record/record.ts';
import type { Assessment } from '../tick/assess.ts';

/**
 * What one pass of a run read and did, as `advance` knows it once it has decided — every fact that says the next pass, with the same
 * inputs, would decide the same and do nothing.
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
  /** Its notes, which `nemia up` prints on every pass that has them. */
  notes: readonly string[];
  /**
   * Steps whose hand-off is still due (`handOffOwed`): one git refused is tried again on the next pass, with no note. Never one whose
   * workspace is gone, which nothing hands off from: whether a workspace is on disk is read by the pass and not watched by the memo, since
   * nothing but a filing, which writes the record, makes a step's workspace again.
   */
  handOffDue: readonly string[];
  /** Whether an ending that lands on its check has not written down how it landed: a merge in the checkout that is not its own waits. */
  landingOwed: boolean;
  /**
   * Whether the pass read other runs' claims on the repository's checkout (`checkoutHold`): what they say moves with them, not with this
   * run.
   */
  checkoutAsked: boolean;
  /** The runs it waits on (`waitsOf`): whether they shipped is theirs. */
  waiting: readonly unknown[];
  /** Whether it counts against the cap on runs in flight, or the cap holds it: both read other runs. */
  inFlight: boolean;
  held: boolean;
};

/**
 * Whether a run is at rest after the pass that read `f`: it is not `running` — it succeeded, failed, was cancelled, or stopped on a
 * person, at a gate or on a question — or it is pruned; its workflow is frozen on its record (a record without one reads its folder,
 * which is not an input the memo watches); every task it has is settled; nothing is due and nothing was done; it has no notes; and
 * nothing it was judged by is another run's — no hold, no claim on the checkout read, no run waited on, no slot. Pure.
 */
export const atRest = (f: RestFacts): boolean => restBlockers(f).length === 0;

/**
 * Each clause of `atRest` that keeps a run out of the memo, by the name of the fact it reads (`status`, `due.retry`, `checkoutAsked`, …):
 * none for a run at rest. What the tick's check of its memo names when a full pass finds a run not at rest, and what a count of a store's
 * runs by clause is made of. Pure.
 */
export function restBlockers(f: RestFacts): string[] {
  const out: string[] = [];
  if (f.status === 'running' && !f.run.pruned) out.push('status');
  if (!f.run.workflow) out.push('workflow');
  if (f.run.hold) out.push('hold');
  if (!f.settled) out.push('settled');
  if (f.acted) out.push('acted');
  for (const key of ['ready', 'check', 'retry', 'round', 'held'] as const) if (f.due[key].length) out.push(`due.${key}`);
  if (f.notes.length) out.push('notes');
  if (f.handOffDue.length) out.push('handOffDue');
  if (f.landingOwed) out.push('landingOwed');
  if (f.checkoutAsked) out.push('checkoutAsked');
  if (f.waiting.length) out.push('waiting');
  if (f.inFlight) out.push('inFlight');
  if (f.held) out.push('held');
  return out;
}

/**
 * The runs among `ids` whose tasks the engine's feed names: a task's id is its run's id and a dash, then the step (`stepTaskId`,
 * `checkTaskId`), so every id a run's task could have — a try, a check, one a pass filed and died before writing down — starts with it.
 * Each prefix of the task id that ends before a dash is looked up, so a run whose id is a prefix of another's (`a-b`, `a-b-c`) is evicted
 * by that one's tasks too: more work, never less. Pure.
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

/**
 * The tasks whose `settled` entry is among `entries`, a read of the engine's feed: each task settles once, so each is named by one read
 * alone. An entry of any other kind — a task ended, measured or closed — names none, nor one that carries no event. Pure.
 */
export const settledIn = (entries: ReadonlyArray<{ taskId: string; event?: { kind?: string } }>): Set<string> =>
  new Set(entries.flatMap((f) => (f.event?.kind === 'settled' ? [f.taskId] : [])));
