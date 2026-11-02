/**
 * Whether a run's read found no run, and how such a read is tried again: what every read of a run shares — its object and its sub-resources
 * (`run.ts`).
 */
import { ReadRefusal } from './read.ts';

/**
 * Whether a read of a run's record found no run: the api's 404 (`noSuchRun`), as the CLI's `rm` leaves it. A page open on the run keeps
 * what it last read when a read again fails — a suspense query throws only while it has nothing — so the run's pages read the query's
 * `error` beside its `data`, and say the run is gone rather than draw it as it was.
 */
export const runGone = (error: unknown): boolean => error instanceof ReadRefusal && error.status === 404;

/**
 * Every failure is tried again three times, as react-query does by default, but a run gone from the store: said at once, not seconds later.
 */
export const retryRun = (failures: number, error: unknown): boolean => !runGone(error) && failures < 3;
