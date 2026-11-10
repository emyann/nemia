/** The how of a read of the runs' summaries, as the inbox's and the run object's reads give it (`SummaryHow`). */
import { Effect } from 'effect';
import type { Kept } from '../command/entry.verb.ts';
import { setting } from '../config/config.store.ts';
import { StoreRoot } from '../config/root.store.ts';
import { informerMemo } from '../rest/informer.verb.ts';
import type { SummaryHow } from './summary.verb.ts';

/**
 * How a read of the list reads, as the inbox's do: the store the program is given, the informer its caller keeps, verified as the
 * program's settings say (`WF_VERIFY_REST`); a caller that keeps none judges every run.
 */
export const howOf = (kept?: Kept) =>
  Effect.gen(function* () {
    return {
      home: yield* StoreRoot,
      memo: kept?.runs ?? informerMemo(),
      verify: yield* setting('verifyRest'),
    } satisfies SummaryHow;
  });
