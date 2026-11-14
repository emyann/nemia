/**
 * `nemia decide` (`decideRun`): what a person needs to decide the run, built off its one reading (`stepsReading`, `decidedOf`) — the
 * judgement the run object, the runs list and the tick's informer read too — so none of them says a run differently. A controller,
 * reaching the runtime through the client (`runtime-client.ts`): an Effect program that requires the engine as a service
 * (`EngineService`), run with `runWith`.
 */
import { StoreConfig } from '../config/config.store.ts';
import { gatesBudgets, type GateBudgets } from '../gate-budgets/gate-budgets.ts';
import { Effect } from 'effect';
import { actorWords, type Actor } from 'objects';
import { asked as engineAsked, nameFor, over, type Engine, type TaskView, type Usage } from '../runtime-client.ts';
import type { CheckoutHold, RunSlot } from '../cap/cap.ts';
import type { ToDecide } from '../ending/ending.ts';
import { type Run } from '../record/record.ts';
import type { SaidTo } from '../say/say.ts';
import { acceptanceOf, approvalOf, type BranchStanding, type Round, type SpendOf } from '../status/status.ts';
import type { StepSpec } from '../step/step.ts';
import { hasStarted, type Wait } from '../wait/wait.ts';
import { roundOffers } from '../round/round.ts';
import { deniedWords, harnessWaitLine } from '../list/list.ts';
import { choicesOf, costLine, runCostLines, runCostWords, type DecideCommand, type Decision } from './decide.ts';
import { acceptedLines, gateLines } from '../brief/index.ts';
import { parseCloseout, type Closeout } from '../closeout/index.ts';
import { answerLines, answerOf, overBudgetLine, retryOffers, type Retry, type RetryAsk } from '../retry/index.ts';
import { timeline, type Timeline } from '../timeline/index.ts';
import {
  checkReportsRead,
  closeoutOf,
  consumption,
  deniedOf,
  passParents,
  saidIn,
  viewedOnce,
  waitingOf,
  type CheckReport,
} from '../views/views.verb.ts';
import { mergeOffers } from '../merge/merge.verb.ts';
import { slotsOf } from '../cap/cap.verb.ts';
import { isRemoteHarness } from '../harness/harness.ts';
import { collisionsDue, type Collisions } from '../collide/collide.ts';
import { collisionsAt } from '../collide/collisions.verb.ts';
import { landingDenies } from '../place/landing.store.ts';
import { PlaceService } from '../place/place.store.ts';
import { stepsReading, type StepsReading } from '../object/read.verb.ts';
import { seenBy } from '../summary/reads.verb.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';

/**
 * A step's current try that a person answered: the try, what they said, what the try before it needed, when it said, and who answered
 * (`actor`, off the ask), where the ask names a caller.
 */
export type Answered = { try: number; message: string; needs?: string; actor?: Actor };

/** What `nemia decide` answers of one run (`decideRun`). */
export type Decided = {
  run: Run;
  /** The run's steps, in the order they run, as the decision read them (`stepsOf`). */
  steps: StepSpec[];
  decision: Decision;
  closeouts: Record<string, Closeout | { error: string } | undefined>;
  /**
   * Every settled check, by step: what the run's own fact about the step says. Its verdict, off the log, tells a refusal from a check that
   * did not finish.
   */
  checks: Record<string, CheckReport>;
  /** The tries the next tick files: asked for, or covered by `retries:`. */
  retrying: Retry[];
  /** The rounds the next tick files: asked for with `again: true`, or with `nemia retry --round`. */
  rounding: Round[];
  /**
   * For each loop out of rounds, the `nemia retry --round` that goes once more (`roundLines`); for each step a person may try again, the
   * `nemia retry` (`retryLines`).
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
  /** What the run has cost, in its `cost` line's words without the label (`runCostWords`); null before any attempt has ended. */
  runCostSaid: string | null;
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
   * For each gated step whose closeout proposes budgets for the steps after it, or whose approval set caps, those budgets (`gateBudgets`):
   * what `nemia decide` prints beside its approve line, and the gate on the board.
   */
  budgets: Record<string, GateBudgets>;
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
  /**
   * Where each result branch the reading asks of stands against the base branch (`branchesAsked`), as the judgement read it off the tick's
   * last pass: the fact under the run's result.
   */
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
   * which runs in flight they collide with, and the semantic conflict (`collisionsAt`), off the reading's branches; absent at any other
   * decision.
   */
  collisions?: Collisions;
};

/**
 * `lines`, a line by step, each of a person's word — an approval at a gate, a loop accepted as it stands — followed by who gave it
 * (`by`, the word's actor, in `actorWords`) where its file names one: `approved 10:04Z — "go" · by the person, on laptop`. A step with
 * no such word — a gate still awaiting its approval — has no actor, and its line is kept as it is.
 */
export const saidBy = (lines: Record<string, string>, by: (step: string) => Actor | undefined): Record<string, string> =>
  Object.fromEntries(
    Object.entries(lines).map(([step, line]) => {
      const actor = by(step);
      return [step, actor ? `${line} · by ${actorWords(actor)}` : line];
    }),
  );

/**
 * For each step whose current try a person answered, the answer beside the `needs` of the try before it, off `views` or, for a try
 * not among them, the engine's view of it (`e`, the call's `viewedOnce`).
 */
const answersOf = Effect.fn('answersOf')(function* (e: Engine, run: Run, views: ReadonlyMap<string, TaskView>, given: readonly RetryAsk[]) {
  const answers: Record<string, Answered> = {};
  for (const name of Object.keys(run.steps)) {
    const answer = answerOf(run, name, given);
    const last = run.steps[name]?.tries?.at(-1);
    if (!answer || last === undefined || answer.message === undefined) continue;
    const before = last.taskId;
    const closeout = (views.get(before) ?? (yield* engineAsked('view', e.view(before)))).state.attempts.at(-1)?.closeout;
    const c = closeout === undefined ? undefined : parseCloseout(closeout);
    answers[name] = {
      try: answer.try,
      message: answer.message,
      ...(c && !('error' in c) && c.needs ? { needs: c.needs } : {}),
      ...(answer.actor ? { actor: answer.actor } : {}),
    };
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
const costsOf = (steps: readonly StepSpec[], run: Run, used: Record<string, Usage | undefined>, spendOf: SpendOf): Record<string, string> =>
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
 * `nemia decide`'s answer (`Decided`) off a run's one reading (`StepsReading`): its judgement — each step's word, the tries and rounds
 * due, what is left to decide and the decision itself, the runs it waits on and is held until, the checkout's holder, every try's view —
 * so it says nothing of the run another reader of the same reading does not. Where the branches stand is the reading's (`at.git`, the
 * tick's last reading): the standings, the collisions at an ending and the cap's parents are read through it, and git is asked nothing.
 *
 * A cancelled, pruned or held run has no try or round due. Each line that would offer a verb (`retryLines`, `roundLines`, `answerLines`,
 * `overBudgetLine`, `gateLines`) says itself that it offers none, so the api's decision, which calls the same functions, says the same. The
 * cap on runs in flight, whose `WF_MAX_RUNS` before any pass is the program's `StoreConfig`'s, is read for whether a run nothing of which
 * is filed is held (`slotsOf`). Fails with a refusal a read threw.
 */
export const decidedOf = Effect.fn('decidedOf')(function* (at: StepsReading) {
  const { run, views, judged, git } = at;
  const config = yield* StoreConfig;
  const e = viewedOnce(seenBy(at.e, views));
  const { phaseOf, signedOff: reader, asked, verdictOf, checkKillOf, asks, roundAsks: rounds, checkout } = judged.read;
  const steps = [...at.steps];
  const { decision: d, assessed, spendOf } = judged;
  const closeouts = Object.fromEntries(Object.keys(run.steps).map((name) => [name, closeoutOf(views, run, name)]));
  const checks = Object.fromEntries(
    yield* checkReportsRead(run, steps, phaseOf, (p) => p === 'succeeded' || p === 'failed' || p === 'stopped').pipe(over(e)),
  );
  const place = yield* PlaceService;
  const standings = [...judged.read.standings];
  const decide = assessed.toDecide;
  const ending = collisionsDue(steps, run, decide);
  const collisions = ending ? yield* collisionsAt(at.home, run, ending, standings, git, place) : undefined;
  const answers = yield* answersOf(e, run, views, judged.answers);
  const used = consumption(views, run);
  const runs = !hasStarted(run) && !run.cancelledAt ? yield* (yield* RunDoor).runs.list() : [];
  const held = runs.length ? (yield* slotsOf(e, runs, config, passParents(git))).held.get(run.id) : undefined;
  const offers = [
    ...roundOffers(steps, run, d, spendOf),
    ...mergeOffers(place, steps, run, d, rounds, phaseOf, reader, asked, spendOf, verdictOf),
    ...retryOffers(steps, run, d, phaseOf, reader, asked, spendOf, verdictOf, () => landingDenies(run, place), checkKillOf),
  ];
  const answer: Decided = {
    run,
    steps,
    decision: d,
    closeouts,
    checks,
    retrying: assessed.retry,
    rounding: assessed.round,
    offers: offers.map((o) => o.said),
    commands: choicesOf(steps, run, d, offers),
    overBudgetLine: overBudgetLine(steps, run, d, spendOf),
    used,
    costs: costsOf(steps, run, used, spendOf),
    runCost: runCostLines(run, spendOf),
    runCostSaid: runCostWords(run, spendOf),
    answers,
    answering: answerLines(steps, run, d, phaseOf, reader, asked, spendOf),
    gates: saidBy(
      gateLines(steps, run, phaseOf, reader, asked, verdictOf, spendOf, asks, rounds, checkKillOf),
      (name) => approvalOf(run, name)?.actor,
    ),
    budgets: gatesBudgets(run, steps, reader, spendOf),
    accepted: saidBy(acceptedLines(steps, run), (name) => acceptanceOf(run, name)?.actor),
    waitingOn: waitingOnOf(run.id, run, views),
    denied: deniedLinesOf(run, views),
    waiting: [...judged.waits],
    holding: run.cancelledAt ? [] : [...judged.holds],
    said: saidOf(run, views),
    timeline: timeline(run, views, steps),
    ...(held ? { held } : {}),
    standings,
    ...(checkout ? { checkout } : {}),
    ...(decide ? { toDecide: decide } : {}),
    ...(collisions ? { collisions } : {}),
  };
  return answer;
});

/**
 * What is left for a person to do about the run `id` (`decidedOf`), off its one reading (`stepsReading`): the informer's judgement where
 * this process keeps one, else judged on demand, where the branches stand read off the tick's last reading (`standing.json`), never git
 * asked now. A run whose folder or a task journal of which does not read dies in `nemia decide`'s words (`saidBy`); fails with a refusal a
 * read threw (`Missing`, for a run that is not there).
 */
export const decideRun = Effect.fn('decide')(function* (id: string) {
  const run = yield* (yield* RunDoor).runs.read(RunId.read(id));
  const at = yield* stepsReading(run);
  if ('unjudged' in at) return yield* Effect.die(new Error(at.saidBy('nemia decide')));
  return yield* decidedOf(at);
});
