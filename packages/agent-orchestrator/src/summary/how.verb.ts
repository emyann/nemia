/** The how of a read of the runs' summaries, as the inbox's and the run object's reads give it (`SummaryHow`). */
import { Effect } from 'effect';
import type { Kept } from '../command/entry.verb.ts';
import { setting } from '../config/config.store.ts';
import { StoreRoot } from '../config/root.store.ts';
import { informerMemo } from '../rest/informer.verb.ts';
import type { SummaryHow } from './summary.verb.ts';

/**
 * How a read of the list reads, as the inbox's do: the store the program is given, the informer and the feed's filing times its caller
 * keeps, verified as the program's settings say (`WF_VERIFY_REST`); a caller that keeps neither judges every run.
 */
export const howOf = (kept?: Kept) =>
  Effect.gen(function* () {
    return {
      home: yield* StoreRoot,
      memo: kept?.runs ?? informerMemo(),
      filings: kept?.filings ?? { filed: new Map(), cursor: 0 },
      verify: yield* setting('verifyRest'),
    } satisfies SummaryHow;
  });
