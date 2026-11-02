/**
 * One read of a run, shared by its page (`runPage`), its object (`runObject`) and its sub-resources (the tries, a try, its closeout, what a
 * step was told): the views of its tasks over one look at the harnesses, what the run is judged as off them, its checks, the feed's filing
 * times and its clock — each read once, and each step's current try and its tries judged off them alike.
 */
import { Effect } from 'effect';
import { timeline, type Timeline } from '../timeline/index.ts';
import { closeoutAsked, closeoutReader, exitVerdicts } from '../views/views.verb.ts';
import { phaseOfView } from '../views/views-words.ts';
import { type Engine, EngineService } from '../runtime-client.ts';
import type { RaiseReads } from '../retry/index.ts';
import {
  bare,
  filedTimes,
  type Filings,
  judgedSteps,
  judgedUnlessUnreadable,
  stepNames,
  type Views,
  viewsFor,
  workflowsOf,
} from '../summary/reads.verb.ts';
import { judge, standingsOf, stepSaid } from '../summary/judged.verb.ts';
import { standingReader, standingSnapshot } from '../standing/standing.verb.ts';
import { StoreRoot } from '../config/root.store.ts';
import type { Run } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { type CheckStderr, checksOf, refusedStderr, type StepCheck } from '../resource/checks.verb.ts';
import { attemptsIn, closeoutIn, type StepTry, triesOf, unreadableIn } from '../resource/tries.verb.ts';

/**
 * The views of `run`'s tasks over `e`, and what the run is judged as off them, its steps `names` of `workflows`, where its branches stand
 * read off `standing.json` (`standingSnapshot`): or, when its unfrozen folder does not load or a task it reads does not, why it is not
 * judged (`judgedUnlessUnreadable`).
 */
const judgedOn = Effect.fnUntraced(function* (e: Engine, run: Run, names: readonly string[], workflows: readonly Workflow[] | null) {
  const { views, reader, unreadable } = yield* viewsFor(e, [run]);
  const git = standingReader(yield* standingSnapshot());
  const standings = (status: Parameters<typeof standingsOf>[2], steps: Parameters<typeof standingsOf>[1]) =>
    standingsOf(run, steps, status, git);
  const read = yield* judgedUnlessUnreadable(run, unreadable, () => judge(run, names, workflows, views, { reader, git, standings }));
  return { views, read };
});

/** What the run is judged as (`judge`), when it is. */
export type JudgedRun = Extract<Effect.Success<ReturnType<typeof judge>>, object>;

/** What `runReading` read once of a run. */
export type RunReading = {
  readonly e: Engine;
  readonly home: string;
  readonly run: Run;
  /** The workflow folder as it loads now, or why it does not (`workflowsOf`). */
  readonly folder: ReturnType<typeof workflowsOf>;
  /** Its steps by name, in the order the run started with them (`stepNames`). */
  readonly names: readonly string[];
  /** The steps it is judged by (`judgedSteps`). */
  readonly steps: readonly Workflow[];
  /** The steps a page shows the workflow of: the frozen workflow, else the folder (`shownWorkflow`). */
  readonly source: readonly Workflow[] | null;
  readonly views: Views;
  readonly judged: JudgedRun;
  readonly checks: ReadonlyMap<string, StepCheck>;
  readonly stderr: CheckStderr;
  readonly clock: Timeline;
  readonly filed: ReadonlyMap<string, string>;
};

/**
 * Where what a page shows of a step's workflow is read from: the workflow the run froze at `nemia start`, which the tick
 * files from and `judgedSteps` judges by; the folder only for a record that froze none. Null when neither reads.
 */
const shownWorkflow = (run: Run, folder: readonly Workflow[] | null): readonly Workflow[] | null => run.workflow ?? folder;

/**
 * The run read once (`RunReading`), off the views of its tasks over one look at the harnesses (`viewsFor`), the feed's filing times read on
 * from `filings` (`filedTimes`); or, when its unfrozen folder does not load or a task it reads does not, why it is not judged, in the words
 * the list says it with (`{ unjudged }`). A refused check's streams are read through the engine's `output`, which observes nothing.
 */
export const runReading = Effect.fnUntraced(function* (run: Run, filings: Filings) {
  const e = yield* EngineService;
  const home = yield* StoreRoot;
  const folder = workflowsOf(run, home);
  const names = stepNames(run, folder.steps);
  const { views, read } = yield* judgedOn(e, run, names, folder.steps);
  if ('unreadable' in read) return { unjudged: read.unreadable };
  const steps = judgedSteps(run, folder.steps);
  const stderr = yield* Effect.promise(() => refusedStderr(e, run, views));
  const checks = yield* Effect.promise(() => checksOf(e, run, steps, views, stderr));
  const filed = yield* filedTimes(e, filings);
  const clock = timeline(run, views, filed, steps);
  const source = shownWorkflow(run, folder.steps);
  const at: RunReading = { e, home, run, folder, names, steps, source, views, judged: read.judged, checks, stderr, clock, filed };
  return at;
});

/** What a step's raise and status word are read from, off the views already read (`RaiseReads`), as `nemia decide` reads them. */
export const raiseReads = (run: Run, views: Views): RaiseReads => ({
  phaseOf: (taskId) => phaseOfView(views.get(taskId)),
  closeoutOf: closeoutReader(views, run),
  askedCloseout: closeoutAsked(views),
  verdictOf: exitVerdicts(views, run),
});

/** The step `name`'s current try as judged: its codes and word, its check, its closeout or why it does not read, and its attempts. */
export const currentOf = ({ run, source, views, judged, checks }: RunReading, name: string) => {
  const taskId = run.steps[name]?.taskId ?? null;
  const step = source?.find((s) => s.name === name);
  return {
    ...stepSaid(judged, name),
    check: checks.get(name) ?? null,
    closeout: closeoutIn(run, name, step ?? bare(name), taskId, views),
    unreadable: unreadableIn(taskId, views),
    attempts: attemptsIn(taskId, views),
  };
};

/** The step `name`'s tries, earliest first, the current one last (`triesOf`), with its current try as judged (`currentOf`). */
export const triesIn = (at: RunReading, name: string, current = currentOf(at, name)): StepTry[] =>
  triesOf(at.run, name, at.steps, at.views, current, at.judged.answers, at.stderr);
