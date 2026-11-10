/**
 * Whether a read found nothing at its address, and how such a read is tried again: the one rule of a 404 every read of a thing that can be
 * gone shares — a run, its object and its sub-resources (`run.ts`), a fact she keeps (`nemia.ts`) and a proposal (`proposals.ts`).
 */
import { ReadRefusal } from './read.ts';

/**
 * Whether a read found nothing at its address: the api's 404 — a run gone from the store (`noSuchRun`), as the CLI's `rm` leaves it, a
 * fact she no longer keeps, a proposal no longer there. A page open on a run keeps what it last read when a read again fails — a
 * suspense query throws only while it has nothing — so the run's pages read the query's `error` beside its `data`, and say the run is
 * gone rather than draw it as it was.
 */
export const readGone = (error: unknown): boolean => error instanceof ReadRefusal && error.status === 404;

/**
 * Every failure is tried again three times, as react-query does by default, but a read that found nothing (`readGone`): said at once, not
 * seconds later.
 */
export const retryUnlessGone = (failures: number, error: unknown): boolean => !readGone(error) && failures < 3;
