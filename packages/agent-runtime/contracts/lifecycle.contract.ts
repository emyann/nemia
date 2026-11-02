/**
 * The lifecycle of a runtime task, as its doc comment states it (agent-runtime,
 * src/core/domain.ts, `lifecycleOf`), written as laws over (state, result)
 * rather than as a second copy of the code. Read in place.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { State } from '../src/core/domain.ts';
import type { LifecycleState } from '../src/core/lifecycle.ts';

const lifecycleSpec = spec<(state: State) => LifecycleState>({
  ensures: {
    terminalExactlyWhenSettled: {
      description: 'A terminal state is reached exactly when the task is settled',
      condition: ({ input: [state], output }) =>
        (output === 'completed' || output === 'failed' || output === 'canceled') === (state.settled !== null),
    },
    succeededCompletes: {
      description: 'A task that succeeded is completed',
      condition: ({ input: [state], output }) => state.settled !== 'succeeded' || output === 'completed',
    },
    failedFails: {
      description: 'A task that failed is failed',
      condition: ({ input: [state], output }) => state.settled !== 'failed' || output === 'failed',
    },
    stoppedCancels: {
      description: 'A task stopped is canceled',
      condition: ({ input: [state], output }) => state.settled !== 'stopped' || output === 'canceled',
    },
    stopOutranks: {
      description: "A person's stop outranks everything except a terminal state",
      condition: ({ input: [state], output }) => state.settled !== null || !state.stopRequested || output === 'stopping',
    },
    stoppingOnlyWhenAsked: {
      description: 'Stopping only when a person asked it to stop',
      condition: ({ input: [state], output }) => output !== 'stopping' || state.stopRequested,
    },
    inFlight: {
      description: 'While its last attempt has not ended: working once spawned, else starting',
      condition: ({ input: [state], output }) => {
        const last = state.attempts.at(-1);
        if (state.settled !== null || state.stopRequested || last === undefined || last.ended !== null) return true;
        return output === (last.spawnedAt !== null ? 'working' : 'starting');
      },
    },
    workingMeansInFlight: {
      description: 'Working or starting only while its last attempt has not ended',
      condition: ({ input: [state], output }) => {
        const last = state.attempts.at(-1);
        return (output !== 'working' && output !== 'starting') || (last !== undefined && last.ended === null);
      },
    },
    inputRequiredNeedsHoldOpen: {
      description: 'Input required only of a task held open that nobody closed',
      condition: ({ input: [state], output }) => output !== 'input-required' || (state.holdOpen === true && !state.closed),
    },
    notHeldOpenNeverWaits: {
      description: 'A task not held open never waits on a person',
      condition: ({ input: [state], output }) => state.holdOpen === true || output !== 'input-required',
    },
    submittedHasNoAttemptThisTurn: {
      description: 'Submitted: nothing has been attempted in the current turn',
      condition: ({ input: [state], output }) =>
        output !== 'submitted' || !state.attempts.some((a) => (a.turn ?? 0) === state.inputs.length),
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type LifecycleOf = Implementation<typeof lifecycleSpec>;
