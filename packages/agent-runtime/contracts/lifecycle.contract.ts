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
    terminalExactlyWhenSettled: ({ input: [state], output }) =>
      (output === 'completed' || output === 'failed' || output === 'canceled') === (state.settled !== null),
    succeededCompletes: ({ input: [state], output }) => state.settled !== 'succeeded' || output === 'completed',
    stoppedCancels: ({ input: [state], output }) => state.settled !== 'stopped' || output === 'canceled',

    /** 2. A person's stop outranks everything except a terminal state. */
    stopOutranks: ({ input: [state], output }) => state.settled !== null || !state.stopRequested || output === 'stopping',
    stoppingOnlyWhenAsked: ({ input: [state], output }) => output !== 'stopping' || state.stopRequested,

    /** 3. While the last attempt has not ended: working once spawned, else starting. */
    inFlight: ({ input: [state], output }) => {
      const last = state.attempts.at(-1);
      if (state.settled !== null || state.stopRequested || last === undefined || last.ended !== null) return true;
      return output === (last.spawnedAt !== null ? 'working' : 'starting');
    },
    workingMeansInFlight: ({ input: [state], output }) => {
      const last = state.attempts.at(-1);
      return (output !== 'working' && output !== 'starting') || (last !== undefined && last.ended === null);
    },

    /** 4–5. Only a task held open waits on a person, and only while nobody closed it. */
    inputRequiredNeedsHoldOpen: ({ input: [state], output }) => output !== 'input-required' || (state.holdOpen === true && !state.closed),
    notHeldOpenNeverWaits: ({ input: [state], output }) => state.holdOpen === true || output !== 'input-required',

    /** 6. Submitted: nothing has been attempted in the current turn. */
    submittedHasNoAttemptThisTurn: ({ input: [state], output }) =>
      output !== 'submitted' || !state.attempts.some((a) => (a.turn ?? 0) === state.inputs.length),
  },
});
export type LifecycleSpec = typeof lifecycleSpec;
