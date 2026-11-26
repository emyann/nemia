/**
 * The rules of a run's state in the list the board reads (a RunList asked by `?fieldSelector=status.state…`): what state a listed run is
 * in — it waits on a person, it is in flight, or it is finished (`kindOf`) — when a finished run finished, a run's wall time, a finished
 * run's outcome, and the factory a read keeps (`runInFactory`).
 *
 * Pure: a run's summary in, as the whole list answers it, and a word or a time out. Each rule reads the fields it names
 * (`Listed`), so the list's own summary is handed as it is.
 */
import { DEFAULT_NAMESPACE } from '../factory/factory.ts';
import { asksOfAPerson, waitsOnYou } from '../phase/phase.ts';
import type { KindOf } from '../../contracts/waits-on-you.contract.ts';

/** What the rules read of a run's summary, as the whole list answers it. */
export type Listed = {
  id: string;
  factory: string | null;
  createdAt: string;
  cancelledAt: string | null;
  status: string;
  moving: boolean;
  waitingOnYou: readonly string[];
  waiting: { waitingOnYou: boolean } | null;
  holding: { waitingOnYou: boolean } | null;
  atWork: { endedAt: string | null } | null;
  toDecide: { kind: string } | null;
  assignee: { at: string } | null;
};

/**
 * The kind of a listed run, asked in this order so each run has one: `waiting`, it waits on a person (`waitsOnYou`), though something
 * of it may still move; else `inFlight`, something of it moves, it asks something someone has in hand (`asksOfAPerson`, with an
 * assignee), or it is running and waits on nobody; else `finished`.
 * @param run The listed run.
 */
export const kindOf: KindOf = (run) => {
  if (waitsOnYou(run)) return 'waiting';
  if (run.moving || asksOfAPerson(run) || (run.status === 'running' && !run.waiting?.waitingOnYou && !run.holding?.waitingOnYou))
    return 'inFlight';
  return 'finished';
};

/**
 * When a finished run's work stopped: the later of the end of its last session or check and its cancellation; its creation for a run
 * that ran nothing and nobody cancelled.
 * @param run The listed run: the end of its last session or check, its cancellation, and its creation.
 */
export const finishedAtOf = (run: Pick<Listed, 'atWork' | 'cancelledAt' | 'createdAt'>) => {
  const ends = [run.atWork?.endedAt ?? null, run.cancelledAt].filter((at): at is string => at !== null);
  return ends.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? run.createdAt;
};

/**
 * The instant a run's clock is read at, in epoch milliseconds: when its work stopped (`finishedAtOf`) for a finished run, so that a
 * finished run's breakdown is frozen where its work ended; `now` for a run still going. `wallMsOf` measures to this same instant, so a
 * clock's `wallMs` and the row's own are one number, which is what makes a breakdown's rows add up to the row.
 * @param run The listed run.
 * @param now The instant the list is read at, in epoch ms.
 */
export const clockUntilOf = (run: Listed, now: number) => (kindOf(run) === 'finished' ? Date.parse(finishedAtOf(run)) : now);

/**
 * A run's wall time in ms, never negative: from its creation until its work stopped (`finishedAtOf`), or until `now` for one not
 * finished (`clockUntilOf`).
 * @param run The listed run.
 * @param now The instant the list is read at, in epoch ms.
 */
export const wallMsOf = (run: Listed, now: number) => Math.max(0, clockUntilOf(run, now) - Date.parse(run.createdAt));

/**
 * How a finished run ended (`RunOutcome`).
 * @param run The finished run: its cancellation, what it leaves to decide, and its status.
 */
export const outcomeOf = (run: Pick<Listed, 'cancelledAt' | 'toDecide' | 'status'>) => {
  if (run.cancelledAt) return 'cancelled';
  if (run.toDecide?.kind === 'result') return 'undecided';
  return run.status === 'succeeded' ? 'succeeded' : 'failed';
};

/**
 * Whether a listed run is of `factory`, a run whose record names none being of the default one; every run where `factory` is undefined.
 * Named apart from the roster's `inFactory`, which reads an agent's.
 * @param factory The factory whose runs are kept, or undefined to keep every run.
 */
export const runInFactory = (factory: string | undefined) => (run: Pick<Listed, 'factory'>) =>
  factory === undefined || (run.factory ?? DEFAULT_NAMESPACE) === factory;
