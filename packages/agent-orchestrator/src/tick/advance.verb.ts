/**
 * One pass over one run (`advance`, `advanceRun`): read the world, adopt, stop a cancelled run's tasks, hand off, land an ending, lift a
 * hold, close the tasks held open, admit, and word the feed; then file through `file.verb.ts`, which holds the filings and the nudge that
 * answers a task held open; then keep the tips and write the run's record, which this file alone writes. Beside it, the filings a pass
 * made and died before writing down, adopted onto the record (`adoptChecks`, `adoptTries`, `adoptRounds`, `unrecordedSteps`), the steps
 * owed a hand-off (`handOffOwed`), and the tasks held open it closes (`closeWaitingTasks`). Those are here, and not beside the verbs that
 * call them first (`cancel`, `forget`, `prune`), because they write the record by the tick's own judgement: those verbs import this file,
 * and it imports none of them. A controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import fs from 'node:fs';
import type { Engine, TaskView } from '../runtime-client.ts';
import type { Verdict } from '../check/check.ts';
import type { Workflow } from '../workflow.ts';
import { folderPlace } from '../record/places.store.ts';
import { tipBranches, tipsSeen } from '../branches/branches.ts';
import { inFlight, runAdmitted, slotNeed, slotWord, takesNoSlot, type CheckoutHold, type RunSlot } from '../cap/cap.ts';
import { endingAsked } from '../ending/ending.ts';
import { holdsOpen } from '../gate/gate.ts';
import { checkTaskId, isGitRun, stepTaskId, tryOf, type CloseoutAsked, type Run, type TaskPhase } from '../record/record.ts';
import { budgetOf, landsOnCheck, sentBack, stepStatus, type RoundAsk, type SpendOf } from '../status/status.ts';
import { hasStarted, holdsOf, runReady, waitsOf, type Wait } from '../wait/wait.ts';
import { handOffDue } from '../workspace/workspace.ts';
import { assess, type Assessment } from './assess.ts';
import { feedPhase, feedWords, type FeedWords } from '../feed/feed.ts';
import { listing } from '../list/list.ts';
import { roundFiled, roundsDue } from '../round/round.ts';
import type { Closeout } from '../closeout/closeout.ts';
import { nextTry, retriesDue, turnsOf, type RetryAsk } from '../retry/index.ts';
import { runsDir, stepsOf } from '../record/record.store.ts';
import { runStore } from '../record/files.store.ts';
import { handOff } from '../workspace/worktree.store.ts';
import { collectArtifacts } from '../artifacts/artifacts.store.ts';
import { refsOf } from '../branches/branches.store.ts';
import { restBlockers, type RestFacts } from '../rest/rest.ts';
import {
  answersIn,
  closeoutAsked,
  closeoutOf,
  closeoutReader,
  exitVerdicts,
  harnessBlocked,
  parentOf,
  parentsOf,
  saidCount,
  spendReader,
  taskPhases,
  waitingOf,
} from '../views/views.verb.ts';
import { engineWord, waitsForWord } from '../views/views-words.ts';
import { within } from '../meter/tally.store.ts';
import { checkoutHold, landEnding } from '../ending/ending.verb.ts';
import { fileChecks, fileReady, fileRounds, fileTries, mayFileOf, type Closer, type Filing, type PassReads } from './file.verb.ts';
import { closeHeld, stopAsked } from './held.verb.ts';

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
 * One pass over one run: tick the engine, then file whatever became ready.
 *
 * Level-triggered, like everything under it: it reads the current state of each task and decides,
 * so it is safe to run repeatedly, safe to interrupt, and correct after a restart with no memory
 * of what it did last time.
 *
 * `slot` is the cap on runs in flight as `tick` judges this run (`runAdmitted`): a run with nothing filed files its roots only while a slot
 * is free, and the first pass that holds it writes when (`slotHeldAt`). Left out, nothing holds it.
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
 *
 * @param runs The pass's own listing of the store, which `run` is one of: the runs whose claims on the repository's checkout are read
 *   (`checkoutHold`). Left out, the store is listed afresh where the run's ending asks for the checkout.
 */
export async function advanceRun(
  e: Engine,
  run: Run,
  slot?: RunSlot,
  runs?: readonly Run[],
): Promise<{ advanced: Advanced; blockers: string[]; rest?: { tipped: string[] } }> {
  const { reads, askNotes } = await readPass(e, run);
  const { steps, phaseOf, signedOff, asked, verdictOf, sessionBlocked, spendOf, asks, roundAsks } = reads;
  const adopted = await adoptAll(e, run, reads);
  if (run.cancelledAt) await stopCancelled(e, run, reads);
  const handed = handOffAll(run, reads);
  const landing = landEnding(run, steps, phaseOf, signedOff, asked, spendOf, verdictOf);
  const checkout = await checkoutHold(e, run, steps, runs);
  const liftNotes = await liftHold(e, run);
  const assessed = assess(steps, run, phaseOf, signedOff, asked, verdictOf, asks, roundAsks, sessionBlocked, spendOf, [], checkout);
  const closer = closerOf(e, reads.views);
  const closeNotes = await closeHeldOpen(run, reads, closer);
  const admission = await admit(e, run, slot, reads, assessed);
  const feed = wordFeed(run, reads, assessed, admission, checkout);

  const notes: string[] = [...askNotes, ...handed.collected, ...landing.notes, ...liftNotes, ...closeNotes];
  const f: Filing = { e, run, reads, closer, mayFile: mayFileOf(run), notes };
  const { tried, rechecked } = await fileTries(f, assessed.retry);
  const looped = await fileRounds(f, assessed.round);
  const checked = await fileChecks(f, [...assessed.check, ...rechecked]);
  const filed = await fileReady(f, admission.ready, admission.starting);
  const heldFirst = holdFirst(f, admission.held, assessed.ready);
  const { tipped, tips } = keepTips(run, steps, assessed.status);
  const wrote =
    [filed, checked, tried, looped, adopted].some((names) => names.length > 0) ||
    Boolean(tips || heldFirst || handed.marked || landing.landed);
  if (wrote) runStore.runs.rewrite(run);
  runStore.asks.consume(run, asks, roundAsks);

  const done = { filed, checked, tried, looped, notes, feed };
  return answerOf(run, reads, assessed, admission, done, { acted: wrote || closer.closed.size > 0, tipped });
}

/** A pass's reads of a run, before it adopts or files anything: the engine's views of its tasks, the readers made of them, and its asks. */
async function readPass(e: Engine, run: Run): Promise<{ reads: PassReads; askNotes: string[] }> {
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run, { earlierTries: underBudget(steps, run) });
  const signedOff = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  const verdictOf = exitVerdicts(views, run);
  const sessionBlocked = harnessBlocked(views);
  const spendOf = spendReader(views);
  const { asks, rounds: roundAsks, notes: askNotes } = runStore.asks.read(run.id);
  return { reads: { steps, views, phaseOf, signedOff, asked, verdictOf, sessionBlocked, spendOf, asks, roundAsks }, askNotes };
}

/**
 * Adopt what a pass before this one filed and never wrote down: its rounds, then its tries, then its checks. Answers with every step
 * adopted.
 */
async function adoptAll(e: Engine, run: Run, r: PassReads): Promise<string[]> {
  const rounds = await adoptRounds(e, run, r.steps, r.views, r.phaseOf, r.signedOff, r.asked, r.roundAsks, r.spendOf);
  const tries = await adoptTries(e, run, r.steps, r.views, r.phaseOf, r.signedOff, r.asked, r.verdictOf, r.asks, r.spendOf);
  const checks = await adoptChecks(e, run, r.steps, r.views, r.phaseOf, r.signedOff, r.asked, r.spendOf);
  return [...rounds, ...tries, ...checks];
}

/**
 * Stop a cancelled run's tasks in flight, those a pass filed and never wrote down included: none the engine was already asked to stop. A
 * stop the engine refuses (`stopAsked`) is one of a task that settled or was asked to stop since this pass read it: nothing left to do.
 */
async function stopCancelled(e: Engine, run: Run, r: PassReads): Promise<void> {
  const unrecorded = await unrecordedSteps(
    e,
    run,
    r.steps,
    r.views,
    r.phaseOf,
    r.signedOff,
    r.asked,
    r.verdictOf,
    r.asks,
    r.roundAsks,
    r.spendOf,
  );
  const live = unrecorded.filter(({ taskId }) => ['pending', 'running'].includes(r.phaseOf(taskId)));
  for (const { taskId } of [...inFlight(run, r.phaseOf), ...live]) {
    if (!r.views.get(taskId)?.state.stopRequested) await stopAsked(e, taskId);
  }
}

/**
 * Hand off every step owed it (`handOffOwed`) while the run is there, and collect what each named: answers with the notes collecting said,
 * and whether a hand-off was marked on the record.
 */
function handOffAll(run: Run, r: PassReads): { collected: string[]; marked: boolean } {
  let marked = false;
  const collected = within('act', () =>
    handOffOwed(r.steps, run, r.phaseOf).flatMap((name) => {
      if (!runStore.runs.exists(run.id)) return [];
      const record = run.steps[name];
      let handed: ReturnType<typeof handOff>;
      if (isGitRun(run)) handed = handOff(record.workspace!, name);
      else folderPlace(runsDir()).handOff(run, name);
      if (!(handed && 'error' in handed)) {
        run.steps[name] = { ...record, handedOff: record.taskId! };
        marked = true;
      }
      return collectArtifacts(run, name, r.signedOff(name));
    }),
  );
  return { collected, marked };
}

/** Lift a person's hold once every run it names has shipped, and only the hold this pass read (`removeHold`): answers with its note. */
async function liftHold(e: Engine, run: Run): Promise<string[]> {
  if (!run.hold || run.cancelledAt || !run.hold.until.length) return [];
  let shipped = true;
  for (const id of run.hold.until) if (!(shipped = (await parentOf(e, id)).shipped)) break;
  if (!shipped || !runStore.holds.lift(run.id, run.hold.at)) return [];
  const { until } = run.hold;
  delete run.hold;
  return [
    `the hold is lifted: ${until.length > 1 ? `${until.slice(0, -1).join(', ')} and ${until.at(-1)} have` : `${until[0]} has`} shipped`,
  ];
}

/** The pass's closer (`Closer`), with the tasks waiting for a word as the pass read them (`waits`) and those it closed (`closed`). */
type PassCloser = Closer & { waits: (taskId: string) => boolean; closed: Set<string> };

/** One closer for the pass: every close it makes, the sweep's and the filings', counted in one `closed`. */
function closerOf(e: Engine, views: ReadonlyMap<string, TaskView>): PassCloser {
  const waits = waitsForWord(views);
  const closed = new Set<string>();
  const closeWaiting = async (name: string, taskId: string): Promise<string | undefined> => {
    const refused = await closeHeld(e, taskId);
    if (!refused) closed.add(taskId);
    return refused && `${name}: ${refused}`;
  };
  const awaitsWord = (taskId: string | null | undefined): boolean => Boolean(taskId && waits(taskId) && !closed.has(taskId));
  return { closeWaiting, awaitsWord, waits, closed };
}

/** Close each step's task held open that waits for a word nobody is to give (`holdsOpen`): answers with the engine's refusals, worded. */
async function closeHeldOpen(run: Run, r: PassReads, closer: PassCloser): Promise<string[]> {
  const notes: string[] = [];
  for (const step of r.steps) {
    const taskId = run.steps[step.name]?.taskId;
    if (!taskId || !closer.waits(taskId) || holdsOpen(step, run, r.phaseOf, r.signedOff, r.asked, r.steps, r.spendOf, r.verdictOf))
      continue;
    const refused = await closer.closeWaiting(step.name, taskId);
    if (refused) notes.push(refused);
  }
  return notes;
}

/**
 * Whether the run files its roots on this pass: the runs it waits on as they stand (`parent`), whether it has started, what it needs of a
 * slot (`slotNeed`), the slot it is held at, the steps it files, and the runs whose shipping it waits on (`waitsOf`).
 */
type Admission = {
  parent: Awaited<ReturnType<typeof parentsOf>>;
  starting: boolean;
  need: ReturnType<typeof slotNeed>;
  held: RunSlot | undefined;
  ready: string[];
  waiting: Wait[];
};

/** Admit the run's ready steps: while it has nothing filed, once every run it waits on has shipped and the cap leaves it a slot. */
async function admit(e: Engine, run: Run, slot: RunSlot | undefined, r: PassReads, assessed: Assessment): Promise<Admission> {
  const parent = await parentsOf(e, run);
  const starting = !hasStarted(run);
  const need = slotNeed(run, r.phaseOf, assessed, (id) => parent(id).shipped, r.steps);
  const admitted = runAdmitted(run, slot, r.steps);
  const held = need.wants && !admitted ? slot : undefined;
  const ready = runReady(run, (id) => parent(id).shipped) && admitted ? assessed.ready : [];
  return { parent, starting, need, held, ready, waiting: waitsOf(run, parent) };
}

/** The feed's words for the run and each step (`feedWords`), off what the pass read before it filed anything. */
function wordFeed(run: Run, r: PassReads, assessed: Assessment, admission: Admission, checkout: CheckoutHold | undefined): FeedWords {
  const { views, steps } = r;
  return feedWords(
    listing(
      steps,
      run,
      (taskId) => feedPhase(engineWord(views)(taskId)),
      (name) => closeoutOf(views, run, name),
      r.asked,
      r.verdictOf,
      r.asks,
      r.roundAsks,
      runStore.asks.answers(run.id),
      admission.waiting,
      saidCount(views, run),
      r.spendOf,
      admission.held,
      [],
      checkout,
      waitingOf(views),
      undefined,
      holdsOf(run, admission.parent),
    ),
    run,
    assessed,
    (name) => closeoutOf(views, run, name),
  );
}

/** Write when the cap first held the run (`slotHeldAt`), and say so once, while the pass may file still: answers whether it did. */
function holdFirst(f: Filing, held: RunSlot | undefined, ready: readonly string[]): boolean {
  const heldFirst = Boolean(held && !f.run.slotHeldAt && f.mayFile());
  if (heldFirst) {
    f.run.slotHeldAt = new Date().toISOString();
    f.notes.push(`${ready.join(', ')}: ${slotWord(held!)} — filed once a run in flight settles`);
  }
  return heldFirst;
}

/** Keep each result branch's tip as git has it (`tipsSeen`), on the record where one moved: the branches read, and the tips kept. */
function keepTips(run: Run, steps: readonly Workflow[], status: Assessment['status']): { tipped: string[]; tips: Run['tips'] | undefined } {
  const tipped = isGitRun(run) ? tipBranches(run, steps, status) : [];
  const tips = tipped.length && isGitRun(run) ? tipsSeen(run, tipped, refsOf(run.repo, tipped)) : undefined;
  if (tips) run.tips = tips;
  return { tipped, tips };
}

/** What a pass filed and said, as `Advanced` carries it. */
type Done = Pick<Advanced, 'filed' | 'checked' | 'tried' | 'looped' | 'notes' | 'feed'>;

/**
 * The pass's answer: what it did (`Advanced`), what holds the run out of rest (`restBlockers`), and at rest the branches it read the tips
 * of. `acted` says the pass wrote the record or closed a task.
 */
function answerOf(
  run: Run,
  r: PassReads,
  assessed: Assessment,
  admission: Admission,
  done: Done,
  pass: { acted: boolean; tipped: string[] },
): { advanced: Advanced; blockers: string[]; rest?: { tipped: string[] } } {
  const { steps, views, phaseOf, asks } = r;
  const { held, waiting } = admission;
  const { filed, checked, tried, looped, notes, feed } = done;
  const { status, blocked } = assessed;
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
    inFlight: !takesNoSlot(steps) && (admission.need.inFlight || [filed, checked, tried, looped].some((names) => names.length > 0)),
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
    acted: pass.acted,
    handOffDue: handOffOwed(steps, run, phaseOf),
    landingOwed: steps.some((s) => landsOnCheck(s, run) && Boolean(run.steps[s.name]?.taskId) && !run.steps[s.name]?.landed),
    checkoutAsked: Boolean(ending && !run.cancelledAt && endingAsked(run, ending, asks) !== undefined),
  };
  const blockers = restBlockers(facts);
  return { advanced, blockers, ...(blockers.length ? {} : { rest: { tipped: pass.tipped } }) };
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
 * Close each step's task held open that waits for a word, for a verb that ends what the run waits on — `wf cancel`, `wf rm` — at once
 * rather than on the next pass. A close is no stop: nothing is running, and the engine settles the task as it signed. Only a step's current
 * task can wait: a try or a round filed as a task of its own closed the one before it. What the engine refuses is returned, worded, and a
 * cancelled run's next pass closes it again (the sweep in `advance`).
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
