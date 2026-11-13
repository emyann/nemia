/**
 * The runs as the board reads them off the RunList (`runs.listAll`, `runs.list`), each made the board's one view of a run (`runViewOf`)
 * or said unjudged (`UnjudgedRun`): the light answer of the runs not finished (`openRunsQuery`), the finished runs a page at a time
 * (`finishedRunsQuery`, `finishedPagesQuery`) or those finished today (`finishedTodayQuery`), and a label's runs whole (`runsSelectedQuery`);
 * and a run's named actions, each in the run's namespace. No page reads every run (`test/structure.test.ts`).
 */
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import type { Run, RunHeld, RunList, RunRemoved, RunUnjudged } from 'objects';
import { Concluded as ConcludedAnswer, type RunClock, type RunOutcome, type StepCost } from 'objects';
import { pace } from '../feed.ts';
import { selectorKey } from './selector.ts';
import { call, read, runs, type RunListQuery } from './objects.ts';
import { factoryIn } from './namespace.ts';
import { runViewOf, type RunRow, type RunView, type UnjudgedRun } from './judged.ts';
import type { FinishedPageRead, ReadsOnToday } from '../../../contracts/finished-today.contract.ts';

export type { RunClock, RunOutcome, StepCost } from 'objects';

/** A run the list could not judge, as the board reads it. */
const unjudgedOf = (run: RunUnjudged): UnjudgedRun => ({ id: run.name, factory: factoryIn(run.namespace), unjudged: run.error });

/** In name order, as the list's. */
const byName = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Every run of a list: each run judged (`runViewOf`) and each it could not judge (`UnjudgedRun`), in name order as the list's. */
export const rowsOf = (list: RunList): RunRow[] => [...list.items.map(runViewOf), ...(list.unjudged ?? []).map(unjudgedOf)].sort(byName);

/** Every run of `query`, the RunList whole: a plain list, no page and no state, so no run's frame is measured. */
const everyRun = (query: RunListQuery = {}): Promise<RunRow[]> => runs.listAll(query).then(rowsOf);

/** TEMPORARY: every run, until its last reader moves off it; deleted in this run. */
export const runsQuery = queryOptions({
  queryKey: ['runs'],
  queryFn: () => everyRun(),
  refetchInterval: () => pace(5_000),
});

/**
 * The runs `selector` takes by their labels (`GET /api/runs?labelSelector=`), every page of them, under `['runs']`: the labels page's,
 * which counts a label's runs by how each ended. Read again on each event of the workflow feed (`useFeed`), and every 5 s while the feed
 * is not followed — every minute while it is.
 */
export const runsSelectedQuery = (selector: string) =>
  queryOptions({
    queryKey: ['runs', ...selectorKey(selector)],
    queryFn: () => everyRun(selector.trim() === '' ? {} : { labelSelector: selector.trim() }),
    refetchInterval: () => pace(5_000),
  });

/**
 * A run in the frame, as a list asked by state carries it: its wall time to the list's `asOf` (`wallMs`), when its work stopped, null
 * while it has not, and where that wall time went (`clock`), null where the api could not read it — what its Clock cell breaks down.
 */
export type ListedRun = RunView & { wallMs: number; finishedAt: string | null; clock: RunClock | null };

/**
 * A run that waits on a person, as the frame lists it: beyond every listed run's `clock`, the cost of each of its steps (`stepCosts`)
 * and the instant its present wait on a person began (`waitingSince`), each null where the api could not read it, the last also where
 * the api dates no such wait.
 */
export type WaitingRun = ListedRun & { stepCosts: StepCost[] | null; waitingSince: string | null };

/**
 * The frame, off the list of the runs not finished: the instant it is measured to (`asOf`), the runs that wait on a person (`waiting`)
 * and the runs in flight (`inFlight`), each in one by its `status.state` — a run the list could not judge by the state the list gives
 * it, in flight where it gives none — and `counts` of each and of the finished runs, which it lists none of.
 */
export type OpenRuns = {
  asOf: string;
  counts: { waiting: number; inFlight: number; finished: number };
  waiting: Array<WaitingRun | UnjudgedRun>;
  inFlight: Array<ListedRun | UnjudgedRun>;
};

/** A run's view with the frame's parts its by-state list carries, each none where a plain list answered. */
const listedOf = (run: Run): ListedRun => ({
  ...runViewOf(run),
  wallMs: run.status.wallMs ?? 0,
  finishedAt: run.status.finishedAt ?? null,
  clock: run.status.clock ?? null,
});

/** A waiting run's view, with its steps' costs and the start of its wait. */
const waitingOf = (run: Run): WaitingRun => ({
  ...listedOf(run),
  stepCosts: run.status.stepCosts ?? null,
  waitingSince: run.status.waitingSince ?? null,
});

/** The counts a by-state list carries, none where a list carries none. */
const NO_COUNTS = { waiting: 0, inFlight: 0, finished: 0 };

/** Each run of a by-state list in its state, judged or not, in name order. */
const statedOf = (list: RunList): Array<{ id: string; state: Run['status']['state']; run: Run | RunUnjudged }> =>
  [
    ...list.items.map((run) => ({ id: run.metadata.name, state: run.status.state, run })),
    ...(list.unjudged ?? []).map((run) => ({ id: run.name, state: run.state ?? ('inFlight' as const), run })),
  ].sort(byName);

/** A run of a by-state list read as the frame reads it: `read` for a run judged, `UnjudgedRun` for one not. */
const frameOf =
  <R>(read: (run: Run) => R) =>
  (run: Run | RunUnjudged): R | UnjudgedRun =>
    'error' in run ? unjudgedOf(run) : read(run);

/** The frame (`OpenRuns`) off the list of the runs not finished: each run in its state's part, the counts and `asOf` the list's. */
export function openOf(list: RunList): OpenRuns {
  const stated = statedOf(list);
  return {
    asOf: list.metadata.asOf ?? new Date().toISOString(),
    counts: list.metadata.counts ?? NO_COUNTS,
    waiting: stated.flatMap((s) => (s.state === 'waiting' ? [frameOf(waitingOf)(s.run)] : [])),
    inFlight: stated.flatMap((s) => (s.state === 'waiting' || s.state === 'finished' ? [] : [frameOf(listedOf)(s.run)])),
  };
}

/** The field selector of the frame: every run not finished. */
export const OPEN_SELECTOR = 'status.state!=finished';

/** The field selector of the finished runs, newest finished first. */
export const FINISHED_SELECTOR = 'status.state=finished';

/** A list of runs, of every factory or of `factory` alone (its namespace, `default` the runs of none). */
const listOf = (factory: string | undefined, query: RunListQuery): Promise<RunList> =>
  factory === undefined ? runs.listAll(query) : runs.list(factory, query);

/** `query` with the label selector `selector` says, none for none. */
const labelled = (query: RunListQuery, selector: string | undefined): RunListQuery =>
  selector === undefined || selector.trim() === '' ? query : { ...query, labelSelector: selector.trim() };

/**
 * The frame (`GET /api/runs?fieldSelector=status.state!=finished`, or `/api/namespaces/<factory>/runs` for one factory, `default` naming
 * the runs of none): the runs that wait and move with the counts, what the board's frame reads on every page. Keyed `['runs-open']`, and
 * `['runs-open', factory]` for one factory; read again on each event of the workflow feed (`useFeed`), and paced as `runsSelectedQuery` is.
 */
export const openRunsQuery = (factory?: string, selector?: string) =>
  queryOptions({
    queryKey: [...(factory === undefined ? ['runs-open'] : ['runs-open', factory]), ...selectorKey(selector)],
    queryFn: () => listOf(factory, labelled({ fieldSelector: OPEN_SELECTOR }, selector)).then(openOf),
    refetchInterval: () => pace(5_000),
  });

/**
 * A finished run: when its work stopped (`finishedAt`), its wall time from its creation until then (`wallMs`), how it ended
 * (`outcome`), and where that wall time went (`clock`), read where its work stopped and so standing still.
 */
export type FinishedRun = RunView & { wallMs: number; finishedAt: string; outcome: RunOutcome; clock: RunClock | null };

/**
 * One page of the finished runs, newest finished first, measured to `asOf`: `total` finished in all (the list's count), the rows of this
 * page, and the token of the next, older page (`continue`), null on the last. A token past the last is answered with no row.
 */
export type FinishedPage = { asOf: string; total: number; runs: FinishedRun[]; continue: string | null };

/**
 * A page of the finished runs off the list asked `status.state=finished`: each run judged with its finish, in the list's order. A run the
 * list could not judge has no finish to say and is no row of it; the count holds it.
 */
export function finishedOf(list: RunList): FinishedPage {
  return {
    asOf: list.metadata.asOf ?? new Date().toISOString(),
    total: list.metadata.counts?.finished ?? list.items.length,
    runs: list.items.map((run) => ({
      ...runViewOf(run),
      wallMs: run.status.wallMs ?? 0,
      finishedAt: run.status.finishedAt ?? run.metadata.creationTimestamp,
      outcome: run.status.outcome ?? 'undecided',
      clock: run.status.clock ?? null,
    })),
    continue: list.metadata.continue || null,
  };
}

/** How many finished runs a page of the board holds. */
export const FINISHED_SIZE = 9;

/**
 * One page of the finished runs (`GET /api/runs?fieldSelector=status.state=finished&limit=9`), of every factory or of `factory` alone, from
 * the token the page before it answered, the last of `older` (`continue`), the first page for none. Keyed `['runs-finished', factory,
 * token]`, the factory and the token null for every factory's and the first page; read again on each event of the workflow feed
 * (`useFeed`), and paced as `runsSelectedQuery` is.
 */
export const finishedRunsQuery = (factory: string | undefined, older: readonly string[], selector?: string) => {
  const from = older.at(-1);
  return queryOptions({
    queryKey: ['runs-finished', factory ?? null, from ?? null, ...selectorKey(selector)],
    queryFn: () =>
      listOf(
        factory,
        labelled({ fieldSelector: FINISHED_SELECTOR, limit: FINISHED_SIZE, ...(from === undefined ? {} : { continue: from }) }, selector),
      ).then(finishedOf),
    refetchInterval: () => pace(5_000),
  });
};

/**
 * Whether the strip reads the page after `page` to have every run finished today, the day beginning at `dayStart` (epoch ms): the list
 * answers the newest finished first, so a page that holds a run finished before the day began is the last that holds one of today's.
 * Proved by `contracts/finished-today.contract.ts`.
 */
export const readsOnToday: ReadsOnToday = (page: FinishedPageRead, dayStart: number): boolean =>
  page.next && page.finishedMs.length > 0 && page.finishedMs.every((ms) => ms >= dayStart);

/** How many finished runs a page of a picker, or of the strip's read of today, holds. */
export const PICKED_SIZE = 50;

/** A page of the finished runs as `readsOnToday` reads it. */
const pageRead = (page: FinishedPage): FinishedPageRead => ({
  finishedMs: page.runs.map((run) => Date.parse(run.finishedAt)),
  next: page.continue !== null,
});

/** One page of the finished runs of every factory or of `factory`, `PICKED_SIZE` a page, from `from`, the first page for none. */
const finishedPage = (factory: string | undefined, from: string | undefined): Promise<FinishedPage> =>
  listOf(factory, { fieldSelector: FINISHED_SELECTOR, limit: PICKED_SIZE, ...(from === undefined ? {} : { continue: from }) }).then(
    finishedOf,
  );

/** The runs finished at or after `dayStart`, newest first, read a page at a time while `readsOnToday` says so. */
async function finishedSince(factory: string | undefined, dayStart: number): Promise<FinishedRun[]> {
  const kept: FinishedRun[] = [];
  let page = await finishedPage(factory, undefined);
  for (;;) {
    kept.push(...page.runs.filter((run) => Date.parse(run.finishedAt) >= dayStart));
    if (!readsOnToday(pageRead(page), dayStart) || page.continue === null) return kept;
    page = await finishedPage(factory, page.continue);
  }
}

/**
 * The runs finished since the day began at `dayStart` (epoch ms), of every factory or of `factory` alone, newest finished first: the
 * strip's. Read off `GET /api/runs?fieldSelector=status.state=finished&limit=50` page by page until a page reaches into the day before
 * (`readsOnToday`). Keyed `['runs-finished', factory, 'today', dayStart]`, so the feed and a write read it again as they read every page
 * of the finished runs; paced as `runsSelectedQuery` is.
 */
export const finishedTodayQuery = (factory: string | undefined, dayStart: number) =>
  queryOptions({
    queryKey: ['runs-finished', factory ?? null, 'today', dayStart],
    queryFn: () => finishedSince(factory, dayStart),
    refetchInterval: () => pace(5_000),
  });

/**
 * The finished runs of every factory, newest finished first, `PICKED_SIZE` a page, each page from the token the one before it answered:
 * what a picker offers past the open runs, one page more each time a person asks (`fetchNextPage`). Keyed `['runs-finished', null,
 * 'pages']`, so the feed and a write read it again; never on a clock, since a picker is open only a moment.
 */
export const finishedPagesQuery = () =>
  infiniteQueryOptions({
    queryKey: ['runs-finished', null, 'pages'],
    queryFn: ({ pageParam }: { pageParam: string | null }) => finishedPage(undefined, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last: FinishedPage) => last.continue,
    refetchInterval: false,
  });

/** What a run would hand as context now (`GET /api/runs/:runId/concluded`): read again with the runs, since a source in flight moves on. */
export const concludedQuery = (id: string) =>
  queryOptions({
    queryKey: ['runs', id, 'concluded'],
    queryFn: () => call((c) => c.runs.concluded({ params: { name: id } }), read(ConcludedAnswer)),
  });

/**
 * Remove a try's run, as the CLI's `rm` removes it: its record, and the folders it worked in, in the run's namespace (`namespaceOf`). The
 * api removes only a try, and not one still in flight; rejects with its refusal in full — the package's words, which say to cancel it
 * first — or the api's own about the request.
 */
export const removeRun = (namespace: string, id: string): Promise<RunRemoved> =>
  runs.delete(namespace, id, 'The run may be removed: look on the Runs page before removing it again.');

/**
 * Lift a person's hold on a run, as the CLI's `hold <run> --off` lifts it: the hold's file removed, and the run goes on at the next tick.
 * Rejects with the api's refusal in full — the package's words for a run nobody holds — or its own about the request.
 */
export const liftHold = (namespace: string, id: string): Promise<RunHeld> =>
  runs.unhold(namespace, id, "The hold may be lifted: look at the run's page before lifting it again.");

/**
 * Hold a run until the runs `until` names land, as the CLI's `hold <run> --until <run>… --why <words>` holds it, `why` sent only where it
 * says something; who put it is the user the api runs as. Rejects with the api's refusal in full — the package's words for a run it will
 * not hold, or a run to wait on it will not take — or its own about the request.
 */
export const putHold = (namespace: string, id: string, until: readonly string[], why: string): Promise<RunHeld> =>
  runs.hold(namespace, id, { until, ...(why.trim() ? { why } : {}) }, 'The run may be held: look at its page before holding it again.');

/**
 * What a prune gives back beyond the run's worktrees, as the CLI's `prune` takes it: `--artifacts`, its files; `--unmerged`, a run nobody
 * merged.
 */
export type PruneHow = { artifacts: boolean; unmerged: boolean };

/** What a prune did, as the board says it: the CLI `prune`'s lines, and how many places it could not remove (`left`), which they name. */
type Pruned = { id: string; pruned: true; lines: string[]; left: number };

/**
 * Prune a finished run, as the CLI's `prune <run> --yes` does: its worktrees removed, and its files with `artifacts`; a run nobody merged
 * only with `unmerged`. No branch is deleted. Rejects with the api's refusal in full — the package's words for a run not over, one already
 * pruned, or one nobody merged — or its own about the request.
 */
export async function pruneRun(namespace: string, id: string, how: PruneHow): Promise<Pruned> {
  const answer = await runs.prune(namespace, id, how, 'The run may be pruned: look at its page before pruning it again.');
  return { id, pruned: true, lines: [...answer.lines], left: answer.left.length };
}

