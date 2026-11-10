/** The how of a read of the runs' summaries, as the inbox's and the run object's reads give it (`SummaryHow`). */
import type { Kept } from '../command/entry.verb.ts';
import { verifiesRest } from '../config/config.store.ts';
import { informerMemo } from '../rest/informer.verb.ts';
import { HOME } from '../record/record.store.ts';
import type { SummaryHow } from './summary.verb.ts';

/**
 * How a read of the list reads, as the inbox's do: the informer and the feed's filing times its caller keeps, verified as its
 * environment says; a caller that keeps neither judges every run.
 */
export const howOf = (env?: NodeJS.ProcessEnv, home?: string, kept?: Kept): SummaryHow => ({
  home: home ?? HOME,
  memo: kept?.runs ?? informerMemo(),
  filings: kept?.filings ?? { filed: new Map(), cursor: 0 },
  verify: env ? verifiesRest(env) : false,
});
