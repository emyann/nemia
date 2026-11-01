/**
 * A landing, read and acted on through the run's place: whether a merge is staged in the repository's checkout (`stagedHere`, a `stat` of
 * the file the place named at `open`, with no process), how it stands (`checkoutStatus`, the place's `status`; `askCheckoutStatus`, the
 * same off the loop), its commit or its abort (`landThrough`, the place's `land`), and what a landing session is denied and told
 * (`landingDenies`, `landingWords`). An answer the place did not give, or refused, is never a verdict: it is folded into words, and the
 * caller acts on none.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { LandingWords } from '../check/check.ts';
import { resultBranches } from '../branches/branches.store.ts';
import { resultTips } from '../branches/index.ts';
import { isRepositoryRun, type RepositoryRun, type Run } from '../record/record.ts';
import type { MergeState, PlaceOutcome, PlaceSay } from './place.ts';
import { landsOnCheck } from '../status/status.ts';
import type { Workflow } from '../step/step.ts';
import type { Place } from './place.store.ts';

/** The checkout as the place's `status` answered it, or why it gave no answer: an unread or refused `status` is never a verdict. */
export type CheckoutRead = MergeState | { readonly unread: string };

/**
 * One pass's reading of its places: the answers of `status` it has had (`reads`), by checkout and the run that asked, whose tips it was
 * asked with, so a pass that asks twice of one checkout for one run starts one process; every branch of a run's repository and its commit
 * as its caller read them (`heads`), which a run's result tips are read off (`resultTips`); and the place it asks (`place`). Owned by the
 * pass and dropped with it; a `land` clears its reads, since the checkout has changed.
 */
export type StatusMemo = {
  readonly reads: Map<string, CheckoutRead>;
  readonly heads: (run: RepositoryRun) => Readonly<Record<string, string>> | undefined;
  readonly place: Place;
};

/** A new `StatusMemo` for one pass, with no answer yet, reading a run's heads through `heads` and asking `place`. */
export const statusMemo = (heads: StatusMemo['heads'], place: Place): StatusMemo => ({ reads: new Map(), heads, place });

/**
 * Whether a merge is staged in `run`'s checkout, as a `stat` of the file the place named at `open` (`stagedFile`) says, with no process.
 * Undefined for a run whose record names no such file, started before its place named one: `status` says it there.
 */
export function stagedHere(run: Pick<RepositoryRun, 'stagedFile'>): boolean | undefined {
  return run.stagedFile === undefined ? undefined : fs.existsSync(run.stagedFile);
}

/**
 * `run`'s checkout as its place's `status` answers it, with the run's result tips off the heads `memo` reads (`resultTips`), asked once per
 * checkout and run within one pass, of the place `memo` names. A refusal and an unread answer are `{ unread }`, in words.
 */
export function checkoutStatus(run: RepositoryRun, memo: StatusMemo): CheckoutRead {
  const key = JSON.stringify([path.resolve(run.repo), run.id]);
  const known = memo.reads.get(key);
  if (known) return known;
  const read = statusRead(memo.place, run.repo, resultTips(run, resultBranches(run), memo.heads(run)));
  memo.reads.set(key, read);
  return read;
}

/** The place's `status` outcome as a reading of the checkout: its answer, or why it said nothing. */
function readOf(outcome: PlaceOutcome<'status'>): CheckoutRead {
  if ('answer' in outcome) return outcome.answer;
  if ('refused' in outcome) return { unread: `the place refused to read the checkout: ${outcome.refused}` };
  return { unread: `the place's status was not heard: ${outcome.unread.said}` };
}

/** What `place` says of `checkout` against `tips`, or why it said nothing. */
const statusRead = (place: Place, repo: string, tips: Readonly<Record<string, string>>): CheckoutRead =>
  readOf(place.askNow('status', { repo, tips }));

/**
 * `checkoutStatus`, asked off the loop (`ask`) and kept in `memo`, so the `checkoutStatus` that follows it for the same run answers
 * from there and starts no process: for a caller the daemon's pass must not wait on.
 */
export const askCheckoutStatus = (run: RepositoryRun, memo: StatusMemo): Effect.Effect<CheckoutRead> => {
  const key = JSON.stringify([path.resolve(run.repo), run.id]);
  const known = memo.reads.get(key);
  if (known) return Effect.succeed(known);
  return memo.place.ask('status', { repo: run.repo, tips: resultTips(run, resultBranches(run), memo.heads(run)) }).pipe(
    Effect.map((outcome) => {
      const read = readOf(outcome);
      memo.reads.set(key, read);
      return read;
    }),
  );
};

/**
 * Whether a merge is staged in the checkout of `run`, whose ending lands on its check, as a pass that only needs to know reads it: the
 * file the place named at `open` (`stagedHere`), with no process; for a record that names none, the place's `status`, asked only while a
 * landing among `steps` is filed and not landed, and true where it gives no answer — a merge nobody can read is held, never let go.
 * False for a folder run and for a run with no such ending.
 */
export function mergeStaged(run: Run, steps: readonly Workflow[], memo: StatusMemo): boolean {
  if (!isRepositoryRun(run)) return false;
  const landings = steps.filter((s) => landsOnCheck(s, run));
  if (!landings.length) return false;
  const marked = stagedHere(run);
  if (marked !== undefined) return marked;
  if (!landings.some((s) => run.steps[s.name]?.taskId && !run.steps[s.name]?.landed)) return false;
  const read = checkoutStatus(run, memo);
  return 'unread' in read || read.merging !== 'none';
}

/** What `landThrough` did: the commit made, the merge taken back, or the place's words on why it did neither. */
export type LandedThrough =
  | { readonly commit: string }
  | { readonly aborted: true }
  | { readonly refused: string }
  | { readonly unread: string };

/**
 * Commit the merge staged in `run`'s checkout with `message`, or abort it, through the place `memo` names (`land`); the pass's reads of
 * `status` in `memo` are cleared, since the checkout has changed. The place's refusal in its words (`refused`: a hook, a path still
 * unmerged), or why it was not heard (`unread`).
 */
export function landThrough(
  run: RepositoryRun,
  act: { readonly act: 'commit'; readonly message: string } | { readonly act: 'abort' },
  memo: StatusMemo,
): LandedThrough {
  memo.reads.clear();
  const outcome = memo.place.askNow('land', { repo: run.repo, ...act });
  if ('answer' in outcome) return outcome.answer;
  if ('refused' in outcome) return { refused: outcome.refused };
  return { unread: `the place's land was not heard: ${outcome.unread.said}` };
}

/** What a landing session of `run` is denied (`denyWhileLanding`, as `place` declares it): none for a folder run, which lands nothing. */
export function landingDenies(run: Run, place: Place): readonly string[] {
  return isRepositoryRun(run) ? place.declared.denyWhileLanding : [];
}

/**
 * What `step`, an ending of `run` that lands on its check, is told and denied by `place` (`landingContract`): its `say.stage` with
 * `{repo}` and `{branches}` filled from the run's checkout and its result branches with a tip, recorded or among `heads` (`resultTips`),
 * and its denies. Undefined for any other step.
 */
export function landingWords(run: Run, step: Workflow, place: Place, heads?: Readonly<Record<string, string>>): LandingWords | undefined {
  if (!isRepositoryRun(run) || !landsOnCheck(step, run)) return undefined;
  const { declared } = place;
  const branches = Object.keys(resultTips(run, resultBranches(run), heads)).join(' ') || '<result branch>';
  return { stage: declared.say.stage.replaceAll('{repo}', run.repo).replaceAll('{branches}', branches), denied: declared.denyWhileLanding };
}

/** The commands `place` gives the briefs of `run`'s steps (its `say`): none for a folder run. */
export function placeSay(run: Run, place: Place): PlaceSay | undefined {
  return isRepositoryRun(run) ? place.declared.say : undefined;
}
