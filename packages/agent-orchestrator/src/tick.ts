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
import type { Engine, TaskView } from './runtime-client.ts';
import { CHECK_DEADLINE_SECONDS, checkBrief, type Verdict } from './check.ts';
import { sessionContext, type Workflow } from './workflow.ts';
import type { QueueStarted } from './inbox.ts';
import { folderPlace } from './places.ts';
import { admissionOrder, resultSteps, slotFree, takesNoSlot, endingAsked, type CheckoutHold, type MainClaim, heldCheckouts, triedFrom, heldRuns, isGitRun, runAdmitted, runCapOf, slotNeed, slotWord, hasStarted, runReady, tipBranches, tipsSeen, waitsOf, type RunSlot, type Wait } from './run.ts';
import { feedPhase, feedWords, type FeedWords } from './run.ts';
import { askingTry, assess, budgetOf, budgetUsdFor, MOMENTUM, priorityOf, ownStatus, stepSpend, type SpendOf, capOf, checkTaskId, composeBrief, handOffDue, inFlight, listing, retriesDue, roundFiled, roundsDue, sentBack, type EndingStopped, stepStatus, stepTaskId, type Assessment, type ParentCloseout, type ParentStep, type RoundAsk, type Run, type CloseoutAsked, type TaskPhase } from './run.ts';
import { closeoutSchemaOf, parseCloseout, type Closeout } from './closeout.ts';
import { modeWord, nextTry, sessionModel, tryOf, type RetryAsk } from './retry.ts';
import { artifactsDir, cancelFile, checkStderr, consumeAsks, inputsDir, listRuns, pruneFile, readAnswers, readAsks, readRun, rewriteRun, runFile, runsDir, stepsOf } from './store.ts';
import { ceilings, lastCeilings, recordCeilings } from './daemon-store.ts';
import { feedFile, recordFeed } from './feed-store.ts';
import { gitSays, handOff, workspaceFor } from './worktree.ts';
import { collectArtifacts } from './artifacts.ts';
import { refsOf } from './branches.ts';
import { closeoutAsked, closeoutOf, closeoutReader, engineWord, exitVerdicts, harnessBlocked, parentsOf, phaseOfView, refusalOf, saidCount, saidIn, sessionIn, spendReader, taskPhases, waitingOf } from './views.ts';
import { startQueued } from './start.ts';

/**
 * Whether any step of this run has a cap in force on it (`budgetOf`: its `budget:`, or the last a person raised it to) — read off the
 * record, with nothing asked of the engine. What the tick's pass reads the earlier tries for (`taskPhases`): with no cap anywhere, what
 * they cost is a number nothing in the pass looks at.
 */
const underBudget = (steps: readonly Workflow[], run: Run): boolean => steps.some((s) => budgetOf(s, run.steps[s.name]) !== undefined);

/**
 * Checks a pass filed and never wrote down, put back on the record. In memory: `advance` is the one
 * writer of the run's json, and writes it; `cancel` only needs them in view.
 *
 * A pass that dies between `e.file` and `writeRun` leaves a check on the engine's board that the
 * record does not name. It is looked for under the id the run derives, for every step whose check is
 * due and unrecorded, and BEFORE anything asks what is in flight. Waiting for filing time to adopt it
 * was not enough: a run cancelled in that window files no more checks, so it was never adopted, never
 * stopped, and its suite ran on to the deadline.
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
    if (!view.state.brief) continue;   // not filed: due, and this pass's to file
    views.set(taskId, view);
    run.steps[step.name] = { ...run.steps[step.name]!, check: { taskId } };
    adopted.push(step.name);
  }
  return adopted;
}

/**
 * Tries a pass filed and never wrote down, put back on the record — in memory, as `adoptChecks` does, and
 * before anything asks what is in flight, for the same reason: a run cancelled in that window files no more
 * tries, so a try filed in it would otherwise never be adopted, nor stopped.
 *
 * Looked for only where a try is due (`retriesDue`, cancelled or not): an ask for the step's next try, or a
 * refused check `retries:` covers. A run waiting on a person with nothing asked costs no look.
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
    const taskId = r.mode === 'recheck' ? checkTaskId(run, r.step, r.try) : stepTaskId(run, r.step, r.try);
    const view = await e.view(taskId);
    if (!view.state.brief) continue;   // not filed: due, and this pass's to file
    views.set(taskId, view);
    const record = run.steps[r.step]!;
    run.steps[r.step] = r.mode === 'recheck' ? { ...nextTry(record, r), check: { taskId } } : nextTry(record, r, taskId);
    for (const b of r.back ?? []) run.steps[b] = sentBack(run.steps[b]!);
    adopted.push(r.step);
  }
  return adopted;
}

/**
 * Rounds a pass filed and never wrote down, put back on the record — in memory, and before anything asks what is in flight, as `adoptTries`
 * does and for its reason.
 *
 * Looked for only where a round is due (`roundsDue`, cancelled or not), under the target's next try's id. A pass that filed the round and died
 * left the looping step's `again: true` on the record, so the round reads due again; finding its task filed, this moves the loop on as the
 * pass would have (`roundFiled`), and nothing is filed twice.
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
    if (!view.state.brief) continue;   // not filed: due, and this pass's to file
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
    const view = views.get(taskId) ?? await e.view(taskId);
    if (!view.state.brief) continue;   // not filed
    views.set(taskId, view);
    found.push({ name, taskId });
  }
  return found;
}

/**
 * One pass's work: the steps it filed, the steps whose checks it filed, the steps it tried again, and where the
 * run stands — and `notes`, each line starting with its step: what cutting a worktree had to say (a path
 * `.worktreeinclude` lists that the main checkout does not have, a line it refused, an `npm ci` that ran or
 * failed), each try and each round filed and on whose word, a blocked session the engine was asked to stop for a try, and an ask file that
 * cannot be read. `looped` names the
 * looping steps whose loop this pass took round again. `waiting` names the runs whose shipping this run's roots wait on (`waitsOf`).
 * `inFlight` says the run counts against the cap on runs in flight once this pass is done: in flight when the pass read it (`slotNeed`), or
 * filed something. `held` is the slot the cap held its roots at, on a pass that held them.
 */
export type Advanced = {
  run: Run; filed: string[]; checked: string[]; tried: string[]; looped: string[]; status: Assessment['status']; blocked: string[]; notes: string[]; waiting: Wait[];
  inFlight: boolean; held?: RunSlot;
  /** What the pass judged of the run and of each step, in the words the feed keeps (`feedWords`): what `tick` writes where they changed. */
  feed: FeedWords;
};

/**
 * Which run's `workspace: main` step holds the repository's own checkout while this run's waits for it (`heldCheckouts`) — or undefined,
 * when nothing does and this run's may be filed.
 *
 * Asked of the store on the pass that asks, never stored: only of a run whose ending step is approved and not filed, since nothing else of
 * a run works in that checkout, and then of every run of the same repository. A run is in the checkout while the engine holds its
 * `workspace: main` task in flight, as `inFlight` counts one, so a step filed earlier in this very pass is read as being in it. One waiting
 * to be filed counts only if the pass would in fact file it: a send-back of the work un-holds its gate, and an ending that will not be filed
 * must not hold another run's for ever.
 */
export async function checkoutHold(e: Engine, run: Run, steps: readonly Workflow[]): Promise<CheckoutHold | undefined> {
  const ending = steps.find((s) => s.workspace === 'main');
  // Cheap, and first: a run reads the store only where a person's word would file its own ending (`endingAsked`) — the approval of one that
  // has not run, or the ask for a try of one that has. A run with no such word is waiting for nothing, and one whose ending is in that
  // checkout is not waiting for it either; neither needs anybody else's claim read.
  if (!ending || run.cancelledAt || endingAsked(run, ending, readAsks(run.id).asks) === undefined) return undefined;
  const runs = listRuns();
  // The cap on runs in flight, read once for every claim here: a run it holds files nothing, so its ending claims nothing (`mainClaim`).
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
 * A run's claim on the repository's own checkout, as a pass reads it now (`MainClaim`) — or undefined for a run with no ending step, and
 * for one whose ending the pass would neither find there nor file.
 *
 * Every run is read the same way, this one and the others, so the two readings cannot drift. A step is IN that checkout while the engine
 * holds its task in flight, as `inFlight` counts one: a task the engine has lost holds nothing, since a run nobody can stop must not hold
 * every other run's ending for ever — but a run somebody called off holds it while its session is still there, between `wf cancel` asking
 * the engine to stop it and the engine settling it, because that session is still merging in that directory.
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
  try { steps = stepsOf(run); } catch { return undefined; }   // a record whose workflow no longer reads files nothing
  const ending = steps.find((s) => s.workspace === 'main');
  if (!ending || !isGitRun(run)) return undefined;
  const repo = path.resolve(run.repo);
  const taskId = run.steps[ending.name]?.taskId;
  const phase = taskId ? phaseOfView(await e.view(taskId)) : 'unknown';
  if (taskId && (phase === 'pending' || phase === 'running')) return { id: run.id, repo, step: ending.name, holds: true };
  if (run.cancelledAt) return undefined;
  const { asks, rounds } = readAsks(run.id);
  const at = endingAsked(run, ending, asks);
  if (at === undefined) return undefined;
  const { views, phaseOf } = await taskPhases(e, run);
  const a = assess(steps, run, phaseOf, closeoutReader(views, run), closeoutAsked(views), exitVerdicts(views, run), asks, rounds, harnessBlocked(views), spendReader(views));
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
  const steps = stepsOf(run);

  // Every try's session, or only the current ones: what the earlier ones cost is read by nothing here unless a cap is in force
  // (`underBudget`), and a step answered without limit grows that read for ever.
  const { views, phaseOf } = await taskPhases(e, run, { earlierTries: underBudget(steps, run) });
  const signedOff = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  const verdictOf = exitVerdicts(views, run);
  const sessionBlocked = harnessBlocked(views);
  // What each try has cost, as the engine has measured it: a step over its budget is filed nothing more on the run's word.
  const spendOf = spendReader(views);
  // A person's word, read on every pass: an ask made while this pass was elsewhere is read by the next.
  const { asks, rounds: roundAsks, notes: askNotes } = readAsks(run.id);
  const adoptedRounds = await adoptRounds(e, run, steps, views, phaseOf, signedOff, asked, roundAsks, spendOf);
  const adoptedTries = await adoptTries(e, run, steps, views, phaseOf, signedOff, asked, verdictOf, asks, spendOf);
  const adopted = await adoptChecks(e, run, steps, views, phaseOf, signedOff, asked, spendOf);

  // A cancelled run is enforced by every pass, not only by the verb that cancelled it.
  //
  // `wf cancel` stops what it can SEE in flight, and this pass may have filed a step moments
  // after it looked. One tick later that step is asked to stop too, so the window costs a few
  // seconds of work rather than a session nobody is watching. Level-triggered, like the rest: the
  // mark is the desired state and every tick reconciles toward it, instead of the system trusting
  // that one command did everything.
  if (run.cancelledAt) {
    // A step a pass filed and died before writing down is stopped too: the record does not name it, and nothing else would.
    const unrecorded = await unrecordedSteps(e, run, steps, views, phaseOf, signedOff, asked, verdictOf, asks, roundAsks, spendOf);
    const live = unrecorded.filter(({ taskId }) => ['pending', 'running'].includes(phaseOf(taskId)));
    for (const { taskId } of [...inFlight(run, phaseOf), ...live]) {
      // Skipped once the engine already has the request on its record, so a task taking a tick or
      // two to settle does not collect a stop-requested event every four seconds.
      if (!views.get(taskId)?.state.stopRequested) await e.stop(taskId);
    }
  }

  // Anything a finished step left uncommitted is committed for it, BEFORE a later step merges.
  //
  // A merge carries commits, not working trees. While steps shared one directory that did not
  // matter — a file written was a file the next step could read — but the moment steps fork, an
  // uncommitted file is invisible downstream and the next step answers a question it never saw.
  // Measured the hard way: a review wrote REVIEW.md, did not commit, and the responder merged a
  // branch that did not contain it. Asking every step's prose to remember is not a contract — so
  // this IS the contract: every step is told the run commits what it leaves (`closeoutContract`),
  // which is also exactly what a sandboxed step that cannot write git's metadata needs.
  //
  // Every finished step, failed and stopped too, until its check is filed or a later step works in its
  // workspace: the check judges the committed tree, and nothing it leaves behind — nor the next step's
  // work in progress — is committed under this step's name (`handOffDue`).
  //
  // And on the same passes, what a finished step named from its workspace root is collected into its files directory: before its check
  // is filed, and before a step after it works in its workspace (`collectArtifacts`).
  //
  // Only while the record is there, read at the moment of each: a run `wf rm` forgot after this pass read it is not handed off — a
  // `--no-worktree` run's workspace is a person's checkout — and its files directory is not made again.
  // Whether a step's hand-off was marked on this pass: a mark nobody writes is lost, and the next pass commits a person's edits as the step's.
  let markedHandedOff = false;
  // A pruned run owed no hand-off when its worktrees went (`pruneRefusal`), and has nowhere to hand one off from since.
  const collected = (run.pruned ? [] : handOffDue(steps, run, phaseOf)).flatMap((name) => {
    if (!fs.existsSync(runFile(run.id))) return [];
    const record = run.steps[name]!;
    let handed: ReturnType<typeof handOff>;
    if (isGitRun(run)) handed = handOff(record.workspace!, name);
    else folderPlace(runsDir()).handOff(run, name);
    // Once for the try, unless git refused the commit — a hook, a signature — which the next pass tries again.
    if (!(handed && 'error' in handed)) {
      run.steps[name] = { ...record, handedOff: record.taskId! };
      markedHandedOff = true;
    }
    return collectArtifacts(run, name, signedOff(name));
  });

  // Two runs' ending steps never work in one checkout at once (`checkoutHold`): while another run's `workspace: main` task is unsettled
  // there, this run's is not filed, whatever its approval says. Read from the world on this pass, including what the pass has already
  // filed, so the order a pass takes the runs in decides nothing, and a restart changes nothing.
  const checkout = await checkoutHold(e, run, steps);
  const assessed = assess(steps, run, phaseOf, signedOff, asked, verdictOf, asks, roundAsks, sessionBlocked, spendOf, [], checkout);
  const { check, retry, round, blocked, status } = assessed;
  // A run that waits on runs (`--after`) files its roots once every one of them has shipped, as its `wf decide` says, read on this pass.
  // Only a run with nothing filed is gated, and nothing else about it changes: once it has started its parents are never read again (`gated`).
  const parent = await parentsOf(e, run);
  const starting = !hasStarted(run);
  // And a run with nothing filed files its roots only while the cap on runs in flight leaves a slot (`runAdmitted`): one that wants a slot and
  // is not admitted is held, and files nothing.
  const need = slotNeed(run, phaseOf, assessed, (id) => parent(id).shipped, steps);
  const admitted = runAdmitted(run, slot, steps);
  const held = need.wants && !admitted ? slot : undefined;
  const ready = runReady(run, (id) => parent(id).shipped) && admitted ? assessed.ready : [];
  const waiting = waitsOf(run, parent);
  // What the pass judged, as `wf ls` words it, for the feed (`recordFeed`) — worded here, off what this pass read before it filed anything: a
  // step filed below has no view on this pass, and would read `unknown`. So a step's filing reaches the feed a pass late, as the engine's
  // `pending`. Off the same reads as the judgement, and nothing read again: the feed only reports what the pass decided on.
  const feed = feedWords(listing(
    steps, run, (taskId) => feedPhase(engineWord(views)(taskId)), (name) => closeoutOf(views, run, name), asked, verdictOf, asks, roundAsks,
    readAnswers(run.id), waiting, saidCount(views, run), spendOf, held, [], checkout, waitingOf(views),
  ), run, assessed, (name) => closeoutOf(views, run, name));

  // Another try: a refused check `retries:` still covers, or a person's `wf retry`. The step goes on in the
  // workspace and on the branch it had, under its next try's derived id, and the try it replaces moves behind
  // it on the record. Nothing about the engine changes: to it, this is one more task.
  const tried: string[] = [];
  const rechecked: string[] = [];
  const notes: string[] = [...askNotes, ...collected];
  // Read again at the moment of filing, and not only when this pass read the run: a person may have called it off, and `wf rm` forgotten it,
  // while this pass was at work — cutting a worktree, whose `npm ci` takes a minute. Filed then, a session would work in a worktree that is
  // gone, for a record no pass reads, and no stop would reach it. The world as it stands decides, and once called off, nothing more is
  // filed on this pass. A pruned run is called off the same way: whatever a person's ask says, what it would file works in a worktree
  // `wf prune` removed, or inherits one — and the marker is written before the first removal, so a pass that read the run a moment
  // before stops here too.
  let calledOff = false;
  const mayFile = (): boolean => !(calledOff ||= !fs.existsSync(runFile(run.id)) || fs.existsSync(cancelFile(run.id)) || fs.existsSync(pruneFile(run.id)));
  const endingSaid = (ending: Workflow): EndingStopped => {
    const said = signedOff(ending.name);
    return {
      step: ending.name, status: ownStatus(ending, run, phaseOf, signedOff, asked, steps, spendOf),
      ...(said?.summary ? { summary: said.summary } : {}), ...(said?.needs ? { needs: said.needs } : {}),
      onto: isGitRun(run) ? run.branch : 'the base branch',
    };
  };
  for (const r of retry) {
    const step = steps.find((s) => s.name === r.step)!;
    const record = run.steps[r.step]!;
    // A try of a step whose task has not settled — its session blocked by its harness, or asked for while it was and working again since: the
    // session is stopped first, and nothing is filed. Asked once — a task the engine already holds the request for is not asked again — and a
    // later pass, once the task has settled, reads the try due as one of a stopped step, and files it. Nothing is carried between the two: a
    // pass after a restart reads the same engine record, and does the same.
    if (r.stopFirst) {
      if (!views.get(record.taskId!)?.state.stopRequested) {
        await e.stop(record.taskId!);
        const why = r.runsOn ? 'its session runs on, asked for while its harness had blocked it' : 'its harness blocked its session';
        notes.push(`${r.step}: try ${r.try} — wf retry ${modeWord(r)}${r.message !== undefined ? ', with your answer' : ''}; ${why}, so the engine is asked to stop it, and the try is filed once it has`);
      }
      continue;
    }
    if (!mayFile()) continue;
    tried.push(r.step);
    notes.push(`${r.step}: try ${r.try} — ${r.by === 'retries' ? `retries: ${step.retries}` : r.by === 'signoff' ? 'a nudge to sign off, once a round' : `wf retry ${modeWord(r)}${r.budget !== undefined ? ` --budget ${r.budget}` : ''}${r.message !== undefined ? ', with your answer' : ''}`}`);
    // A recheck files no session. Its check is filed below with the others, under the new try's id.
    if (r.mode === 'recheck') {
      run.steps[r.step] = nextTry(record, r);
      rechecked.push(r.step);
      continue;
    }

    const taskId = stepTaskId(run, r.step, r.try);
    // A try an earlier pass filed and never wrote down was adopted above. Looked up once more all the same,
    // as a check is: filing an id the engine already holds would journal it twice.
    if (!(await e.view(taskId)).state.brief) {
      const files = artifactsDir(run, r.step);
      fs.mkdirSync(files, { recursive: true });
      // A nudge continues the last try's session. With none to continue — a session the harness never
      // reported — the try starts a new one, and its brief says so.
      const resumeFrom = r.mode === 'nudge' ? sessionIn(views, record.taskId!) : undefined;
      // What the check said, as data in the brief: the frozen command, its exit, and both tails.
      const refusal = record.check && step.check ? await refusalOf(e, step.check, record.check.taskId) : undefined;
      // A new session of a loop's target within a round owes replies to the round's findings, and is handed them as its first try was:
      // off the looping step's try that asked, since the looping step's own place is unfiled until the target is verified.
      const asking = resumeFrom ? undefined : askingTry(steps, run, r.step);
      const askedWith = asking ? (await e.view(asking.taskId)).state.attempts.at(-1)?.closeout : undefined;
      const findings = askedWith === undefined ? undefined : parseCloseout(askedWith);
      const reads = (name: string): Closeout | undefined =>
        (asking && name === asking.looping.name && findings && !('error' in findings) ? findings : signedOff(name));
      await e.file({
        id: taskId,
        brief: composeBrief(step, run, steps, reads, files, undefined, {
          try: r.try, by: r.by, mode: r.mode, ...(r.model ? { model: r.model } : {}), ...(r.message !== undefined ? { message: r.message } : {}),
          ...(r.budget !== undefined ? { budget: r.budget } : {}), resumed: Boolean(resumeFrom),
          // What was said to the session a nudge continues: it may never have read it (agent-runtime open issue 16).
          ...(resumeFrom ? { said: saidIn(views.get(record.taskId!)) } : {}),
          // How the last try ended on its own work — unsigned, failed, its check — and not `over budget`, which is why nothing was filed: `budget` says that.
          // A gated step that signed off was sent back from its gate.
          status: triedFrom(step, run, phaseOf, signedOff, asked, steps, spendOf), ...(refusal ? { refusal } : {}),
          // Sent back from an ending that stopped on the base branch: how it stopped and what it said, for the step to weigh.
          ...(r.back?.length ? { ending: endingSaid(steps.find((s) => s.name === r.back![0])!) } : {}),
        }, undefined, undefined, inputsDir(run)),
        cwd: record.workspace ?? run.workspace,
        harness: step.harness,
        // How the harness is to run the session: its arguments, which the engine carries to the runner unread (`HarnessArgs`).
        config: {
          // A fresh try on the model it asked for, or the step's; any other the model its session was started on (`sessionModel`), so a nudge
          // after a `--model` try continues that session as it cached it.
          model: r.mode === 'fresh' ? r.model ?? step.model : sessionModel(step, record),
          effort: step.effort,
          // One window for the session's whole chain (`sessionContext`): a resumed copy keeps only the flags it is given.
          contextTokens: sessionContext(step, steps),
          permissionMode: step.permissionMode,
          // The fence goes with every try: a try is the step, and a nudge continues a session that had it.
          tools: step.tools,
          disallowedTools: step.disallow,
          allowedTools: step.allow,
          // And the bridge to claude.ai, as the step asked for it: a try is a session of the step, run as the step is (`background`).
          background: step.background,
          remoteControl: step.remote,
        },
        deadlineSeconds: step.deadlineSeconds,
        maxAttempts: step.maxAttempts,
        // What is left of the cap a person raised with the try, or of the one in force, once the step's tries are taken off: handed to a harness
        // that keeps a cap (`budgetUsdFor`), so it holds the tries together to it.
        budgetUsd: budgetUsdFor(step, r.budget ?? budgetOf(step, record), stepSpend(run, r.step, spendOf)),
        // A try is never a run's first filing: it goes before a newer run's first step (`MOMENTUM`).
        priority: MOMENTUM,
        resumeFrom,
        // The step's one schema, whatever round the run is on: a nudge continues a session, and a changed schema would rebuild its cache.
        // What a loop's target owes on this try — its answers to the round's findings — is `owedFields`', read when it signs off.
        closeoutSchema: closeoutSchemaOf(step, steps),
      });
    }
    run.steps[r.step] = nextTry(record, r, taskId);
    // Sent back from an ending that stopped on the base branch: its try moves behind in the same write, so it waits for the work again.
    for (const b of r.back ?? []) run.steps[b] = sentBack(run.steps[b]!);
  }

  // Another round: a looping step said `again: true` with rounds left, or a person's `wf round` took a loop out of rounds once more. The
  // loop's target goes on in its workspace, its session continued under its next try's id and handed what the looping step declared, as data.
  // Every other step of the loop moves behind, unfiled, and a later pass files each once what it waits on is verified — a new session. To the
  // engine, this is one more task.
  const looped: string[] = [];
  for (const r of round) {
    if (!mayFile()) break;
    const looping = steps.find((s) => s.name === r.step)!;
    const target = steps.find((s) => s.name === r.target)!;
    const record = run.steps[r.target]!;
    const taskId = stepTaskId(run, r.target, tryOf(run, r.target) + 1);
    looped.push(r.step);
    notes.push(`${r.step}: round ${r.round} — ${r.by === 'again' ? `again, rounds: ${capOf(looping)}` : `wf round${r.budget !== undefined ? ` --budget ${r.budget}` : ''}`}; ${r.target} goes again`);
    // A round an earlier pass filed and never wrote down was adopted above. Looked up once more all the same, as a try is.
    if (!(await e.view(taskId)).state.brief) {
      const files = artifactsDir(run, r.target);
      fs.mkdirSync(files, { recursive: true });
      const resumeFrom = record.taskId ? sessionIn(views, record.taskId) : undefined;
      await e.file({
        id: taskId,
        // Read off the closeout that asked for the round, before the record moves it behind.
        brief: composeBrief(target, run, steps, signedOff, files, undefined, undefined, {
          loop: r.step, round: r.round, rounds: capOf(looping), by: r.by, resumed: Boolean(resumeFrom),
          ...(resumeFrom ? { said: saidIn(views.get(record.taskId!)) } : {}),
        }, undefined, inputsDir(run)),
        cwd: record.workspace ?? run.workspace,
        harness: target.harness,
        // How the harness is to run the session: its arguments, which the engine carries to the runner unread (`HarnessArgs`).
        config: {
          // The model the session it continues runs on: a `wf retry --model` within the round before is kept (`sessionModel`).
          model: sessionModel(target, record),
          effort: target.effort,
          contextTokens: sessionContext(target, steps),
          permissionMode: target.permissionMode,
          tools: target.tools,
          disallowedTools: target.disallow,
          allowedTools: target.allow,
          background: target.background,
          remoteControl: target.remote,
        },
        deadlineSeconds: target.deadlineSeconds,
        maxAttempts: target.maxAttempts,
        budgetUsd: budgetUsdFor(target, r.budget !== undefined && r.raise?.includes(r.target) ? r.budget : budgetOf(target, record), stepSpend(run, r.target, spendOf)),
        priority: MOMENTUM,
        resumeFrom,
        // The schema round 1 was filed with, `replies` and all (`closeoutSchemaOf`): the session is continued, and keeps its cache.
        closeoutSchema: closeoutSchemaOf(target, steps),
      });
    }
    Object.assign(run.steps, roundFiled(steps, run, r, taskId));
  }

  // The fact the run establishes for itself: each signed step's `check:`, executed where the work is.
  // An engine task on the `check` harness, so it outlives this pass, has a deadline, and is stopped
  // by a cancel like anything else. Nothing is ready on it in this pass — a follower waits for the
  // check to SETTLE, on a later one.
  const checked: string[] = [];
  for (const name of [...check, ...rechecked]) {
    if (!mayFile()) break;
    const step = steps.find((s) => s.name === name)!;
    const workspace = run.steps[name]!.workspace ?? run.workspace;
    const taskId = checkTaskId(run, name);
    // A check an earlier pass filed and never wrote down was adopted above, before this list was made.
    // Looked up once more all the same: filing an id the engine already holds would journal it twice.
    if (!(await e.view(taskId)).state.brief) {
      fs.mkdirSync(path.dirname(checkStderr(taskId)), { recursive: true });
      // Made here as well as at filing: a step filed before the run made these has none.
      const files = artifactsDir(run, name);
      fs.mkdirSync(files, { recursive: true });
      await e.file({
        id: taskId,
        harness: 'check',
        // The command from the workflow this run froze — never from the workspace it is about to judge.
        brief: checkBrief(step.check!, {
          WF_RUN: run.id, WF_STEP: name, ...(isGitRun(run) ? { WF_BASE_REF: run.baseRef } : {}), WF_WORKSPACE: workspace, WF_STDERR: checkStderr(taskId),
          WF_ARTIFACTS: files,
        }),
        cwd: workspace,
        deadlineSeconds: CHECK_DEADLINE_SECONDS,
        // One attempt, never resumed: a check that refused has said what it has to say, and running a
        // suite until it passes would let a flaky suite decide what ships.
        maxAttempts: 1,
        resume: 'never',
        // In its own pool, before a newer run's check: what follows the step waits on it.
        priority: MOMENTUM,
      });
    }
    run.steps[name] = { ...run.steps[name]!, check: { taskId } };
    checked.push(name);
  }

  /** The harness's own id for a step's session — what `--resume` takes. */
  const sessionOf = (stepName: string): string | undefined => {
    const taskId = run.steps[stepName]?.taskId;
    const attempts = taskId ? views.get(taskId)?.state.attempts : undefined;
    return attempts?.at(-1)?.nativeId ?? undefined;
  };

  // A run that waited on runs starts from its base branch as it stands now, with their work on it — not as it stood at `wf start`,
  // before they shipped. Read once, in the pass that files its roots, and written with them; every worktree and diff of the run is cut
  // from it. A run with no `after` keeps the base `wf start` recorded, as before.
  if (ready.length && starting && run.after?.length && isGitRun(run)) run.baseRef = gitSays(run.repo, 'rev-parse', '--verify', `${run.branch}^{commit}`)?.trim() || run.baseRef;
  // What those runs concluded, for the roots' briefs (`## From run <id>`): read on the same pass, and never again.
  const parents = ready.length && starting && run.after?.length ? await parentCloseouts(e, run.after) : undefined;

  const filed: string[] = [];
  for (const name of ready) {
    if (!mayFile()) break;
    const step = steps.find((s) => s.name === name)!;
    const place = await workspaceFor(run, steps, step);
    notes.push(...place.notes.map((note) => `${name}: ${note}`));
    // Asked again after the cut, which can take minutes: the worktree stays for `wf rm` to find, and nothing is filed into it.
    if (!mayFile()) break;
    // Made before the step is told of it, so the directory its brief names is there when it starts.
    const files = artifactsDir(run, name);
    fs.mkdirSync(files, { recursive: true });

    const taskId = await e.file({
      // The task id is chosen, not generated, so the harness session reads `ae/<run>-<step>/1`.
      // A person scanning their sessions then sees which run and which step, and two steps of one
      // run share a prefix — which is what makes a resumed step legible as a continuation rather
      // than a duplicate. A step of a loop filed for a later round is on a later try, and its id says which.
      id: stepTaskId(run, name, tryOf(run, name)),
      // What the steps it reads declared, if it names any in `input:` — read off the same closeouts the
      // assessment that made it ready just read, so it is handed what it was filed on.
      // And, when the run installed its `node_modules` or could not, why its start was slow or what to run. And, on a root of a run
      // that waited on runs, what they concluded.
      brief: composeBrief(step, run, steps, signedOff, files, place.deps, undefined, undefined, step.after.length ? undefined : parents, inputsDir(run)),
      cwd: place.workspace,
      harness: step.harness,
      // How the harness is to run the session: its arguments, which the engine carries to the runner unread (`HarnessArgs`).
      config: {
        model: step.model,
        effort: step.effort,
        // The session's context window, as `--autocompact`: past about it Claude Code compacts the conversation and carries on. A step that
        // continues another's session (`resume:`) is filed with the window that session was started with (`sessionContext`).
        contextTokens: sessionContext(step, steps),
        // Left to the engine's default (`auto`) unless the step says otherwise. A job asks nobody in any mode: a call it may not make
        // is denied, recorded, and the session carries on (agent-runtime's open issue 28, M1).
        permissionMode: step.permissionMode,
        // The only tools the session has, when the step names them — from the workflow this run froze, like the rest.
        tools: step.tools,
        // What it may not have of them, as `--disallowedTools`: a deny beats the checkout's settings.
        disallowedTools: step.disallow,
        allowedTools: step.allow,
        // A job (`claude -p`) unless the step says `background: true`, which runs it as a session a person can talk to (`claude --bg`).
        background: step.background,
        // Bridged to claude.ai, where anyone signed in can drive it, only when the step says `remote: true`: never a default.
        remoteControl: step.remote,
      },
      deadlineSeconds: step.deadlineSeconds,
      maxAttempts: step.maxAttempts,
      // What is left of the cap for this session, where its harness keeps one: `claude-detached`. A step on a later round has spent some of it.
      // On `claude` the run holds the cap between tries.
      budgetUsd: budgetUsdFor(step, budgetOf(step, run.steps[name]), stepSpend(run, name, spendOf)),
      // None on a run's first steps, and `MOMENTUM` on a step after another: a run in flight goes before a newer run's first step.
      priority: priorityOf(step),
      resumeFrom: step.resume ? sessionOf(step.resume) : undefined,
      // The shape of the step's closing statement, with the fields its `output:` declares — from the
      // workflow this run froze, never the folder. The engine hands it to the harness and records the
      // answer without reading it; what the fields mean is ours — see `Closeout`.
      // A loop's target is asked for `replies` from its first round, so every round continues its session under this same schema.
      closeoutSchema: closeoutSchemaOf(step, steps),
    });
    // The tries a round moved behind stay with it.
    run.steps[name] = { ...run.steps[name], taskId, workspace: place.workspace, branch: place.branch };
    filed.push(name);
  }
  // The first pass the cap holds a run writes when, and says so once: what the run's timeline counts its wait for a slot from.
  const heldFirst = Boolean(held && !run.slotHeldAt && mayFile());
  if (heldFirst) {
    run.slotHeldAt = new Date().toISOString();
    notes.push(`${assessed.ready.join(', ')}: ${slotWord(held!)} — filed once a run in flight settles`);
  }
  // A finished run's result branches, as git has them now: the commits `wf decide` offers to ship, kept so that git can still be asked
  // whether they are on the base once a person has deleted the branch after the merge (`isShipped`). Written only when a tip moved.
  const tipped = isGitRun(run) ? tipBranches(run, steps, status) : [];
  const tips = tipped.length && isGitRun(run) ? tipsSeen(run, tipped, refsOf(run.repo, tipped)) : undefined;
  if (tips) run.tips = tips;
  // Only to a record that is still there: a run `wf rm` forgot while this pass was at work stays forgotten (`rewriteRun`).
  if (filed.length || checked.length || tried.length || looped.length || adopted.length || adoptedTries.length || adoptedRounds.length || tips || heldFirst || markedHandedOff) rewriteRun(run);
  // After the record is written, never before: an ask is consumed once the record holds its try or its round — this
  // pass's, or one a pass that died before consuming it wrote down.
  consumeAsks(run, asks, roundAsks);

  return {
    run, filed, checked, tried, looped, status, blocked, notes, waiting,
    // A run outside the cap (`slot: none`) counts for nothing it filed either: what it files is its own watching, not a run's work.
    inFlight: !takesNoSlot(steps) && (need.inFlight || filed.length > 0 || checked.length > 0 || tried.length > 0 || looped.length > 0),
    ...(held ? { held } : {}),
    feed,
  };
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
 * It never throws: a parent whose record or workflow no longer reads, a step never filed, a task the engine holds
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
      if (!c) said.push({ name: step.name, unreadable: `the engine holds no closeout for its task ${taskId}, which is ${phaseOfView(view)}` });
      else if ('error' in c) said.push({ name: step.name, unreadable: `its closeout cannot be read: ${c.error}` });
      else said.push({ step, said: c });
    }
    out.push({ run: id, asked: record.brief.split('\n')[0]!, steps: said });
  }
  return out;
}

/** One pass: every run advanced, in the store's order, and what the pass did with the queue of inbox cards, when it did anything (`startQueued`). */
export type Pass = {
  runs: Advanced[]; queue?: QueueStarted;
  /** Why the feed could not be written on this pass (`recordFeed`), when it could not: the pass itself went on, since nothing reads the feed to decide. */
  feedError?: string;
};

/**
 * Every run, advanced once, after one engine tick — then, with a run slot free, the queue's next card started. This is the whole daemon.
 *
 * Every run that has started first, which the cap on runs in flight (`WF_MAX_RUNS`) never holds: what each has in flight once its pass is done
 * is what the cap counts. Then each run with nothing filed, oldest first (`admissionOrder`), judged against the runs in flight so far — and
 * counted, once it filed, for the next (`runAdmitted`). Then, while a slot is still free (`slotFree`) — always, with no cap — one queued card
 * is started, on `repo` when its card names none: one per pass, so the next pass counts its run before another is started. Nothing is carried
 * between passes: the next one counts again.
 */
export async function tick(e: Engine, { repo = process.cwd() }: { repo?: string } = {}): Promise<Pass> {
  await e.tick();
  const ran = ceilings();
  // What `wf ls` and `wf decide` judge the cap by, from a shell of their own.
  recordCeilings(ran);
  const cap = ran.runs;
  const runs = listRuns();
  const done = new Map<string, Advanced>();
  // A finished run still gets assessed — it costs one read and it is how `ls` stays honest.
  for (const run of runs.filter(hasStarted)) done.set(run.id, await advance(e, run));
  let counted = [...done.values()].filter((a) => a.inFlight).length;
  for (const run of admissionOrder(runs.filter((r) => !hasStarted(r)))) {
    const advanced = await advance(e, run, { inFlight: counted, cap });
    done.set(run.id, advanced);
    if (advanced.inFlight) counted++;
  }
  const queue = slotFree({ inFlight: counted, cap }) ? startQueued(repo, runs) : undefined;
  // Last, and apart: what the pass judged, written where it changed. A feed that cannot be written costs the report, never the pass.
  let feedError: string | undefined;
  try {
    recordFeed(new Map(runs.map((run) => [run.id, done.get(run.id)!.feed])));
  } catch (err) {
    feedError = `the feed (${feedFile()}) was not written on this pass: ${(err as Error).message}`;
  }
  return { runs: runs.map((run) => done.get(run.id)!), ...(queue ? { queue } : {}), ...(feedError ? { feedError } : {}) };
}

/**
 * The runs the cap on runs in flight holds now, each with the count it is held at (`heldRuns`): every run read as a pass reads it, between
 * passes — what `wf ls` and `wf decide` say. None, and nothing read, with no cap or no run that has nothing filed. A record whose workflow
 * no longer reads is left out, as nothing of it could be filed.
 *
 * The cap is the one the last pass ran with (`lastCeilings`), not the caller's environment, which is a shell's and not the daemon's; before
 * any pass has written it, the caller's own (`WF_MAX_RUNS`, refused by name when it is not a count).
 */
export async function runSlots(e: Engine, runs: readonly Run[] = listRuns()): Promise<Map<string, RunSlot>> {
  const cap = lastCeilings()?.runs ?? runCapOf(process.env.WF_MAX_RUNS);
  if (cap <= 0 || !runs.some((r) => !hasStarted(r) && !r.cancelledAt)) return new Map();
  const needs: Array<Pick<Run, 'id' | 'createdAt'> & { inFlight: boolean; wants: boolean }> = [];
  for (const run of runs) {
    let steps: Workflow[];
    try { steps = stepsOf(run); } catch { continue; }
    const { views, phaseOf } = await taskPhases(e, run);
    const { asks, rounds } = readAsks(run.id);
    const a = assess(steps, run, phaseOf, closeoutReader(views, run), closeoutAsked(views), exitVerdicts(views, run), asks, rounds, harnessBlocked(views), spendReader(views));
    const parent = await parentsOf(e, run);
    needs.push({ id: run.id, createdAt: run.createdAt, ...slotNeed(run, phaseOf, a, (id) => parent(id).shipped, steps) });
  }
  return heldRuns(needs, cap);
}
