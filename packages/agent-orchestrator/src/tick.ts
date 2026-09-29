/**
 * The tick: one pass over one run (`advance`) and over the store (`tick`) — read the world, decide, file what became ready, and write the
 * run's record, which this file alone writes. Beside it, what a pass judges by and other files ask of it: the cap on runs in flight
 * (`runSlots`), the repository's own checkout (`checkoutHold`), and the filings a pass made and died before writing down, adopted onto the
 * record (`adoptChecks`, `adoptTries`, `adoptRounds`, `unrecordedSteps`). Those are here, and not beside the verbs that call them first
 * (`cancel`, `forget`, `prune`), because they write the record by the tick's own judgement: the verbs import this file, and it imports none of
 * them. A controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { refusedText, unreadableJournal, type ClaudeFlags, type Engine, type RefusedMove, type TaskView } from './runtime-client.ts';
import { CHECK_DEADLINE_SECONDS, checkBrief, type Verdict } from './check/check.ts';
import { isRemoteHarness, modeOf, sessionContext, type Workflow } from './workflow.ts';
import type { QueueStarted } from './inbox/inbox.ts';
import { folderPlace } from './record/places.store.ts';
import { sizeOf } from './artifacts/artifacts.ts';
import { resultSteps, tipBranches, tipsSeen } from './branches/branches.ts';
import {
  admissionOrder,
  heldCheckouts,
  heldRuns,
  inFlight,
  runAdmitted,
  slotFree,
  slotNeed,
  slotWord,
  takesNoSlot,
  type CheckoutHold,
  type MainClaim,
  type RunSlot,
} from './cap/cap.ts';
import { endingAsked, filedDenies, landedWords, landingDue, landingOpen } from './ending/ending.ts';
import { holdsOpen } from './gate/gate.ts';
import {
  checkTaskId,
  isGitRun,
  stepTaskId,
  tryOf,
  type CloseoutAsked,
  type GitRun,
  type Landed,
  type Run,
  type TaskPhase,
} from './record/record.ts';
import {
  askingTry,
  budgetOf,
  budgetUsdFor,
  capOf,
  holdsOpenOn,
  landsOnCheck,
  ownStatus,
  sentBack,
  stepSpend,
  stepStatus,
  triedFrom,
  type RoundAsk,
  type SpendOf,
} from './status/status.ts';
import { hasStarted, holdsOf, runReady, waitsOf, type Wait } from './wait/wait.ts';
import { handOffDue } from './workspace/workspace.ts';
import { assess, type Assessment } from './tick/assess.ts';
import { composeBrief, remoteBrief, type EndingStopped, type ParentCloseout, type ParentStep } from './brief/index.ts';
import { feedPhase, feedWords, type FeedWords } from './feed/feed.ts';
import { listing } from './list/list.ts';
import { roundFiled, roundsDue } from './round/round.ts';
import { closeoutSchemaOf, parseCloseout, type Closeout } from './closeout/closeout.ts';
import { modeWord, nextTry, retriesDue, sessionModel, turnsOf, type RetryAsk } from './retry/index.ts';
import {
  artifactsDir,
  cancelFile,
  isDirectory,
  checkStderr,
  consumeAsks,
  holdFile,
  inputsDir,
  listRuns,
  pruneFile,
  removeHold,
  readAnswers,
  readAsks,
  readRun,
  restStamps,
  rewriteRun,
  runFile,
  runsDir,
  stepsOf,
} from './record/record.store.ts';
import { agentFilesDir, skillsAgain } from './agents/agents.store.ts';
import { ceilings, lastCeilings, recordCeilings, recordPassCost } from './daemon/daemon.store.ts';
import { maxRuns, verifiesRest } from './config/config.store.ts';
import { feedFile, recordFeed } from './feed/feed.store.ts';
import { abortMerge, checkoutParts, commitMerge, gitSays, handOff, mergeInProgress, mergeState, workspaceFor } from './worktree.ts';
import { collectArtifacts, dropLandedPictures, LANDED_PICTURES } from './artifacts.ts';
import { headsOf, refsOf, resultBranches } from './branches.ts';
import { evictedBy, restBlockers, type RestFacts } from './rest/rest.ts';
import {
  answersIn,
  closeoutAsked,
  closeoutOf,
  closeoutReader,
  engineWord,
  exitVerdicts,
  harnessBlocked,
  parentOf,
  parentsOf,
  phaseOfView,
  refusalOf,
  reportedEngine,
  saidCount,
  saidIn,
  sessionIn,
  spendReader,
  taskPhases,
  waitingOf,
  waitsForWord,
} from './views.ts';
import { placesOf, startQueued } from './start.ts';
import { skillsFor } from './workflow-store.ts';
import { renderedFlags, rendersAgent, unrendered } from './rendering.ts';
import { momentumOf, toAdmit } from './cap/cap.ts';
import { addRuntime, aside, countRested, metered, within, type Tallies } from './meter/tally.store.ts';
import { passCost, type HarnessCost, type PassCost, type Phase } from './meter/meter.ts';

/**
 * Whether any step of this run has a cap in force on it (`budgetOf`: its `budget:`, or the last a person raised it to) — read off the
 * record, with nothing asked of the engine. What the tick's pass reads the earlier tries for (`taskPhases`): with no cap anywhere, what
 * they cost is a number nothing in the pass looks at, and a step answered without limit would grow that read for ever.
 */
const underBudget = (steps: readonly Workflow[], run: Run): boolean => steps.some((s) => budgetOf(s, run.steps[s.name]) !== undefined);

/**
 * Checks a pass filed and never wrote down, put back on the record in memory — `advance` is the one writer of the run's json, and writes
 * it; `cancel` only needs them in view — and the steps they were adopted for.
 *
 * A pass that dies between `e.file` and `rewriteRun` leaves a check on the engine's board that the record does not name. It is looked for
 * under the id the run derives, for every step whose check is due and unrecorded, and before anything asks what is in flight: a run
 * cancelled in that window files no more checks, so one adopted only at filing time would never be stopped, and its suite would run on to
 * the deadline. A task the engine holds no brief for was not filed, and is left for the pass to file.
 */
export async function adoptChecks(
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  views: Map<string, TaskView>,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  asked: (taskId: string) => CloseoutAsked,
  spendOf: SpendOf,
): Promise<string[]> {
  const adopted: string[] = [];
  for (const step of steps) {
    if (run.steps[step.name]?.check || stepStatus(step, run, phaseOf, closeoutOf, asked, steps, spendOf) !== 'checking') continue;
    const taskId = checkTaskId(run, step.name);
    const view = await e.view(taskId);
    if (!view.state.brief) continue;
    views.set(taskId, view);
    run.steps[step.name] = { ...run.steps[step.name], check: { taskId } };
    adopted.push(step.name);
  }
  return adopted;
}

/**
 * Tries a pass filed and never wrote down, put back on the record — in memory, as `adoptChecks` does, and before anything asks what is in
 * flight, for the same reason: a run cancelled in that window files no more tries, so a try filed in it would otherwise never be adopted,
 * nor stopped. A task the engine holds no brief for is left for the pass to file.
 *
 * Looked for only where a try is due (`retriesDue`, cancelled or not): an ask for the step's next try, or a refused check `retries:`
 * covers. A run waiting on a person with nothing asked costs no look.
 *
 * A person's nudge a pass gave as an answer to the step's task held open, and died before writing down, shows as a task with more answers
 * than the record has turns (`answersIn`, `turnsOf`): the answered task reads running, so the ask reads as one to stop it first. It is
 * adopted as the turn it is, and nothing is stopped and nothing filed.
 */
export async function adoptTries(
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  views: Map<string, TaskView>,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  asked: (taskId: string) => CloseoutAsked,
  verdictOf: (step: string) => Verdict | undefined,
  asks: readonly RetryAsk[],
  spendOf: SpendOf,
): Promise<string[]> {
  const adopted: string[] = [];
  for (const r of retriesDue(steps, run, phaseOf, closeoutOf, asked, verdictOf, asks, () => false, spendOf)) {
    const current = run.steps[r.step]?.taskId;
    if (r.by === 'ask' && r.mode === 'nudge' && current && answersIn(views.get(current)) > turnsOf(run.steps[r.step])) {
      run.steps[r.step] = nextTry(run.steps[r.step], r, current);
      adopted.push(r.step);
      continue;
    }
    const taskId = r.mode === 'recheck' ? checkTaskId(run, r.step, r.try) : stepTaskId(run, r.step, r.try);
    const view = await e.view(taskId);
    if (!view.state.brief) continue;
    views.set(taskId, view);
    const record = run.steps[r.step];
    run.steps[r.step] = r.mode === 'recheck' ? { ...nextTry(record, r), check: { taskId } } : nextTry(record, r, taskId);
    for (const b of r.back ?? []) run.steps[b] = sentBack(run.steps[b]);
    adopted.push(r.step);
  }
  return adopted;
}

/**
 * Rounds a pass filed and never wrote down, put back on the record — in memory, and before anything asks what is in flight, as `adoptTries`
 * does and for its reason.
 *
 * Looked for only where a round is due (`roundsDue`, cancelled or not), under the target's next try's id. A pass that filed the round and
 * died left the looping step's `again: true` on the record, so the round reads due again; finding its task filed, this moves the loop on as
 * the pass would have (`roundFiled`), and nothing is filed twice. A task the engine holds no brief for is left for the pass to file.
 */
export async function adoptRounds(
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  views: Map<string, TaskView>,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  asked: (taskId: string) => CloseoutAsked,
  asks: readonly RoundAsk[],
  spendOf: SpendOf,
): Promise<string[]> {
  const adopted: string[] = [];
  for (const r of roundsDue(steps, run, phaseOf, closeoutOf, asked, asks, spendOf)) {
    const taskId = stepTaskId(run, r.target, tryOf(run, r.target) + 1);
    const view = await e.view(taskId);
    if (!view.state.brief) continue;
    views.set(taskId, view);
    Object.assign(run.steps, roundFiled(steps, run, r, taskId));
    adopted.push(r.step);
  }
  return adopted;
}

/**
 * Steps a pass filed and never wrote down: each step `assess` calls ready — blind to a cancellation, as a pass that read the run before it
 * was called off calls it — whose task, under the id that pass files it by, the engine holds. Looked up as `adoptChecks` looks up a check,
 * and put in `views`; it answers with them and changes nothing on the run. `forget` adopts them in memory, so a step being filed is in
 * flight, and `advance` stops them on a cancelled run, whose record would otherwise hide them from every stop.
 */
export async function unrecordedSteps(
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  views: Map<string, TaskView>,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  asked: (taskId: string) => CloseoutAsked,
  verdictOf: (step: string) => Verdict | undefined,
  asks: readonly RetryAsk[],
  rounds: readonly RoundAsk[],
  spendOf: SpendOf,
): Promise<Array<{ name: string; taskId: string }>> {
  const { cancelledAt: _, ...live } = run;
  const { ready } = assess(steps, live, phaseOf, closeoutOf, asked, verdictOf, asks, rounds, () => false, spendOf);
  const found: Array<{ name: string; taskId: string }> = [];
  for (const name of ready) {
    const taskId = stepTaskId(run, name, tryOf(run, name));
    const view = views.get(taskId) ?? (await e.view(taskId));
    if (!view.state.brief) continue;
    views.set(taskId, view);
    found.push({ name, taskId });
  }
  return found;
}

/**
 * One pass's work: the steps it filed, the steps whose checks it filed, the steps it tried again, and where the run stands — and `notes`,
 * each line starting with its step: what cutting a worktree had to say (a path `.worktreeinclude` lists that the main checkout does not
 * have, a line it refused, an `npm ci` that ran or failed), each try and each round filed and on whose word, a blocked session the engine
 * was asked to stop for a try, and an ask file that cannot be read. `looped` names the looping steps whose loop this pass took round again.
 * `waiting` names the runs whose shipping this run's roots wait on (`waitsOf`). `inFlight` says the run counts against the cap on runs in
 * flight once this pass is done: in flight when the pass read it (`slotNeed`), or filed something — never for a run outside the cap
 * (`takesNoSlot`), whose filings are its own watching, not a run's work. `held` is the slot the cap held its roots at, on a pass that held
 * them.
 */
export type Advanced = {
  run: Run;
  filed: string[];
  checked: string[];
  tried: string[];
  looped: string[];
  status: Assessment['status'];
  blocked: string[];
  notes: string[];
  waiting: Wait[];
  inFlight: boolean;
  held?: RunSlot;
  /** What the pass judged of the run and of each step, in the words the feed keeps (`feedWords`): what `tick` writes where they changed. */
  feed: FeedWords;
};

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
 */
export async function checkoutHold(e: Engine, run: Run, steps: readonly Workflow[]): Promise<CheckoutHold | undefined> {
  const ending = steps.find((s) => s.workspace === 'main');
  if (!ending || run.cancelledAt || endingAsked(run, ending, readAsks(run.id).asks) === undefined) return undefined;
  const runs = listRuns();
  const slots = await runSlots(e, runs);
  const mine = await mainClaim(e, run, slots.get(run.id));
  if (!mine || mine.holds) return undefined;
  const claims: MainClaim[] = [mine];
  for (const other of runs) {
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
 * every other run's ending for ever — but a run somebody called off holds it while its session is still there, between `wf cancel` asking
 * the engine to stop it and the engine settling it, because that session is still merging in that directory.
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
  const { asks, rounds } = readAsks(run.id);
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
 * One pass over one run: tick the engine, then file whatever became ready.
 *
 * Level-triggered, like everything under it: it reads the current state of each task and decides,
 * so it is safe to run repeatedly, safe to interrupt, and correct after a restart with no memory
 * of what it did last time.
 *
 * `slot` is the cap on runs in flight as `tick` judges this run (`runAdmitted`): a run with nothing filed files its roots only while a slot is
 * free, and the first pass that holds it writes when (`slotHeldAt`). Left out, nothing holds it.
 */
export async function advance(e: Engine, run: Run, slot?: RunSlot): Promise<Advanced> {
  return (await advanceRun(e, run, slot)).advanced;
}

/**
 * `advance`, and whether the run is at rest once the pass is done (`atRest`): `blockers` names each clause that holds it out
 * (`restBlockers`), and a run with none carries `rest`, the branches whose tips the next pass would read (`tipBranches`), which is all of
 * git a pass asks of a run at rest.
 *
 * The pass reads a person's asks afresh, adopts what a pass before it filed and never wrote down, and then, in this order:
 * - stops a cancelled run's tasks, on every pass and not only in `wf cancel`, which stops what it saw in flight: a step filed after it
 *   looked, and one a pass filed and died before writing down (`unrecordedSteps`), are stopped too. A task the engine already holds a
 *   stop request for is not asked again.
 * - hands off every finished step, failed and stopped too (`handOffOwed`): commits what it left uncommitted and collects what it named
 *   from its workspace root (`collectArtifacts`), before its check is filed and before a later step merges it or works in its workspace.
 *   A merge carries commits, not working trees, so the run commits what a step leaves, as every step is told (`closeoutContract`).
 *   Nothing is handed off for a run `wf rm` forgot after this pass read it: a `--no-worktree` run's workspace is a person's checkout. A
 *   hand-off is marked once for the try, unless git refused the commit, which the next pass tries again; a mark made is always written,
 *   or the next pass would commit a person's edits as the step's.
 * - lands or aborts an ending's staged merge (`landEnding`) before anything reads where the ending stands, so the pass that lands it
 *   reads it landed, and no try of it is filed over a merge still staged.
 * - holds this run's ending while another run's works in the repository's checkout (`checkoutHold`), read from the world on this pass,
 *   what it has filed included, so the order a pass takes the runs in decides nothing.
 * - lifts a person's hold on the pass that reads every run it names shipped (`parentOf`), and goes on on that pass. A lift sticks, as a
 *   start after `--after` does; only the hold this pass read is lifted (`removeHold`), so one put again since stays; and one that names
 *   no run is never lifted here (`holdAdvice`).
 * - closes each step's task held open that waits for a word nobody is to give (`holdsOpen`): an ungated step that signed off, a gate a
 *   person approved, a run called off. What waits on it is filed on this same pass, since the run reads it settled once it signed
 *   (`phaseOfView`); a close the engine refuses is a note, and asked again by the next pass.
 * - files a run's roots only while it has nothing filed, once every run it waits on (`--after`) has shipped (`runReady`), and while the
 *   cap on runs in flight leaves it a slot (`runAdmitted`); a run that has started never reads its parents again.
 * - words the feed (`feedWords`) off what it read before it filed anything, and reads nothing again for it: a step it files reaches the
 *   feed on the next pass, as the engine's `pending`.
 * - files the tries due, then the rounds, then the checks, then the ready steps, each under the id the run derives and looked up first,
 *   since filing an id the engine already holds would journal it twice. Before each filing it reads the store again (`mayFile`): a run
 *   called off, forgotten, pruned or held while the pass was at work — a worktree cut can take minutes — is filed nothing more on this
 *   pass, and a worktree cut for it stays for `wf rm` to find. A step's files directory is made before its brief names it, and again for
 *   its check, for a step filed without one.
 * - writes when, on the first pass the cap holds the run (`slotHeldAt`), what its wait for a slot is counted from, and says so once.
 * - keeps the tip of each result branch as git has it (`tipsSeen`), written only when a tip moved, so git can still be asked whether a
 *   branch a person deleted after its merge is on the base (`isShipped`).
 * - writes the record (`rewriteRun`) only where the pass changed it and only while it is there, then consumes the asks it holds
 *   (`consumeAsks`), never before: an ask a pass died before consuming is consumed by the next.
 *
 * A try goes on in the workspace and on the branch the step had, under its next try's id; an ending the work is sent back from moves behind
 * in the same write, so it waits for the work again (`sentBack`). A try of a step whose task has not settled — its session blocked by its
 * harness, or asked for while it was and working again since — stops the session and files nothing; a later pass, once the task has
 * settled, files the try. A recheck files no session, only its check, under the new try's id. A person's nudge of a step whose task is held
 * open and waits for their word is that task's next turn, in the session that signed, under the same id (`answerHeld`); any other try, and
 * every round, of a task that waits closes it first and is filed as a task of its own. A nudge with no session to continue starts a new
 * one, and its brief says so. A new session of a loop's target within a round is handed the round's findings off the looping step's try
 * that asked (`askingTry`). A round continues the target's session under its next try's id, and every other step of the loop moves behind,
 * unfiled, for a later pass to file (`roundFiled`).
 *
 * A check is filed on the `check` harness, so it outlives the pass, has a deadline, and is stopped by a cancel; its command is the one
 * the run froze, never the workspace's it judges. It is filed once, with no attempt again: a suite run until it passes would let a
 * flaky suite decide what ships. An ending's check gets no `WF_BASE_REF`: it judges the merge staged in the checkout against HEAD, and
 * installs first what that merge's lockfile asks for (`checkoutParts`). Nothing is ready on a check in the pass that files it.
 *
 * A run that waited on runs cuts its roots, and every worktree and diff after, from its base branch as it stands on the pass that files
 * them, with their work on it, and hands each root what they concluded (`parentCloseouts`); read on that pass, and never again.
 */
async function advanceRun(
  e: Engine,
  run: Run,
  slot?: RunSlot,
): Promise<{ advanced: Advanced; blockers: string[]; rest?: { tipped: string[] } }> {
  const steps = stepsOf(run);

  const { views, phaseOf } = await taskPhases(e, run, { earlierTries: underBudget(steps, run) });
  const signedOff = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  const verdictOf = exitVerdicts(views, run);
  const sessionBlocked = harnessBlocked(views);
  const spendOf = spendReader(views);
  const { asks, rounds: roundAsks, notes: askNotes } = readAsks(run.id);
  const adoptedRounds = await adoptRounds(e, run, steps, views, phaseOf, signedOff, asked, roundAsks, spendOf);
  const adoptedTries = await adoptTries(e, run, steps, views, phaseOf, signedOff, asked, verdictOf, asks, spendOf);
  const adopted = await adoptChecks(e, run, steps, views, phaseOf, signedOff, asked, spendOf);

  if (run.cancelledAt) {
    const unrecorded = await unrecordedSteps(e, run, steps, views, phaseOf, signedOff, asked, verdictOf, asks, roundAsks, spendOf);
    const live = unrecorded.filter(({ taskId }) => ['pending', 'running'].includes(phaseOf(taskId)));
    for (const { taskId } of [...inFlight(run, phaseOf), ...live]) {
      if (!views.get(taskId)?.state.stopRequested) await e.stop(taskId);
    }
  }

  let markedHandedOff = false;
  const collected = within('act', () =>
    handOffOwed(steps, run, phaseOf).flatMap((name) => {
      if (!fs.existsSync(runFile(run.id))) return [];
      const record = run.steps[name];
      let handed: ReturnType<typeof handOff>;
      if (isGitRun(run)) handed = handOff(record.workspace!, name);
      else folderPlace(runsDir()).handOff(run, name);
      if (!(handed && 'error' in handed)) {
        run.steps[name] = { ...record, handedOff: record.taskId! };
        markedHandedOff = true;
      }
      return collectArtifacts(run, name, signedOff(name));
    }),
  );

  const landing = landEnding(run, steps, phaseOf, signedOff, asked, spendOf, verdictOf);

  const checkout = await checkoutHold(e, run, steps);
  const liftNotes: string[] = [];
  if (run.hold && !run.cancelledAt && run.hold.until.length) {
    let shipped = true;
    for (const id of run.hold.until) if (!(shipped = (await parentOf(e, id)).shipped)) break;
    if (shipped && removeHold(run.id, run.hold.at)) {
      const { until } = run.hold;
      liftNotes.push(
        `the hold is lifted: ${until.length > 1 ? `${until.slice(0, -1).join(', ')} and ${until.at(-1)} have` : `${until[0]} has`} shipped`,
      );
      delete run.hold;
    }
  }
  const assessed = assess(steps, run, phaseOf, signedOff, asked, verdictOf, asks, roundAsks, sessionBlocked, spendOf, [], checkout);
  const { check, retry, round, blocked, status } = assessed;
  const waits = waitsForWord(views);
  const closed = new Set<string>();
  const closeNotes: string[] = [];
  const closeWaiting = async (name: string, taskId: string): Promise<string | undefined> => {
    const refused = await closeHeld(e, taskId);
    if (!refused) closed.add(taskId);
    return refused && `${name}: ${refused}`;
  };
  for (const step of steps) {
    const taskId = run.steps[step.name]?.taskId;
    if (!taskId || !waits(taskId) || holdsOpen(step, run, phaseOf, signedOff, asked, steps, spendOf, verdictOf)) continue;
    const refused = await closeWaiting(step.name, taskId);
    if (refused) closeNotes.push(refused);
  }
  const awaitsWord = (taskId: string | null | undefined): boolean => Boolean(taskId && waits(taskId) && !closed.has(taskId));
  const parent = await parentsOf(e, run);
  const starting = !hasStarted(run);
  const need = slotNeed(run, phaseOf, assessed, (id) => parent(id).shipped, steps);
  const admitted = runAdmitted(run, slot, steps);
  const held = need.wants && !admitted ? slot : undefined;
  const ready = runReady(run, (id) => parent(id).shipped) && admitted ? assessed.ready : [];
  const waiting = waitsOf(run, parent);
  const feed = feedWords(
    listing(
      steps,
      run,
      (taskId) => feedPhase(engineWord(views)(taskId)),
      (name) => closeoutOf(views, run, name),
      asked,
      verdictOf,
      asks,
      roundAsks,
      readAnswers(run.id),
      waiting,
      saidCount(views, run),
      spendOf,
      held,
      [],
      checkout,
      waitingOf(views),
      undefined,
      holdsOf(run, parent),
    ),
    run,
    assessed,
    (name) => closeoutOf(views, run, name),
  );

  const tried: string[] = [];
  const rechecked: string[] = [];
  const notes: string[] = [...askNotes, ...collected, ...landing.notes, ...liftNotes, ...closeNotes];
  let calledOff = false;
  const mayFile = (): boolean =>
    !(calledOff ||=
      !fs.existsSync(runFile(run.id)) ||
      fs.existsSync(cancelFile(run.id)) ||
      fs.existsSync(pruneFile(run.id)) ||
      fs.existsSync(holdFile(run.id)));
  const endingSaid = (ending: Workflow): EndingStopped => {
    const said = signedOff(ending.name);
    return {
      step: ending.name,
      status: ownStatus(ending, run, phaseOf, signedOff, asked, steps, spendOf),
      ...(said?.summary ? { summary: said.summary } : {}),
      ...(said?.needs ? { needs: said.needs } : {}),
      onto: isGitRun(run) ? run.branch : 'the base branch',
    };
  };
  for (const r of retry) {
    const step = steps.find((s) => s.name === r.step)!;
    const record = run.steps[r.step];
    if (r.stopFirst) {
      if (!views.get(record.taskId!)?.state.stopRequested) {
        await e.stop(record.taskId!);
        const why = r.runsOn ? 'its session runs on, asked for while its harness had blocked it' : 'its harness blocked its session';
        notes.push(
          `${r.step}: try ${r.try} — wf retry ${modeWord(r)}${r.message !== undefined ? ', with your answer' : ''}; ${why}, so the engine is asked to stop it, and the try is filed once it has`,
        );
      }
      continue;
    }
    if (!mayFile()) continue;
    const said = `${r.step}: try ${r.try} — ${r.by === 'retries' ? `retries: ${step.retries}` : r.by === 'signoff' ? 'a nudge to sign off, once a round' : `wf retry ${modeWord(r)}${r.budget !== undefined ? ` --budget ${r.budget}` : ''}${r.message !== undefined ? ', with your answer' : ''}`}`;
    if (r.mode === 'recheck') {
      tried.push(r.step);
      notes.push(said);
      run.steps[r.step] = nextTry(record, r);
      rechecked.push(r.step);
      continue;
    }

    const answers =
      awaitsWord(record.taskId) &&
      r.by === 'ask' &&
      r.mode === 'nudge' &&
      Boolean(sessionIn(views, record.taskId!)) &&
      holdsOpen(step, run, phaseOf, signedOff, asked, steps, spendOf, verdictOf);
    if (!answers && awaitsWord(record.taskId)) {
      const refused = await closeWaiting(r.step, record.taskId!);
      if (refused) {
        notes.push(refused);
        continue;
      }
    }
    const taskId = answers ? record.taskId! : stepTaskId(run, r.step, r.try);
    if (answers || !(await e.view(taskId)).state.brief) {
      const files = artifactsDir(run, r.step);
      fs.mkdirSync(files, { recursive: true });
      const remote = isRemoteHarness(step.harness);
      const resumeFrom = r.mode === 'nudge' && !remote ? sessionIn(views, record.taskId!) : undefined;
      const refusal = record.check && step.check ? await refusalOf(e, step.check, record.check.taskId) : undefined;
      const asking = resumeFrom ? undefined : askingTry(steps, run, r.step);
      const askedWith = asking ? (await e.view(asking.taskId)).state.attempts.at(-1)?.closeout : undefined;
      const findings = askedWith === undefined ? undefined : parseCloseout(askedWith);
      const reads = (name: string): Closeout | undefined =>
        asking && name === asking.looping.name && findings && !('error' in findings) ? findings : signedOff(name);
      const tried = triedFrom(step, run, phaseOf, signedOff, asked, steps, spendOf);
      const told = toldOf(run, step);
      const brief = remote
        ? remoteBrief(step, run, steps, reads, {
            try: r.try,
            by: r.by,
            mode: r.mode,
            resumed: false,
            status: tried,
            ...(r.message !== undefined ? { message: r.message } : {}),
          })
        : composeBrief(
            told.step,
            run,
            steps,
            reads,
            files,
            undefined,
            {
              try: r.try,
              by: r.by,
              mode: r.mode,
              ...(r.model ? { model: r.model } : {}),
              ...(r.message !== undefined ? { message: r.message } : {}),
              ...(r.budget !== undefined ? { budget: r.budget } : {}),
              resumed: Boolean(resumeFrom),
              ...(resumeFrom ? { said: saidIn(views.get(record.taskId!)) } : {}),
              status: tried,
              ...(refusal ? { refusal } : {}),
              ...(tried === 'denied' ? { denied: spendOf(record.taskId!)?.denied ?? [] } : {}),
              ...(r.back?.length ? { ending: endingSaid(steps.find((s) => s.name === r.back![0])!) } : {}),
            },
            undefined,
            undefined,
            inputsDir(run),
          );
      const budgetUsd = budgetUsdFor(step, r.budget ?? budgetOf(step, record), stepSpend(run, r.step, spendOf));
      if (answers) {
        const refused = await answerHeld(e, taskId, brief, budgetUsd);
        if (refused) {
          notes.push(`${r.step}: ${refused}`);
          continue;
        }
      } else
        await e.file({
          id: taskId,
          brief,
          cwd: record.workspace ?? run.workspace,
          harness: step.harness,
          ...localFields(step, () => ({
            config: {
              /** A fresh try runs on the model it asked for, or the step's; any other try on the model its session was started on. */
              model: r.mode === 'fresh' ? (r.model ?? step.model) : sessionModel(step, record),
              effort: step.effort,
              contextTokens: sessionContext(step, steps),
              permissionMode: modeOf(step),
              tools: step.tools,
              disallowedTools: filedDenies(step, run),
              allowedTools: step.allowedTools,
              background: step.background,
              budgetUsd,
              claude: told.claude,
            },
            resumeFrom,
            ...(holdsOpenOn(step) ? { holdOpen: true as const } : {}),
            closeoutSchema: closeoutSchemaOf(step, steps),
          })),
          deadlineSeconds: step.deadlineSeconds,
        });
    }
    tried.push(r.step);
    notes.push(said);
    run.steps[r.step] = nextTry(record, r, taskId);
    for (const b of r.back ?? []) run.steps[b] = sentBack(run.steps[b]);
  }

  const looped: string[] = [];
  for (const r of round) {
    if (!mayFile()) break;
    const looping = steps.find((s) => s.name === r.step)!;
    const target = steps.find((s) => s.name === r.target)!;
    const record = run.steps[r.target];
    const taskId = stepTaskId(run, r.target, tryOf(run, r.target) + 1);
    if (awaitsWord(record.taskId)) {
      const refused = await closeWaiting(r.target, record.taskId!);
      if (refused) {
        notes.push(refused);
        continue;
      }
    }
    looped.push(r.step);
    notes.push(
      `${r.step}: round ${r.round} — ${r.by === 'again' ? `again, rounds: ${capOf(looping)}` : `wf round${r.budget !== undefined ? ` --budget ${r.budget}` : ''}`}; ${r.target} goes again`,
    );
    if (!(await e.view(taskId)).state.brief) {
      const files = artifactsDir(run, r.target);
      fs.mkdirSync(files, { recursive: true });
      const resumeFrom = record.taskId ? sessionIn(views, record.taskId) : undefined;
      const told = toldOf(run, target);
      await e.file({
        id: taskId,
        /** Read off the closeout that asked for the round, before the record moves it behind (`roundFiled`). */
        brief: composeBrief(
          told.step,
          run,
          steps,
          signedOff,
          files,
          undefined,
          undefined,
          {
            loop: r.step,
            round: r.round,
            rounds: capOf(looping),
            by: r.by,
            resumed: Boolean(resumeFrom),
            ...(resumeFrom ? { said: saidIn(views.get(record.taskId!)) } : {}),
          },
          undefined,
          inputsDir(run),
        ),
        cwd: record.workspace ?? run.workspace,
        harness: target.harness,
        ...localFields(target, () => ({
          config: {
            model: sessionModel(target, record),
            effort: target.effort,
            contextTokens: sessionContext(target, steps),
            permissionMode: modeOf(target),
            tools: target.tools,
            disallowedTools: filedDenies(target, run),
            allowedTools: target.allowedTools,
            background: target.background,
            budgetUsd: budgetUsdFor(
              target,
              r.budget !== undefined && r.raise?.includes(r.target) ? r.budget : budgetOf(target, record),
              stepSpend(run, r.target, spendOf),
            ),
            claude: told.claude,
          },
          resumeFrom,
          ...(holdsOpenOn(target) ? { holdOpen: true as const } : {}),
          closeoutSchema: closeoutSchemaOf(target, steps),
        })),
        deadlineSeconds: target.deadlineSeconds,
      });
    }
    Object.assign(run.steps, roundFiled(steps, run, r, taskId));
  }

  const checked: string[] = [];
  for (const name of [...check, ...rechecked]) {
    if (!mayFile()) break;
    const step = steps.find((s) => s.name === name)!;
    const workspace = run.steps[name].workspace ?? run.workspace;
    const taskId = checkTaskId(run, name);
    if (!(await e.view(taskId)).state.brief) {
      fs.mkdirSync(path.dirname(checkStderr(taskId)), { recursive: true });
      const files = artifactsDir(run, name);
      fs.mkdirSync(files, { recursive: true });
      const install = isGitRun(run) && landsOnCheck(step, run) ? (checkoutParts(workspace) ?? undefined) : undefined;
      if (install)
        notes.push(
          `${name}: the merge's package-lock.json asks for ${install}, which the checkout's node_modules does not have: its check runs npm install there first`,
        );
      await e.file({
        id: taskId,
        harness: 'check',
        brief: checkBrief(
          step.check!,
          {
            WF_RUN: run.id,
            WF_STEP: name,
            ...(isGitRun(run) && step.workspace !== 'main' ? { WF_BASE_REF: run.baseRef } : {}),
            WF_WORKSPACE: workspace,
            WF_STDERR: checkStderr(taskId),
            WF_ARTIFACTS: files,
          },
          install,
        ),
        cwd: workspace,
        deadlineSeconds: CHECK_DEADLINE_SECONDS,
      });
    }
    run.steps[name] = { ...run.steps[name], check: { taskId } };
    checked.push(name);
  }

  const sessionOf = (stepName: string): string | undefined => {
    const taskId = run.steps[stepName]?.taskId;
    return taskId ? sessionIn(views, taskId) : undefined;
  };

  if (ready.length && starting && run.after?.length && isGitRun(run))
    run.baseRef = gitSays(run.repo, 'rev-parse', '--verify', `${run.branch}^{commit}`)?.trim() || run.baseRef;
  const parents = ready.length && starting && run.after?.length ? await parentCloseouts(e, run.after) : undefined;

  const filed: string[] = [];
  for (const name of ready) {
    if (!mayFile()) break;
    const step = steps.find((s) => s.name === name)!;
    const place = await within('act', () => workspaceFor(run, steps, step));
    notes.push(...place.notes.map((note) => `${name}: ${note}`));
    if (!mayFile()) break;
    const files = artifactsDir(run, name);
    fs.mkdirSync(files, { recursive: true });
    const told = toldOf(run, step);

    const taskId = await e.file({
      /**
       * Chosen, not generated (`stepTaskId`): a person scanning their sessions sees which run and which step, two steps of one run share a
       * prefix, and a step filed on a later try or round says which.
       */
      id: stepTaskId(run, name, tryOf(run, name)),
      /**
       * Read off the closeouts the assessment that made the step ready read, so it is handed what it was filed on; a remote agent's names
       * nothing of this machine (`remoteBrief`).
       */
      brief: isRemoteHarness(step.harness)
        ? remoteBrief(step, run, steps, signedOff, undefined, step.after.length ? undefined : parents)
        : composeBrief(
            told.step,
            run,
            steps,
            signedOff,
            files,
            place.deps,
            undefined,
            undefined,
            step.after.length ? undefined : parents,
            inputsDir(run),
          ),
      cwd: place.workspace,
      harness: step.harness,
      deadlineSeconds: step.deadlineSeconds,
      ...localFields(step, () => ({
        /**
         * The harness's arguments, which the engine carries to the runner unread (`HarnessArgs`), all from the workflow this run froze. The
         * runtime judges no budget: `budgetUsd` is the harness's own cap, and whether the step went over is this package's (`ownStatus`).
         */
        config: {
          model: step.model,
          effort: step.effort,
          contextTokens: sessionContext(step, steps),
          permissionMode: modeOf(step),
          tools: step.tools,
          disallowedTools: filedDenies(step, run),
          allowedTools: step.allowedTools,
          background: step.background,
          budgetUsd: budgetUsdFor(step, budgetOf(step, run.steps[name]), stepSpend(run, name, spendOf)),
          claude: told.claude,
        },
        resumeFrom: step.resume ? sessionOf(step.resume) : undefined,
        ...(holdsOpenOn(step) ? { holdOpen: true as const } : {}),
        /**
         * The engine hands it to the harness and records the answer without reading it: what the fields mean is this package's (`Closeout`).
         */
        closeoutSchema: closeoutSchemaOf(step, steps),
      })),
    });
    run.steps[name] = { ...run.steps[name], taskId, workspace: place.workspace, branch: place.branch };
    filed.push(name);
  }
  const heldFirst = Boolean(held && !run.slotHeldAt && mayFile());
  if (heldFirst) {
    run.slotHeldAt = new Date().toISOString();
    notes.push(`${assessed.ready.join(', ')}: ${slotWord(held!)} — filed once a run in flight settles`);
  }
  const tipped = isGitRun(run) ? tipBranches(run, steps, status) : [];
  const tips = tipped.length && isGitRun(run) ? tipsSeen(run, tipped, refsOf(run.repo, tipped)) : undefined;
  if (tips) run.tips = tips;
  const wrote = Boolean(
    filed.length ||
    checked.length ||
    tried.length ||
    looped.length ||
    adopted.length ||
    adoptedTries.length ||
    adoptedRounds.length ||
    tips ||
    heldFirst ||
    markedHandedOff ||
    landing.landed,
  );
  if (wrote) rewriteRun(run);
  consumeAsks(run, asks, roundAsks);

  const advanced: Advanced = {
    run,
    filed,
    checked,
    tried,
    looped,
    status,
    blocked,
    notes,
    waiting,
    inFlight: !takesNoSlot(steps) && (need.inFlight || filed.length > 0 || checked.length > 0 || tried.length > 0 || looped.length > 0),
    ...(held ? { held } : {}),
    feed,
  };
  const ending = steps.find((s) => s.workspace === 'main');
  const facts: RestFacts = {
    run,
    status,
    due: assessed,
    notes,
    waiting,
    inFlight: advanced.inFlight,
    held: Boolean(held),
    settled: [...views.values()].every((v) => Boolean(v.state.settled)),
    acted: wrote || closed.size > 0,
    handOffDue: handOffOwed(steps, run, phaseOf),
    landingOwed: steps.some((s) => landsOnCheck(s, run) && Boolean(run.steps[s.name]?.taskId) && !run.steps[s.name]?.landed),
    checkoutAsked: Boolean(ending && !run.cancelledAt && endingAsked(run, ending, asks) !== undefined),
  };
  const blockers = restBlockers(facts);
  return { advanced, blockers, ...(blockers.length ? {} : { rest: { tipped } }) };
}

/**
 * The steps a pass hands off now (`handOffDue`), where there is somewhere to hand one off from: none of a pruned run, which owed none when
 * its worktrees went (`pruneRefusal`), and no step whose workspace is not on disk — removed by hand, or with no record of the removal —
 * since what the step left went with it; a hand-off tried there would fail on every pass, keep the run out of the tick's memo of runs at
 * rest, and have `wf prune` refuse the run as still owed one. What the pass hands off, what its memo judges, and what `wf prune` waits
 * for, read off this one function.
 */
export const handOffOwed = (steps: readonly Workflow[], run: Run, phaseOf: (taskId: string) => TaskPhase): string[] =>
  run.pruned ? [] : handOffDue(steps, run, phaseOf).filter((name) => fs.existsSync(run.steps[name].workspace!));

/**
 * The commit each of a run's result branches is at, as git has it — or, for one git no longer has, the tip the run last saw (`tipsSeen`):
 * what a merge in the repository's checkout is read as this run's by (`mergeState`).
 */
export function resultTips(run: GitRun): Record<string, string> {
  const branches = resultBranches(run);
  return { ...Object.fromEntries(Object.entries(run.tips ?? {}).filter(([b]) => branches.includes(b))), ...refsOf(run.repo, branches) };
}

/**
 * Land the merge the run's ending staged in the repository's checkout, where one lands on its check (`landingDue`): commit it with the
 * message its closeout gave, or abort it, and write on the step's record (in memory — `advance` writes the run) what was done, once for the
 * try. A commit git refuses — a hook, a signature — aborts the merge, and says git's words. An abort git refuses is said, and nothing is
 * written, so the next pass tries again. Nothing is done for a run `wf rm` forgot while this pass was at work. Level-triggered: after a
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
function landEnding(
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
  if (!ending || !record?.taskId || record.landed || !isGitRun(run) || !fs.existsSync(runFile(run.id))) return { notes: [], landed: false };
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

/**
 * Close a task held open that waits for a word (`e.close`): undefined once closed, and the engine's refusal in its words where it refused
 * (an `Error` whose `exitCode` is 2 — the task was answered, settled or stopped since this pass read it). A refusal is a note, not a failure
 * of the pass: the next pass reads the task again. Any other error is the engine's, and thrown.
 */
async function closeHeld(e: Engine, taskId: string): Promise<string | undefined> {
  try {
    await e.close(taskId);
    return undefined;
  } catch (err) {
    if ((err as { exitCode?: number }).exitCode === 2) return (err as Error).message;
    throw err;
  }
}

/**
 * Close each step's task held open that waits for a word, for a verb that ends what the run waits on — `wf cancel`, `wf rm` — at once rather
 * than on the next pass. A close is no stop: nothing is running, and the engine settles the task as it signed. Only a step's current task can
 * wait: a try or a round filed as a task of its own closed the one before it. What the engine refuses is returned, worded, and a cancelled
 * run's next pass closes it again (the sweep in `advance`).
 */
export async function closeWaitingTasks(e: Engine, run: Run, views: ReadonlyMap<string, TaskView>): Promise<string[]> {
  const waits = waitsForWord(views);
  const refused: string[] = [];
  for (const [name, { taskId }] of Object.entries(run.steps)) {
    if (!taskId || !waits(taskId)) continue;
    const said = await closeHeld(e, taskId);
    if (said) refused.push(`${name}: ${said}`);
  }
  return refused;
}

/**
 * Answer a task held open that waits for a word (`e.answer`), with a turn's cap where there is one — the turn's own `config`, laid over
 * the filing's by the runtime: undefined once answered, as `closeHeld`. `text` is a nudge's brief, which the runtime hands the session it
 * continues as the turn's words; the tools, the model and the fence stay the task's, as filed.
 */
async function answerHeld(e: Engine, taskId: string, text: string, budgetUsd: number | undefined): Promise<string | undefined> {
  try {
    await e.answer(taskId, text, budgetUsd === undefined ? {} : { config: { budgetUsd } });
    return undefined;
  } catch (err) {
    if ((err as { exitCode?: number }).exitCode === 2) return (err as Error).message;
    throw err;
  }
}

/**
 * What a filing says of how its session runs — the harness's arguments, a session to continue, a hold and a closing statement's schema — for a
 * step on a local harness, and nothing for one on a remote A2A agent (`harness: a2a:<name>`), which runs as its operator configured it. The
 * runtime refuses a `config` with any key in it, one whose value is undefined included (`remoteRefuses`), so the fields are left out, not
 * emptied; and a try of a remote step is a new Task, never a turn of the last one.
 */
const localFields = <T extends object>(step: Workflow, fields: () => T): T | Record<string, never> =>
  isRemoteHarness(step.harness) ? {} : fields();

/**
 * A step as the tick tells it and files it: with its agent's instructions in the system prompt and its skills in a plugin, where `wf start`
 * rendered them (`rendersAgent`, `renderedFlags`); a step it does not render — a codex step, a record that gives no agent — is filed with
 * no flags and told everything in its brief. Where the rendered folder is not there (`unrendered`), a flag naming a file that is not there
 * would end the session at its start, so its brief tells it its skills whole, read again from where a start of this run's folder finds
 * them (`skillsAgain`). Bridged to claude.ai, where anyone signed in can drive it, only when the step says `remote: true`, never by
 * default: as Claude Code's own flag, first among its others (`claude.remoteControl`).
 */
function toldOf(run: Run, step: Workflow): { step: Workflow; claude?: ClaudeFlags } {
  const dir = agentFilesDir(run, step.name);
  const told =
    rendersAgent(step) && !isDirectory(dir)
      ? unrendered(step, step.agent?.skills?.length ? skillsAgain(step, skillsFor(run.workflowDir, placesOf(run.repo))) : [])
      : step;
  const rendered = renderedFlags(told, dir);
  return { step: told, claude: told.remote ? { remoteControl: true, ...rendered } : rendered };
}

/**
 * What each run this one waited on concluded, for its roots' briefs (`## From run <id>` in `composeBrief`): the first line of its brief, and
 * the closeout of each step whose work is that run's result (`resultSteps`), on the engine's record of its current try, read as `wf decide`
 * reads one (`closeoutOf`). Read once, on the pass that files the roots.
 *
 * The result's steps, not the terminal ones: where a folder's last step is an ending that merges (`workspace: main`), that step's account
 * is of the merge — "merged wf/…/implement onto main, the check passed" — and it declares nothing, so a child handed it would be handed
 * nothing about the work. What the child wants is what the work said, which is the step the ending acts on. A folder with no ending step
 * is unchanged: its terminal steps are its result.
 *
 * It never throws: a parent whose record or workflow does not read, a step never filed, a task the engine holds
 * no closeout for — a failed step whose work a person merged all the same — and a closeout that does not parse each say so in the section,
 * and the roots are filed all the same.
 */
async function parentCloseouts(e: Engine, ids: readonly string[]): Promise<ParentCloseout[]> {
  const out: ParentCloseout[] = [];
  for (const id of new Set(ids)) {
    let record: Run;
    let steps: Workflow[];
    try {
      record = readRun(id);
      steps = stepsOf(record);
    } catch (err) {
      out.push({ run: id, unreadable: `its record cannot be read: ${(err as Error).message}` });
      continue;
    }
    const said: ParentStep[] = [];
    for (const step of resultSteps(steps)) {
      const taskId = record.steps[step.name]?.taskId;
      if (!taskId) {
        said.push({ name: step.name, unreadable: 'it was never filed' });
        continue;
      }
      let view: TaskView;
      try {
        view = await e.view(taskId);
      } catch (err) {
        said.push({ name: step.name, unreadable: `the engine could not be asked for its task ${taskId}: ${(err as Error).message}` });
        continue;
      }
      const c = closeoutOf(new Map([[taskId, view]]), record, step.name);
      if (!c)
        said.push({ name: step.name, unreadable: `the engine holds no closeout for its task ${taskId}, which is ${phaseOfView(view)}` });
      else if ('error' in c) said.push({ name: step.name, unreadable: `its closeout cannot be read: ${c.error}` });
      else said.push({ step, said: c });
    }
    out.push({ run: id, asked: record.brief.split('\n')[0], steps: said });
  }
  return out;
}

/** One pass: every run advanced, in the store's order, and what the pass did with the queue of inbox cards, when it did anything (`startQueued`). */
export type Pass = {
  runs: Advanced[];
  queue?: QueueStarted;
  /** Why the feed could not be written on this pass (`recordFeed`), when it could not: the pass itself went on, since nothing reads the feed to decide. */
  feedError?: string;
  /**
   * What the pass cost, phase by phase (`PassCost`), as written to the store for `wf up --stats` and the api (`recordPassCost`) — its
   * `overheadMs` here with that write in it, which the file cannot hold of itself.
   */
  cost?: PassCost;
  /**
   * The moves the runtime's lifecycle had no edge for on this pass (`TickReport.refused`): each task stalls, asked again every pass, until
   * what it sees changes or the machine gains the edge. Absent when there were none. `wf up` says each once while it lasts (`refusalLines`).
   */
  refused?: RefusedMove[];
  /**
   * Why the runtime left a task out of this pass, or skipped a feed entry, as it said it (`TickReport.unreadable`): a journal holding an
   * entry no runtime wrote, on every pass while it lasts. And each run a read of whose tasks rejected so (`unreadableJournal`): it is left
   * out of `runs` and of the feed, judged on no pass until the journal reads, and counted in flight, while every other run advances; its
   * line carries the runtime's words, said once. Absent when there were none. `wf up` says each once while it lasts.
   */
  unreadable?: string[];
};

/**
 * What a daemon says of a pass's refused moves, and what it has then said: a refusal it said on an earlier pass and that is still refused is
 * not said again, one that cleared is forgotten, so it is said again if it comes back. `said` holds the refusals of the last pass alone, by
 * task, state and event: a daemon that restarts says every refusal still standing once more, since what it printed before is on a terminal
 * that may be gone. Nothing is decided on it: this is only what has been printed, as `wf up`'s queue and feed failures are.
 */
export function refusalLines(refused: readonly RefusedMove[], said: ReadonlySet<string>): { lines: string[]; said: Set<string> } {
  const now = new Set<string>();
  const lines: string[] = [];
  for (const m of refused) {
    const key = `${m.taskId}\t${m.state}\t${m.event}`;
    if (!said.has(key) && !now.has(key)) lines.push(refusedText(m));
    now.add(key);
  }
  return { lines, said: now };
}

/**
 * Every run, advanced once, after one engine tick — then, with a run slot free, the queue's next card started. This is the whole daemon.
 *
 * First, what the engine's tick saw waiting is admitted per pool under `WF_MAX_CONCURRENT` (`toAdmit`), off the views its pass built from its
 * one observation of each harness; the engine starts it on its next pass. So a task filed on this pass is admitted on the next and started on
 * the one after, and a slot freed is taken a pass after it is freed.
 *
 * Every run that has started first, which the cap on runs in flight (`WF_MAX_RUNS`) never holds: what each has in flight once its pass is done
 * is what the cap counts. Then each run with nothing filed, oldest first (`admissionOrder`), judged against the runs in flight so far — and
 * counted, once it filed, for the next (`runAdmitted`). Then, while a slot is still free (`slotFree`) — always, with no cap — one queued card
 * is started, on `repo` when its card names none: one per pass, so the next pass counts its run before another is started. Nothing is carried
 * between passes: the next one counts again.
 *
 * A run at rest — finished, every task settled, nothing due and nothing done — is answered from the memo of the passes before (`RestMemo`)
 * while none of its inputs changed, and costs no read of the engine and no git of its own: see `restMemo`.
 *
 * Metered as it goes (`tally.store.ts`), and its cost written down (`recordPassCost`) and returned. A pass run inside another's meter — a
 * test that meters its own — is counted as part of that one and carries no cost of its own.
 *
 * `memo` is the memo to answer from and keep, the engine's own by default: a fresh one each pass (`freshRestMemo`) is a daemon restarted
 * before every pass, which answers every run afresh. `verifyRest` judges every run the memo answers again as a full pass would, and throws
 * where the two differ — the tests' (`WF_VERIFY_REST=1`, `verifiesRest`), never the daemon's, since it spends all that the memo saves.
 */
export async function tick(
  e: Engine,
  {
    repo = process.cwd(),
    memo = restMemo(e),
    verifyRest = verifiesRest(),
  }: {
    repo?: string;
    memo?: RestMemo;
    verifyRest?: boolean;
  } = {},
): Promise<Pass> {
  const io0 = ioOf(e);
  const { value, ms, tallies } = await metered(() => pass(meteredEngine(e), repo, memo, verifyRest));
  if (!tallies) return value;
  const t0 = performance.now();
  const measured = costOf(tallies, ms, io0, ioOf(e));
  const cost = { ...measured, overheadMs: measured.overheadMs + (performance.now() - t0) };
  const written = recordPassCost(cost);
  return { ...value, cost: { ...cost, overheadMs: cost.overheadMs + written } };
}

/**
 * The pass `tick` meters: the runtime's own pass, then every run judged off the views it reported (`reportedEngine`) — a task it did not
 * report, settled or changed by this pass since, is read off the engine's record where it is settled. In this order:
 * - the memo is brought up to the engine's feed after the runtime's pass (`restingPass`), so what it appended on it — a settled task's
 *   `measured` — is read on this one, and what is appended after is read on the next; a run `wf rm` forgot leaves the memo.
 * - the ceilings the pass runs with are written (`recordCeilings`), for `wf ls` and `wf decide`, which judge the cap from a shell of their
 *   own.
 * - queued tasks are admitted off the views the runtime's pass reported (`toAdmit`), never off a read of `e.list()` or `e.view`, which
 *   would ask each harness again; with nothing to admit the engine is not called, since a call costs two reads of its totals.
 * - every run that has started is judged, finished ones included (`advanceResting`); then each run with nothing filed, oldest first, with
 *   its slot; then one queued card, while a slot is free.
 * - last, and apart, the feed is written where it changed: a feed that cannot be written costs the report (`feedError`), never the pass.
 *
 * A run a read of whose task journal is refused (`unreadableJournal`) is left unjudged, out of the feed's `removed` and counted in
 * flight; the runtime's own line for that cause is said once, on the run's line. Any other error is thrown. An engine's report that
 * carries no refusals — a test's fake — is read as having none.
 */
async function pass(engine: Engine, repo: string, memo: RestMemo, verify: boolean): Promise<Pass> {
  const report = await engine.tick();
  const e = reportedEngine(engine, report.views ?? []);
  const resting = await restingPass(e, memo, verify);
  const ran = ceilings();
  within('act', () => recordCeilings(ran));
  const cap = ran.runs;
  const runs = listRuns();
  if (resting) {
    const listed = new Set(runs.map((r) => r.id));
    for (const id of memo.runs.keys()) if (!listed.has(id)) memo.runs.delete(id);
  }
  const admitting = toAdmit({ views: report.views, momentum: momentumOf(runsWithSteps(runs)), ceiling: ran.sessions });
  if (admitting.length) await e.admit(admitting);
  const done = new Map<string, Advanced>();
  const unjudged = new Map<string, string>();
  const judged = async (run: Run, slot?: RunSlot): Promise<Advanced | undefined> => {
    try {
      return await advanceResting(e, run, resting, slot);
    } catch (err) {
      const why = unreadableJournal(err);
      if (why === undefined) throw err;
      unjudged.set(run.id, why);
      return undefined;
    }
  };
  for (const run of runs.filter(hasStarted)) {
    const advanced = await judged(run);
    if (advanced) done.set(run.id, advanced);
  }
  let counted = [...done.values()].filter((a) => a.inFlight).length + unjudged.size;
  for (const run of admissionOrder(runs.filter((r) => !hasStarted(r)))) {
    const advanced = await judged(run, { inFlight: counted, cap });
    if (advanced) done.set(run.id, advanced);
    if (!advanced || advanced.inFlight) counted++;
  }
  const queue = slotFree({ inFlight: counted, cap }) ? within('act', () => startQueued(repo, runs)) : undefined;
  let feedError: string | undefined;
  try {
    recordFeed(new Map(runs.flatMap((run) => (done.has(run.id) ? [[run.id, done.get(run.id)!.feed] as const] : []))), {
      unjudged: new Set(unjudged.keys()),
    });
  } catch (err) {
    feedError = `the feed (${feedFile()}) was not written on this pass: ${(err as Error).message}`;
  }
  const refused = report.refused ?? [];
  const causes = new Set(unjudged.values());
  const unreadable = [
    ...(report.unreadable ?? []).filter((why) => !causes.has(why)),
    ...[...unjudged].map(([id, why]) => `${id} is not advanced while a task it reads is unreadable: ${why}`),
  ];
  return {
    runs: runs.flatMap((run) => done.get(run.id) ?? []),
    ...(queue ? { queue } : {}),
    ...(feedError ? { feedError } : {}),
    ...(refused.length ? { refused } : {}),
    ...(unreadable.length ? { unreadable } : {}),
  };
}

/**
 * What the tick remembers of the runs at rest (`atRest`), in memory and nowhere else: for each, what its last full pass answered, and the
 * inputs it answered on — its files in the store (`restStamps`), its record as read, and the result branches whose tips it would read. And
 * `cursor`, where on the engine's feed the memo has read to: every task of every run appends to it (the runtime's journal), so an event for
 * a task of a run the memo holds takes the run out of it (`evictedBy`). Undefined until the first pass reads the feed.
 *
 * A cache of a pure function, never a source of truth: nothing is written for it, a restarted daemon starts with an empty one and judges
 * every run afresh, and no verb, `wf ls` or the api reads it.
 */
export type RestMemo = {
  cursor?: number;
  runs: Map<string, { stamp: string; record: string; tipped: string[]; advanced: Omit<Advanced, 'run'> }>;
};

/** A memo that holds nothing: what a daemon starts with, and what a test hands each pass to play a restart. */
export const freshRestMemo = (): RestMemo => ({ runs: new Map() });

/** Each engine's memo: one engine is one daemon's (`wf up` makes one for all its passes), and one a test builds starts with none. */
const memos = new WeakMap<Engine, RestMemo>();
const restMemo = (e: Engine): RestMemo => {
  let memo = memos.get(e);
  if (!memo) memos.set(e, (memo = freshRestMemo()));
  return memo;
};

/** What a pass answers runs at rest by: the memo, read up to date with the feed, the store's stamps, and git's heads once per repository. */
type RestingPass = { memo: RestMemo; stamps: Map<string, string>; heads: (repo: string) => Record<string, string>; verify: boolean };

/**
 * The memo brought up to the engine's feed — every run a task of which appended since takes it out — and the store stamped, before the pass
 * reads a record. Undefined, and nothing answered from memory, for an engine with no feed: without it nothing says a task moved.
 *
 * A memo that has read nothing reads the feed from its end: it holds no run a line before could concern. A journal with no feed yet
 * answers with the cursor it was given, and the memo then reads from the start on the next pass. A feed that went back — a journal
 * replaced or cut — or cannot be read empties the memo, and the next pass reads it from its end again.
 */
async function restingPass(e: Engine, memo: RestMemo, verify: boolean): Promise<RestingPass | undefined> {
  if (typeof e.feed !== 'function') return undefined;
  try {
    if (memo.cursor === undefined) {
      memo.runs.clear();
      const { cursor } = await e.feed(Number.MAX_SAFE_INTEGER);
      memo.cursor = cursor >= Number.MAX_SAFE_INTEGER ? 0 : cursor;
    } else {
      const { entries, cursor } = await e.feed(memo.cursor);
      if (cursor < memo.cursor) memo.runs.clear();
      else
        for (const id of evictedBy(
          entries.map((f) => f.taskId),
          new Set(memo.runs.keys()),
        ))
          memo.runs.delete(id);
      memo.cursor = cursor;
    }
  } catch {
    memo.runs.clear();
    memo.cursor = undefined;
    return undefined;
  }
  const heads = new Map<string, Record<string, string>>();
  return {
    memo,
    verify,
    stamps: restStamps(),
    heads: (repo) => {
      const at = path.resolve(repo);
      if (!heads.has(at)) heads.set(at, headsOf(at));
      return heads.get(at)!;
    },
  };
}

/**
 * One run's pass, answered from the memo where the run was at rest on its last full pass and nothing it was judged by has changed:
 * its files in the store stamp the same, its record reads the same, nothing of its tasks is on the feed since (`restingPass`), and every
 * result branch it would read the tip of is where its record says (`tipsSeen`, off one `for-each-ref` a repository). Otherwise a full pass
 * (`advanceRun`), kept in the memo if the run is at rest after it.
 *
 * Answered from memory, it costs no journal read, no observe and no git process of its own, and is counted (`rested`). With `verify`, it is
 * judged in full as well, and a difference throws: a change the memo missed is a bug in what it watches.
 *
 * `slot` is `advance`'s, handed on to every full pass. A run with nothing filed comes here too — one called off before it started rests like
 * any other — and its answer from memory does not hang on the slot: a run at rest has nothing ready (`atRest`), and only a run with a step
 * ready wants a slot (`slotNeed`), so the cap holds it on no pass and it counts on none.
 */
async function advanceResting(e: Engine, run: Run, resting: RestingPass | undefined, slot?: RunSlot): Promise<Advanced> {
  if (!resting) return (await advanceRun(e, run, slot)).advanced;
  const { memo, stamps, heads, verify } = resting;
  const stamp = stamps.get(run.id);
  const record = JSON.stringify(run);
  const kept = memo.runs.get(run.id);
  if (
    kept &&
    stamp !== undefined &&
    kept.stamp === stamp &&
    kept.record === record &&
    (!kept.tipped.length || !isGitRun(run) || tipsSeen(run, kept.tipped, heads(run.repo)) === undefined)
  ) {
    countRested();
    if (verify) {
      const {
        advanced: { run: _, ...judged },
        blockers,
        rest,
      } = await advanceRun(e, run, slot);
      if (!rest || !isDeepStrictEqual(judged, kept.advanced) || JSON.stringify(run) !== record) {
        throw new Error(
          `the tick answered ${run.id} from its memo of runs at rest, and a full pass ${rest ? 'answers otherwise' : `finds it not at rest (${blockers.join(', ')})`}: ` +
            `an input of the run changed that the memo does not watch (rest.ts) — memo ${JSON.stringify(kept.advanced)}, pass ${JSON.stringify(judged)}`,
        );
      }
    }
    return { ...kept.advanced, run };
  }
  memo.runs.delete(run.id);
  const { advanced, rest } = await advanceRun(e, run, slot);
  if (rest && stamp !== undefined) {
    const { run: _, ...answered } = advanced;
    memo.runs.set(run.id, { stamp, record, tipped: rest.tipped, advanced: answered });
  }
  return advanced;
}

/** Each run with its workflow's steps, for `momentumOf`; a run whose workflow does not read names no task. */
function* runsWithSteps(runs: readonly Run[]): Generator<{ run: Run; steps: Workflow[] }> {
  for (const run of runs) {
    let steps: Workflow[];
    try {
      steps = stepsOf(run);
    } catch {
      continue;
    }
    yield { run, steps };
  }
}

/** The phase each of the engine's verbs is counted in: its pass is the runtime's, a read of a journal is `journals`, a verb that changes a task is `act`. */
const ENGINE_PHASES: Readonly<Record<string, Phase>> = {
  tick: 'runtime',
  view: 'journals',
  list: 'journals',
  feed: 'journals',
  logs: 'journals',
  transcript: 'journals',
  file: 'act',
  admit: 'act',
  stop: 'act',
  close: 'act',
  answer: 'act',
  say: 'act',
};

type EngineIo = ReturnType<Engine['io']>;

/** The runtime's running totals, or undefined for an engine that keeps none (a test's fake). */
const ioOf = (e: Engine): EngineIo | undefined => (typeof e.io === 'function' ? e.io() : undefined);

/**
 * Each harness's observes between two of the runtime's totals, for a harness observed in between; `unread` only where some observe could
 * not read, and read as none from totals that carry no count of it.
 */
const observedBetween = (before: EngineIo | undefined, after: EngineIo | undefined): Record<string, HarnessCost> =>
  Object.fromEntries(
    Object.entries(after?.observed ?? {}).flatMap(([name, o]): Array<[string, HarnessCost]> => {
      const b = before?.observed[name] ?? { calls: 0, ms: 0, listed: 0, spawned: 0, unread: 0 };
      const unread = (o.unread ?? 0) - (b.unread ?? 0);
      return o.calls > b.calls
        ? [
            [
              name,
              {
                calls: o.calls - b.calls,
                ms: o.ms - b.ms,
                listed: o.listed - b.listed,
                spawned: o.spawned - b.spawned,
                ...(unread > 0 ? { unread } : {}),
              },
            ],
          ]
        : [];
    }),
  );

/**
 * One call to the engine, counted in its phase — and what the runtime reported of it added there: the bytes it read and the processes it
 * started, with the time its harnesses' observes took moved to `observe`. A pass observes its harnesses at once, so its observe took the
 * slowest's time; a view observes the one harness of its task.
 */
async function engineCall<T>(e: Engine, verb: string, phase: Phase, call: () => Promise<T>): Promise<T> {
  const before = aside(() => ioOf(e));
  try {
    return await within(phase, call);
  } finally {
    aside(() => {
      const after = ioOf(e);
      if (!before || !after) return;
      const seen = Object.values(observedBetween(before, after));
      const ms = verb === 'tick' ? Math.max(0, ...seen.map((o) => o.ms)) : seen.reduce((n, o) => n + o.ms, 0);
      addRuntime(
        phase,
        { bytes: after.bytesRead - before.bytesRead, reads: after.reads - before.reads, spawned: after.spawned - before.spawned },
        { ms, calls: seen.reduce((n, o) => n + o.calls, 0), spawned: seen.reduce((n, o) => n + o.spawned, 0) },
      );
    });
  }
}

/** The engine, each verb counted in its phase (`engineCall`); anything else passed through as it is. */
const meteredEngine = (e: Engine): Engine =>
  new Proxy(e, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver) as unknown;
      const phase = typeof key === 'string' ? ENGINE_PHASES[key] : undefined;
      if (!phase || typeof value !== 'function') return value;
      return (...args: unknown[]) =>
        engineCall(target, key as string, phase, () => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args));
    },
  });

/** A pass's cost from its counts and the runtime's totals before and after it. */
const costOf = (t: Tallies, ms: number, before: EngineIo | undefined, after: EngineIo | undefined): PassCost =>
  passCost({
    at: new Date().toISOString(),
    ms,
    phases: t.kinds,
    harnesses: observedBetween(before, after),
    records: t.records,
    rested: t.rested,
    overheadMs: t.overheadMs,
  });

/** A run a task of which does not read (`unreadableJournal`), as a pass counts it: in flight, and asking the cap for nothing more. */
const UNJUDGED = { inFlight: true, wants: false } as const;

/**
 * The runs the cap on runs in flight holds now, each with the count it is held at (`heldRuns`): every run read as a pass reads it, between
 * passes — what `wf ls` and `wf decide` say. None, and nothing read, with no cap or no run that has nothing filed. A record whose workflow
 * does not read is left out, as nothing of it could be filed; a run a task of which does not read is counted in flight (`UNJUDGED`).
 *
 * The cap is the one the last pass ran with (`lastCeilings`), not the caller's environment, which is a shell's and not the daemon's; before
 * any pass has written it, the caller's own (`WF_MAX_RUNS`, `maxRuns`, refused by name when it is not a count).
 */
export async function runSlots(e: Engine, runs: readonly Run[] = listRuns()): Promise<Map<string, RunSlot>> {
  const cap = lastCeilings()?.runs ?? maxRuns();
  if (cap <= 0 || !runs.some((r) => !hasStarted(r) && !r.cancelledAt)) return new Map();
  const needs: Array<Pick<Run, 'id' | 'createdAt'> & { inFlight: boolean; wants: boolean }> = [];
  for (const run of runs) {
    let steps: Workflow[];
    try {
      steps = stepsOf(run);
    } catch {
      continue;
    }
    let need: { inFlight: boolean; wants: boolean };
    try {
      const { views, phaseOf } = await taskPhases(e, run);
      const { asks, rounds } = readAsks(run.id);
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
      need = slotNeed(run, phaseOf, a, (id) => parent(id).shipped, steps);
    } catch (err) {
      if (unreadableJournal(err) === undefined) throw err;
      need = UNJUDGED;
    }
    needs.push({ id: run.id, createdAt: run.createdAt, ...need });
  }
  return heldRuns(needs, cap);
}
