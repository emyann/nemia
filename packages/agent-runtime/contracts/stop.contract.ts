/**
 * A person's word that a task stop (agent-runtime, src/core/engine/filing.ts, `requestStop`), as its doc comment states it:
 * journalled as `stop-requested`, and refused, with nothing journalled, for what `stopRefusalOf` refuses. The laws speak of the
 * outcome and of the journal's calls, never of how the program is written.
 */
import { assume } from '@emyann/tsverify';
import { spec } from '@emyann/tsverify/effect';
import type { Effect } from 'effect';
import { fold, verbTakes } from '../src/core/domain.ts';
import type { Journal, JournalError } from '../src/core/engine/journal.ts';
import { stopRefusalOf, type StopRefused } from '../src/core/engine/filing.ts';

/**
 * The journal's fold, which the verifier does not read (it loops): pure, which the verifier checks from its source, and
 * nothing else. The laws below hold whatever state it folds to.
 */
export const foldIsPure = assume(fold, { pure: true });

/** Whether a verb's guard takes a state: a lookup the verifier does not read (`.find` on a table). Pure, checked. */
export const verbTakesIsPure = assume(verbTakes, { pure: true });

const stopSpec = spec<(taskId: string) => Effect.Effect<void, StopRefused | JournalError, Journal>>({
  ensures: {
    /** The journal is read first, and for this task. */
    readsFirst: (taskId, _out, calls) => {
      const first = calls.at(0);
      return first !== undefined && first.op === 'read' && first.args[0] === taskId;
    },
    /** A read that fails ends the request with that failure, and nothing else is called. */
    readFailurePassesThrough: (_taskId, out, calls) => {
      const first = calls.at(0);
      if (first === undefined || first.outcome._tag !== 'Failure') return true;
      return calls.length === 1 && out._tag === 'Failure' && out.error._tag === first.outcome.error._tag;
    },
    /** A refused stop writes nothing. */
    refusedWritesNothing: (_taskId, out, calls) =>
      !(out._tag === 'Failure' && out.error._tag === 'StopRefused') || !calls.some((c) => c.op === 'append'),
    /** An accepted stop writes exactly one entry, last, to this task, of kind `stop-requested`. */
    acceptedWritesOneStop: (taskId, out, calls) => {
      if (out._tag !== 'Success') return true;
      const last = calls.at(-1);
      return (
        calls.filter((c) => c.op === 'append').length === 1 &&
        last !== undefined &&
        last.op === 'append' &&
        last.args[0] === taskId &&
        last.args[1].kind === 'stop-requested'
      );
    },
    /** The request is refused exactly when the guard, asked of the journal read, gives words. */
    refusedExactlyWhenTheGuardSays: (taskId, out, calls) => {
      const first = calls.at(0);
      if (first === undefined || first.op !== 'read' || first.outcome._tag !== 'Success') return true;
      const events = first.outcome.value;
      const refused = stopRefusalOf(taskId, events.length ? fold(taskId, events) : undefined) !== undefined;
      return refused === (out._tag === 'Failure' && out.error._tag === 'StopRefused');
    },
  },
});
export type StopSpec = typeof stopSpec;
