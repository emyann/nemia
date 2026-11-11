/**
 * A run's judgement (`Judgement`): the views of its tasks, its steps, and what the package judges of it off them (`judge`), with the
 * branches git was asked about for it — the one reading the runs list's row (`summaryOf`), the run's object and its sub-resources
 * (`stepsReading`) are each built from, so the list and the object say a run alike (Q18). Judged for many runs off one listing of their
 * tasks (`judgementsOf`), and read through the informer (`informedJudgements` in rest/informer.verb.ts) where a process keeps one, so the
 * tick's pass judges a run once and the requests answer from that. A controller: it reads the engine's journals through the client, the
 * store's workflow folders and where branches stand as its `git` gives them.
 */
import { isDeepStrictEqual } from 'node:util';
import { Effect } from 'effect';
import type { Engine } from '../runtime-client.ts';
import type { BranchReader } from '../branches/branches.store.ts';
import { runTasks, type Run } from '../record/record.ts';
import type { StepSpec } from '../step/step.ts';
import {
  judgedSteps,
  judgedUnlessUnreadable,
  seenBy,
  stepNames,
  type Unreadable,
  type Views,
  viewsFor,
  viewsOf,
  workflowsOf,
} from './reads.verb.ts';
import { type GitAsked, judge, standingsOf } from './judged.verb.ts';
import { unjudgedWord } from '../views/views.verb.ts';

/** What the run is judged as (`judge`), when it is. */
export type JudgedRun = Extract<Effect.Success<ReturnType<typeof judge>>, object>;

/**
 * A run judged: the run as it was read, its steps by name in the order the run started with them (`stepNames`), the steps it is judged by
 * (`judgedSteps`), the views of its tasks — and of the runs it waits on — it was judged off, the judgement, and the branches git was asked
 * about for it (`GitAsked`), which the informer keeps it against.
 */
export type Judgement = {
  readonly run: Run;
  readonly names: readonly string[];
  readonly steps: readonly StepSpec[];
  readonly views: Views;
  readonly judged: JudgedRun;
  readonly asked: GitAsked;
};

/** A step of a run left unjudged: its word off the views that did read (`unjudgedWord`), and its branch, null where it has none. */
export type UnjudgedStep = { readonly name: string; readonly message: string; readonly branch: string | null };

/**
 * A run judged (`judgement`), or why it is not, in the words the list says it with (`unjudged`) and in a reader's own (`saidBy`), with
 * each step's word off its record (`steps`).
 */
export type JudgedOrWhy =
  | { judgement: Judgement }
  | { unjudged: string; saidBy: (by: string) => string; steps: readonly UnjudgedStep[] };

/** What `judgementsOf` read: each run's judgement or why it has none, and the views and unreadable journals of the one listing. */
export type Judgements = { readonly runs: ReadonlyMap<string, JudgedOrWhy>; readonly views: Views; readonly unreadable: Unreadable };

/** Each of `names` of `run` as a run left unjudged words it (`unjudgedWord`), off the views that did read, with its branch. */
const unjudgedSteps = (run: Run, names: readonly string[], views: Views, unreadable: Unreadable): UnjudgedStep[] => {
  const wordOf = unjudgedWord(views, unreadable);
  return names.map((name) => ({ name, message: wordOf(run.steps[name]), branch: run.steps[name]?.branch ?? null }));
};

/**
 * `runs` judged, off one listing of their tasks and of the runs they wait on, found among `store` (`viewsFor`), through a reader that
 * answers each task off it (`seenBy`), where their branches stand as `git` gives them: each with the branches it asked git about. A run
 * whose unfrozen folder does not load or a task of which does not read is not judged, and says why (`judgedUnlessUnreadable`).
 */
export const judgementsOf = Effect.fn('judgementsOf')(function* (
  e: Engine,
  home: string,
  runs: readonly Run[],
  git: BranchReader,
  store?: () => readonly Run[],
) {
  const { views, reader, unreadable } = yield* viewsFor(e, runs, store);
  const out = new Map<string, JudgedOrWhy>();
  for (const run of runs) {
    const folder = workflowsOf(run, home).steps;
    const names = stepNames(run, folder);
    const asked: GitAsked = { branches: [], failed: false };
    const one = yield* judgedUnlessUnreadable(run, unreadable, () =>
      judge(run, names, folder, views, {
        reader,
        git,
        standings: (status, steps) => standingsOf(run, steps, status, git, asked),
      }),
    );
    out.set(
      run.id,
      'judged' in one
        ? { judgement: { run, names, steps: judgedSteps(run, folder), views, judged: one.judged, asked } }
        : { unjudged: one.unreadable, saidBy: one.saidBy, steps: unjudgedSteps(run, names, views, unreadable) },
    );
  }
  return { runs: out, views, unreadable } satisfies Judgements;
});

/**
 * Whether a judgement may be kept across passes: a run at rest, which nothing but a person, git or the engine's journals can move. Its
 * status not `running` or the run pruned, nothing of it moving, waited on or held, every task it has filed settled, the workflow it is
 * judged by frozen on its record — a folder on disk is watched by nothing — and git's every answer given. The tick's own test (`atRest`
 * in rest.ts) reads what a pass would file; this reads what the run is judged as.
 */
export const restingOf = Effect.fnUntraced(function* (e: Engine, { run, judged, asked, views }: Judgement) {
  if (!run.workflow || run.hold || asked.failed || judged.moving || judged.waiting || judged.holding) return false;
  if (!run.pruned && judged.status === 'running') return false;
  return [...(yield* viewsOf(run, seenBy(e, views))).values()].every((view) => view.state.settled);
});

/**
 * What two judgements of a run are compared by under `WF_VERIFY_REST`: everything but the functions the judgement carries — its spend
 * reader, and the read it was made on, whose views and standings are compared already, through `views` and what was decided on them.
 */
const comparable = ({ run, names, steps, views, judged, asked }: Judgement) => {
  const { spendOf: _, read: __, ...said } = judged;
  return { run: JSON.stringify(run), names, steps, views: runTasks(run).map((id) => views.get(id)), said, asked };
};

/** Whether a judgement from memory and one made afresh say the same of the run. */
export const sameJudgement = (kept: Judgement, fresh: Judgement): boolean => isDeepStrictEqual(comparable(kept), comparable(fresh));
