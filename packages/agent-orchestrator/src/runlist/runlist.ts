/**
 * The rules of the two reads of the runs the board lists: what kind a listed run is — it waits on a person, it is in flight, or it is
 * finished (`kindOf`) — when a finished run finished, a run's wall time, a finished run's outcome, the order of the finished runs, the
 * factory a read keeps, and a page of them with what refuses one asked wrongly.
 *
 * Pure: a run's summary in, as the whole list answers it, and a word, a time or a page out. Each rule reads the fields it names
 * (`Listed`), so the list's own summary is handed as it is.
 */
import { DEFAULT_FACTORY } from '../factory/factory.ts';

/** What the rules read of a run's summary, as the whole list answers it. */
export type Listed = {
  id: string;
  factory: string | null;
  createdAt: string;
  cancelledAt: string | null;
  status: string;
  moving: boolean;
  waitingOnYou: readonly string[];
  waiting: { onYou: boolean } | null;
  holding: { onYou: boolean } | null;
  atWork: { endedAt: string | null } | null;
  toDecide: { kind: string } | null;
};

/** The three kinds of a listed run, each run of exactly one. */
export type RunKind = 'waiting' | 'inFlight' | 'finished';

/**
 * How a finished run ended: `cancelled`, a person called it off; `undecided`, its work is done and nobody has decided its result;
 * `succeeded`; or `failed`, every other end.
 */
export type RunOutcome = 'succeeded' | 'failed' | 'cancelled' | 'undecided';

/** A run in either read: its summary, its wall time in ms (`wallMsOf`), and when it finished, null for a run that has not. */
export type ListedRun<S> = S & { wallMs: number; finishedAt: string | null };

/** A finished run on its page: when its work stopped (`finishedAtOf`) and how it ended (`outcomeOf`). */
export type FinishedRun<S> = ListedRun<S> & { finishedAt: string; outcome: RunOutcome };

/** One page of rows: `total` rows in all, `page` from 1 of `pages`, at least one, of `size` rows each, and the page's `runs`. */
export type Page<R> = { total: number; page: number; size: number; pages: number; runs: R[] };

/** The page size a read answers when none is asked. */
export const PAGE_SIZE = 9;

/** The largest page a read answers. */
export const PAGE_MAX = 100;

/**
 * Whether a run waits on a person: nobody called it off, and a step of it waits on one, or a run it waits on never lands without one,
 * or a hold on it only a person lifts.
 */
const waitsOnPerson = (run: Listed): boolean =>
  !run.cancelledAt && (run.waitingOnYou.length > 0 || Boolean(run.waiting?.onYou) || Boolean(run.holding?.onYou));

/**
 * The kind of a listed run, asked in this order so each run has one: `waiting`, it waits on a person, though something of it may still
 * move; else `inFlight`, something of it moves, or it is running and waits on nobody; else `finished`.
 */
export const kindOf = (run: Listed): RunKind => {
  if (waitsOnPerson(run)) return 'waiting';
  if (run.moving || (run.status === 'running' && !run.waiting?.onYou && !run.holding?.onYou)) return 'inFlight';
  return 'finished';
};

/**
 * When a finished run's work stopped: the later of the end of its last session or check and its cancellation; its creation for a run
 * that ran nothing and nobody cancelled.
 */
export const finishedAtOf = (run: Pick<Listed, 'atWork' | 'cancelledAt' | 'createdAt'>): string => {
  const ends = [run.atWork?.endedAt ?? null, run.cancelledAt].filter((at): at is string => at !== null);
  return ends.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? run.createdAt;
};

/**
 * The instant a run's clock is read at, in epoch milliseconds: when its work stopped (`finishedAtOf`) for a finished run, so that a
 * finished run's breakdown is frozen where its work ended; `now` for a run still going. `wallMsOf` measures to this same instant, so a
 * clock's `wallMs` and the row's own are one number, which is what makes a breakdown's rows add up to the row.
 */
export const clockUntilOf = (run: Listed, now: number): number => (kindOf(run) === 'finished' ? Date.parse(finishedAtOf(run)) : now);

/**
 * A run's wall time in ms, never negative: from its creation until its work stopped (`finishedAtOf`), or until `now` for one not
 * finished (`clockUntilOf`).
 */
export const wallMsOf = (run: Listed, now: number): number => Math.max(0, clockUntilOf(run, now) - Date.parse(run.createdAt));

/** How a finished run ended (`RunOutcome`). */
export const outcomeOf = (run: Pick<Listed, 'cancelledAt' | 'toDecide' | 'status'>): RunOutcome => {
  if (run.cancelledAt) return 'cancelled';
  if (run.toDecide?.kind === 'result') return 'undecided';
  return run.status === 'succeeded' ? 'succeeded' : 'failed';
};

/** The order of the finished runs: the one whose work stopped last first (`finishedAtOf`), two that stopped together by id. */
export const byFinished = (a: Listed, b: Listed): number =>
  Date.parse(finishedAtOf(b)) - Date.parse(finishedAtOf(a)) || a.id.localeCompare(b.id);

/** Whether a run is of `factory`, a run whose record names none being of the default one; every run where `factory` is undefined. */
export const inFactory =
  (factory: string | undefined) =>
  (run: Pick<Listed, 'factory'>): boolean =>
    factory === undefined || (run.factory ?? DEFAULT_FACTORY) === factory;

/** A whole number written in digits alone, from `least` to `most`; undefined for any other text. */
const wholeOf = (text: string, least: number, most: number): number | undefined => {
  const n = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  return n >= least && n <= most ? n : undefined;
};

/**
 * The page and the size a read was asked for: page 1 and `PAGE_SIZE` where none is said.
 *
 * @returns The two numbers, or `refused`: why a `page` that is no whole number from 1, or a `size` that is none from 1 to `PAGE_MAX`,
 *   is not answered, naming the key, what it takes and an example.
 */
export function pageAsked(asked: { page?: string; size?: string }): { page: number; size: number } | { refused: string } {
  const page = asked.page === undefined ? 1 : wholeOf(asked.page, 1, Number.MAX_SAFE_INTEGER);
  if (page === undefined) return { refused: `page takes a whole number from 1, as in page=2, and \`${asked.page}\` is none.` };
  const size = asked.size === undefined ? PAGE_SIZE : wholeOf(asked.size, 1, PAGE_MAX);
  if (size === undefined)
    return { refused: `size takes a whole number from 1 to ${PAGE_MAX}, as in size=${PAGE_SIZE}, and \`${asked.size}\` is none.` };
  return { page, size };
}

/** Page `page` of `rows`, `size` rows a page (`Page`): a page past the last is empty, and says the `total` and the `pages` there are. */
export const pageOf = <R>(rows: readonly R[], page: number, size: number): Page<R> => ({
  total: rows.length,
  page,
  size,
  pages: Math.max(1, Math.ceil(rows.length / size)),
  runs: rows.slice((page - 1) * size, page * size),
});
