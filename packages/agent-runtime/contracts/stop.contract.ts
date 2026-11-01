/** One stop request (agent-runtime, src/core/engine/filing.ts, `requestStop`) under five laws (`laws.ts`). */
import { assume } from '@emyann/tsverify';
import { computation } from '@emyann/tsverify/effect';
import { fold, verbTakes } from '../src/core/domain.ts';
import type { JournalShape } from '../src/core/engine/journal.ts';
import { requestStop } from '../src/core/engine/filing.ts';
import {
  acceptedWritesOneStop,
  readFailurePassesThrough,
  readsFirst,
  refusedExactlyWhenTheGuardSays,
  refusedWritesNothing,
} from './laws.ts';

/**
 * The journal's fold, which the verifier does not read (it loops): pure, which the verifier checks from its source, and
 * nothing else. The laws below hold whatever state it folds to.
 */
export const foldIsPure = assume(fold, { pure: true });

/** Whether a verb's guard takes a state: a lookup the verifier does not read (`.find` on a table). Pure, checked. */
export const verbTakesIsPure = assume(verbTakes, { pure: true });

/** The runtime's verb, read in place: `Effect.fn('requestStop')(function* (taskId) { ... })`. */
export const stopRequest = computation<{ journal: Pick<JournalShape, 'read' | 'append'> }>()(requestStop, {
  ensures: { readsFirst, readFailurePassesThrough, refusedWritesNothing, acceptedWritesOneStop, refusedExactlyWhenTheGuardSays },
});
