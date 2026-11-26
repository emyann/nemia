/**
 * What the daemon's pass records of the runs it judged: each run's listed object built as the list builds it (`objectsOf`, the informer's
 * kept core with its disk parts read now), the frame's parts laid on its status at the pass's instant (`framedPartsOf`), made the run's
 * observed status record (`observedRecordOf`) and handed to the keyspace's writer (`runStatusesWritten`), which writes only what moved. A
 * run the pass left unjudged, or whose object does not build, is observed as none: its record is deleted and the lists judge it on demand.
 * A program over the engine, the informer and the store's root.
 */
import { Effect } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import type { Run } from '../run.ts';
import type { Engine } from '../runtime-client.ts';
import { objectsOf } from '../run-list/run-list.verb.ts';
import { framed, framedPartsOf } from '../runlist/runlist.verb.ts';
import type { InformerMemo } from '../rest/informer.verb.ts';
import { standingReader, standingSnapshot } from '../standing/standing.verb.ts';
import { summaryOf } from '../summary/summary.verb.ts';
import type { JudgedOrWhy } from '../summary/judgement.verb.ts';
import { observedRecordOf, type StatusRecord } from './run-status.ts';
import { runStatusesWritten } from './run-status.store.ts';

/** Where the last line a session said is kept: a listed object reads none, so it holds nothing. */
const SAID = new Map<string, { cursor: string; line: string | null }>();

/**
 * Every run of `runs` observed as the lists serve it, measured at `now`, and its status written where it differs from the record.
 * @param e The engine the runs are judged through.
 * @param informer The informer the pass keeps each run's judgement and listed object in.
 * @param runs Every run of the pass's listing.
 * @param judged What the pass's informer holds of each of them: its judgement, or why it has none.
 * @param now The instant the frame is measured at, in epoch ms.
 */
export const runStatusesObserved = Effect.fn('runStatusesObserved')(function* (
  e: Engine,
  informer: InformerMemo,
  runs: readonly Run[],
  judged: ReadonlyMap<string, JudgedOrWhy>,
  now: number,
) {
  const home = yield* StoreRoot;
  const git = standingReader(yield* standingSnapshot());
  const objectOf = objectsOf(e, { home, memo: informer, verify: false }, { memo: { said: SAID } }, false, git);
  const observed = new Map<string, StatusRecord>();
  for (const run of runs) {
    const one = judged.get(run.id);
    if (one === undefined || 'unjudged' in one) continue;
    const answer = yield* objectOf(run, one.judgement);
    if ('unjudged' in answer) continue;
    const { parts, growing } = framedPartsOf(summaryOf(one.judgement, home), one.judgement, now);
    observed.set(run.id, observedRecordOf(framed(answer, parts), now, growing));
  }
  return yield* runStatusesWritten(observed);
});
