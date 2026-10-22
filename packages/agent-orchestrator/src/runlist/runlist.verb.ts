/**
 * The runs in two reads, beside the whole list: the runs that wait on a person and the runs in flight, with the counts of each and of the
 * finished (`runsOpen`), and one page of the finished runs, newest first (`runsFinished`). Each is the whole list's own answer
 * (`runsSummarized`), read off the same memo of runs at rest, sorted by the rules of `runlist.ts`, and keeps nothing of its own.
 *
 * A controller: it reads the list, and for every row of either read its record, the engine's views of its tasks and the feed's filing
 * times, which a run answered from memory was not read for — the clock of a row is broken down on the board, so every row carries one.
 * The finished read pages first and reads that page's rows alone, so what it costs is bounded by the page and not by the store.
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
  clockUntilOf,
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

/**
 * A run in either read: the whole list's summary of it, its wall time in ms, when it finished, null for a run that has not, and its
 * `clock`, where that wall time went (`RunClock`) — null for a run a task of which does not read, or whose record is gone since the
 * list was read. A row's clock is read at the instant its wall time is measured to (`clockUntilOf`), so the clock's `wallMs` is the
 * row's own and its five parts add up to it.
 */
export type ListedRun = Listed<RunSummary> & { clock: RunClock | null };

/** What one step of a run has cost, every try's session together; `cost` null until one was measured. */
export type StepCost = { step: string; cost: Spent | null };

/**
 * A run that waits on a person: beyond every row's `clock`, `stepCosts`, the cost of each of its steps in the summary's order, and
 * `waitingSince`, when its present wait on a person began (`waitingSinceOf`): the end of the waiting step's last try or the placing of
 * a hold only a person lifts, the earliest where several are open. Both null for a run a task of which does not read, or whose record
 * is gone since the list was read; `waitingSince` null too for a wait the record does not date, as one on a run that never ships.
 */
export type WaitingRun = ListedRun & { stepCosts: StepCost[] | null; waitingSince: string | null };

/** A finished run on its page: when its work stopped, how it ended (`RunOutcome`), and its `clock`, frozen at its finish. */
export type FinishedRun = Finished<RunSummary> & { clock: RunClock | null };

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

/** The records of `ids` the store still has, in their order. */
const recordsOf = (ids: readonly string[]): Run[] => ids.filter((id) => runStore.runs.exists(id)).map((id) => runStore.runs.read(id));

/** What a row's breakdowns are read off: the engine's views of its tasks, the tasks left out, and the feed's filing times. */
type Read = { views: Views; unreadable: Unreadable; filed: ReadonlyMap<string, string> };

/** Everything the rows of one read are broken down off: what was read of their tasks, and each record the store still has, by id. */
type Broken = Read & { byId: ReadonlyMap<string, Run> };

/** What `rows` are broken down off: their records, the engine's views of their own tasks, and the feed's filing times. */
const brokenOff = Effect.fn('brokenOff')(function* (e: Engine, how: SummaryHow, rows: readonly RunSummary[]) {
  const records = yield* tried(() => recordsOf(rows.map((run) => run.id)));
  const read = records.length ? yield* viewsFor(e, records, NO_PARENT) : NONE_READ;
  const filed = records.length ? yield* filedTimes(e, how.filings) : new Map<string, string>();
  const broken: Broken = { ...read, filed, byId: new Map(records.map((run) => [run.id, run])) };
  return broken;
});

/** The workflow a run's breakdowns judge it by. */
const judgedBy = (run: Run, home: string) => judgedSteps(run, workflowsOf(run, home).steps);

/**
 * A row of either read: its summary, its wall time until `now`, when it finished, and its clock read at the instant that wall time is
 * measured to (`clockUntilOf`); the clock null where the run's record is gone or a task of it does not read.
 */
const listedAt =
  (broken: Broken, home: string, now: number) =>
  (run: RunSummary): ListedRun => {
    const record = broken.byId.get(run.id);
    return {
      ...run,
      wallMs: wallMsOf(run, now),
      finishedAt: null,
      clock:
        !record || unreadableOf(record, broken.unreadable)
          ? null
          : clockOf(record, broken.views, broken.filed, judgedBy(record, home), run.waitingOnYou, clockUntilOf(run, now)),
    };
  };

/**
 * What a waiting run's card breaks down beyond its clock (`WaitingRun`), off its record and the views of its tasks; both null where one
 * of them does not read.
 */
function brokenDown(summary: RunSummary, broken: Broken, home: string): Pick<WaitingRun, 'stepCosts' | 'waitingSince'> {
  const run = broken.byId.get(summary.id);
  if (!run || unreadableOf(run, broken.unreadable)) return { stepCosts: null, waitingSince: null };
  const held = summary.holding?.onYou ? summary.holding.at : null;
  return {
    stepCosts: summary.steps.map(({ name }) => ({
      step: name,
      cost: spentOf(stepSpend(run, name, (id) => taskSpend(broken.views.get(id)))),
    })),
    waitingSince: waitingSinceOf(run, broken.views, broken.filed, judgedBy(run, home), summary.waitingOnYou, held),
  };
}

/**
 * The runs that wait on a person and the runs in flight, of `asked.factory` or of every factory, with the three counts (`OpenRuns`).
 * Both kinds are read for their clocks — their records, the views of their own tasks and the feed's filing times — and the waiting
 * runs for their costs and their wait besides; a run one of them waits on is not read.
 */
export const runsOpen = Effect.fn('runsOpen')(function* (e: Engine, how: SummaryHow, asked: Asked) {
  const all = (yield* runsSummarized(e, how)).filter(inFactory(asked.factory));
  const of = (kind: ReturnType<typeof kindOf>) => all.filter((run) => kindOf(run) === kind);
  const waiting = of('waiting');
  const inFlight = of('inFlight');
  const broken = yield* brokenOff(e, how, [...waiting, ...inFlight]);
  const listed = listedAt(broken, how.home, asked.now);
  const open: OpenRuns = {
    asOf: new Date(asked.now).toISOString(),
    counts: { waiting: waiting.length, inFlight: inFlight.length, finished: all.length - waiting.length - inFlight.length },
    waiting: waiting.map((run) => ({ ...listed(run), ...brokenDown(run, broken, how.home) })),
    inFlight: inFlight.map(listed),
  };
  return open;
});

/**
 * One page of the finished runs of `asked.factory`, or of every factory, newest first by when their work stopped (`FinishedPage`): page
 * `asked.page` of `asked.size` rows, as the texts say them (`pageAsked`). A page past the last is empty, and says the total and the pages
 * there are. Refused (`Invalid`), before anything is read: a `page` that is no whole number from 1, a `size` that is none from 1 to 100.
 *
 * It pages first, then reaches the engine for that page's rows alone — their records, the views of their own tasks and the feed's
 * filing times — so each row carries the clock its cell breaks down, and the read costs the page's rows and never the store's: at most
 * `PAGE_MAX` runs, nine where the board asks.
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
    .sort(byFinished);
  const of = pageOf(finished, paged.page, paged.size);
  const broken = yield* brokenOff(e, how, of.runs);
  const listed = listedAt(broken, how.home, asked.now);
  const rows = of.runs.map((run): FinishedRun => ({ ...listed(run), finishedAt: finishedAtOf(run), outcome: outcomeOf(run) }));
  const page: FinishedPage = { asOf: new Date(asked.now).toISOString(), ...of, runs: rows };
  return page;
});
