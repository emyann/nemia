/**
 * One pass over one run (`advanceRun`, `advancePass`): read the world, adopt, stop a cancelled run's tasks, hand off, land an ending, lift
 * a hold, close the tasks held open, admit, and word the feed; then file through `file.verb.ts`, which holds the filings and the continue
 * that answers a task held open; then keep the tips and write the run's record, which this file alone writes. Beside it, the filings a
 * pass made and died before writing down, adopted onto the record (`adoptChecks`, `adoptTries`, `adoptRounds`, `unrecordedSteps`), the
 * steps owed a hand-off (`handOffOwed`). Those are here, and not beside the verbs
 * that call them first (`cancelRun`, `forgetRun`, `prune`), because they write the record by the tick's own judgement: those verbs import
 * this file, and it imports none of them. A controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import fs from 'node:fs';
import { Effect } from 'effect';
import { EngineService, asked as engineAsked, denialText, over, type Engine, type TaskView } from '../runtime-client.ts';
import { wordFeed } from '../feed/word-feed.verb.ts';
import { StoreRoot } from '../config/root.store.ts';
import type { Verdict } from '../check/check.ts';
import type { Workflow } from '../workflow.ts';
import { folderPlace } from '../record/places.store.ts';
import { tipBranches, tipsSeen } from '../branches/index.ts';
import { inFlight, runAdmitted, slotNeed, slotWord, takesNoSlot, type RunSlot } from '../cap/cap.ts';
import { endingAsked } from '../ending/ending.ts';
import { holdsOpen } from '../gate/gate.ts';
import { checkTaskId, isRepositoryRun, stepTaskId, tryOf, type CloseoutAsked, type Run, type TaskPhase } from '../record/record.ts';
import { budgetOf, landsOnCheck, sentBack, stepStatus, type RoundAsk, type SpendOf } from '../status/status.ts';
import { hasStarted, runReady, waitedOn, waitsOf, type ParentRun, type Wait } from '../wait/wait.ts';
import { behindNow, followPass, pinPass, pinsWritten, type PinnedPass } from '../revisions/pin.verb.ts';
import { handOffDue } from '../workspace/workspace.ts';
import { filesDue } from '../artifacts/artifacts.ts';
import { inParts } from '../brief/index.ts';
import { assess, type Assessment } from './assess.ts';
import type { FeedWords } from '../feed/index.ts';
import { roundFiled, roundsDue } from '../round/round.ts';
import type { Closeout } from '../closeout/index.ts';
import { nextTry, pauseAsksVoid, retriesDue, turnsOf, type RetryAsk } from '../retry/index.ts';
import { runsDir, stepsOf } from '../record/record.store.ts';
import { runStore } from '../record/files.store.ts';
import { collectArtifacts, filesLacked, handCloseout } from '../artifacts/artifacts.store.ts';
import {
  headsFor,
  headsNow,
  NOTHING_READ,
  standingLive,
  standingNow,
  standingReader,
  type PassStanding,
} from '../standing/standing.verb.ts';
import { restBlockers, type RestFacts } from '../rest/index.ts';
import {
  answersIn,
  closeoutAsked,
  closeoutReader,
  everyTryOf,
  exitVerdicts,
  harnessBlocked,
  keptParent,
  parentsRead,
  passParents,
  spendReader,
  taskPhasesRead,
  type Parents,
} from '../views/views.verb.ts';
import { waitsForWord } from '../views/views-words.ts';
import { withinEffect } from '../meter/tally.store.ts';
import { PlaceService, type Place } from '../place/place.store.ts';
import { onceFacts, roundsGranted, settledOnce, timelineFacts, type StepFact } from '../meter/index.ts';
import { checkoutHold, landEnding } from '../ending/ending.verb.ts';
import { statusMemo } from '../place/landing.store.ts';
import type { PassRead } from '../cap/cap.verb.ts';
import { fileChecks, fileReady, fileRounds, fileTries, type Closer, type Filing, type Heads, type PassReads } from './file.verb.ts';
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
export const adoptChecks = Effect.fn('adoptChecks')(function* (
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  views: Map<string, TaskView>,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  asked: (taskId: string) => CloseoutAsked,
  spendOf: SpendOf,
) {
  const adopted: string[] = [];
  for (const step of steps) {
    if (run.steps[step.name]?.check || stepStatus(step, run, phaseOf, closeoutOf, asked, steps, spendOf) !== 'checking') continue;
    const taskId = checkTaskId(run, step.name);
    const view = yield* engineAsked('view', e.view(taskId));
    if (!view.state.brief) continue;
    views.set(taskId, view);
    run.steps[step.name] = { ...run.steps[step.name], check: { taskId } };
    adopted.push(step.name);
  }
  return adopted;
});

/**
 * Tries a pass filed and never wrote down, put back on the record — in memory, as `adoptChecks` does, and before anything asks what is in
 * flight, for the same reason: a run cancelled in that window files no more tries, so a try filed in it would otherwise never be adopted,
 * nor stopped. A task the engine holds no brief for is left for the pass to file.
 *
 * Looked for only where a try is due (`retriesDue`, cancelled or not): an ask for the step's next try, or a refused check `retries:`
 * covers. A run waiting on a person with nothing asked costs no look.
 *
 * A person's continue a pass gave as an answer to the step's task held open, and died before writing down, shows as a task with more answers
 * than the record has turns (`answersIn`, `turnsOf`): the answered task reads running, so the ask reads as one to stop it first. It is
 * adopted as the turn it is, and nothing is stopped and nothing filed.
 */
export const adoptTries = Effect.fn('adoptTries')(function* (
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
) {
  const adopted: string[] = [];
  for (const r of retriesDue(steps, run, phaseOf, closeoutOf, asked, verdictOf, asks, () => false, spendOf)) {
    const current = run.steps[r.step]?.taskId;
    if (r.by === 'ask' && r.mode === 'continue' && current && answersIn(views.get(current)) > turnsOf(run.steps[r.step])) {
      run.steps[r.step] = nextTry(run.steps[r.step], r, current);
      adopted.push(r.step);
      continue;
    }
    const taskId = r.mode === 'recheck' ? checkTaskId(run, r.step, r.try) : stepTaskId(run, r.step, r.try);
    const view = yield* engineAsked('view', e.view(taskId));
    if (!view.state.brief) continue;
    views.set(taskId, view);
    const record = run.steps[r.step];
    run.steps[r.step] = r.mode === 'recheck' ? { ...nextTry(record, r), check: { taskId } } : nextTry(record, r, taskId);
    for (const b of r.back ?? []) run.steps[b] = sentBack(run.steps[b]);
    adopted.push(r.step);
  }
  return adopted;
});

/**
 * Rounds a pass filed and never wrote down, put back on the record — in memory, and before anything asks what is in flight, as `adoptTries`
 * does and for its reason.
 *
 * Looked for only where a round is due (`roundsDue`, cancelled or not), under the target's next try's id. A pass that filed the round and
 * died left the looping step's `again: true` on the record, so the round reads due again; finding its task filed, this moves the loop on as
 * the pass would have (`roundFiled`), and nothing is filed twice. A task the engine holds no brief for is left for the pass to file.
 */
export const adoptRounds = Effect.fn('adoptRounds')(function* (
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  views: Map<string, TaskView>,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  asked: (taskId: string) => CloseoutAsked,
  asks: readonly RoundAsk[],
  spendOf: SpendOf,
) {
  const adopted: string[] = [];
  for (const r of roundsDue(steps, run, phaseOf, closeoutOf, asked, asks, spendOf)) {
    const taskId = stepTaskId(run, r.target, tryOf(run, r.target) + 1);
    const view = yield* engineAsked('view', e.view(taskId));
    if (!view.state.brief) continue;
    views.set(taskId, view);
    Object.assign(run.steps, roundFiled(steps, run, r, taskId));
    if (r.merge && isRepositoryRun(run)) run.baseRef = r.merge.sha;
    adopted.push(r.step);
  }
  return adopted;
});

/**
 * Steps a pass filed and never wrote down: each step `assess` calls ready — blind to a cancellation, as a pass that read the run before it
 * was called off calls it — whose task, under the id that pass files it by, the engine holds. Looked up as `adoptChecks` looks up a check,
 * and put in `views`; it answers with them and changes nothing on the run. `forget` adopts them in memory, so a step being filed is in
 * flight, and `advance` stops them on a cancelled run, whose record would otherwise hide them from every stop.
 */
export const unrecordedSteps = Effect.fn('unrecordedSteps')(function* (
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
) {
  const { cancelledAt: _, ...live } = run;
  const { ready } = assess(steps, live, phaseOf, closeoutOf, asked, verdictOf, asks, rounds, () => false, spendOf);
  const found: Array<{ name: string; taskId: string }> = [];
  for (const name of ready) {
    const taskId = stepTaskId(run, name, tryOf(run, name));
    const view = views.get(taskId) ?? (yield* engineAsked('view', e.view(taskId)));
    if (!view.state.brief) continue;
    views.set(taskId, view);
    found.push({ name, taskId });
  }
  return found;
});

/**
 * One pass's work: the steps it filed, the steps whose checks it filed, the steps it tried again, and where the run stands — and `notes`,
 * each line starting with its step: what cutting a worktree had to say (a path `.worktreeinclude` lists that the main checkout does not
 * have, a line it refused, an `npm ci` that ran or failed), each try and each round filed and on whose word, a blocked session the engine
 * was asked to stop for a try, and an ask file that cannot be read. `looped` names the looping steps whose loop this pass took round again.
 * `facts` are what the metrics record of the run's steps (`StepFact`): each of its tasks the pass reads settled and not counted before
 * (`settledOf`) with the waits they ended, each round granted, each gate wait not timed and each denied call not counted before
 * (`markedOnce`), and each number of the run's timeline once it is over (`timedOnce`); absent where there is none.
 * `waiting` names the runs whose landing this run's roots wait on (`waitsOf`). `inFlight` says the run counts against the cap on runs in
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
  unreachable: string[];
  notes: string[];
  waiting: Wait[];
  inFlight: boolean;
  held?: RunSlot;
  facts?: StepFact[];
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
export const advanceRun = Effect.fn('advance')(function* (run: Run, slot?: RunSlot) {
  const e = yield* EngineService;
  return (yield* advancePass(e, run, slot)).advanced;
});

/**
 * `advanceRun`, over the engine `e`, and whether the run is at rest once the pass is done (`atRest`): `blockers` names each clause that
 * holds it out (`restBlockers`), and a run with none carries `rest`, the branches whose tips the next pass would read (`tipBranches`),
 * which is all of git a pass asks of a run at rest.
 *
 * The pass reads a person's asks afresh, adopts what a pass before it filed and never wrote down, and then, in this order:
 * - stops a cancelled run's tasks, on every pass and not only in `nemia cancel`, which stops what it saw in flight: a step filed after it
 *   looked, and one a pass filed and died before writing down (`unrecordedSteps`), are stopped too. A task the engine already holds a
 *   stop request for is not asked again.
 * - hands off every finished step, failed and stopped too (`handOffOwed`): commits what it left uncommitted and collects what it named
 *   from its workspace root (`collectArtifacts`), before its check is filed and before a later step merges it or works in its workspace.
 *   A merge carries commits, not working trees, so the run commits what a step leaves, as every step is told (`closeoutContract`).
 *   Nothing is handed off for a run `nemia rm` forgot after this pass read it: a `--no-worktree` run's workspace is a person's checkout. A
 *   hand-off is marked once for the try, unless git refused the commit, which the next pass tries again; a mark made is always written,
 *   or the next pass would commit a person's edits as the step's.
 * - lands or aborts an ending's staged merge (`landEnding`) before anything reads where the ending stands, so the pass that lands it
 *   reads it landed, and no try of it is filed over a merge still staged.
 * - holds this run's ending while another run's works in the repository's checkout (`checkoutHold`), read from the world on this pass,
 *   what it has filed included, so the order a pass takes the runs in decides nothing.
 * - lifts a person's hold on the pass that reads every run it names landed (`keptParent`), and goes on on that pass. A lift sticks, as a
 *   start after `--after` does; only the hold this pass read is lifted (`removeHold`), so one put again since stays; and one that names
 *   no run is never lifted here (`holdAdvice`).
 * - closes each step's task held open that waits for a word nobody is to give (`holdsOpen`): an ungated step that signed off, a gate a
 *   person approved, a run called off. What waits on it is filed on this same pass, since the run reads it settled once it signed
 *   (`phaseOfView`); a close the engine refuses is a note, and asked again by the next pass.
 * - files a run's roots only while it has nothing filed, once every run it waits on (`--after`) has landed (`runReady`), and while the
 *   cap on runs in flight leaves it a slot (`runAdmitted`); a run that has started never reads its parents again.
 * - words the feed (`feedWords`) off what it read before it filed anything, and reads nothing again for it: a step it files reaches the
 *   feed on the next pass, as the engine's `pending`.
 * - files the tries due, then the rounds, then the checks, then the ready steps, each under the id the run derives and looked up first,
 *   since filing an id the engine already holds would journal it twice. Before each filing it reads the store again (`mayFile`): a run
 *   called off, forgotten, pruned or held while the pass was at work — a worktree cut can take minutes — is filed nothing more on this
 *   pass, and a worktree cut for it stays for `nemia rm` to find. A step's files directory is made before its brief names it, and again for
 *   its check, for a step filed without one.
 * - writes when, on the first pass the cap holds the run (`slotHeldAt`), what its wait for a slot is counted from, and says so once.
 * - marks each approval at a gate whose wait it hands the metrics as timed (`gatesTimed`), on the pass that first reads it, and each
 *   session's attempts whose denied calls it hands them as counted (`deniedCounted`), both by `markedOnce`. A gate approved on a try
 *   that answered an earlier try's session is timed only while `runTimed` is `false`, which `markedOnce` reads before `timedOnce`
 *   writes it.
 * - reads the files each step that just signed off named in its closeout, once a task, and keeps that it read them and those the run
 *   does not have (`readFiles`), so the step reads `unsigned` before any check of it is filed.
 * - marks each task whose settle it hands the metrics as counted (`settlesCounted`, `settledOnce`), on the pass that first reads it
 *   settled.
 * - hands the metrics the run's timeline on the first pass that reads it over with nothing in flight, and marks it (`runTimed`,
 *   `timedOnce`).
 * - keeps the tip of each result branch as git has it (`tipsSeen`), written only when a tip moved, so git can still be asked whether a
 *   branch a person deleted after its merge is on the base (`BranchReader.landed`).
 * - writes the record (`rewriteRun`) only where the pass changed it and only while it is there, then consumes the asks it holds
 *   (`consumeAsks`), never before: an ask a pass died before consuming is consumed by the next. An ask `nemia pause --now` wrote that is
 *   void on this pass (`pauseAsksVoid`) is consumed with them, paused or not.
 *
 * A try goes on in the workspace and on the branch the step had, under its next try's id; an ending the work is sent back from moves behind
 * in the same write, so it waits for the work again (`sentBack`). A try of a step whose task has not settled — its session blocked by its
 * harness, or asked for while it was and working again since — stops the session and files nothing; a later pass, once the task has
 * settled, files the try. A recheck files no session, only its check, under the new try's id. A person's continue of a step whose task is held
 * open and waits for their word is that task's next turn, in the session that signed, under the same id (`answerHeld`); any other try, and
 * every round, of a task that waits closes it first and is filed as a task of its own. A continue with no session left starts a new
 * one, and its brief says so. A new session of a loop's target within a round is handed the round's findings off the looping step's try
 * that asked (`askingTry`). A round continues the target's session under its next try's id, and every other step of the loop moves behind,
 * unfiled, for a later pass to file (`roundFiled`).
 *
 * A check is filed on the `check` harness, so it outlives the pass, has a deadline, and is stopped by a cancel; its command is the one
 * the run froze, never the workspace's it judges. It is filed once, with no attempt again: a suite run until it passes would let a
 * flaky suite decide what lands. An ending's check gets no `WF_BASE_REF`: it judges the merge staged in the checkout against HEAD, and
 * installs first what that merge's lockfile asks for (`checkoutParts`). Nothing is ready on a check in the pass that files it.
 *
 * A run that waited on runs cuts its roots, and every worktree and diff after, from its base branch as it stands on the pass that files
 * them, with their work on it, and hands each root what they concluded (`parentCloseouts`); read on that pass, and never again.
 *
 * Its span is annotated with the run, `run`, and so is every log said within it, the runtime's included; a filing of a step adds the
 * step, `step`, to the runtime's spans and logs under it (`forStep`).
 *
 * @param pass What the pass reads once for every run (`PassRead`): its own listing of the store, which `run` is one of, whose claims on the
 *   repository's checkout are read (`checkoutHold`), the runs the cap holds, and the runs others wait on, which lifting a hold (`liftHold`)
 *   and admitting the run (`admit`) read through. Left out, the store is listed afresh where the run's ending asks for the checkout, and
 *   the runs this run waits on are read for this call alone.
 */
export const advancePass = Effect.fn('advancePass')(
  function* (e: Engine, run: Run, slot?: RunSlot, pass?: PassRead) {
    yield* Effect.annotateCurrentSpan({ run: run.id });
    const revisions = pass?.revisions;
    const took = pinPass(run, new Date().toISOString(), revisions);
    const { reads, askNotes } = yield* readPass(e, run);
    const { steps, phaseOf, signedOff, asked, verdictOf, sessionBlocked, spendOf, asks, roundAsks } = reads;
    const adopted = yield* adoptAll(e, run, reads);
    if (run.cancelledAt) yield* stopCancelled(e, run, reads);
    const place = yield* PlaceService;
    const handed = yield* withinEffect('act', handOffAll(run, reads, place));
    const lacking = readFiles(run, reads);
    const heads = headsOf(run, handed.marked ? undefined : pass?.standing, place);
    const memo = statusMemo((r) => (r.id === run.id ? heads() : pass ? headsFor(pass.standing, r) : headsNow(r, place)), place);
    const landing = landEnding(run, steps, phaseOf, signedOff, asked, spendOf, verdictOf, memo);
    const parents = pass?.parents ?? passParents(readsOthers(run) ? yield* standingLive([run]) : standingReader(NOTHING_READ));
    const from = pass
      ? { read: pass, slot }
      : { standing: standingNow(runStore.runs.list()).pipe(Effect.provideService(PlaceService, place)) };
    const checkout = yield* checkoutHold(e, run, steps, from, process.env, memo);
    const lift = yield* liftHold(e, run, parents);
    const assessed = assess(steps, run, phaseOf, signedOff, asked, verdictOf, asks, roundAsks, sessionBlocked, spendOf, [], checkout);
    const settled = settledOf(run, reads);
    const marked = markedOnce(run, reads);
    const timed = yield* timedOnce(e, run, reads, assessed.status);
    const closer = closerOf(e, reads.views);
    const closeNotes = yield* closeHeldOpen(run, reads, closer);
    const admission = yield* admit(e, run, slot, reads, assessed, parents);
    const feed = wordFeed(
      run,
      reads,
      assessed,
      admission,
      checkout,
      lift.lifted,
      behindNow(run, assessed.status === 'succeeded', revisions),
    );
    const { followed, pinned, ...due } = followedDue(run, took, assessed, admission, revisions);

    const notes: string[] = [...askNotes, ...handed.collected, ...lacking.notes, ...landing.notes, ...lift.notes, ...closeNotes];
    notes.unshift(...took.notes);
    notes.push(...followed.notes);
    const f: Filing = { e: { ...e, file: (spec) => e.file(inParts(spec)) }, run, reads, closer, mayFile: mayFileOf(run), notes, heads };
    const { tried, rechecked } = yield* fileTries(f, due.retry);
    const looped = yield* fileRounds(f, due.round);
    const checked = yield* fileChecks(f, [...assessed.check, ...rechecked]);
    const filed = yield* fileReady(f, due.ready, admission.starting, parents.git);
    const heldFirst = holdFirst(f, admission.held, assessed.ready);
    const { tipped, tips } = keepTips(run, steps, assessed.status, heads);
    const wrote =
      [filed, checked, tried, looped, adopted].some((names) => names.length > 0) ||
      Boolean(tips || heldFirst || handed.marked || lacking.read || landing.landed || marked.length || timed) ||
      Boolean(settled.marks.settlesCounted);
    pinsWritten(run, pinned, wrote);
    runStore.asks.consume(run, asks, roundAsks, pauseAsksVoid(steps, run, asks, phaseOf, spendOf));

    const facts = [...settled.facts, ...roundsGranted(run, steps, looped), ...marked, ...(timed ?? [])];
    const done = { filed, checked, tried, looped, notes, feed, facts };
    return answerOf(run, reads, assessed, admission, done, { acted: wrote || closer.closed.size > 0, tipped });
  },
  (advanced, _e: Engine, run: Run, _slot?: RunSlot, _pass?: PassRead) => advanced.pipe(Effect.annotateLogs({ run: run.id })),
);

/**
 * The steps, tries and rounds the pass files, once a following factory's run has taken the files (`followPass`): what is due, or, where
 * the pass re-pinned, nothing, so the next pass files them on the new pins; and what the pass owes the store of its pins, `took` (the head
 * of the pass's, `pinPass`) and the follow's together (`pinned`).
 */
function followedDue(
  run: Run,
  took: PinnedPass,
  assessed: Assessment,
  admission: Admission,
  revisions: PassRead['revisions'] | undefined,
): { followed: PinnedPass; pinned: PinnedPass; ready: readonly string[]; retry: Assessment['retry']; round: Assessment['round'] } {
  const due = admission.ready.length + assessed.retry.length + assessed.round.length > 0;
  const followed = followPass(run, new Date().toISOString(), due, revisions);
  if (!followed.wrote) return { followed, pinned: took, ready: admission.ready, retry: assessed.retry, round: assessed.round };
  return { followed, pinned: { ...took, wrote: true }, ready: [], retry: [], round: [] };
}

/**
 * What the pass hands the metrics of the run's settled tasks (`settledOnce`), off what it read of them, before it files anything over
 * them: a try filed moves the step's task among its earlier tries. Each task it reads settled that the run's mark does not hold is added
 * to the mark (`settlesCounted`) for the record this pass writes, as `markedOnce`'s are. A record with no mark counts none, and gets
 * no mark.
 */
function settledOf(run: Run, r: PassReads): ReturnType<typeof settledOnce> {
  const statusOf = (step: Workflow) => stepStatus(step, run, r.phaseOf, r.signedOff, r.asked, r.steps, r.spendOf, r.verdictOf);
  const once = settledOnce(run, r.steps, { views: r.views, spendOf: r.spendOf, signedOff: r.signedOff, statusOf });
  Object.assign(run, once.marks);
  return once;
}

/**
 * What the pass hands the metrics once of the run (`onceFacts`), off this pass's views: the gate waits of its approvals not timed yet and
 * the calls its sessions were denied not counted yet, each marked on the run (`gatesTimed`, `deniedCounted`) for the record this pass
 * writes. The metrics record them once the pass is done, after that write (`tickRun`): a process that dies between the two loses them,
 * and never records one twice, a restart between passes included.
 */
function markedOnce(run: Run, r: PassReads): StepFact[] {
  const once = onceFacts(run, r.steps, r.views, denialText);
  Object.assign(run, once.marks);
  return once.facts;
}

/**
 * The run's timeline for the metrics (`timelineFacts`), once: on the first pass that reads a run started with the mark (`runTimed`) over,
 * succeeded or called off, with no task of it in flight, off the engine's views of every try (`everyTryOf`), read on that pass alone. The
 * run is marked for the record this pass writes, and the metrics record the facts once the pass is done, as `markedOnce`'s. Undefined on
 * any other pass, which reads nothing: a run still going or stopped short, a record with no mark, one already timed, and a run nothing
 * was ever filed of, which has no timeline and is left as it is.
 */
const timedOnce = Effect.fnUntraced(function* (e: Engine, run: Run, r: PassReads, status: Assessment['status']) {
  if (run.runTimed !== false || !hasStarted(run) || (status !== 'succeeded' && status !== 'cancelled')) return undefined;
  const facts = timelineFacts(run, r.steps, yield* everyTryOf(e, run, r.views), status);
  if (facts) run.runTimed = true;
  return facts ?? undefined;
});

/**
 * Whether a pass may file for this run still, read off the store before each filing: not once the run is called off, forgotten, pruned
 * or held, or the store paused, while the pass was at work. Once it has said no it says no for the rest of the pass, whatever the store
 * reads after.
 */
export const mayFileOf = (run: Run): (() => boolean) => {
  let calledOff = false;
  return () => !(calledOff ||= !runStore.runs.exists(run.id) || runStore.runs.calledOff(run.id));
};

/** A pass's reads of a run, before it adopts or files anything: the engine's views of its tasks, the readers made of them, and its asks. */
const readPass = Effect.fnUntraced(function* (e: Engine, run: Run) {
  const steps = stepsOf(run);
  const { views, phaseOf } = yield* taskPhasesRead(run, { earlierTries: underBudget(steps, run) }).pipe(over(e));
  const signedOff = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  const verdictOf = exitVerdicts(views, run);
  const sessionBlocked = harnessBlocked(views);
  const spendOf = spendReader(views);
  const { asks, rounds: roundAsks, notes: askNotes } = runStore.asks.read(run.id);
  const home = yield* StoreRoot;
  const reads: PassReads = { steps, views, phaseOf, signedOff, asked, verdictOf, sessionBlocked, spendOf, asks, roundAsks, home };
  return { reads, askNotes };
});

/**
 * Adopt what a pass before this one filed and never wrote down: its rounds, then its tries, then its checks. Answers with every step
 * adopted.
 */
const adoptAll = Effect.fnUntraced(function* (e: Engine, run: Run, r: PassReads) {
  const rounds = yield* adoptRounds(e, run, r.steps, r.views, r.phaseOf, r.signedOff, r.asked, r.roundAsks, r.spendOf);
  const tries = yield* adoptTries(e, run, r.steps, r.views, r.phaseOf, r.signedOff, r.asked, r.verdictOf, r.asks, r.spendOf);
  const checks = yield* adoptChecks(e, run, r.steps, r.views, r.phaseOf, r.signedOff, r.asked, r.spendOf);
  return [...rounds, ...tries, ...checks];
});

/**
 * Stop a cancelled run's tasks in flight, those a pass filed and never wrote down included: none the engine was already asked to stop. A
 * stop the engine refuses (`stopAsked`) is one of a task that settled or was asked to stop since this pass read it: nothing left to do.
 */
const stopCancelled = Effect.fnUntraced(function* (e: Engine, run: Run, r: PassReads) {
  const unrecorded = yield* unrecordedSteps(
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
    if (!r.views.get(taskId)?.state.stopRequested) yield* stopAsked(e, taskId);
  }
});

/**
 * Hand off every step owed it (`handOffOwed`) while the run is there, collect what each named, and write its closeout beside them
 * (`handCloseout`): answers with the notes collecting said,
 * and with why a hand-off was not made, and whether a hand-off was marked on the record. A repository run's step is handed off by its
 * `handoff`, asked of `place`, and marked only on its answer: one refused or not heard is asked again on the next pass.
 */
const handOffAll = Effect.fnUntraced(function* (run: Run, r: PassReads, place: Place) {
  let marked = false;
  const collected: string[] = [];
  for (const name of handOffOwed(r.steps, run, r.phaseOf)) {
    if (!runStore.runs.exists(run.id)) continue;
    const record = run.steps[name];
    const unhanded = isRepositoryRun(run) ? yield* handedOffBy(place, record.workspace!, name) : folderPlace(runsDir()).handOff(run, name);
    if (unhanded === undefined) {
      run.steps[name] = { ...record, handedOff: record.taskId! };
      marked = true;
    }
    collected.push(...(unhanded === undefined ? [] : [`${name}: ${unhanded}`]), ...collectArtifacts(run, name, r.signedOff(name)));
    const step = r.steps.find((s) => s.name === name);
    if (step) collected.push(...handCloseout(run, step, r.signedOff(name)));
  }
  return { collected, marked };
});

/**
 * Read off the disk the files each step due it named in its closeout (`filesDue`), after the pass collected them (`handOffAll`) and
 * before it judges the run, and keep on the step's record that its task was read and each file the run does not have
 * (`StepRecord.filesRead`), which unsigns the step where there is one: so no later pass reads that task's files again. Answers how
 * many steps it read, each a write the record is owed, and a note for each whose closeout is not accepted.
 */
function readFiles(run: Run, r: PassReads): { read: number; notes: string[] } {
  const due = filesDue(r.steps, run, r.phaseOf, r.signedOff);
  const notes: string[] = [];
  for (const name of due) {
    const record = run.steps[name];
    const lacked = filesLacked(run, name, r.signedOff(name));
    const why = Object.fromEntries(lacked.map((file) => [file.path, file.why]));
    run.steps[name] = { ...record, filesRead: { taskId: record.taskId!, lacked: why } };
    if (lacked.length) {
      notes.push(`${name}: its closeout named ${lacked.map((file) => file.path).join(', ')}, which the run does not have — not accepted`);
    }
  }
  return { read: due.length, notes };
}

/**
 * What `place` did with `step`'s hand-off of `workspace`, its `handoff` asked off the event loop, as a commit hook may take minutes:
 * undefined once it answered, else why not, in words.
 */
const handedOffBy = Effect.fnUntraced(function* (place: Place, workspace: string, step: string) {
  const outcome = yield* place.ask('handoff', { workspace, step, why: '' });
  if ('answer' in outcome) return undefined;
  return `not handed off — ${'refused' in outcome ? `the place refused: ${outcome.refused}` : `the place's handoff was not heard: ${outcome.unread.said}`}; asked again on the next pass`;
});

/**
 * Lift a person's hold once every run it names has landed, each read through `parents`, and only the hold this pass read (`removeHold`):
 * answers with its note, and with the moment the hold it lifted was put (`lifted`), which the feed writes as this pass's own deed and not
 * a person's (`holdOnce`) — by the time it is worded the hold is off the record, and nothing but this knows who took it off.
 */
const liftHold = Effect.fnUntraced(function* (e: Engine, run: Run, parents: Parents) {
  const nothing: { notes: string[]; lifted?: string } = { notes: [] };
  if (!run.hold || run.cancelledAt || !run.hold.until.length) return nothing;
  let landed = true;
  for (const id of run.hold.until) if (!(landed = (yield* keptParent(id, parents.git, parents.read).pipe(over(e))).landed)) break;
  if (!landed || !runStore.holds.lift(run.id, run.hold.at)) return nothing;
  const { until, at } = run.hold;
  delete run.hold;
  return {
    notes: [
      `the hold is lifted: ${until.length > 1 ? `${until.slice(0, -1).join(', ')} and ${until.at(-1)} have` : `${until[0]} has`} landed`,
    ],
    lifted: at,
  };
});

/** The pass's closer (`Closer`), with the tasks waiting for a word as the pass read them (`waits`) and those it closed (`closed`). */
type PassCloser = Closer & { waits: (taskId: string) => boolean; closed: Set<string> };

/** One closer for the pass: every close it makes, the sweep's and the filings', counted in one `closed`. */
function closerOf(e: Engine, views: ReadonlyMap<string, TaskView>): PassCloser {
  const waits = waitsForWord(views);
  const closed = new Set<string>();
  const closeWaiting = Effect.fnUntraced(function* (name: string, taskId: string) {
    const refused = yield* closeHeld(e, taskId);
    if (!refused) closed.add(taskId);
    return refused && `${name}: ${refused}`;
  });
  const awaitsWord = (taskId: string | null | undefined): boolean => Boolean(taskId && waits(taskId) && !closed.has(taskId));
  return { closeWaiting, awaitsWord, waits, closed };
}

/** Close each step's task held open that waits for a word nobody is to give (`holdsOpen`): answers with the engine's refusals, worded. */
const closeHeldOpen = Effect.fnUntraced(function* (run: Run, r: PassReads, closer: PassCloser) {
  const notes: string[] = [];
  for (const step of r.steps) {
    const taskId = run.steps[step.name]?.taskId;
    if (!taskId || !closer.waits(taskId) || holdsOpen(step, run, r.phaseOf, r.signedOff, r.asked, r.steps, r.spendOf, r.verdictOf))
      continue;
    const refused = yield* closer.closeWaiting(step.name, taskId);
    if (refused) notes.push(refused);
  }
  return notes;
});

/**
 * Whether the run files its roots on this pass: the runs it waits on as they stand (`parent`), whether it has started, what it needs of a
 * slot (`slotNeed`), the slot it is held at, the steps it files, and the runs whose landing it waits on (`waitsOf`).
 */
type Admission = {
  parent: (id: string) => ParentRun;
  starting: boolean;
  need: ReturnType<typeof slotNeed>;
  held: RunSlot | undefined;
  ready: string[];
  waiting: Wait[];
};

/**
 * Admit the run's ready steps: while it has nothing filed, once every run it waits on, read through `parents`, has landed and the cap
 * leaves it a slot.
 */
const admit = Effect.fnUntraced(function* (
  e: Engine,
  run: Run,
  slot: RunSlot | undefined,
  r: PassReads,
  assessed: Assessment,
  parents: Parents,
) {
  const parent = yield* parentsRead(run, parents.git, parents.read).pipe(over(e));
  const starting = !hasStarted(run);
  const need = slotNeed(run, r.phaseOf, assessed, (id) => parent(id).landed, r.steps);
  const admitted = runAdmitted(run, slot, r.steps);
  const held = need.wants && !admitted ? slot : undefined;
  const ready = runReady(run, (id) => parent(id).landed) && admitted ? assessed.ready : [];
  const admission: Admission = { parent, starting, need, held, ready, waiting: waitsOf(run, parent) };
  return admission;
});

/** Write when the cap first held the run (`slotHeldAt`), and say so once, while the pass may file still: answers whether it did. */
function holdFirst(f: Filing, held: RunSlot | undefined, ready: readonly string[]): boolean {
  const heldFirst = Boolean(held && !f.run.slotHeldAt && f.mayFile());
  if (heldFirst) {
    f.run.slotHeldAt = new Date().toISOString();
    f.notes.push(`${ready.join(', ')}: ${slotWord(held!)} — filed once a run in flight settles`);
  }
  return heldFirst;
}

/** Whether `run` reads other runs: one it waits on (`waitedOn`), or one it is handed as context before it starts. */
const readsOthers = (run: Run): boolean => waitedOn(run).length > 0 || (!hasStarted(run) && Boolean(run.context?.length));

/**
 * Every branch of the run's repository and its commit, read once when first asked: off what the pass read (`standing`, `headsFor`),
 * undefined where it did not, or asked of its place now (`headsNow`, of `place`) where no pass read them (`advanceRun`) or the run
 * committed a hand-off since (`handOffAll`).
 */
const headsOf = (run: Run, standing: PassStanding | undefined, place: Place): Heads => {
  let read: { heads: Readonly<Record<string, string>> | undefined } | undefined;
  return () => {
    if (!isRepositoryRun(run)) return undefined;
    read ??= { heads: standing ? headsFor(standing, run) : headsNow(run, place) };
    return read.heads;
  };
};

/**
 * Keep each result branch's tip as the pass read it (`tipsSeen`, off `heads`), on the record where one moved: the branches read, and the
 * tips kept. None kept where the pass did not read them.
 */
function keepTips(
  run: Run,
  steps: readonly Workflow[],
  status: Assessment['status'],
  heads: () => Readonly<Record<string, string>> | undefined,
): { tipped: string[]; tips: Run['tips'] | undefined } {
  const tipped = isRepositoryRun(run) ? tipBranches(run, steps, status) : [];
  const seen = tipped.length ? heads() : undefined;
  const tips = seen && isRepositoryRun(run) ? tipsSeen(run, tipped, seen) : undefined;
  if (tips) run.tips = tips;
  return { tipped, tips };
}

/** What a pass filed and said, as `Advanced` carries it. */
type Done = Pick<Advanced, 'filed' | 'checked' | 'tried' | 'looped' | 'notes' | 'feed' | 'facts'>;

/**
 * The pass's answer: what it did (`Advanced`), what holds the run out of rest (`restBlockers`), and at rest the branches it read the tips
 * of, and its feed words marked `atRest`. `acted` says the pass wrote the record or closed a task.
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
  const { status, unreachable } = assessed;
  const inFlight = !takesNoSlot(steps) && (admission.need.inFlight || [filed, checked, tried, looped].some((names) => names.length > 0));
  const ending = steps.find((s) => s.workspace === 'main');
  const facts: RestFacts = {
    run,
    status,
    due: assessed,
    notes,
    waiting,
    inFlight,
    held: Boolean(held),
    settled: [...views.values()].every((v) => Boolean(v.state.settled)),
    acted: pass.acted,
    handOffDue: handOffOwed(steps, run, phaseOf),
    landingOwed: steps.some((s) => landsOnCheck(s, run) && Boolean(run.steps[s.name]?.taskId) && !run.steps[s.name]?.landed),
    checkoutAsked: Boolean(ending && !run.cancelledAt && endingAsked(run, ending, asks) !== undefined),
  };
  const blockers = restBlockers(facts);
  const advanced: Advanced = {
    run,
    filed,
    checked,
    tried,
    looped,
    status,
    unreachable,
    notes,
    waiting,
    inFlight,
    ...(held ? { held } : {}),
    ...(done.facts?.length ? { facts: done.facts } : {}),
    feed: blockers.length ? feed : { ...feed, atRest: true },
  };
  return { advanced, blockers, ...(blockers.length ? {} : { rest: { tipped: pass.tipped } }) };
}

/**
 * The steps a pass hands off now (`handOffDue`), where there is somewhere to hand one off from: none of a pruned run, which owed none when
 * its worktrees went (`pruneRefusal`), and no step whose workspace is not on disk — removed by hand, or with no record of the removal —
 * since what the step left went with it; a hand-off tried there would fail on every pass, keep the run out of the tick's memo of runs at
 * rest, and have `nemia prune` refuse the run as still owed one. What the pass hands off, what its memo judges, and what `nemia prune`
 * waits for, read off this one function.
 */
export const handOffOwed = (steps: readonly Workflow[], run: Run, phaseOf: (taskId: string) => TaskPhase): string[] =>
  run.pruned ? [] : handOffDue(steps, run, phaseOf).filter((name) => fs.existsSync(run.steps[name].workspace!));
