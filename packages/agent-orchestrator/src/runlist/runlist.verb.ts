/**
 * The runs in two reads, beside the whole list: the runs that wait on a person and the runs in flight, with the counts of each and of the
 * finished (`runsOpen`), and one page of the finished runs, newest first (`runsFinished`). Each is the whole list's own answer
 * (`runsSummarized`), read off the same memo of runs at rest, sorted by the rules of `runlist.ts`, and keeps nothing of its own.
 *
 * A controller: it reads the list, and for the runs that wait on a person alone their records, the engine's views of their tasks and
 * the feed's filing times, which a run answered from memory was not read for.
 */
import { Effect } from 'effect';
import { type Engine, tried } from '../runtime-client.ts';
import { runStore } from '../record/files.store.ts';
import type { Run } from '../record/record.ts';
import { Invalid } from '../refusal/refusal.ts';
import { stepSpend, taskSpend } from '../status/status.ts';
import { type Spent, spentOf } from '../summary/judged.verb.ts';
import { filedTimes, judgedSteps, unreadableOf, type Unreadable, type Views, viewsFor, workflowsOf } from '../summary/reads.verb.ts';
import { type RunSummary, runsSummarized, type SummaryHow } from '../summary/summary.verb.ts';
import { clockOf, waitingSinceOf, type RunClock } from '../timeline/index.ts';
import {
  byFinished,
  finishedAtOf,
  type FinishedRun as Finished,
  inFactory,
  kindOf,
  type ListedRun as Listed,
  outcomeOf,
  type Page,
  pageAsked,
  pageOf,
  wallMsOf,
} from './runlist.ts';

export type { RunClock };
export type { RunKind, RunOutcome } from './runlist.ts';

/** A run in either read: the whole list's summary of it, its wall time in ms, and when it finished, null for a run that has not. */
export type ListedRun = Listed<RunSummary>;

/** What one step of a run has cost, every try's session together; `cost` null until one was measured. */
export type StepCost = { step: string; cost: Spent | null };

/**
 * A run that waits on a person: its `clock`, where its wall time went until now (`RunClock`), `stepCosts`, the cost of each of its
 * steps in the summary's order, and `waitingSince`, when its present wait on a person began (`waitingSinceOf`): the end of the waiting
 * step's last try or the placing of a hold only a person lifts, the earliest where several are open. All three null for a run a task of
 * which does not read, or whose record is gone since the list was read; `waitingSince` null too for a wait the record does not date, as
 * one on a run that never ships.
 */
export type WaitingRun = ListedRun & { clock: RunClock | null; stepCosts: StepCost[] | null; waitingSince: string | null };

/** A finished run on its page: when its work stopped, and how it ended (`RunOutcome`). */
export type FinishedRun = Finished<RunSummary>;

/**
 * The light answer: the instant it was read at (`asOf`), how many runs wait on a person, are in flight and are finished, and the first
 * two kinds whole, each in the store's order. A run that moves and also waits is among the waiting, once.
 */
export type OpenRuns = {
  asOf: string;
  counts: { waiting: number; inFlight: number; finished: number };
  waiting: WaitingRun[];
  inFlight: ListedRun[];
};

/** One page of the finished runs, newest first by when their work stopped (`byFinished`), read at `asOf`. */
export type FinishedPage = { asOf: string } & Page<FinishedRun>;

/** What both reads are asked: the one factory whose runs to keep, every factory's where undefined, and the instant they are read at. */
type Asked = { factory?: string; now: number };

/** What is read of no run: no view, and no task left out. */
const NONE_READ: { views: Views; unreadable: Unreadable } = { views: new Map(), unreadable: new Map() };

/**
 * The store a waiting run's parents are looked for in: none. A breakdown reads the run's own tasks, so no run it waits on, or is held
 * until, is read for it.
 */
const NO_PARENT = (): readonly Run[] => [];

/** A summary with its wall time until `now`, and no time it finished at. */
const listedAt =
  (now: number) =>
  (run: RunSummary): ListedRun => ({ ...run, wallMs: wallMsOf(run, now), finishedAt: null });

/** The records of `ids` the store still has, in their order. */
const recordsOf = (ids: readonly string[]): Run[] => ids.filter((id) => runStore.runs.exists(id)).map((id) => runStore.runs.read(id));

/**
 * What a waiting run's card breaks down (`WaitingRun`), off its record and the views of its tasks; null where one of them does not
 * read.
 */
function brokenDown(
  summary: RunSummary,
  run: Run | undefined,
  read: { views: Views; unreadable: Unreadable; filed: ReadonlyMap<string, string> },
  how: { home: string; now: number },
): Pick<WaitingRun, 'clock' | 'stepCosts' | 'waitingSince'> {
  if (!run || unreadableOf(run, read.unreadable)) return { clock: null, stepCosts: null, waitingSince: null };
  const held = summary.holding?.onYou ? summary.holding.at : null;
  const steps = judgedSteps(run, workflowsOf(run, how.home).steps);
  return {
    clock: clockOf(run, read.views, read.filed, steps, summary.waitingOnYou, how.now),
    stepCosts: summary.steps.map(({ name }) => ({
      step: name,
      cost: spentOf(stepSpend(run, name, (id) => taskSpend(read.views.get(id)))),
    })),
    waitingSince: waitingSinceOf(run, read.views, read.filed, steps, summary.waitingOnYou, held),
  };
}

/**
 * The runs that wait on a person and the runs in flight, of `asked.factory` or of every factory, with the three counts (`OpenRuns`).
 * The waiting runs alone are read for their breakdowns: their records, the views of their own tasks and the feed's filing times; a run
 * one of them waits on is not read.
 */
export const runsOpen = Effect.fn('runsOpen')(function* (e: Engine, how: SummaryHow, asked: Asked) {
  const all = (yield* runsSummarized(e, how)).filter(inFactory(asked.factory));
  const of = (kind: ReturnType<typeof kindOf>) => all.filter((run) => kindOf(run) === kind);
  const waiting = of('waiting');
  const inFlight = of('inFlight');
  const records = yield* tried(() => recordsOf(waiting.map((run) => run.id)));
  const { views, unreadable } = records.length ? yield* viewsFor(e, records, NO_PARENT) : NONE_READ;
  const filed = records.length ? yield* filedTimes(e, how.filings) : new Map<string, string>();
  const byId = new Map(records.map((run) => [run.id, run]));
  const open: OpenRuns = {
    asOf: new Date(asked.now).toISOString(),
    counts: { waiting: waiting.length, inFlight: inFlight.length, finished: all.length - waiting.length - inFlight.length },
    waiting: waiting.map((run) => ({
      ...listedAt(asked.now)(run),
      ...brokenDown(run, byId.get(run.id), { views, unreadable, filed }, { home: how.home, now: asked.now }),
    })),
    inFlight: inFlight.map(listedAt(asked.now)),
  };
  return open;
});

/**
 * One page of the finished runs of `asked.factory`, or of every factory, newest first by when their work stopped (`FinishedPage`): page
 * `asked.page` of `asked.size` rows, as the texts say them (`pageAsked`). A page past the last is empty, and says the total and the pages
 * there are. Refused (`Invalid`), before anything is read: a `page` that is no whole number from 1, a `size` that is none from 1 to 100.
 */
export const runsFinished = Effect.fn('runsFinished')(function* (
  e: Engine,
  how: SummaryHow,
  asked: Asked & { page?: string; size?: string },
) {
  const paged = pageAsked(asked);
  if ('refused' in paged)
    return yield* Effect.fail(new Invalid({ message: `the finished runs are read a page at a time: ${paged.refused}` }));
  const finished = (yield* runsSummarized(e, how))
    .filter(inFactory(asked.factory))
    .filter((run) => kindOf(run) === 'finished')
    .sort(byFinished)
    .map((run): FinishedRun => ({ ...run, wallMs: wallMsOf(run, asked.now), finishedAt: finishedAtOf(run), outcome: outcomeOf(run) }));
  const page: FinishedPage = { asOf: new Date(asked.now).toISOString(), ...pageOf(finished, paged.page, paged.size) };
  return page;
});
