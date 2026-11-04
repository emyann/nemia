/**
 * What a pass sees of a runtime task, as `observe`'s doc comment states it (agent-runtime, src/core/domain.ts): its
 * ordered rules written as laws over (state, observed, now, event), rather than as a second copy of the code. Read in
 * place.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import type { Monotonic } from '../src/core/clock.ts';
import { type Attempt, awaitsAdmission, nameFor, type Now, type Sighting, type State, waitsForInput } from '../src/core/domain.ts';
import type { LifecycleEvent } from '../src/core/lifecycle.ts';
import { backoffOf, RESTART_BACKOFF } from '../src/core/restart.ts';

/**
 * The restart's wait doubles up to its cap: past some forty ends in a row its product is no exact double, which the
 * verifier does not read, so what `observe` may take of it is declared, and tested on the real function.
 */
export const backoff = assume(backoffOf, {
  pure: true,
  ensures: {
    withinItsCap: {
      description: 'A restart waits at least its first wait and at most its cap',
      condition: ({ output }) => output >= RESTART_BACKOFF.initialMs && output <= RESTART_BACKOFF.maxMs,
    },
  },
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
/** Whether the last attempt, of the current turn, was parked under a jobs' drain (`Attempt.parked`, which only an end carries). */
const parkedLast = (state: State): boolean => {
  const last = state.attempts.at(-1);
  return last !== undefined && last.parked !== undefined && (last.turn ?? 0) === state.inputs.length;
};
/** What a pass sees only of the session of an attempt in flight: its deadline, its sighting, or its absence. */
const SESSION_EVENTS = [
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
];

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
  /**
   * The order of the rest of the doc comment's rules is left to the code and held by its tests (`test/engine.test.ts`): the
   * laws say each rule that keeps a session from being started twice, started while queued, lost, or held past a person's
   * close, and stop there. The pairs left: `NO_SESSION_TO_CONTINUE` against `READY` for a later turn whose session is gone,
   * which would say `turnOf`'s arithmetic again as a law, and `UNREAD` for a restart's unread harness, whose name the
   * verifier cannot tell equal to itself for an attempt numbered `NaN`, which `requires` does not refuse.
   */
  open: ['output.type'],
  ensures: {
    settledExactly: {
      description: 'A settled task is seen settled, and only a settled one',
      condition: ({ input: [state], output }) => (state.settled !== null) === (output.type === 'SETTLED'),
    },
    theStopOutranksTheDeadline: {
      description: "With an attempt in flight, a person's stop outranks the deadline",
      condition: ({ input: [state], output }) => !state.stopRequested || output.type !== 'DEADLINE_PASSED',
    },
    anEndOfItsOwnOutranksTheDeadline: {
      description: 'An end the session came to on its own outranks the deadline',
      condition: ({ input: [state, observed], output }) => {
        const seen = sightingOf(state, observed);
        return seen === undefined || !['completed', 'failed', 'rejected'].includes(seen.state) || output.type !== 'DEADLINE_PASSED';
      },
    },
    aDeadlineIsOneSet: {
      description: 'A deadline passed or spent is one the task set',
      condition: ({ input: [state], output }) =>
        (output.type !== 'DEADLINE_PASSED' && output.type !== 'DEADLINE_SPENT') || state.deadlineSeconds !== undefined,
    },
    aSightingIsAdopted: {
      description: "A session seen under the attempt's name is adopted, never started a second time",
      condition: ({ input: [state, observed], output }) => sightingOf(state, observed) === undefined || output.type !== 'UNSPAWNED',
    },
    anUnreadHarnessIsNeitherRestartedNorLost: {
      description: 'An unread harness neither starts the session again nor counts it lost: the pass sees it unread, or past its deadline',
      condition: ({ input: [state, observed, now], output }) =>
        state.settled !== null ||
        !unreadOf(state, now) ||
        sightingOf(state, observed) !== undefined ||
        output.type === 'UNREAD' ||
        output.type === 'DEADLINE_PASSED',
    },
    anUnreadHarnessLosesNothing: {
      description: 'An unread harness never counts a session lost',
      condition: ({ input: [state, , now], output }) => !unreadOf(state, now) || output.type !== 'LOST',
    },
    lostOnlyOnceSpawned: {
      description: 'Lost only once spawned',
      condition: ({ input: [state], output }) => {
        const last = inFlight(state);
        return output.type !== 'LOST' || (last !== undefined && last.spawnedAt !== null);
      },
    },
    inFlightEventsOnlyInFlight: {
      description: 'What is seen of a session is seen only of one in flight',
      condition: ({ input: [state], output }) => inFlight(state) !== undefined || !SESSION_EVENTS.includes(output.type),
    },
    inFlightSeesOnlyItsSession: {
      description: 'With an attempt in flight, only what is seen of its session, or that its harness was not read',
      condition: ({ input: [state], output }) =>
        state.settled !== null || inFlight(state) === undefined || SESSION_EVENTS.includes(output.type) || output.type === 'UNREAD',
    },
    aStopWithNothingInFlight: {
      description: 'With nothing in flight, a stop leaves nothing open',
      condition: ({ input: [state], output }) =>
        state.settled !== null || inFlight(state) !== undefined || !state.stopRequested || output.type === 'NOTHING_OPEN',
    },
    nothingOpenOnlyOnAStop: {
      description: 'Nothing open only on a stop',
      condition: ({ input: [state], output }) => output.type !== 'NOTHING_OPEN' || state.stopRequested,
    },
    closedOnlyWhenClosed: {
      description: 'Closed only when held open and closed',
      condition: ({ input: [state], output }) => output.type !== 'CLOSED' || (state.holdOpen === true && state.closed),
    },
    aPersonOutranksTheDeadline: {
      description: 'A person is waited on for as long as they take, ahead of the deadline',
      condition: ({ input: [state], output }) =>
        inFlight(state) !== undefined || state.stopRequested || state.closed || !waitsForInput(state) || output.type === 'AWAITING_INPUT',
    },
    aPersonIsWaitedOnOnlyWhenHeldOpen: {
      description: 'A person is waited on only for a task held open',
      condition: ({ input: [state], output }) => output.type !== 'AWAITING_INPUT' || state.holdOpen === true,
    },
    onlyALongLivedTaskIdles: {
      description: 'Only a long-lived task idles or is respawned',
      condition: ({ input: [state], output }) =>
        state.restartPolicy === 'Always' || !['SESSION_IDLE', 'SESSION_RESPAWNING', 'RESPAWN_OVERDUE'].includes(output.type),
    },
    /**
     * A job parked under a jobs' drain is continued as a restart inside its task (the card "a job stops at its tool call's end"),
     * so a restart is no longer the long-lived task's alone.
     */
    onlyALongLivedTaskOrAParkedJobRestarts: {
      description: 'Only a long-lived task, or a job whose attempt ended parked, restarts',
      condition: ({ input: [state], output }) =>
        state.restartPolicy === 'Always' || parkedLast(state) || !['BACKING_OFF', 'RESTART_DUE'].includes(output.type),
    },
    aParkedJobIsContinued: {
      description: 'A job whose last attempt ended parked is continued or held, never settled on that end',
      condition: ({ input: [state], output }) => output.type !== 'ATTEMPT_ENDED' || !parkedLast(state),
    },
    aParkedJobIsHeldWhileDrained: {
      description: "While a jobs' drain stands, a job is never continued",
      condition: ({ input: [state, , now], output }) =>
        now.drained !== true || state.restartPolicy === 'Always' || output.type !== 'RESTART_DUE',
    },
    heldOnlyWhenParkedAndDrained: {
      description: "A job is held parked only while a jobs' drain stands and its last attempt ended parked",
      condition: ({ input: [state, , now], output }) => output.type !== 'PARK_HELD' || (now.drained === true && parkedLast(state)),
    },
    queuedOnlyWhenQueued: {
      description: "Queued only while it waits for the layer above's word",
      condition: ({ input: [state], output }) => output.type !== 'QUEUED' || state.queued !== false,
    },
    aStartIsTheNextAttempt: {
      description: 'A start, or a restart, is the next attempt',
      condition: ({ input: [state], output }) =>
        (output.type !== 'READY' && output.type !== 'RESTART_DUE') || output.attempt === state.attempts.length + 1,
    },
    aQueuedTaskIsNeverStarted: {
      description: "A turn waiting for the layer above's word is never started",
      condition: ({ input: [state], output }) => output.type !== 'READY' || !awaitsAdmission(state),
    },
    aWaitingTurnIsQueued: {
      description: "A turn waiting for the layer above's word is seen queued, unless it is a later turn with no session to continue",
      condition: ({ input: [state], output }) =>
        !awaitsAdmission(state) || output.type === 'QUEUED' || output.type === 'NO_SESSION_TO_CONTINUE',
    },
    queuedOnlyWhileWaiting: {
      description: "Queued only while the turn waits for the layer above's word: once given, the turn is not held",
      condition: ({ input: [state], output }) => output.type !== 'QUEUED' || awaitsAdmission(state),
    },
    aClosedTaskIsSeenClosed: {
      description: 'With nothing in flight and no stop asked, a task held open and closed by a person is seen closed',
      condition: ({ input: [state], output }) =>
        state.settled !== null ||
        inFlight(state) !== undefined ||
        state.stopRequested ||
        !(state.holdOpen === true && state.closed) ||
        output.type === 'CLOSED',
    },
    previousLiveOnlyWhenSeen: {
      description: "The session a turn continues is seen live only when the pass saw it, under the last attempt's name",
      condition: ({ input: [state, observed], output }) => {
        const last = state.attempts.at(-1);
        return output.type !== 'PREVIOUS_LIVE' || (last !== undefined && observed.has(nameFor(state.taskId, last.n)));
      },
    },
    noSessionToContinueOnlyInALaterTurn: {
      description: 'No session to continue only for a later turn: the first turn starts with or without one',
      condition: ({ input: [state], output }) => output.type !== 'NO_SESSION_TO_CONTINUE' || state.inputs.length > 0,
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type Observe = Implementation<typeof observeSpec>;
