/**
 * How the board draws a step on a run's graph (apps/web, src/lib/stepMark.ts): its mark (`stepMark`), from its state and whether it
 * waits on something now — a run, a run slot, a hold — rather than only its turn (`waitsNow`, the rail's rule before it).
 *
 * The meanings are the rail's (`RunSteps`' `barClass`) moved onto a node: a session or its check at work is alive; a state that waits on
 * a person is yours; a failure is failure; a step done, by its check or its own word, or a workflow node that filed its card, is done; a
 * step not started is drawn by its four corners where it waits on something now and hollow where it only waits its turn — a held step
 * among them, drawn as not started (the person's rule of 1 Nov); a node its route passed by is off; and the rest (paused, called off,
 * unknown) is at rest.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { StepState } from '../src/lib/status.ts';

/** What a node of the graph is drawn as: one of the look's meanings, or how a step not started waits, or a route not taken. */
export type StepMark = 'done' | 'alive' | 'yours' | 'failure' | 'waits' | 'todo' | 'off' | 'rest';

/** Work moves into the step: its session at work, or its check running. */
const moving = (s: StepState): boolean => s === 'working' || s === 'checking';

/** The step waits on a person: a session asking, a gate, a budget or rounds spent, a sign-off missing or refused. */
const onAPerson = (s: StepState): boolean =>
  s === 'asks-in-session' ||
  s === 'blocked' ||
  s === 'awaiting-approval' ||
  s === 'exhausted' ||
  s === 'over-budget' ||
  s === 'budget-exhausted' ||
  s === 'unsigned' ||
  s === 'denied';

/** The step failed, or the board could not read it as anything but a failure. */
const failedState = (s: StepState): boolean => s === 'failed' || s === 'failed-check' || s === 'unreadable';

/** The step is done: verified by its check, done on its own word, or a workflow node that filed its card. */
const doneState = (s: StepState): boolean => s === 'verified' || s === 'unverified' || s === 'sent';

/** The step has not started: waiting its turn or a run slot, or held by a person. */
const notStarted = (s: StepState): boolean => s === 'waiting' || s === 'waiting-for-slot' || s === 'held';

/** The rest, at rest: paused between two calls, called off, or a state the engine does not know. */
const atRest = (s: StepState): boolean => s === 'paused' || s === 'cancelled' || s === 'unknown';

const stepMarkSpec = spec<(state: StepState, waits: boolean) => StepMark>({
  ensures: {
    aliveExactlyWhileWorkMoves: {
      description: 'A step is drawn alive exactly while its session or its check is at work',
      condition: ({ input: [state], output }) => (output === 'alive') === moving(state),
    },
    yoursExactlyWhenItWaitsOnAPerson: {
      description: 'A step is drawn yours exactly when it waits on a person',
      condition: ({ input: [state], output }) => (output === 'yours') === onAPerson(state),
    },
    failureExactlyWhenItFailed: {
      description: 'A step is drawn as a failure exactly when it failed, and nothing else is',
      condition: ({ input: [state], output }) => (output === 'failure') === failedState(state),
    },
    doneExactlyWhenDone: {
      description: 'A step is drawn done exactly when its check verified it, its own word says so, or its workflow node filed its card',
      condition: ({ input: [state], output }) => (output === 'done') === doneState(state),
    },
    cornersExactlyWhereNotStartedAndWaitingNow: {
      description: 'A step is drawn by its four corners exactly where it has not started and waits on something now',
      condition: ({ input: [state, waits], output }) => (output === 'waits') === (notStarted(state) && waits),
    },
    hollowExactlyWhereNotStartedAndOnlyItsTurn: {
      description: 'A step is drawn hollow exactly where it has not started and only waits its turn',
      condition: ({ input: [state, waits], output }) => (output === 'todo') === (notStarted(state) && !waits),
    },
    offExactlyWhenItsRoutePassedItBy: {
      description: 'A node is drawn off exactly when the route of its condition passed it by',
      condition: ({ input: [state], output }) => (output === 'off') === (state === 'skipped'),
    },
    restExactlyForTheRest: {
      description: 'A step paused, called off or unknown is drawn at rest, and no other is',
      condition: ({ input: [state], output }) => (output === 'rest') === atRest(state),
    },
  },
});
export type StepMarkOf = Implementation<typeof stepMarkSpec>;
