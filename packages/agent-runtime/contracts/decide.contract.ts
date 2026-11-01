/**
 * One step of a runtime task toward its desired state (agent-runtime, src/core/domain.ts, `decide`): where the task
 * stands (`lifecycleOf`), what the pass saw (`observe`), and the lifecycle's edge for that (`transition`), here the
 * shipped one. The edge table is XState's, which the verifier does not read: what `decide` may take of it is declared
 * below, every law tested on the real table, every state against every event (`test/assumptions.test.ts`).
 */
import { assume, spec } from '@emyann/tsverify';
import type { Monotonic } from '../src/core/clock.ts';
import { type Action, type Attempt, backoffOf, nameFor, type Now, RESTART_BACKOFF, type Sighting, type State } from '../src/core/domain.ts';
import { type Move, transition } from '../src/core/lifecycle.ts';

export const backoff = assume(backoffOf, {
  pure: true,
  ensures: { withinItsCap: ({ output }) => output >= RESTART_BACKOFF.initialMs && output <= RESTART_BACKOFF.maxMs },
});

const ENDS = ['NO_SESSION_TO_CONTINUE', 'NOTHING_OPEN', 'CLOSED', 'DEADLINE_SPENT', 'ATTEMPT_ENDED'];
const SESSIONS = ['PREVIOUS_LIVE', 'SESSION_LIVE', 'SESSION_IDLE', 'SESSION_BLOCKED', 'SESSION_QUIET', 'DEADLINE_PASSED'];

/** What `decide` takes of the lifecycle's table: which events each kind of action answers, and what a state refuses. */
export const edges = assume(transition, {
  pure: true,
  ensures: {
    startsOnlyWhenReady: ({ input: [, event], output }) =>
      'refused' in output || output.action.do !== 'start' || event.type === 'READY' || event.type === 'RESTART_DUE',
    spawnsOnlyTheUnspawned: ({ input: [, event], output }) =>
      'refused' in output || output.action.do !== 'spawn' || event.type === 'UNSPAWNED',
    settlesOnlyOnAnEnd: ({ input: [, event], output }) => 'refused' in output || output.action.do !== 'settle' || ENDS.includes(event.type),
    stopsOnlyASession: ({ input: [, event], output }) =>
      'refused' in output || output.action.do !== 'stop' || SESSIONS.includes(event.type),
    stoppingNeverStarts: ({ input: [from], output }) =>
      from !== 'stopping' || 'refused' in output || (output.action.do !== 'start' && output.action.do !== 'spawn'),
    aFinalStateRefuses: ({ input: [from], output }) =>
      (from !== 'completed' && from !== 'failed' && from !== 'canceled') || 'refused' in output,
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

const decideSpec = spec<(state: State, observed: ReadonlyMap<string, Sighting>, now: Now, move?: Move) => Action>({
  /** The shipped lifecycle (`move` left to its default), on moments stamped as the runtime stamps them. */
  requires: ({ input: [state, , now, move] }) =>
    move === undefined &&
    stamped(now.at.getTime()) &&
    monoStamped(now.mono) &&
    (state.deadlineSeconds === undefined ||
      (Number.isInteger(state.deadlineSeconds) && state.deadlineSeconds >= 0 && state.deadlineSeconds <= 2 ** 31)) &&
    state.attempts.every(attemptStamped),
  ensures: {
    /** A settled task is left alone. */
    aSettledTaskIsLeftAlone: ({ input: [state], output }) => state.settled === null || output.do === 'nothing',
    /** A person's stop is never answered by starting a session. */
    aStopNeverStarts: ({ input: [state], output }) => !state.stopRequested || (output.do !== 'start' && output.do !== 'spawn'),
    /**
     * A session its harness already shows under the attempt's name is adopted, never spawned a second time: the reason
     * the name is ours.
     */
    neverSpawnsASessionItSees: ({ input: [state, observed], output }) => {
      const last = inFlight(state);
      return output.do !== 'spawn' || (last !== undefined && !observed.has(nameFor(state.taskId, last.n)));
    },
    /** A task settles only once nothing of it runs. */
    settlesOnlyWithNothingInFlight: ({ input: [state], output }) => output.do !== 'settle' || inFlight(state) === undefined,
    /** A start is a new attempt, never one while another is in flight. */
    startsOnlyWithNothingInFlight: ({ input: [state], output }) => output.do !== 'start' || inFlight(state) === undefined,
  },
});
export type DecideSpec = typeof decideSpec;
