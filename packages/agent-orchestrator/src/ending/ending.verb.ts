/**
 * A run's ending, as a pass meets it: which run's `workspace: main` step holds the repository's own checkout (`checkoutHold`, `mainClaim`),
 * and the merge an ending staged there, committed or aborted on its check (`landEnding`). A controller, reaching the runtime through the
 * client (`runtime-client.ts`).
 */
import path from 'node:path';
import type { Engine } from '../runtime-client.ts';
import type { Verdict } from '../check/check.ts';
import type { Workflow } from '../workflow.ts';
import { sizeOf } from '../artifacts/artifacts.ts';
import { heldCheckouts, runAdmitted, type CheckoutHold, type MainClaim, type RunSlot } from '../cap/cap.ts';
import { endingAsked, landedWords, landingDue, landingOpen } from './ending.ts';
import { isGitRun, type CloseoutAsked, type Landed, type Run, type TaskPhase } from '../record/record.ts';
import { landsOnCheck, ownStatus, type SpendOf } from '../status/status.ts';
import { runReady } from '../wait/wait.ts';
import { assess } from '../tick/assess.ts';
import type { Closeout } from '../closeout/closeout.ts';
import { runStore } from '../record/files.store.ts';
import { stepsOf } from '../record/record.store.ts';
import { abortMerge, commitMerge, mergeInProgress, mergeState } from '../workspace/worktree.store.ts';
import { dropLandedPictures, LANDED_PICTURES } from '../artifacts/artifacts.store.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, harnessBlocked, parentsOf, spendReader, taskPhases } from '../views/views.verb.ts';
import { phaseOfView } from '../views/views-words.ts';
import { runSlots } from '../cap/cap.verb.ts';
import { resultTips } from '../branches/branches.store.ts';

/**
 * Which run's `workspace: main` step holds the repository's own checkout while this run's waits for it (`heldCheckouts`) — or undefined,
 * when nothing does and this run's may be filed.
 *
 * Asked of the store on the pass that asks, never stored, and then of every run of the same repository — but first, and cheaply, of the
 * run's own asks: undefined, with no other run's claim read, for a run called off, for one with no person's word that would file its own
 * ending (`endingAsked`: the approval of one that has not run, or the ask for a try of one that has), and for one whose ending is in that
 * checkout already. A run is in the checkout while the engine holds its `workspace: main` task in flight, as `inFlight` counts one, so a
 * step filed earlier in this very pass is read as being in it. One waiting to be filed counts only if the pass would in fact file it: a
 * send-back of the work un-holds its gate, and an ending that will not be filed must not hold another run's for ever. The cap on runs in
 * flight is read once for every claim (`runSlots`): a run it holds files nothing, so its ending claims nothing (`mainClaim`).
 *
 * @param runs The runs whose claims are read: a pass's own listing, the very runs it advances, so a step it filed is read on the run it
 *   filed it on; the store's, listed only past the run's own asks, when none is given.
 * @param env Where the cap on runs in flight is read before any pass has written one (`runSlots`): the process's, or the api's own.
 */
export async function checkoutHold(
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  runs?: readonly Run[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<CheckoutHold | undefined> {
  const ending = steps.find((s) => s.workspace === 'main');
  if (!ending || run.cancelledAt || endingAsked(run, ending, runStore.asks.read(run.id).asks) === undefined) return undefined;
  const listed = runs ?? runStore.runs.list();
  const slots = await runSlots(e, listed, env);
  const mine = await mainClaim(e, run, slots.get(run.id));
  if (!mine || mine.holds) return undefined;
  const claims: MainClaim[] = [mine];
  for (const other of listed) {
    if (other.id === run.id || !isGitRun(other) || path.resolve(other.repo) !== mine.repo) continue;
    const claim = await mainClaim(e, other, slots.get(other.id));
    if (claim) claims.push(claim);
  }
  return heldCheckouts(claims).get(run.id);
}

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
 * merge it is is asked of git only where one is in progress, which the file system says with no git (`mergeInProgress`).
 *
 * It WAITS for the checkout on a person's word that would file it — an approval of an ending that has not run, or the ask for a try of one
 * that ended blocked (`endingAsked`) — and only where the pass would in fact file it: a send-back of the work un-holds the gate, an ask no
 * tick honours files nothing, a run waiting on runs that have not shipped files no root of its own (`runReady`), and neither does one the
 * cap on runs in flight holds (`runAdmitted`) — so an ending that will not be filed does not hold another run's. Those last two are the
 * questions `advance` asks before it files a ready step, and they bite only on a run with nothing filed: an ending is one when it is also
 * its root, which a folder whose one step merges has. Neither touches a try, since a run with a try due has started.
 */
async function mainClaim(e: Engine, run: Run, slot: RunSlot | undefined): Promise<MainClaim | undefined> {
  let steps: Workflow[];
  try {
    steps = stepsOf(run);
  } catch {
    return undefined;
  }
  const ending = steps.find((s) => s.workspace === 'main');
  if (!ending || !isGitRun(run)) return undefined;
  const repo = path.resolve(run.repo);
  const taskId = run.steps[ending.name]?.taskId;
  const phase = taskId ? phaseOfView(await e.view(taskId)) : 'unknown';
  if (taskId && (phase === 'pending' || phase === 'running')) return { id: run.id, repo, step: ending.name, holds: true };
  if (taskId && landsOnCheck(ending, run) && !run.steps[ending.name]?.landed) {
    const { views, phaseOf } = await taskPhases(e, run);
    const own = ownStatus(ending, run, phaseOf, closeoutReader(views, run), closeoutAsked(views), steps, spendReader(views));
    const merging = mergeInProgress(run.repo) ? mergeState(run.repo, resultTips(run)).merging : 'none';
    if (landingOpen(ending, run, own, phaseOf, merging)) return { id: run.id, repo, step: ending.name, holds: true };
  }
  if (run.cancelledAt) return undefined;
  const { asks, rounds } = runStore.asks.read(run.id);
  const at = endingAsked(run, ending, asks);
  if (at === undefined) return undefined;
  const { views, phaseOf } = await taskPhases(e, run);
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
  const parent = await parentsOf(e, run);
  const files = runReady(run, (id) => parent(id).shipped) && runAdmitted(run, slot);
  return (files && a.ready.includes(ending.name)) || a.retry.some((r) => r.step === ending.name)
    ? { id: run.id, repo, step: ending.name, holds: false, at }
    : undefined;
}

/**
 * Land the merge the run's ending staged in the repository's checkout, where one lands on its check (`landingDue`): commit it with the
 * message its closeout gave, or abort it, and write on the step's record (in memory — `advance` writes the run) what was done, once for the
 * try. A commit git refuses — a hook, a signature — aborts the merge, and says git's words. An abort git refuses is said, and nothing is
 * written, so the next pass tries again. Nothing is done for a run `nemia rm` forgot while this pass was at work. Level-triggered: after a
 * restart, of the daemon or the machine, the pass reads the checkout and the engine as they are, and lands then a merge whose session and
 * check have both stopped running.
 *
 * Once it has landed, the pictures its check took of the merged tree are read by nobody (`dropLandedPictures`): they are removed before the
 * record says it landed, so a pass that dies between the two lands again on the next and removes what is left.
 *
 * What the pass does when it finds MERGE_HEAD in the checkout with nothing of the ending running: a merge that is not this run's — every
 * commit it names is not a tip of the run's result branches — is left alone, the person's or the other run's; one that is this run's is
 * committed only if its check passed on it, and aborted otherwise.
 */
export function landEnding(
  run: Run,
  steps: readonly Workflow[],
  phaseOf: (taskId: string) => TaskPhase,
  signedOff: (step: string) => Closeout | undefined,
  asked: (taskId: string) => CloseoutAsked,
  spendOf: SpendOf,
  verdictOf: (step: string) => Verdict | undefined,
): { notes: string[]; landed: boolean } {
  const ending = steps.find((s) => landsOnCheck(s, run));
  const record = ending && run.steps[ending.name];
  if (!ending || !record?.taskId || record.landed || !isGitRun(run) || !runStore.runs.exists(run.id)) return { notes: [], landed: false };
  const own = ownStatus(ending, run, phaseOf, signedOff, asked, steps, spendOf);
  const said = signedOff(ending.name)?.output?.message;
  const due = landingDue(
    ending,
    run,
    own,
    phaseOf,
    typeof said === 'string' ? said : undefined,
    verdictOf(ending.name),
    mergeInProgress(run.repo),
    () => mergeState(run.repo, resultTips(run)),
  );
  if (!due) return { notes: [], landed: false };
  const name = ending.name;
  const write = (landed: Landed, note: string) => {
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
  if (due.act === 'record') return write(due.landed, landedWords(run, due.landed));
  if (due.act === 'commit') {
    const made = commitMerge(run.repo, due.message);
    if ('commit' in made) return write(made, `its check passed on the merge, and ${landedWords(run, made)}`);
    const why = `git refused the commit of its merge: ${made.error}`;
    const refused = abortMerge(run.repo);
    if (refused)
      return {
        notes: [`${name}: ${why}; and the run could not abort the merge either (${refused.error}): the next tick tries again`],
        landed: false,
      };
    return write({ aborted: why }, `${why}, so the run aborted the merge; nothing landed on ${run.branch}`);
  }
  const refused = abortMerge(run.repo);
  if (refused)
    return {
      notes: [`${name}: ${due.why}, and the run could not abort its merge (${refused.error}): the next tick tries again`],
      landed: false,
    };
  return write({ aborted: due.why }, `${due.why}, so the run aborted its merge; nothing landed on ${run.branch}`);
}
