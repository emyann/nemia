/**
 * One read of a run, shared by its object (`runObject`) and its sub-resources (the tries, a try, its closeout, what a
 * step was told): the views of its tasks over one look at the harnesses, what the run is judged as off them, its checks, the feed's filing
 * times and its clock — each read once, and each step's current try and its tries judged off them alike.
 */
import { Effect } from 'effect';
import { timeline, type Timeline } from '../timeline/index.ts';
import { closeoutAsked, closeoutReader, exitVerdicts } from '../views/views.verb.ts';
import { phaseOfView } from '../views/views-words.ts';
import { type Engine, EngineService, tried } from '../runtime-client.ts';
import { realReleasesDir } from '../release/release.store.ts';
import type { RaiseReads } from '../retry/index.ts';
import { bare, filedTimes, type Filings, type Views, workflowsOf } from '../summary/reads.verb.ts';
import { stepSaid } from '../summary/judged.verb.ts';
import { type JudgedOrWhy, type Judgement, judgementsOf, sameJudgement } from '../summary/judgement.verb.ts';
import { informedJudgements, Informer, informerRead } from '../rest/informer.verb.ts';
import { verifiesRest } from '../config/config.store.ts';
import { standingReader, standingSnapshot } from '../standing/standing.verb.ts';
import { StoreRoot } from '../config/root.store.ts';
import type { Run } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { type CheckStderr, checksOf, refusedStderr, type StepCheck } from '../resource/checks.verb.ts';
import { attemptsIn, closeoutIn, type StepTry, triesOf, unreadableIn } from '../resource/tries.verb.ts';

/**
 * What the package judges of `run` (`Judgement`), its steps `folder` as it loads now: read through this process's informer where it keeps
 * one (`Informer`), served from what the tick's pass or an earlier request judged while every input it was judged on holds
 * (`informedJudgements`), and kept on a miss; judged on demand where it keeps none (`judgementsOf`), as an in-process read is. Where its
 * branches stand is read off `standing.json` (`standingSnapshot`).
 */
const judgedOn = Effect.fnUntraced(function* (e: Engine, home: string, run: Run) {
  const git = standingReader(yield* standingSnapshot());
  const informer = yield* Informer;
  const read = informer ? yield* informerRead(e, informer, yield* tried(() => verifiesRest()), git, sameJudgement) : undefined;
  const judged = read ? yield* informedJudgements(e, home, [run], read, git) : yield* judgementsOf(e, home, [run], git);
  const one = judged.runs.get(run.id);
  return one ?? (yield* Effect.die(new Error(`Run ${run.id} was handed to its judgement and not judged.`)));
});

/** What the run is judged as (`judge`), when it is. */
export type { JudgedRun } from '../summary/judgement.verb.ts';

/** What `stepsReading` read once of a run: its steps judged, their checks, and none of the clock. */
export type StepsReading = Judgement & {
  readonly e: Engine;
  readonly home: string;
  /** The workflow folder as it loads now, or why it does not (`workflowsOf`). */
  readonly folder: ReturnType<typeof workflowsOf>;
  /** The steps a page shows the workflow of: the frozen workflow, else the folder (`shownWorkflow`). */
  readonly source: readonly Workflow[] | null;
  readonly checks: ReadonlyMap<string, StepCheck>;
  readonly stderr: CheckStderr;
  /** The store's real releases folder, which a step's attempt is placed under to say the release it ran on (`realReleasesDir`). */
  readonly releases: string;
};

/** What `runReading` read once of a run: its steps (`StepsReading`), and its timeline off the feed's filing times. */
export type RunReading = StepsReading & { readonly clock: Timeline; readonly filed: ReadonlyMap<string, string> };

/**
 * Where what a page shows of a step's workflow is read from: the workflow the run froze at `nemia start`, which the tick
 * files from and `judgedSteps` judges by; the folder only for a record that froze none. Null when neither reads.
 */
const shownWorkflow = (run: Run, folder: readonly Workflow[] | null): readonly Workflow[] | null => run.workflow ?? folder;

/**
 * The run's steps read once (`StepsReading`): its judgement (`judgedOn`), the informer's where it serves one, else judged off the views of
 * its tasks over one look at the harnesses; or, when its unfrozen folder does not load or a task it reads does not, why it is not judged,
 * in the words the list says it with (`{ unjudged }`). The folder, whose words a page shows, is read now, and a refused check's streams
 * through the engine's `output`, which observes nothing, on each read. No feed is read: a step's tries, closeout and told layers are
 * answered from this alone.
 */
export const stepsReading = Effect.fnUntraced(function* (run: Run) {
  const e = yield* EngineService;
  const home = yield* StoreRoot;
  const folder = workflowsOf(run, home);
  return yield* stepsReadingOf(e, home, run, yield* judgedOn(e, home, run), folder);
});

/**
 * The run's steps read once (`StepsReading`) off its judgement in hand (`one`, or why it is not judged) and its `folder` as it loads now,
 * as `stepsReading` reads them: what the RunList builds each run of its page from, having judged the page in one batch.
 */
export const stepsReadingOf = Effect.fnUntraced(function* (
  e: Engine,
  home: string,
  run: Run,
  one: JudgedOrWhy,
  folder: ReturnType<typeof workflowsOf>,
) {
  if ('unjudged' in one) return { unjudged: one.unjudged };
  const { judgement } = one;
  const stderr = yield* Effect.promise(() => refusedStderr(e, run, judgement.views));
  const checks = yield* Effect.promise(() => checksOf(e, run, judgement.steps, judgement.views, stderr));
  const source = shownWorkflow(run, folder.steps);
  const at: StepsReading = { ...judgement, run, e, home, folder, source, checks, stderr, releases: realReleasesDir(home) };
  return at;
});

/**
 * Whether a read of `at` failed where it would read again: a refused check's stream the engine did not give (`unreadable`). What is built
 * on such a read is served once and never kept, since the run's inputs may not move until it reads.
 */
export const readFailed = ({ checks, stderr }: StepsReading): boolean =>
  [...stderr.values()].some((said) => typeof said === 'string') ||
  [...checks.values()].some((check) => check.refused?.unreadable != null);

/**
 * The run read once (`RunReading`): its steps (`stepsReading`), then its timeline, off the feed's filing times read on from `filings`
 * (`filedTimes`); or why it is not judged (`{ unjudged }`).
 */
export const runReading = Effect.fnUntraced(function* (run: Run, filings: Filings) {
  const steps = yield* stepsReading(run);
  if ('unjudged' in steps) return steps;
  return runReadingOf(steps, yield* filedTimes(steps.e, filings));
});

/** The run read once (`RunReading`) off its steps read (`StepsReading`) and the feed's filing times `filed`, read already. */
export const runReadingOf = (steps: StepsReading, filed: ReadonlyMap<string, string>): RunReading => ({
  ...steps,
  clock: timeline(steps.run, steps.views, filed, steps.steps),
  filed,
});

/** What a step's raise and status word are read from, off the views already read (`RaiseReads`), as `nemia decide` reads them. */
export const raiseReads = (run: Run, views: Views): RaiseReads => ({
  phaseOf: (taskId) => phaseOfView(views.get(taskId)),
  closeoutOf: closeoutReader(views, run),
  askedCloseout: closeoutAsked(views),
  verdictOf: exitVerdicts(views, run),
});

/** The step `name`'s current try as judged: its codes and word, its check, its closeout or why it does not read, and its attempts. */
export const currentOf = ({ run, source, steps, views, judged, checks, releases }: StepsReading, name: string) => {
  const taskId = run.steps[name]?.taskId ?? null;
  const step = source?.find((s) => s.name === name);
  return {
    ...stepSaid(judged, name),
    check: checks.get(name) ?? null,
    closeout: closeoutIn(run, name, step ?? bare(name), taskId, views, steps),
    unreadable: unreadableIn(taskId, views),
    attempts: attemptsIn(taskId, views, releases),
  };
};

/** The step `name`'s tries, earliest first, the current one last (`triesOf`), with its current try as judged (`currentOf`). */
export const triesIn = (at: StepsReading, name: string, current = currentOf(at, name)): StepTry[] =>
  triesOf(at.run, name, at.steps, at.views, current, at.judged.answers, at.stderr, at.releases);
