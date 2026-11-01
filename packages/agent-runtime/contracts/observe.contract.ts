/**
 * What a pass sees of a runtime task, as `observe`'s doc comment states it (agent-runtime, src/core/domain.ts): its
 * ordered rules written as laws over (state, observed, now, event), rather than as a second copy of the code. Read in
 * place.
 */
import { assume, contract } from '@emyann/tsverify';
import type { Monotonic } from '../src/core/clock.ts';
import {
  type Attempt,
  backoffOf,
  nameFor,
  observe,
  RESTART_BACKOFF,
  type Sighting,
  type State,
  waitsForInput,
} from '../src/core/domain.ts';

/**
 * The restart's wait doubles up to its cap: past some forty ends in a row its product is no exact double, which the
 * verifier does not read, so what `observe` may take of it is declared, and tested on the real function.
 */
export const backoff = assume(backoffOf, {
  pure: true,
  ensures: { withinItsCap: (_attempts, ms) => ms >= RESTART_BACKOFF.initialMs && ms <= RESTART_BACKOFF.maxMs },
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

export const observed = contract(observe, {
  /**
   * Every moment on the journal and the clock is whole milliseconds (`Monotonic`, `Instant`), and a deadline a whole
   * number of seconds: the arithmetic on them is then exact.
   */
  requires: (state, _observed, now) =>
    stamped(now.at.getTime()) &&
    monoStamped(now.mono) &&
    (state.deadlineSeconds === undefined ||
      (Number.isInteger(state.deadlineSeconds) && state.deadlineSeconds >= 0 && state.deadlineSeconds <= 2 ** 31)) &&
    state.attempts.every(attemptStamped),
  ensures: {
    /** A settled task is seen settled, and only a settled one. */
    settledExactly: (state, _observed, _now, e) => (state.settled !== null) === (e.type === 'SETTLED'),

    /** With an attempt in flight. 1: a person's stop outranks the deadline, and so does an end the session came to. */
    theStopOutranksTheDeadline: (state, _observed, _now, e) => !state.stopRequested || e.type !== 'DEADLINE_PASSED',
    anEndOfItsOwnOutranksTheDeadline: (state, observed, _now, e) => {
      const seen = sightingOf(state, observed);
      return seen === undefined || !['completed', 'failed', 'rejected'].includes(seen.state) || e.type !== 'DEADLINE_PASSED';
    },
    aDeadlineIsOneSet: (state, _observed, _now, e) =>
      (e.type !== 'DEADLINE_PASSED' && e.type !== 'DEADLINE_SPENT') || state.deadlineSeconds !== undefined,
    /** 2: a session seen under the attempt's name is adopted, never started a second time. */
    aSightingIsAdopted: (state, observed, _now, e) => sightingOf(state, observed) === undefined || e.type !== 'UNSPAWNED',
    /** 3: an unread harness neither starts the session again nor counts it lost. */
    anUnreadHarnessIsNeitherRestartedNorLost: (state, observed, now, e) =>
      state.settled !== null ||
      !unreadOf(state, now) ||
      sightingOf(state, observed) !== undefined ||
      e.type === 'UNREAD' ||
      e.type === 'DEADLINE_PASSED',
    anUnreadHarnessLosesNothing: (state, _observed, now, e) => !unreadOf(state, now) || e.type !== 'LOST',
    /** 5: lost only once spawned. */
    lostOnlyOnceSpawned: (state, _observed, _now, e) => {
      const last = inFlight(state);
      return e.type !== 'LOST' || (last !== undefined && last.spawnedAt !== null);
    },
    /** What is seen of a session is seen only of one in flight. */
    inFlightEventsOnlyInFlight: (state, _observed, _now, e) =>
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
      ].includes(e.type),

    /** With nothing in flight. 1: a stop leaves nothing open. */
    aStopWithNothingInFlight: (state, _observed, _now, e) =>
      state.settled !== null || inFlight(state) !== undefined || !state.stopRequested || e.type === 'NOTHING_OPEN',
    nothingOpenOnlyOnAStop: (state, _observed, _now, e) => e.type !== 'NOTHING_OPEN' || state.stopRequested,
    /** 2: closed only when held open and closed. */
    closedOnlyWhenClosed: (state, _observed, _now, e) => e.type !== 'CLOSED' || (state.holdOpen === true && state.closed),
    /** 3: a person is waited on for as long as they take, ahead of the deadline. */
    aPersonOutranksTheDeadline: (state, _observed, _now, e) =>
      inFlight(state) !== undefined || state.stopRequested || state.closed || !waitsForInput(state) || e.type === 'AWAITING_INPUT',
    aPersonIsWaitedOnOnlyWhenHeldOpen: (state, _observed, _now, e) => e.type !== 'AWAITING_INPUT' || state.holdOpen === true,
    /** 5: only a long-lived task restarts, idles or is respawned. */
    onlyALongLivedTaskRestarts: (state, _observed, _now, e) =>
      state.restartPolicy === 'Always' ||
      !['BACKING_OFF', 'RESTART_DUE', 'SESSION_IDLE', 'SESSION_RESPAWNING', 'RESPAWN_OVERDUE'].includes(e.type),
    /** 8: queued only while it waits for the layer above's word. */
    queuedOnlyWhenQueued: (state, _observed, _now, e) => e.type !== 'QUEUED' || state.queued !== false,
    /** 10, and a restart: a start is the next attempt. */
    aStartIsTheNextAttempt: (state, _observed, _now, e) =>
      (e.type !== 'READY' && e.type !== 'RESTART_DUE') || e.attempt === state.attempts.length + 1,
  },
});
