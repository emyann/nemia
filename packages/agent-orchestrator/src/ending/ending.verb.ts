/**
 * A run's ending, as a pass meets it: which run's `workspace: base` step holds the repository's own checkout (`checkoutHold`, `mainClaim`),
 * and the merge an ending staged there, committed or aborted on its check (`landEnding`). A controller, reaching the runtime through the
 * client (`runtime-client.ts`).
 */
import path from 'node:path';
import { endsOnBase } from '../step/step.ts';
import { Effect } from 'effect';
import { asked, over, type Engine } from '../runtime-client.ts';
import type { Refusal } from '../refusal/refusal.ts';
import type { Verdict } from '../check/check.ts';
import type { Workflow } from '../workflow.ts';
import { sizeOf } from '../artifacts/artifacts.ts';
import { heldCheckouts, runAdmitted, type MainClaim, type RunSlot } from '../cap/cap.ts';
import { endingAsked, landedWords, landingDue, landingOpen } from './ending.ts';
import { isRepositoryRun, type CloseoutAsked, type RepositoryRun, type LandingRecord, type Run, type TaskPhase } from '../record/record.ts';
import { landsOnCheck, ownStatus, type SpendOf } from '../status/status.ts';
import { runReady } from '../wait/wait.ts';
import { assess } from '../tick/assess.ts';
import type { Closeout } from '../closeout/index.ts';
import { runStore } from '../record/files.store.ts';
import { stepsOf } from '../record/record.store.ts';
import { checkoutStatus, landThrough, stagedHere, type StatusMemo } from '../place/landing.store.ts';
import { dropLandedPictures, LANDED_PICTURES } from '../artifacts/artifacts.store.ts';
import {
  closeoutAsked,
  closeoutReader,
  exitVerdicts,
  harnessBlocked,
  parentsRead,
  spendReader,
  taskPhasesRead,
  type Parents,
} from '../views/views.verb.ts';
import { phaseOfView } from '../views/views-words.ts';
import { passRead, type PassRead } from '../cap/cap.verb.ts';
import type { PassStanding } from '../standing/standing.verb.ts';

/**
 * Which run's `workspace: base` step holds the repository's own checkout while this run's waits for it (`heldCheckouts`) — or undefined,
 * when nothing does and this run's may be filed.
 *
 * Asked of the store on the pass that asks, never stored, and then of every run of the same repository — but first, and cheaply, of the
 * run's own asks: undefined, with no other run's claim read, for a run called off, for one with no person's word that would file its own
 * ending (`endingAsked`: the approval of one that has not run, or the ask for a try of one that has), and for one whose ending is in that
 * checkout already. A run is in the checkout while the engine holds its `workspace: base` task in flight, as `inFlight` counts one, so a
 * step filed earlier in this very pass is read as being in it. One waiting to be filed counts only if the pass would in fact file it: a
 * send-back of the work un-holds its gate, and an ending that will not be filed must not hold another run's for ever. The cap on runs in
 * flight is read once for the pass (`runSlots`): a run it holds files nothing, so its ending claims nothing (`mainClaim`).
 *
 * @param from The pass that asks (`PassRead`), and the slot it gave this run (`advanceRun`'s): the runs whose claims are read are the
 *   pass's own listing, the very runs it advances, so a step it filed is read on the run it filed it on; the runs the cap holds are read
 *   once for the pass, and only where another run's claim waits on a slot, since this run's own claim reads the slot the pass gave it; and
 *   each run another waits on is read once for the pass. Else where the branches stand, as the caller reads it (`PassStanding`): the store
 *   is listed, and that read, only past the run's own asks, and the cap read only where a claim waits on a slot.
 * @param env Where the cap on runs in flight is read before any pass has written one (`runSlots`): the process's, or the api's own.
 * @param memo The reading of the places (`StatusMemo`), shared with the pass's `landEnding`, so a checkout is read once a run.
 */
export const checkoutHold = Effect.fn('checkoutHold')(function* (
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  from: { read: PassRead; slot: RunSlot | undefined } | { standing: Effect.Effect<PassStanding, Refusal> },
  env: NodeJS.ProcessEnv,
  memo: StatusMemo,
) {
  const ending = steps.find((s) => endsOnBase(s));
  if (!ending || run.cancelledAt || endingAsked(run, ending, runStore.asks.read(run.id).asks) === undefined) return undefined;
  const read = 'read' in from ? from.read : passRead(e, runStore.runs.list(), env, yield* from.standing);
  const slotOf = (id: string) => read.slots.pipe(Effect.map((slots) => slots.get(id)));
  const mine = yield* mainClaim(e, run, 'read' in from ? Effect.succeed(from.slot) : slotOf(run.id), read.parents, memo);
  if (!mine || mine.holds) return undefined;
  const claims: MainClaim[] = [mine];
  for (const other of read.runs) {
    if (other.id === run.id || !isRepositoryRun(other) || path.resolve(other.repo) !== mine.repo) continue;
    const claim = yield* mainClaim(e, other, slotOf(other.id), read.parents, memo);
    if (claim) claims.push(claim);
  }
  return heldCheckouts(claims).get(run.id);
});

/**
 * A run's claim on the repository's own checkout, as a pass reads it now (`MainClaim`) — or undefined for a run with no ending step, for a
 * record whose workflow does not read, and for one whose ending the pass would neither find there nor file.
 *
 * Every run is read the same way, this one and the others, so the two readings cannot drift. A step is IN that checkout while the engine
 * holds its task in flight, as `inFlight` counts one: a task the engine has lost holds nothing, since a run nobody can stop must not hold
 * every other run's ending for ever — but a run somebody called off holds it while its session is still there, between `nemia cancel`
 * asking the engine to stop it and the engine settling it, because that session is still merging in that directory.
 *
 * An ending that lands on its check holds it too, from its filing until the run has landed its merge: while its check runs on that merge,
 * and while the merge is staged there and not yet committed or aborted — a run called off included, whose merge a pass still aborts. Whose
 * merge it is is asked of its place (`checkoutStatus`) only once its session and its check are done, and only where one is in progress,
 * which the file the place named at `open` says with no process (`stagedHere`); a record that names none asks the place. A checkout the
 * place gives no reading of is held: a merge nobody can read is never let go.
 *
 * It WAITS for the checkout on a person's word that would file it — an approval of an ending that has not run, or the ask for a try of one
 * that ended blocked (`endingAsked`) — and only where the pass would in fact file it: a send-back of the work un-holds the gate, an ask no
 * tick honours files nothing, a run waiting on runs that have not landed files no root of its own (`runReady`), and neither does one the
 * cap on runs in flight holds (`runAdmitted`) — so an ending that will not be filed does not hold another run's. Those last two are the
 * questions `advance` asks before it files a ready step, and they bite only on a run with nothing filed: an ending is one when it is also
 * its root, which a folder whose one step merges has. Neither touches a try, since a run with a try due has started. Its `slot` is asked
 * for there alone, and the runs it waits on are read through `parents`.
 */
const mainClaim = Effect.fnUntraced(function* (
  e: Engine,
  run: Run,
  slot: Effect.Effect<RunSlot | undefined, Refusal>,
  parents: Parents,
  memo: StatusMemo,
) {
  let steps: Workflow[];
  try {
    steps = stepsOf(run);
  } catch {
    return undefined;
  }
  const ending = steps.find((s) => endsOnBase(s));
  if (!ending || !isRepositoryRun(run)) return undefined;
  const repo = path.resolve(run.repo);
  const taskId = run.steps[ending.name]?.taskId;
  const phase = taskId ? phaseOfView(yield* asked('view', e.view(taskId))) : 'unknown';
  if (taskId && (phase === 'pending' || phase === 'running')) return { id: run.id, repo, step: ending.name, holds: true };
  if (taskId && landsOnCheck(ending, run) && !run.steps[ending.name]?.landed) {
    const { views, phaseOf } = yield* taskPhasesRead(run).pipe(over(e));
    const own = ownStatus(ending, run, phaseOf, closeoutReader(views, run), closeoutAsked(views), steps, spendReader(views));
    const merging = () => {
      if (stagedHere(run) === false) return 'none';
      const read = checkoutStatus(run, memo);
      return 'unread' in read ? 'ours' : read.merging;
    };
    if (landingOpen(ending, run, own, phaseOf, merging)) return { id: run.id, repo, step: ending.name, holds: true };
  }
  if (run.cancelledAt) return undefined;
  const { asks, rounds } = runStore.asks.read(run.id);
  const at = endingAsked(run, ending, asks);
  if (at === undefined) return undefined;
  const { views, phaseOf } = yield* taskPhasesRead(run).pipe(over(e));
  const a = assess(
    steps,
    run,
    phaseOf,
    closeoutReader(views, run),
    closeoutAsked(views),
    exitVerdicts(views, run),
    asks,
    rounds,
    harnessBlocked(views),
    spendReader(views),
  );
  const parent = yield* parentsRead(run, parents.git, parents.read).pipe(over(e));
  const files = runReady(run, (id) => parent(id).landed) && runAdmitted(run, yield* slot);
  return (files && a.ready.includes(ending.name)) || a.retry.some((r) => r.step === ending.name)
    ? { id: run.id, repo, step: ending.name, holds: false, at }
    : undefined;
});

/**
 * Land the merge the run's ending staged in the repository's checkout, where one lands on its check (`landingDue`): commit it with the
 * message its closeout gave, or abort it, through the run's place (`landThrough`), and write on the step's record (in memory — `advance`
 * writes the run) what was done, once for the try. A commit the place refuses — a hook, a signature — aborts the merge, and says the
 * place's words. An abort the place refuses, a `land` it does not answer, and a checkout its `status` gives no reading of are said, and
 * nothing is written, so the next pass reads again: none is a verdict. Nothing is done for a run `nemia rm` forgot while this pass was at
 * work. Level-triggered: after a restart, of the daemon or the machine, the pass reads the checkout and the engine as they are, and lands
 * then a merge whose session and check have both stopped running.
 *
 * Once it has landed, the pictures its check took of the merged tree are read by nobody (`dropLandedPictures`): they are removed before the
 * record says it landed, so a pass that dies between the two lands again on the next and removes what is left.
 *
 * What the pass does when the place says a merge is staged in the checkout with nothing of the ending running: a merge that is not this
 * run's — every commit it names is not a tip of the run's result branches — is left alone, the person's or the other run's; one that is
 * this run's is committed only if its check passed on it, and aborted otherwise.
 *
 * @param memo The pass's reading of its places (`StatusMemo`), shared with its `checkoutHold`: the place to read and land through, in
 *   place of the run's own, where it names one.
 */
export function landEnding(
  run: Run,
  steps: readonly Workflow[],
  phaseOf: (taskId: string) => TaskPhase,
  signedOff: (step: string) => Closeout | undefined,
  asked: (taskId: string) => CloseoutAsked,
  spendOf: SpendOf,
  verdictOf: (step: string) => Verdict | undefined,
  memo: StatusMemo,
): { notes: string[]; landed: boolean } {
  const ending = steps.find((s) => landsOnCheck(s, run));
  const record = ending && run.steps[ending.name];
  if (!ending || !record?.taskId || record.landed || !isRepositoryRun(run) || !runStore.runs.exists(run.id))
    return { notes: [], landed: false };
  const own = ownStatus(ending, run, phaseOf, signedOff, asked, steps, spendOf);
  const said = signedOff(ending.name)?.output?.message;
  const due = landingDue(
    ending,
    run,
    own,
    phaseOf,
    typeof said === 'string' ? said : undefined,
    verdictOf(ending.name),
    stagedHere(run) ?? true,
    () => checkoutStatus(run, memo),
  );
  if (!due) return { notes: [], landed: false };
  const name = ending.name;
  const write = (landed: LandingRecord, note: string) => {
    const dropped =
      'commit' in landed
        ? dropLandedPictures(run, name, signedOff(name), { commit: landed.commit, checkTaskId: record.check?.taskId })
        : undefined;
    run.steps[name] = { ...record, landed };
    const freed = dropped?.removed.length
      ? [
          `${name}: removed the ${dropped.removed.length} ${dropped.removed.length === 1 ? 'picture' : 'pictures'} its check took of the merged tree (${sizeOf(dropped.bytes)}); ${LANDED_PICTURES} says what they were`,
        ]
      : [];
    return { notes: [`${name}: ${note}`, ...freed], landed: true };
  };
  const again = (why: string) => ({ notes: [`${name}: ${why}: the next tick tries again`], landed: false });
  if (due.act === 'wait') return again(`the run read no state of its checkout, so it neither commits nor aborts its merge (${due.why})`);
  if (due.act === 'record') return write(due.landed, landedWords(run, due.landed));
  if (due.act === 'commit') {
    const done = committedThrough(run, due.message, memo);
    return 'again' in done ? again(done.again) : write(done.landed, done.note);
  }
  const refused = abortedThrough(run, memo);
  if (refused) return again(`${due.why}, and the run could not abort its merge (${refused})`);
  const aborted = { aborted: due.why, ...(due.refusedOn ? { refusedOn: due.refusedOn } : {}) };
  return write(aborted, `${due.why}, so the run aborted its merge; nothing landed on ${run.branch}`);
}

/**
 * Commit the merge staged in `run`'s checkout with `message` through its place (`landThrough`), and abort it where the place refuses the
 * commit: what to write on the step's record, with its note, or why the next pass tries again.
 */
function committedThrough(
  run: RepositoryRun,
  message: string,
  memo: StatusMemo,
): { landed: LandingRecord; note: string } | { again: string } {
  const made = landThrough(run, { act: 'commit', message }, memo);
  if ('commit' in made) return { landed: made, note: `its check passed on the merge, and ${landedWords(run, made)}` };
  if ('aborted' in made) return { again: 'the place answered an abort where the run asked a commit of its merge' };
  if ('unread' in made) return { again: `the run could not commit its merge (${made.unread})` };
  const why = `the place refused the commit of its merge: ${made.refused}`;
  const refused = abortedThrough(run, memo);
  if (refused) return { again: `${why}; and the run could not abort the merge either (${refused})` };
  return { landed: { aborted: why }, note: `${why}, so the run aborted the merge; nothing landed on ${run.branch}` };
}

/** Abort the merge staged in `run`'s checkout through its place (`landThrough`): undefined once it has, else why not, in words. */
function abortedThrough(run: RepositoryRun, memo: StatusMemo): string | undefined {
  const taken = landThrough(run, { act: 'abort' }, memo);
  if ('aborted' in taken) return undefined;
  if ('commit' in taken) return 'the place answered a commit where the run asked an abort';
  return 'refused' in taken ? taken.refused : taken.unread;
}
