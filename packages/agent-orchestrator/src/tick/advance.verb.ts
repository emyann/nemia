/**
 * One pass over one run (`advance`): read the world, decide, file what became ready, and write the run's record, which this file alone
 * writes. Beside it, the filings a pass made and died before writing down, adopted onto the record (`adoptChecks`, `adoptTries`,
 * `adoptRounds`, `unrecordedSteps`), and the tasks held open it closes or answers (`closeWaitingTasks`). Those are here, and not beside the
 * verbs that call them first (`cancel`, `forget`, `prune`), because they write the record by the tick's own judgement: those verbs import
 * this file, and it imports none of them. A controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Engine, TaskView } from '../runtime-client.ts';
import { CHECK_DEADLINE_SECONDS, checkBrief, type Verdict } from '../check/check.ts';
import { isRemoteHarness, modeOf, sessionContext, type Workflow } from '../workflow.ts';
import { folderPlace } from '../record/places.store.ts';
import { tipBranches, tipsSeen } from '../branches/branches.ts';
import { inFlight, runAdmitted, slotNeed, slotWord, takesNoSlot, type RunSlot } from '../cap/cap.ts';
import { endingAsked, filedDenies } from '../ending/ending.ts';
import { holdsOpen } from '../gate/gate.ts';
import { checkTaskId, isGitRun, stepTaskId, tryOf, type CloseoutAsked, type Run, type TaskPhase } from '../record/record.ts';
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
} from '../status/status.ts';
import { hasStarted, holdsOf, runReady, waitsOf, type Wait } from '../wait/wait.ts';
import { handOffDue } from '../workspace/workspace.ts';
import { assess, type Assessment } from './assess.ts';
import { composeBrief, remoteBrief, type EndingStopped } from '../brief/index.ts';
import { feedPhase, feedWords, type FeedWords } from '../feed/feed.ts';
import { listing } from '../list/list.ts';
import { roundFiled, roundsDue } from '../round/round.ts';
import { closeoutSchemaOf, parseCloseout, type Closeout } from '../closeout/closeout.ts';
import { modeWord, nextTry, retriesDue, sessionModel, turnsOf, type RetryAsk } from '../retry/index.ts';
import {
  artifactsDir,
  cancelFile,
  checkStderr,
  consumeAsks,
  holdFile,
  inputsDir,
  pruneFile,
  removeHold,
  readAnswers,
  readAsks,
  rewriteRun,
  runFile,
  runsDir,
  stepsOf,
} from '../record/record.store.ts';
import { checkoutParts } from '../workspace/worktree.store.ts';
import { gitSays, handOff, workspaceFor } from '../workspace/worktree.store.ts';
import { collectArtifacts } from '../artifacts.ts';
import { refsOf } from '../branches.ts';
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
  refusalOf,
  saidCount,
  saidIn,
  sessionIn,
  spendReader,
  taskPhases,
  waitingOf,
} from '../views/views.verb.ts';
import { engineWord, waitsForWord } from '../views/views-words.ts';
import { within } from '../meter/tally.store.ts';
import { checkoutHold, landEnding } from '../ending/ending.verb.ts';
import { localFields, parentCloseouts, toldOf } from './file.verb.ts';

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
export async function advanceRun(
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
