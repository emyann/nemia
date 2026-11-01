/**
 * The lifecycle of a runtime task, as its doc comment states it (agent-runtime,
 * src/core/domain.ts, `lifecycleOf`), written as laws over (state, result)
 * rather than as a second copy of the code. Read in place.
 */
import { spec } from '@emyann/tsverify';
import type { State } from '../src/core/domain.ts';
import type { LifecycleState } from '../src/core/lifecycle.ts';

const lifecycleSpec = spec<(state: State) => LifecycleState>({
  ensures: {
    /** 1. Settled: the final state its outcome names. A terminal state is reached exactly when settled. */
    terminalExactlyWhenSettled: (state, s) => (s === 'completed' || s === 'failed' || s === 'canceled') === (state.settled !== null),
    succeededCompletes: (state, s) => state.settled !== 'succeeded' || s === 'completed',
    stoppedCancels: (state, s) => state.settled !== 'stopped' || s === 'canceled',

    /** 2. A person's stop outranks everything except a terminal state. */
    stopOutranks: (state, s) => state.settled !== null || !state.stopRequested || s === 'stopping',
    stoppingOnlyWhenAsked: (state, s) => s !== 'stopping' || state.stopRequested,

    /** 3. While the last attempt has not ended: working once spawned, else starting. */
    inFlight: (state, s) => {
      const last = state.attempts.at(-1);
      if (state.settled !== null || state.stopRequested || last === undefined || last.ended !== null) return true;
      return s === (last.spawnedAt !== null ? 'working' : 'starting');
    },
    workingMeansInFlight: (state, s) => {
      const last = state.attempts.at(-1);
      return (s !== 'working' && s !== 'starting') || (last !== undefined && last.ended === null);
    },

    /** 4–5. Only a task held open waits on a person, and only while nobody closed it. */
    inputRequiredNeedsHoldOpen: (state, s) => s !== 'input-required' || (state.holdOpen === true && !state.closed),
    notHeldOpenNeverWaits: (state, s) => state.holdOpen === true || s !== 'input-required',

    /** 6. Submitted: nothing has been attempted in the current turn. */
    submittedHasNoAttemptThisTurn: (state, s) => s !== 'submitted' || !state.attempts.some((a) => (a.turn ?? 0) === state.inputs.length),
  },
});
export type LifecycleSpec = typeof lifecycleSpec;
