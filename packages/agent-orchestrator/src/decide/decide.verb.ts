/**
 * `nemia decide` (`decideRun`): the pure call over one read of each task, with what a person needs to decide the run. It reads the
 * repository's own checkout as the pass that would file into it reads it (`checkoutHold`, in `ending.verb.ts`). A controller, reaching the
 * runtime through the client (`runtime-client.ts`): an Effect program that requires the engine as a service (`EngineService`), run with
 * `runWith`.
 */
import { Effect } from 'effect';
import { EngineService, asked as engineAsked, nameFor, over, tried, type Engine, type TaskView, type Usage } from '../runtime-client.ts';
import type { CheckoutHold, RunSlot } from '../cap/cap.ts';
import type { ToDecide } from '../ending/ending.ts';
import { type Run } from '../record/record.ts';
import type { SaidTo } from '../say/say.ts';
import type { BranchStanding, Round, SpendOf } from '../status/status.ts';
import type { Workflow } from '../step/step.ts';
import { hasStarted, holdsOf, waitedOn, waitsOf, type Wait } from '../wait/wait.ts';
import { roundOffers, roundsDue } from '../round/round.ts';
import { deniedWords, harnessWaitLine } from '../list/list.ts';
import { choicesOf, costLine, decision, runCostLines, type DecideCommand, type Decision } from './decide.ts';
import { assess } from '../tick/assess.ts';
import { acceptedLines, gateLines } from '../brief/index.ts';
import { parseCloseout, type Closeout } from '../closeout/index.ts';
import { answerLines, answerOf, overBudgetLine, retriesDue, retryOffers, type Retry, type RetryAsk } from '../retry/index.ts';
import { timeline, type Timeline } from '../timeline/index.ts';
import { stepsOf } from '../record/record.store.ts';
import { landedOf, standingsOf, type BranchReader } from '../branches/branches.store.ts';
import { headsOver, NOTHING_READ, standingReader, standingWhen, type StandingAsker } from '../standing/standing.verb.ts';
import {
  checkReportsRead,
  closeoutAsked,
  closeoutOf,
  closeoutReader,
  consumption,
  deniedOf,
  everyTryOf,
  harnessBlocked,
  parentsRead,
  passParents,
  saidIn,
  spendReader,
  taskPhasesRead,
  viewedOnce,
  waitingOf,
  type CheckReport,
} from '../views/views.verb.ts';
import { checkoutHold } from '../ending/ending.verb.ts';
import { mergeOffers } from '../merge/merge.verb.ts';
import { slotsOf } from '../cap/cap.verb.ts';
import { isRemoteHarness } from '../harness/harness.ts';
import { collisionsDue, type Collisions } from '../collide/collide.ts';
import { collisionsAt } from '../collide/collisions.verb.ts';
import { landingDenies, statusMemo } from '../place/landing.store.ts';
import { PlaceService } from '../place/place.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';

/** A step's current try that a person answered: the try, what they said, and what the try before it needed, when it said. */
export type Answered = { try: number; message: string; needs?: string };

/** What `nemia decide` answers of one run (`decideRun`). */
export type Decided = {
  run: Run;
  decision: Decision;
  closeouts: Record<string, Closeout | { error: string } | undefined>;
  /**
   * Every settled check, by step: what the run's own fact about the step says. Its verdict, off the log, tells a refusal from a check that
   * did not finish.
   */
  checks: Record<string, CheckReport>;
  /** The tries the next tick files: asked for, or covered by `retries:`. */
  retrying: Retry[];
  /** The rounds the next tick files: asked for with `again: true`, or with `nemia round`. */
  rounding: Round[];
  /**
   * For each loop out of rounds, the `nemia round` that goes once more (`roundLines`); for each step a person may try again, the `nemia
   * retry` (`retryLines`).
   */
  offers: string[];
  /**
   * The commands a person may type on a run awaiting them (`choicesOf`), each a bare `nemia` or `git -C` line with its label: what the
   * board offers and `nemia decide` prints. None on a run that awaits nobody.
   */
  commands: DecideCommand[];
  /** The OVER BUDGET line, saying why each step over its budget is held (`overBudgetLine`); undefined with none. */
  overBudgetLine?: string;
  /** What each filed step's current try consumed (`consumption`), off the views read for the rest. */
  used: Record<string, Usage | undefined>;
  /**
   * For each step with a try, its `cost` line (`costLine`): its current try's, its tries' together where there were more, and the cap in
   * force.
   */
  costs: Record<string, string>;
  /** The run's `cost` line, after its steps (`runCostLines`): every step's tries together. None before any attempt has ended. */
  runCost: string[];
  /**
   * For each step whose current try a person answered, the answer beside the `needs` it answers (`Answered`): the answer off the person's
   * ask file, the `needs` off the engine's record of the try before, as the run's record keeps neither.
   */
  answers: Record<string, Answered>;
  /** For each step that signed off blocked and may be tried again, the `nemia retry --message` that answers it (`answerLines`). */
  answering: Record<string, string>;
  /**
   * For each gated step with something to say, what its gate says (`gateLines`): approved, when and with what words, or awaiting approval
   * and the commands.
   */
  gates: Record<string, string>;
  /**
   * For each looping step whose loop a person ended as it stands (`acceptedLines`): when, and the words they gave — why its findings are
   * open.
   */
  accepted: Record<string, string>;
  /**
   * For each step whose session the harness blocked and that says what it waits for, the sentence a person acts on (`harnessWaitLine`):
   * `waiting for a permission prompt — answer it in Claude Code: claude agents, session ae/<task>/1`. Off the views already read, so it
   * costs no observation; empty for a harness that says nothing, which is every harness but Claude Code's. The session named is the
   * engine's name for the task's current attempt (`nameFor`), which `claude agents` lists it under. Read on this call and kept nowhere, so
   * a step that stops waiting says nothing here on the next.
   */
  waitingOn: Record<string, string>;
  /**
   * For each step whose current try's sessions were denied a call, the line that names them (`deniedWords`):
   * `denied: Skill(look), Bash(pytest)`. Off the engine's record of each ended attempt (`deniedOf`); empty for a step denied nothing, or
   * whose harness cannot say. A denied call is a tool the session was not allowed, which a job carries on without.
   */
  denied: Record<string, string>;
  /** The runs this run's roots wait on (`waitsOf`): while there are any, that is the whole of what there is to say. */
  waiting: Wait[];
  /**
   * The runs a person holds this run until (`holdsOf`): while the hold stands, what is in flight is all there is to say, and nothing is
   * offered. None on a run nobody holds.
   */
  holding: Wait[];
  /**
   * For each step, what a person said to its sessions while they ran (`nemia say`), try by try, off the engine's view of each try's task
   * (`saidLines`). Every try, as words said to a try that was replaced bear on the work the step hands on; a recheck's try shares its task
   * with the try before, and its words are said once.
   */
  said: Record<string, SaidTo[]>;
  /**
   * Where the run's time went, per try and per check (`timeline`): off the engine's view of every try's task and check, each viewed once,
   * and the filing time each view carries (`State.filedAt`), never the engine's feed, which holds every task ever filed. A task with no
   * filing time leaves its queue time `not known`, and the screen printed all the same.
   */
  timeline: Timeline;
  /**
   * The cap on runs in flight holding this run, with nothing of it filed, and the count it is held at (`slotsOf`); absent when it holds
   * none. Asked only of a run not cancelled with nothing filed, which is all the cap holds, as the answer reads every run in the store.
   */
  held?: RunSlot;
  /** Where each result branch stands against the base branch, as git says it now (`branchStandings`): the fact under the run's result. */
  standings: BranchStanding[];
  /**
   * The run whose ending step has the repository's own checkout while this run's waits for it (`checkoutHold`); absent when nothing holds
   * it.
   */
  checkout?: CheckoutHold;
  /**
   * What is left for a person to decide about the result (`toDecide`): the ending step's gate, or a branch nobody has merged (`assess`, on
   * the same `standings`).
   */
  toDecide?: ToDecide;
  /**
   * At an ending's decision (`collisionsDue`) — its gate, or its landing a check refused — whether the run's branches merge onto the base,
   * which runs in flight they collide with, and the semantic conflict (`collisionsAt`), read live; absent at any other decision.
   */
  collisions?: Collisions;
};

/**
 * For each step whose current try a person answered, the answer beside the `needs` of the try before it, off `views` or, for a try
 * not among them, the engine's view of it (`e`, the call's `viewedOnce`).
 */
const answersOf = Effect.fn('answersOf')(function* (e: Engine, run: Run, views: ReadonlyMap<string, TaskView>, given: RetryAsk[]) {
  const answers: Record<string, Answered> = {};
  for (const name of Object.keys(run.steps)) {
    const answer = answerOf(run, name, given);
    if (!answer) continue;
    const before = run.steps[name].tries!.at(-1)!.taskId;
    const closeout = (views.get(before) ?? (yield* engineAsked('view', e.view(before)))).state.attempts.at(-1)?.closeout;
    const c = closeout === undefined ? undefined : parseCloseout(closeout);
    answers[name] = { try: answer.try, message: answer.message!, ...(c && !('error' in c) && c.needs ? { needs: c.needs } : {}) };
  }
  return answers;
});

/** For each step, what a person said to its sessions, try by try, off `everyTry`; a task two tries share is read once. */
function saidOf(run: Run, everyTry: ReadonlyMap<string, TaskView>): Record<string, SaidTo[]> {
  const said: Record<string, SaidTo[]> = {};
  for (const [name, record] of Object.entries(run.steps)) {
    const tasks = [...(record.tries ?? []).map((t) => t.taskId), ...(record.taskId ? [record.taskId] : [])];
    const told: SaidTo[] = [];
    for (const [i, taskId] of tasks.entries()) {
      if (tasks.indexOf(taskId) !== i) continue;
      for (const s of saidIn(everyTry.get(taskId))) told.push({ ...s, try: i + 1 });
    }
    if (told.length) said[name] = told;
  }
  return said;
}

/** For each step with a try, its `cost` line (`costLine`), off what its current try used. */
const costsOf = (steps: readonly Workflow[], run: Run, used: Record<string, Usage | undefined>, spendOf: SpendOf): Record<string, string> =>
  Object.fromEntries(
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

/** For each step whose session the harness blocked and says what it waits for, the line a person acts on (`harnessWaitLine`). */
function waitingOnOf(id: string, run: Run, views: ReadonlyMap<string, TaskView>): Record<string, string> {
  const waitingOn: Record<string, string> = {};
  for (const [name, record] of Object.entries(run.steps)) {
    const word = record.taskId ? waitingOf(views)(record.taskId) : undefined;
    if (!record.taskId || !word) continue;
    const attempt = views.get(record.taskId)?.state.attempts.at(-1)?.n;
    const remote = isRemoteHarness(views.get(record.taskId)?.state.harness) ? { run: id, step: name } : undefined;
    waitingOn[name] = harnessWaitLine(word, attempt === undefined ? null : nameFor(record.taskId, attempt), remote);
  }
  return waitingOn;
}

/** For each step whose current try's sessions were denied a call, the line that names them (`deniedWords`). */
function deniedLinesOf(run: Run, views: ReadonlyMap<string, TaskView>): Record<string, string> {
  const denied: Record<string, string> = {};
  for (const [name, record] of Object.entries(run.steps)) {
    const words = record.taskId ? deniedWords(deniedOf(views)(record.taskId)) : '';
    if (words) denied[name] = words;
  }
  return denied;
}

/**
 * What is left for a person to do — the pure call, with git asked the one question it owns. Each task is viewed once (`viewedOnce`), the
 * current tries and every try before them, and where the branches stand asked of their places at most once, now (`standingNow`: this
 * run's, and those of every run the tick's pass would ask of), only where something read depends on it (`standingWhen`): the decision of
 * a run neither running nor called off, its standings and collisions, the checkout's claims of an ending asked for, the runs it waits on,
 * and the cap's parents where a run waits on another. A run still running or called off has no standings: nothing of it is decided on them.
 *
 * A cancelled, pruned or held run has no try or round due. Each line that would offer a verb (`retryLines`, `roundLines`, `answerLines`,
 * `overBudgetLine`, `gateLines`) says itself that it offers none, so the api's decision, which calls the same functions, says the same.
 * The cap on runs in flight, whose `WF_MAX_RUNS` before any pass is `env`'s, is read for both facts it bears on: whether a run nothing of
 * which is filed is held (`slotsOf`), and which run's ending holds the repository's checkout (`checkoutHold`).
 * Where the branches stand is asked through `standing` where it is given, so a caller that asked already asks no second time.
 * Fails with a refusal a read threw (`Missing`, for a run that is not there); dies of anything else (`tried`).
 */
export const decideRun = Effect.fn('decide')(function* (id: string, env: NodeJS.ProcessEnv = process.env, standing?: StandingAsker) {
  const e = viewedOnce(yield* EngineService);
  const run = yield* (yield* RunDoor).runs.read(RunId.read(id));
  const runs = yield* (yield* RunDoor).runs.list();
  const live = standing ?? (yield* standingWhen(runs, id));
  const steps = yield* tried(() => stepsOf(run));
  const { views, phaseOf } = yield* taskPhasesRead(run).pipe(over(e));
  const closeouts = Object.fromEntries(Object.keys(run.steps).map((name) => [name, closeoutOf(views, run, name)]));
  const checks = Object.fromEntries(
    yield* checkReportsRead(run, steps, phaseOf, (p) => p === 'succeeded' || p === 'failed' || p === 'stopped').pipe(over(e)),
  );
  const { asks, rounds } = yield* (yield* RunDoor).asks.read(RunId.read(id));
  const reader = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  const verdictOf = (name: string) => checks[name]?.verdict;
  const blocked = harnessBlocked(views);
  const spendOf = spendReader(views);
  const place = yield* PlaceService;
  const memo = statusMemo((r) => headsOver(live.read())(r), place);
  const checkout = yield* checkoutHold(e, run, steps, { standing: live.standing }, env, memo);
  const decided = (git: BranchReader) =>
    decision(steps, run, phaseOf, landedOf(run, git), reader, asked, verdictOf, asks, rounds, blocked, spendOf, checkout);
  const unasked = decided(standingReader(NOTHING_READ));
  const git = yield* live.when(unasked.kind !== 'running' && unasked.kind !== 'cancelled');
  const d = yield* tried(() => decided(git));
  const standings = d.kind === 'running' || d.kind === 'cancelled' ? [] : yield* tried(() => standingsOf(run, git));
  const { toDecide: decide } = assess(steps, run, phaseOf, reader, asked, verdictOf, asks, rounds, blocked, spendOf, standings);
  const ending = collisionsDue(steps, run, decide);
  const collisions = ending ? yield* collisionsAt(run, ending, standings, git, place) : undefined;
  const answers = yield* answersOf(e, run, views, yield* (yield* RunDoor).asks.answers(RunId.read(id)));
  const everyTry = yield* everyTryOf(e, run, views);
  const said = saidOf(run, everyTry);
  const filed = new Map([...everyTry].flatMap(([taskId, v]) => (v.state.filedAt ? [[taskId, v.state.filedAt] as const] : [])));
  const used = consumption(views, run);
  const costs = costsOf(steps, run, used, spendOf);
  const waitingOn = waitingOnOf(id, run, views);
  const denied = deniedLinesOf(run, views);
  const parents = passParents(yield* live.when(runs.some((r) => waitedOn(r).length > 0)));
  const held = !hasStarted(run) && !run.cancelledAt ? (yield* slotsOf(e, runs, env, parents)).held.get(id) : undefined;
  const ended = Boolean(run.cancelledAt || run.pruned || run.hold);
  const offers = [
    ...roundOffers(steps, run, d, spendOf),
    ...mergeOffers(place, steps, run, d, rounds, phaseOf, reader, asked, spendOf),
    ...retryOffers(steps, run, d, phaseOf, reader, asked, spendOf, verdictOf, () => landingDenies(run, place)),
  ];
  const parent = yield* parentsRead(run, yield* live.when(waitedOn(run).length > 0)).pipe(over(e));
  const answer: Decided = {
    run,
    decision: d,
    closeouts,
    checks,
    retrying: ended ? [] : retriesDue(steps, run, phaseOf, reader, asked, verdictOf, asks, blocked, spendOf),
    rounding: ended ? [] : roundsDue(steps, run, phaseOf, reader, asked, rounds, spendOf),
    offers: offers.map((o) => o.said),
    commands: choicesOf(steps, run, d, offers),
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
    ...(collisions ? { collisions } : {}),
  };
  return answer;
});
