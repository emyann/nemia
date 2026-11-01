/**
 * What a pass sees of a runtime task, as `observe`'s doc comment states it (agent-runtime, src/core/domain.ts): its
 * ordered rules written as laws over (state, observed, now, event), rather than as a second copy of the code. Read in
 * place.
 */
import { assume, spec } from '@emyann/tsverify';
import type { Monotonic } from '../src/core/clock.ts';
import {
  type Attempt,
  backoffOf,
  nameFor,
  RESTART_BACKOFF,
  type Now,
  type Sighting,
  type State,
  waitsForInput,
} from '../src/core/domain.ts';
import type { LifecycleEvent } from '../src/core/lifecycle.ts';

/**
 * The restart's wait doubles up to its cap: past some forty ends in a row its product is no exact double, which the
 * verifier does not read, so what `observe` may take of it is declared, and tested on the real function.
 */
export const backoff = assume(backoffOf, {
  pure: true,
  ensures: { withinItsCap: ({ output }) => output >= RESTART_BACKOFF.initialMs && output <= RESTART_BACKOFF.maxMs },
});

/** A moment as the runtime stamps one: whole milliseconds, after 1970 and before 2^52 of them. */
const stamped = (ms: number): boolean => Number.isInteger(ms) && ms >= 0 && ms <= 2 ** 52;
const monoStamped = (m: Monotonic | undefined): boolean => m === undefined || stamped(m.ms);
const wallStamped = (at: string | null | undefined): boolean => at === null || at === undefined || stamped(Date.parse(at));
const attemptStamped = (a: Attempt): boolean =>
  wallStamped(a.startedAt) &&
  monoStamped(a.startedMono) &&
  wallStamped(a.spawnedAt) &&
  monoStamped(a.spawnedMono) &&
  wallStamped(a.endedAt) &&
  monoStamped(a.endedMono) &&
  wallStamped(a.gapSince) &&
  monoStamped(a.gapMono);

/** The last attempt, while it has not ended. */
const inFlight = (state: State): Attempt | undefined => {
  const last = state.attempts.at(-1);
  return last !== undefined && last.ended === null ? last : undefined;
};
/** What the pass saw of the attempt in flight. */
const sightingOf = (state: State, observed: ReadonlyMap<string, Sighting>): Sighting | undefined => {
  const last = inFlight(state);
  return last === undefined ? undefined : observed.get(nameFor(state.taskId, last.n));
};
/** Whether the pass could not read the harness that holds the attempt in flight. */
const unreadOf = (state: State, now: { readonly unread?: ReadonlySet<string> }): boolean => {
  const last = inFlight(state);
  return last !== undefined && now.unread !== undefined && now.unread.has(nameFor(state.taskId, last.n));
};

const observeSpec = spec<(state: State, observed: ReadonlyMap<string, Sighting>, now: Now) => LifecycleEvent>({
  /**
   * Every moment on the journal and the clock is whole milliseconds (`Monotonic`, `Instant`), and a deadline a whole
   * number of seconds: the arithmetic on them is then exact.
   */
  requires: ({ input: [state, , now] }) =>
    stamped(now.at.getTime()) &&
    monoStamped(now.mono) &&
    (state.deadlineSeconds === undefined ||
      (Number.isInteger(state.deadlineSeconds) && state.deadlineSeconds >= 0 && state.deadlineSeconds <= 2 ** 31)) &&
    state.attempts.every(attemptStamped),
  ensures: {
    /** A settled task is seen settled, and only a settled one. */
    settledExactly: ({ input: [state], output }) => (state.settled !== null) === (output.type === 'SETTLED'),

    /** With an attempt in flight. 1: a person's stop outranks the deadline, and so does an end the session came to. */
    theStopOutranksTheDeadline: ({ input: [state], output }) => !state.stopRequested || output.type !== 'DEADLINE_PASSED',
    anEndOfItsOwnOutranksTheDeadline: ({ input: [state, observed], output }) => {
      const seen = sightingOf(state, observed);
      return seen === undefined || !['completed', 'failed', 'rejected'].includes(seen.state) || output.type !== 'DEADLINE_PASSED';
    },
    aDeadlineIsOneSet: ({ input: [state], output }) =>
      (output.type !== 'DEADLINE_PASSED' && output.type !== 'DEADLINE_SPENT') || state.deadlineSeconds !== undefined,
    /** 2: a session seen under the attempt's name is adopted, never started a second time. */
    aSightingIsAdopted: ({ input: [state, observed], output }) => sightingOf(state, observed) === undefined || output.type !== 'UNSPAWNED',
    /** 3: an unread harness neither starts the session again nor counts it lost. */
    anUnreadHarnessIsNeitherRestartedNorLost: ({ input: [state, observed, now], output }) =>
      state.settled !== null ||
      !unreadOf(state, now) ||
      sightingOf(state, observed) !== undefined ||
      output.type === 'UNREAD' ||
      output.type === 'DEADLINE_PASSED',
    anUnreadHarnessLosesNothing: ({ input: [state, , now], output }) => !unreadOf(state, now) || output.type !== 'LOST',
    /** 5: lost only once spawned. */
    lostOnlyOnceSpawned: ({ input: [state], output }) => {
      const last = inFlight(state);
      return output.type !== 'LOST' || (last !== undefined && last.spawnedAt !== null);
    },
    /** What is seen of a session is seen only of one in flight. */
    inFlightEventsOnlyInFlight: ({ input: [state], output }) =>
      inFlight(state) !== undefined ||
      ![
        'DEADLINE_PASSED',
        'SESSION_LIVE',
        'SESSION_IDLE',
        'SESSION_BLOCKED',
        'SESSION_QUIET',
        'SESSION_ENDED',
        'SESSION_STOPPED',
        'SESSION_RESPAWNING',
        'RESPAWN_OVERDUE',
        'UNSPAWNED',
        'UNSEEN_IN_GRACE',
        'LOST',
      ].includes(output.type),

    /** With nothing in flight. 1: a stop leaves nothing open. */
    aStopWithNothingInFlight: ({ input: [state], output }) =>
      state.settled !== null || inFlight(state) !== undefined || !state.stopRequested || output.type === 'NOTHING_OPEN',
    nothingOpenOnlyOnAStop: ({ input: [state], output }) => output.type !== 'NOTHING_OPEN' || state.stopRequested,
    /** 2: closed only when held open and closed. */
    closedOnlyWhenClosed: ({ input: [state], output }) => output.type !== 'CLOSED' || (state.holdOpen === true && state.closed),
    /** 3: a person is waited on for as long as they take, ahead of the deadline. */
    aPersonOutranksTheDeadline: ({ input: [state], output }) =>
      inFlight(state) !== undefined || state.stopRequested || state.closed || !waitsForInput(state) || output.type === 'AWAITING_INPUT',
    aPersonIsWaitedOnOnlyWhenHeldOpen: ({ input: [state], output }) => output.type !== 'AWAITING_INPUT' || state.holdOpen === true,
    /** 5: only a long-lived task restarts, idles or is respawned. */
    onlyALongLivedTaskRestarts: ({ input: [state], output }) =>
      state.restartPolicy === 'Always' ||
      !['BACKING_OFF', 'RESTART_DUE', 'SESSION_IDLE', 'SESSION_RESPAWNING', 'RESPAWN_OVERDUE'].includes(output.type),
    /** 8: queued only while it waits for the layer above's word. */
    queuedOnlyWhenQueued: ({ input: [state], output }) => output.type !== 'QUEUED' || state.queued !== false,
    /** 10, and a restart: a start is the next attempt. */
    aStartIsTheNextAttempt: ({ input: [state], output }) =>
      (output.type !== 'READY' && output.type !== 'RESTART_DUE') || output.attempt === state.attempts.length + 1,
  },
});
export type ObserveSpec = typeof observeSpec;
