/**
 * What a person reads of a run: `wf ls` (`list`) and `wf decide` (`decide`), each the pure call over one read of each task. `list` is here
 * beside `decide`, and not with the views (`views.ts`), because it reads the repository's own checkout as the pass that would file into it
 * reads it (`checkoutHold`, in `tick.ts`), and the views are beneath the tick. A controller, reaching the runtime through the client
 * (`runtime-client.ts`).
 */
import { nameFor, unreadableJournal, type Engine, type Usage } from './runtime-client.ts';
import {
  acceptedLines,
  answerLines,
  assess,
  costLine,
  decision,
  deniedWords,
  gateLines,
  harnessWaitLine,
  hasStarted,
  holdsOf,
  listing,
  overBudgetLine,
  retriesDue,
  retryLines,
  roundLines,
  roundsDue,
  runCostLines,
  runTasks,
  unjudgedWords,
  waitsOf,
  type BranchStanding,
  type CheckoutHold,
  type Decision,
  type Listing,
  type Round,
  type Run,
  type RunSlot,
  type SaidTo,
  type ToDecide,
  type Wait,
} from './run.ts';
import { parseCloseout, type Closeout } from './closeout.ts';
import { answerOf, type Retry } from './retry.ts';
import { timeline, type Timeline } from './timeline.ts';
import { readAnswers, readAsks, readRun, stepsOf } from './store.ts';
import { branchReader, shippedOf, standingsOf, type BranchReader } from './branches.ts';
import {
  checkReports,
  closeoutAsked,
  closeoutOf,
  closeoutReader,
  consumption,
  deniedOf,
  engineWord,
  harnessBlocked,
  parentsOf,
  saidCount,
  saidIn,
  spendReader,
  taskPhases,
  unjudgedWord,
  viewedOnce,
  waitingOf,
  type CheckReport,
} from './views.ts';
import { checkoutHold, runSlots } from './tick.ts';
import { isRemoteHarness } from './workflow.ts';

/**
 * What `wf ls` shows for one run — the pure call, over one read of each task.
 *
 * The phase beside a step is the engine's own word (`running (working)`, `needs-human`), not the
 * narrowed `TaskPhase` the DAG decides on: a person reading the list wants the detail.
 */
export async function list(e: Engine, run: Run, slot?: RunSlot, git: BranchReader = branchReader()): Promise<Listing> {
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  // Only a refused check's log is read here: its exit code is the one number on its line.
  const refused = await checkReports(e, run, steps, phaseOf, (p) => p === 'failed' || p === 'stopped');
  const { asks, rounds } = readAsks(run.id);
  // And where the run's result stands against the base branch, read off git on this pass: what says a finished run is one nobody has decided.
  const standings = standingsOf(run, git);
  // And which run's ending step has the repository's own checkout, when this run's waits for it: read of the store, as the pass that would file it reads it.
  const checkout = await checkoutHold(e, run, steps);
  const parent = await parentsOf(e, run, git);
  return listing(
    steps,
    run,
    engineWord(views),
    (name) => closeoutOf(views, run, name),
    closeoutAsked(views),
    (name) => refused.get(name)?.verdict,
    asks,
    rounds,
    readAnswers(run.id),
    waitsOf(run, parent),
    saidCount(views, run),
    spendReader(views),
    slot,
    standings,
    checkout,
    waitingOf(views),
    deniedOf(views),
    holdsOf(run, parent),
  );
}

/** A run left unjudged (`unjudgedOf`): why, in one sentence, and each step's word with the branch it works on. */
export type Unjudged = { said: string; steps: Array<{ name: string; status: string; branch?: string }> };

/**
 * A run a read of which rejected with `err`, answered off its record when that is a task journal that does not read (`unreadableJournal`),
 * as the tick leaves such a run where it is: why it is not judged, by `by` (`unjudgedWords`), and each step's word (`unjudgedWord`) off one
 * read of the run's own tasks (`list`), which names every one of them that does not read — a check's and an earlier try's among them.
 * Undefined for any other failure, which the caller throws.
 */
export async function unjudgedOf(e: Engine, run: Run, err: unknown, by: string): Promise<Unjudged | undefined> {
  const why = unreadableJournal(err);
  if (why === undefined) return undefined;
  const tasks = runTasks(run);
  const listed = await e.list(tasks);
  const unreadable = new Map(listed.unreadable.map((u) => [u.taskId, u.why]));
  const named = (err as { taskId: string }).taskId;
  const own = tasks.find((id) => unreadable.has(id)) ?? tasks.find((id) => id === named);
  const word = unjudgedWord(new Map(listed.views.map((v) => [v.id, v])), unreadable);
  return {
    said: unjudgedWords(run.id, own, (own && unreadable.get(own)) ?? why, by),
    steps: stepsOf(run).map(({ name }) => ({ name, status: word(run.steps[name]), branch: run.steps[name]?.branch })),
  };
}

/** A step's current try that a person answered: the try, what they said, and what the try before it needed, when it said. */
export type Answered = { try: number; message: string; needs?: string };

/**
 * What is left for a person to do — the pure call, with git asked the one question it owns. Each task is viewed once (`viewedOnce`), the
 * current tries and every try before them, and git asked of each branch once (`branchReader`), for the decision and the standings both.
 */
export async function decide(
  engine: Engine,
  id: string,
): Promise<{
  run: Run;
  decision: Decision;
  closeouts: Record<string, Closeout | { error: string } | undefined>;
  /** Every settled check, by step: what the run's own fact about the step says. */
  checks: Record<string, CheckReport>;
  /** The tries the next tick files: asked for, or covered by `retries:`. */
  retrying: Retry[];
  /** The rounds the next tick files: asked for with `again: true`, or with `wf round`. */
  rounding: Round[];
  /** For each loop out of rounds, the `wf round` that goes once more (`roundLines`); for each step a person may try again, the `wf retry` (`retryLines`). */
  offers: string[];
  /** The OVER BUDGET line, saying why each step over its budget is held (`overBudgetLine`); undefined with none. */
  overBudgetLine?: string;
  /** What each filed step's current try consumed (`consumption`), off the views read for the rest. */
  used: Record<string, Usage | undefined>;
  /** For each step with a try, its `cost` line (`costLine`): its current try's, its tries' together where there were more, and the cap in force. */
  costs: Record<string, string>;
  /** The run's `cost` line, after its steps (`runCostLines`): every step's tries together. None before any attempt has ended. */
  runCost: string[];
  /** For each step whose current try a person answered, the answer beside the `needs` it answers (`Answered`). */
  answers: Record<string, Answered>;
  /** For each step that signed off blocked and may be tried again, the `wf retry --message` that answers it (`answerLines`). */
  answering: Record<string, string>;
  /** For each gated step with something to say, what its gate says (`gateLines`): approved, when and with what words, or awaiting approval and the commands. */
  gates: Record<string, string>;
  /** For each looping step whose loop a person ended as it stands (`acceptedLines`): when, and the words they gave — why its findings are open. */
  accepted: Record<string, string>;
  /**
   * For each step whose session the harness blocked and that says what it waits for, the sentence a person acts on (`harnessWaitLine`):
   * `waiting for a permission prompt — answer it in Claude Code: claude agents, session ae/<task>/1`. Off the views already read, so it
   * costs no observation; empty for a harness that says nothing, which is every harness but Claude Code's.
   */
  waitingOn: Record<string, string>;
  /**
   * For each step whose current try's sessions were denied a call, the line that names them (`deniedWords`): `denied: Skill(look),
   * Bash(pytest)`. Off the engine's record of each ended attempt (`deniedOf`); empty for a step denied nothing, or whose harness cannot say.
   */
  denied: Record<string, string>;
  /** The runs this run's roots wait on (`waitsOf`): while there are any, that is the whole of what there is to say. */
  waiting: Wait[];
  /**
   * The runs a person holds this run until (`holdsOf`): while the hold stands, what is in flight is all there is to say, and nothing is offered.
   * None on a run nobody holds.
   */
  holding: Wait[];
  /** For each step, what a person said to its sessions while they ran (`wf say`), try by try, off the engine's view of each try's task (`saidLines`). */
  said: Record<string, SaidTo[]>;
  /**
   * Where the run's time went, per try and per check (`timeline`): off the engine's view of every try's task and check, and the filing times
   * on its feed. A feed that cannot be read leaves every queue time `not known`, and the screen printed all the same.
   */
  timeline: Timeline;
  /** The cap on runs in flight holding this run, with nothing of it filed, and the count it is held at (`runSlots`); absent when it holds none. */
  held?: RunSlot;
  /** Where each result branch stands against the base branch, as git says it now (`branchStandings`): the fact under the run's result. */
  standings: BranchStanding[];
  /** The run whose ending step has the repository's own checkout while this run's waits for it (`checkoutHold`); absent when nothing holds it. */
  checkout?: CheckoutHold;
  /** What is left for a person to decide about the result (`toDecide`): the ending step's gate, or a branch nobody has merged. */
  toDecide?: ToDecide;
}> {
  const e = viewedOnce(engine);
  const git = branchReader();
  const run = readRun(id);
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  const closeouts = Object.fromEntries(Object.keys(run.steps).map((name) => [name, closeoutOf(views, run, name)]));
  const checks = Object.fromEntries(
    await checkReports(e, run, steps, phaseOf, (p) => p === 'succeeded' || p === 'failed' || p === 'stopped'),
  );
  const { asks, rounds } = readAsks(id);
  const reader = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  // The verdict the screen prints, off the log: a refusal and a check that did not finish, told apart by it.
  const verdictOf = (name: string) => checks[name]?.verdict;
  const blocked = harnessBlocked(views);
  const spendOf = spendReader(views);
  // Which run's ending step has the repository's own checkout, when this run's waits for it: a run still running for that, and nothing else.
  const checkout = await checkoutHold(e, run, steps);
  const d = decision(steps, run, phaseOf, shippedOf(run, git), reader, asked, verdictOf, asks, rounds, blocked, spendOf, checkout);
  // Where the result stands against the base branch, read off git now — and what that leaves a person to decide (`assess`, on the same facts).
  const standings = standingsOf(run, git);
  const { toDecide: decide } = assess(steps, run, phaseOf, reader, asked, verdictOf, asks, rounds, blocked, spendOf, standings);
  // What a person said to a step's current try, off their ask file, and what the try before it needed, off the engine's record of that
  // try: the run's record keeps neither.
  const given = readAnswers(id);
  const answers: Record<string, Answered> = {};
  for (const name of Object.keys(run.steps)) {
    const answer = answerOf(run, name, given);
    if (!answer) continue;
    const before = run.steps[name].tries!.at(-1)!.taskId;
    const closeout = (views.get(before) ?? (await e.view(before))).state.attempts.at(-1)?.closeout;
    const c = closeout === undefined ? undefined : parseCloseout(closeout);
    answers[name] = { try: answer.try, message: answer.message!, ...(c && !('error' in c) && c.needs ? { needs: c.needs } : {}) };
  }
  // Every try's task and check, the tries behind the current one too, each viewed once: what a person said to each try, and the timeline.
  const everyTry = new Map(views);
  for (const record of Object.values(run.steps)) {
    for (const t of record.tries ?? []) {
      for (const taskId of [t.taskId, t.check?.taskId]) if (taskId && !everyTry.has(taskId)) everyTry.set(taskId, await e.view(taskId));
    }
  }
  // What a person said to each try's sessions while they ran, off the engine's journal of the try's task: every try, since words said to a try
  // that was replaced still bear on the work the step hands on.
  const said: Record<string, SaidTo[]> = {};
  for (const [name, record] of Object.entries(run.steps)) {
    const tasks = [...(record.tries ?? []).map((t) => t.taskId), ...(record.taskId ? [record.taskId] : [])];
    const told: SaidTo[] = [];
    for (const [i, taskId] of tasks.entries()) {
      // A recheck replaced only a check: the try after it has the same task, whose words are the try's that ran its session, said once.
      if (tasks.indexOf(taskId) !== i) continue;
      for (const s of saidIn(everyTry.get(taskId))) told.push({ ...s, try: i + 1 });
    }
    if (told.length) said[name] = told;
  }
  // When each try's task and check was filed, off the views just read (`State.filedAt`, the `at` of each journal's `filed` entry): the
  // engine's feed says the same of every task ever filed, and was read whole for one run — 15 MB of the live store's, on 2026-09-25.
  const filed = new Map([...everyTry].flatMap(([taskId, v]) => (v.state.filedAt ? [[taskId, v.state.filedAt] as const] : [])));
  const used = consumption(views, run);
  const costs = Object.fromEntries(
    Object.entries(run.steps)
      .filter(([, record]) => record.taskId || record.tries?.length)
      .map(([name]) => [
        name,
        costLine(
          steps.find((s) => s.name === name),
          run,
          name,
          used[name],
          spendOf,
        ),
      ]),
  );
  // What each blocked session's harness says it waits for, and the session a person answers it in: the engine's name for the task's
  // current attempt, which is the name `claude agents` lists it under. Level-triggered like the phase beside it — read this pass, kept
  // nowhere — so a step that stops waiting says nothing here on the next.
  const waitingOn: Record<string, string> = {};
  for (const [name, record] of Object.entries(run.steps)) {
    const word = record.taskId ? waitingOf(views)(record.taskId) : undefined;
    if (!record.taskId || !word) continue;
    const attempt = views.get(record.taskId)?.state.attempts.at(-1)?.n;
    const remote = isRemoteHarness(views.get(record.taskId)?.state.harness) ? { run: id, step: name } : undefined;
    waitingOn[name] = harnessWaitLine(word, attempt === undefined ? null : nameFor(record.taskId, attempt), remote);
  }
  // What each step's current try was denied, off the same views: a tool it was not allowed, which a job carries on without.
  const denied: Record<string, string> = {};
  for (const [name, record] of Object.entries(run.steps)) {
    const words = record.taskId ? deniedWords(deniedOf(views)(record.taskId)) : '';
    if (words) denied[name] = words;
  }
  // Asked only of a run with nothing filed, which is all the cap holds: every run in the store is read for it.
  const held = !hasStarted(run) && !run.cancelledAt ? (await runSlots(e)).get(id) : undefined;
  // A pruned run files nothing more (`advance`), and every verb that would is refused (`prunedRefusal`): nothing is due, and nothing is
  // offered — each line below that would offer a verb says so itself (`retryLines`, `roundLines`, `answerLines`, `overBudgetLine`, `gateLines`),
  // so the api's decision, which calls the same functions, says the same. A held run files nothing while the hold stands, the same way
  // (`heldRefusal`).
  const over = Boolean(run.cancelledAt || run.pruned || run.hold);
  const parent = await parentsOf(e, run, git);
  return {
    run,
    decision: d,
    closeouts,
    checks,
    retrying: over ? [] : retriesDue(steps, run, phaseOf, reader, asked, verdictOf, asks, blocked, spendOf),
    rounding: over ? [] : roundsDue(steps, run, phaseOf, reader, asked, rounds, spendOf),
    offers: [...roundLines(steps, run, d, spendOf), ...retryLines(steps, run, d, phaseOf, reader, asked, spendOf, verdictOf)],
    overBudgetLine: overBudgetLine(steps, run, d, spendOf),
    used,
    costs,
    runCost: runCostLines(run, spendOf),
    answers,
    answering: answerLines(steps, run, d, phaseOf, reader, asked, spendOf),
    gates: gateLines(steps, run, phaseOf, reader, asked, verdictOf, spendOf, asks, rounds),
    accepted: acceptedLines(steps, run),
    waitingOn,
    denied,
    waiting: waitsOf(run, parent),
    holding: run.cancelledAt ? [] : holdsOf(run, parent),
    said,
    timeline: timeline(run, everyTry, filed, steps),
    ...(held ? { held } : {}),
    standings,
    ...(checkout ? { checkout } : {}),
    ...(decide ? { toDecide: decide } : {}),
  };
}
