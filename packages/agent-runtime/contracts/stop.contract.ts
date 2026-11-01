/**
 * A person's word that a task stop (agent-runtime, src/core/engine/filing.ts, `requestStop`), as its doc comment states it:
 * journalled as `stop-requested`, and refused, with nothing journalled, for what `stopRefusalOf` refuses. The laws speak of the
 * outcome and of the journal's calls, never of how the program is written.
 */
import { assume, type Implementation } from '@emyann/tsverify';
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
    readsFirst: {
      description: 'The journal is read first, and for this task',
      condition: ({ input: [taskId], calls }) => {
        const first = calls.at(0);
        return first !== undefined && first.op === 'read' && first.args[0] === taskId;
      },
    },
    readFailurePassesThrough: {
      description: 'A read that fails ends the request with that failure, and nothing else is called',
      condition: ({ output, calls }) => {
        const first = calls.at(0);
        if (first === undefined || first.outcome._tag !== 'Failure') return true;
        return calls.length === 1 && output._tag === 'Failure' && output.error._tag === first.outcome.error._tag;
      },
    },
    refusedWritesNothing: {
      description: 'A refused stop writes nothing',
      condition: ({ output, calls }) =>
        !(output._tag === 'Failure' && output.error._tag === 'StopRefused') || !calls.some((c) => c.op === 'append'),
    },
    acceptedWritesOneStop: {
      description: 'An accepted stop writes exactly one entry, last, to this task, of kind stop-requested',
      condition: ({ input: [taskId], output, calls }) => {
        if (output._tag !== 'Success') return true;
        const last = calls.at(-1);
        return (
          calls.filter((c) => c.op === 'append').length === 1 &&
          last !== undefined &&
          last.op === 'append' &&
          last.args[0] === taskId &&
          last.args[1].kind === 'stop-requested'
        );
      },
    },
    refusedExactlyWhenTheGuardSays: {
      description: 'The request is refused exactly when the guard, asked of the journal read, gives words',
      condition: ({ input: [taskId], output, calls }) => {
        const first = calls.at(0);
        if (first === undefined || first.op !== 'read' || first.outcome._tag !== 'Success') return true;
        const events = first.outcome.value;
        const refused = stopRefusalOf(taskId, events.length ? fold(taskId, events) : undefined) !== undefined;
        return refused === (output._tag === 'Failure' && output.error._tag === 'StopRefused');
      },
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type RequestStop = Implementation<typeof stopSpec>;
