/**
 * A task's lifecycle, as a statechart: which states a task can be in, and for each event that can be observed in a state, the
 * one state it moves to and the one action that moves it.
 *
 * **A transition function, never an interpreter.** Nothing here runs: no actor is created, no action executes, no timer is
 * set. `transition` asks XState's pure `transition(machine, snapshot, event)` what an edge does, from a state `lifecycleOf`
 * read off the journal that pass, for an event `observe` read off the journal and the pass's observation. The journal stays
 * the state, a pass carries nothing, and a restart reads the same state from the same journal (`domain.ts`, which is where
 * both readings live). XState is imported by this file alone (`test/xstate-boundary.test.ts`); no entry exports the
 * machine or its move, as none exports `decide`: `agent-runtime` hands out its graph as plain data (`lifecycleGraph`), which a
 * board draws.
 *
 * **The states are A2A's `TaskState`, and three of the runtime's own.** `submitted`, `working`, `input-required`,
 * `completed`, `failed` and `canceled` are the protocol's words for what they say. The runtime's own:
 *
 *   - `starting`  an attempt's intent is journalled and no spawn is. The crash window: the name is derivable from the
 *                 intent, so a session found under it is adopted (a self-edge) rather than spawned a second time.
 *   - `stopping`  a person asked it to stop. Outranks every other reading but a settled one.
 *   - `ending`    no attempt runs and the current turn's end is on the record, or a person closed a task held open:
 *                 the task settles on that end, and on nothing observed.
 *
 * A2A's `rejected` is not a state: a spawn its harness refused is one attempt's end (`unstartable`), and the task settles
 * `failed` from `ending` as on any failed end — a long-lived task too, which waiting would not start. A sighting may say
 * `rejected` — a remote agent that refused the work once it had it — and that is the harness ending the attempt,
 * `SESSION_ENDED`, recorded `failed` as any failure the harness reports. A sighting's `submitted` — a remote Task
 * accepted and not yet started — is `SESSION_LIVE`, as `working` is: every edge of it (wait, stop for a person or the
 * deadline, stop before continuing) is right for it, and a new event would copy them. `auth-required` is not a task's
 * state either: a sighting says it, and it is `SESSION_BLOCKED`, as `input-required` is. A session blocked on a person is
 * a self-edge of `working`, not a state: the journal cannot tell it from working, only a sighting can, and a state is what
 * the journal says.
 *
 * **A person's verbs are not edges, and are declared beside them.** `requestStop`, `answer` and `close` write an entry to
 * the journal, and the next pass reads the state that entry makes: `stopping`, a new turn's `submitted`, `ending`. The edges
 * are what a pass does, and a pass never writes a person's word. `VERBS` says, for each, the states it is taken from, the
 * state the next pass reads and the guard its refusal asks (`verbTakes` in `domain.ts`); the diagram draws them.
 *
 * **An event with no edge is refused, not guessed at.** `transition` answers `{ refused }`, `decide` turns it into
 * `nothing` with the refusal on it, the engine's pass reports it (`TickReport.refused`) and `wf up` logs it: a missing
 * edge stalls a task out loud.
 *
 * What XState does, as this file uses it: `machine.resolveState({ value })` builds a snapshot of any state;
 * `snapshot.can(event)` evaluates guards against the event's payload; `transition(machine, snapshot, event)` returns
 * `[next, actions]`, each action `{ type, params }` and none executed; on an event with no edge it returns the same
 * snapshot and no action, and throws nothing — which is why `can` is asked first, since a self-edge also leaves the state
 * where it was. A final state's snapshot is `status: 'done'` and `can` is false there for every event.
 */
import { setup, transition as xTransition } from 'xstate';
import { toDirectedGraph } from 'xstate/graph';
import { endOf, phaseWordOf, type Ended, type Outcome } from './session.ts';
import type { Action, EndReason, Event, Sighting } from './domain.ts';

/** Where a task stands, read off its journal alone (`lifecycleOf` in `domain.ts`). */
export const STATES = [
  'submitted',
  'starting',
  'working',
  'input-required',
  'stopping',
  'ending',
  'completed',
  'failed',
  'canceled',
] as const;
export type LifecycleState = (typeof STATES)[number];

/**
 * A verb written to a task from outside the lifecycle, by a person: the entry it journals, the states it is taken from, the
 * state the next pass reads once it is journalled, and the guard its refusal asks, by the name `VERB_GUARDS` keys it by.
 */
export type Verb = {
  verb: string;
  entry: Event['kind'];
  by: 'person';
  from: readonly LifecycleState[];
  to: LifecycleState;
  guard: string;
};

/**
 * The verbs a person writes to a task. None is an edge: each journals its entry, and the next pass reads the state it makes.
 * `stoppable`: not settled, not asked to stop already. `awaitsWord`: held open, its turn signed, waiting on a person.
 */
export const VERBS = [
  {
    verb: 'requestStop',
    entry: 'stop-requested',
    by: 'person',
    from: ['submitted', 'starting', 'working', 'input-required', 'ending'],
    to: 'stopping',
    guard: 'stoppable',
  },
  { verb: 'answer', entry: 'input', by: 'person', from: ['input-required'], to: 'submitted', guard: 'awaitsWord' },
  { verb: 'close', entry: 'closed', by: 'person', from: ['input-required'], to: 'ending', guard: 'awaitsWord' },
] as const satisfies readonly Verb[];

export type VerbName = (typeof VERBS)[number]['verb'];
export type VerbGuard = (typeof VERBS)[number]['guard'];

/** What a pass saw of one attempt's session, and what ending it now would lead to. */
type Seen = {
  attempt: number;
  sighting: Sighting;
  /** Whether the task asked for a closing statement (`closeoutSchema`): an end records whether one came (`stated`). */
  asked: boolean;
  /** Whether an end recorded now leaves the task held open, waiting on a person: `input-required` rather than `ending`. */
  holds: boolean;
};

/**
 * What a pass observed about a task, recomputed from the journal and the sightings on every pass (`observe` in
 * `domain.ts`). Each names a fact, never an action: the edge says what the fact means in the state it meets.
 *
 * - Nothing in flight, the turn not started: `READY`, `QUEUED`, `PREVIOUS_LIVE`, `NO_SESSION_TO_CONTINUE`.
 * - An attempt in flight, and what its harness says of the name: `SESSION_LIVE`, `SESSION_IDLE`, `SESSION_BLOCKED`,
 *   `SESSION_QUIET`, `SESSION_ENDED`, `SESSION_STOPPED`, `UNSPAWNED`, `UNSEEN_IN_GRACE`, `LOST`, `UNREAD` and `DEADLINE_PASSED`.
 *   `SESSION_IDLE` is a long-lived task's session open between turns (`idleOf` in `domain.ts`). `SESSION_RESPAWNING` is one
 *   its harness lists with no process, which it restarts itself, and `RESPAWN_OVERDUE` one listed so for `RESPAWN_GAP_MS`.
 *   `UNREAD` is one in flight — spawned, or only intended — whose harness could not be read this pass (`Now.unread`):
 *   neither seen nor gone; `overdue` on it says it is past its deadline.
 * - `SPAWN_REFUSED`, the engine's own: the harness refused the spawn, and nothing started. Never observed, since only the
 *   spawn call knows.
 * - Nothing in flight, and the record says why: `NOTHING_OPEN`, `AWAITING_INPUT`, `CLOSED`, `DEADLINE_SPENT`,
 *   `ATTEMPT_ENDED`.
 * - Nothing in flight in a long-lived task, whose ended session is restarted (`restartOf` in `domain.ts`): `UNREAD` while its
 *   harness could not be read, `PREVIOUS_LIVE` while it still holds the old one, `BACKING_OFF` within the backoff, then
 *   `RESTART_DUE`.
 * - `SETTLED`: a settled task. Every state it can be in is final, and takes no event; `decide` never asks (`settledQuiet`).
 */
export type LifecycleEvent =
  | { type: 'READY'; attempt: number; resumeFrom?: string; nudge?: string }
  | { type: 'QUEUED' }
  | { type: 'PREVIOUS_LIVE'; sessionId: string }
  | { type: 'NO_SESSION_TO_CONTINUE'; turn: number }
  | ({ type: 'SESSION_LIVE' } & Seen)
  | ({ type: 'SESSION_IDLE' } & Seen)
  | ({ type: 'SESSION_BLOCKED' } & Seen)
  | ({ type: 'SESSION_QUIET' } & Seen)
  | ({ type: 'SESSION_ENDED' } & Seen)
  | ({ type: 'SESSION_STOPPED' } & Seen)
  | ({ type: 'SESSION_RESPAWNING' } & Seen)
  | ({ type: 'RESPAWN_OVERDUE' } & Seen)
  | { type: 'UNSPAWNED'; attempt: number; name: string }
  | { type: 'UNSEEN_IN_GRACE'; attempt: number }
  | { type: 'LOST'; attempt: number }
  | { type: 'UNREAD'; attempt: number; overdue: boolean }
  | { type: 'DEADLINE_PASSED'; attempt: number; sighting?: Sighting; live: boolean }
  | { type: 'SPAWN_REFUSED'; attempt: number; error: string }
  | { type: 'NOTHING_OPEN' }
  | { type: 'AWAITING_INPUT' }
  | { type: 'CLOSED'; last?: { n: number; ended: Ended | null } }
  | { type: 'DEADLINE_SPENT'; seconds: number }
  | { type: 'ATTEMPT_ENDED'; ended: Ended | null; reason: EndReason | null; attempts: number; turn: number; error?: string }
  | { type: 'BACKING_OFF'; attempt: number; backoffMs: number }
  | { type: 'RESTART_DUE'; attempt: number; resumeFrom?: string; nudge?: string }
  | { type: 'SETTLED'; outcome: Outcome };

export type EventType = LifecycleEvent['type'];

/** A move the machine has no edge for: the state it was read in and the event it was handed. */
export type Refusal = { state: LifecycleState; event: EventType };

export type Moved = { to: LifecycleState; action: Action } | { refused: Refusal };

/** One pass's move: from a state, on an event, to the next state and the one action that takes it there. */
export type Move = (from: LifecycleState, event: LifecycleEvent) => Moved;

type Ev<T extends EventType> = Extract<LifecycleEvent, { type: T }>;
type Sessioned = Ev<'SESSION_LIVE' | 'SESSION_IDLE' | 'SESSION_BLOCKED' | 'SESSION_QUIET' | 'SESSION_ENDED' | 'SESSION_STOPPED'>;
type Open = Ev<'UNSPAWNED' | 'UNSEEN_IN_GRACE' | 'LOST' | 'UNREAD'>;

/**
 * The `nothing` an edge that waits gives, in words from the event's payload alone. Each edge names one action, and this and
 * the helpers below give its words: the `Action` `decide` returns. A live session runs in the words views print
 * (`phaseWordOf`), so a remote Task `submitted` runs as `working` does.
 */
const said = (event: LifecycleEvent): Action => {
  switch (event.type) {
    case 'SESSION_LIVE':
      return { do: 'nothing', why: `running (${phaseWordOf(event.sighting.state)})` };
    case 'SESSION_IDLE':
      return { do: 'nothing', why: 'idle — open until stopped' };
    case 'SESSION_BLOCKED':
      return { do: 'nothing', why: 'blocked — needs a person' };
    case 'SESSION_RESPAWNING':
      return { do: 'nothing', why: 'restarting — its harness respawns its process' };
    case 'BACKING_OFF':
      return { do: 'nothing', why: `restarting — backing off ${event.backoffMs / 1000}s after attempt ${event.attempt} ended` };
    case 'UNSEEN_IN_GRACE':
      return { do: 'nothing', why: 'spawned, waiting for the harness to register it' };
    case 'UNREAD':
      return { do: 'nothing', why: 'its harness could not be read this pass' };
    case 'QUEUED':
      return { do: 'nothing', why: 'queued — waits to be admitted' };
    case 'AWAITING_INPUT':
      return { do: 'nothing', why: 'input-required' };
    default:
      return { do: 'nothing', why: event.type };
  }
};

/**
 * The end of an attempt its harness has let go of, or that went quiet: what it said, untouched, or why it said nothing. Its
 * word is `endOf` the sighting's state — the journal's `done`, `failed` or `stopped`. No edge takes a session waiting on a
 * person here (`SESSION_BLOCKED` waits or stops), so one that did is the table's mistake, thrown as `moveOn` throws one.
 * `stated`, where the task asked for a closing statement: whether it came, a fact for the layer above, which judges it.
 */
const harnessEnd = (e: Sessioned): Action => ({
  do: 'record-end',
  attempt: e.attempt,
  sessionId: e.sighting.sessionId,
  observed: endedOf(e),
  reason: 'harness',
  nativeId: e.sighting.nativeId,
  closeout: e.sighting.closeout?.payload,
  ...(e.asked ? { stated: e.sighting.closeout !== undefined } : {}),
});

const endedOf = (e: Sessioned): Ended => {
  const end = endOf(e.sighting.state);
  if (!end)
    throw new Error(
      `the lifecycle recorded the end of a session its harness says is \`${e.sighting.state}\` on ${e.type}: it has not ended`,
    );
  return end;
};

/**
 * An attempt cut short with its harness holding no end of its own: the cut is its reason. A person's stop records it
 * `stopped`, the deadline `failed`; whatever the harness last showed of it is kept.
 */
const cutEnd = (reason: 'operator' | 'deadline', attempt: number, sighting?: Sighting): Action => ({
  do: 'record-end',
  attempt,
  sessionId: sighting?.sessionId ?? '(never seen)',
  observed: reason === 'operator' ? 'stopped' : 'failed',
  reason,
  nativeId: sighting?.nativeId,
  closeout: sighting?.closeout?.payload,
});

/**
 * The note a turn with no successful attempt settles `failed` with: how many attempts it had — a journal an older runtime
 * wrote may hold several of one turn, and the note counts them all — and, for an end that runtime's engine judged
 * `unsigned`, that the last ended without the closing statement it was asked for; for a spawn its harness refused, whose
 * words are on the event (`error`), that the last could not start, in those words, and the fix.
 */
const attemptNote = (e: Ev<'ATTEMPT_ENDED'>) => {
  const none = `${e.attempts} attempt(s)${e.turn ? ` of turn ${e.turn}` : ''}, none succeeded`;
  if (e.reason === 'unsigned') return `${none}: the last ended without the closing statement it was asked for`;
  if (e.error !== undefined) return `${none}: the last could not start: ${e.error}; fix what it names and file the task again`;
  return none;
};

/**
 * The actions, named for the `Action` each gives. Their bodies are empty and never run: XState is asked what an edge does,
 * never to do it, and the engine applies the `Action` (`step` in `engine.ts`).
 */
const ACTIONS = { nothing: () => {}, start: () => {}, spawn: () => {}, 'record-end': () => {}, stop: () => {}, settle: () => {} };

/** An edge's action, whose params are the `Action` it gives. Typed loosely here; `transition` hands back only `params`. */
const act = (type: keyof typeof ACTIONS, params: (event: any) => Action) => ({
  type,
  params: ({ event }: { event: LifecycleEvent }) => params(event),
});

const nothing = act('nothing', said);
const harness = [
  { guard: 'holds', target: 'input-required', actions: act('record-end', harnessEnd) },
  { target: 'ending', actions: act('record-end', harnessEnd) },
];
const deadline = [
  {
    guard: 'live',
    actions: act('stop', (e: Ev<'DEADLINE_PASSED'>) => ({
      do: 'stop',
      sessionId: e.sighting?.sessionId ?? '(never seen)',
      why: 'deadline',
    })),
  },
  { target: 'ending', actions: act('record-end', (e: Ev<'DEADLINE_PASSED'>) => cutEnd('deadline', e.attempt, e.sighting)) },
];
/** An attempt in flight, as its harness sees the name — the same in `starting` and `working`. */
const inFlight = {
  SESSION_LIVE: { actions: nothing },
  /** A long-lived task's session, open between turns: only a stop from outside ends it. */
  SESSION_IDLE: { actions: nothing },
  /** A long-lived task's session its harness is respawning: its harness's restart, waited out and never repeated. */
  SESSION_RESPAWNING: { actions: nothing },
  /** A respawn that never came: the attempt is lost, and the runtime restarts it from `ending`. */
  RESPAWN_OVERDUE: {
    target: 'ending',
    actions: act('record-end', (e: Ev<'RESPAWN_OVERDUE'>) => ({
      do: 'record-end',
      attempt: e.attempt,
      sessionId: e.sighting.sessionId,
      observed: 'failed',
      reason: 'lost',
      nativeId: e.sighting.nativeId,
    })),
  },
  SESSION_BLOCKED: { actions: nothing },
  SESSION_QUIET: harness,
  SESSION_ENDED: harness,
  /** Stopped under it, by its harness or a person at the harness's side: an end that never holds, since only `done` does. */
  SESSION_STOPPED: { target: 'ending', actions: act('record-end', harnessEnd) },
  DEADLINE_PASSED: deadline,
};
const settle = (outcome: Outcome, note?: (e: any) => string | undefined) =>
  act('settle', (e) => {
    const n = note?.(e);
    return { do: 'settle', outcome, ...(n !== undefined ? { note: n } : {}) };
  });

/**
 * The machine's configuration, as data: `withoutEdge` builds a machine from it with one edge taken away, which is how a
 * test plants the refusal the pass must report.
 */
const CONFIG = {
  id: 'task',
  initial: 'submitted',
  states: {
    /** Filed, or answered, and its turn not started: it starts once admitted, or settles on what the record rules out. */
    submitted: {
      on: {
        READY: {
          target: 'starting',
          actions: act('start', (e: Ev<'READY'>) => ({
            do: 'start',
            attempt: e.attempt,
            resumeFrom: e.resumeFrom,
            ...(e.nudge ? { nudge: e.nudge } : {}),
          })),
        },
        QUEUED: { actions: nothing },
        /**
         * A session its harness still holds — one that went quiet is not gone — is stopped before it is continued, or two
         * would share one conversation.
         */
        PREVIOUS_LIVE: {
          actions: act('stop', (e: Ev<'PREVIOUS_LIVE'>) => ({ do: 'stop', sessionId: e.sessionId, why: 'to continue it' })),
        },
        /** A later turn is an answer to a session, and one that never heard the question has nothing to answer. */
        NO_SESSION_TO_CONTINUE: {
          target: 'failed',
          actions: settle(
            'failed',
            (e: Ev<'NO_SESSION_TO_CONTINUE'>) =>
              `turn ${e.turn} has no session to continue: its harness recorded none for the attempt that signed`,
          ),
        },
      },
    },
    /**
     * The intent journalled, no spawn: spawned now, or — a crash between the spawn and its entry — the session found
     * under the name is adopted, and its end recorded as any other.
     */
    starting: {
      on: {
        ...inFlight,
        UNSPAWNED: {
          target: 'working',
          actions: act('spawn', (e: Ev<'UNSPAWNED'>) => ({ do: 'spawn', attempt: e.attempt, name: e.name })),
        },
        /**
         * Its harness could not be read, so a session the crash left under the name is not ruled out: spawned by a pass that
         * reads it, never twice. The deadline is read before this, and ends it.
         */
        UNREAD: { actions: nothing },
        /** Nothing started: the attempt ends `failed`, `unstartable`, in the harness's words. */
        SPAWN_REFUSED: {
          target: 'ending',
          actions: act('record-end', (e: Ev<'SPAWN_REFUSED'>) => ({
            do: 'record-end',
            attempt: e.attempt,
            sessionId: '(never started)',
            observed: 'failed',
            reason: 'unstartable',
            error: e.error,
          })),
        },
      },
    },
    /** Spawned. Followed while its harness holds it, its end recorded when it lets go or goes quiet. */
    working: {
      on: {
        ...inFlight,
        /** Not registered yet, a race measured in seconds, or gone: the grace window tells the two apart. */
        UNSEEN_IN_GRACE: { actions: nothing },
        /** Its harness could not be read: nothing is known, so nothing is done. The deadline is read before this, and ends it. */
        UNREAD: { actions: nothing },
        LOST: {
          target: 'ending',
          actions: act('record-end', (e: Ev<'LOST'>) => ({
            do: 'record-end',
            attempt: e.attempt,
            sessionId: '(never seen)',
            observed: 'failed',
            reason: 'lost',
          })),
        },
      },
    },
    /** Held open, its turn signed: it waits on a person for as long as they take, before the deadline, which times work. */
    'input-required': {
      on: { AWAITING_INPUT: { actions: nothing } },
    },
    /**
     * A person asked it to stop: what runs is stopped, an attempt is ended — with its harness's own end, statement untouched,
     * when it had one before the cut came, else with the cut — and then the task settles. Never settled open.
     */
    stopping: {
      on: {
        SESSION_LIVE: { actions: act('stop', (e: Sessioned) => ({ do: 'stop', sessionId: e.sighting.sessionId, why: 'operator' })) },
        SESSION_IDLE: { actions: act('stop', (e: Sessioned) => ({ do: 'stop', sessionId: e.sighting.sessionId, why: 'operator' })) },
        SESSION_BLOCKED: { actions: act('stop', (e: Sessioned) => ({ do: 'stop', sessionId: e.sighting.sessionId, why: 'operator' })) },
        SESSION_QUIET: { actions: act('stop', (e: Sessioned) => ({ do: 'stop', sessionId: e.sighting.sessionId, why: 'operator' })) },
        SESSION_ENDED: { actions: act('record-end', harnessEnd) },
        SESSION_STOPPED: { actions: act('record-end', (e: Sessioned) => cutEnd('operator', e.attempt, e.sighting)) },
        UNSPAWNED: { actions: act('record-end', (e: Open) => cutEnd('operator', e.attempt)) },
        UNSEEN_IN_GRACE: { actions: act('record-end', (e: Open) => cutEnd('operator', e.attempt)) },
        LOST: { actions: act('record-end', (e: Open) => cutEnd('operator', e.attempt)) },
        /**
         * Its harness could not be read: the stop waits for a read that says what runs, and once the deadline has passed
         * it is cut as a lost one is, so a person's stop is bounded by a harness that is never read again.
         */
        UNREAD: [{ guard: 'overdue', actions: act('record-end', (e: Open) => cutEnd('operator', e.attempt)) }, { actions: nothing }],
        NOTHING_OPEN: { target: 'canceled', actions: settle('stopped', () => 'operator') },
      },
    },
    /**
     * Nothing runs, and the record says how the turn ended, or that a person closed it: it settles on that — or, for a
     * long-lived task no stop was asked of, restarts it, unless its harness refused the spawn, which it settles on.
     */
    ending: {
      on: {
        CLOSED: [
          { guard: 'lastDone', target: 'completed', actions: settle('succeeded', () => 'closed') },
          {
            target: 'failed',
            actions: settle(
              'failed',
              (e: Ev<'CLOSED'>) => `closed${e.last ? `: attempt ${e.last.n} ended ${e.last.ended}` : ' before any attempt'}`,
            ),
          },
        ],
        DEADLINE_SPENT: {
          target: 'failed',
          actions: settle('failed', (e: Ev<'DEADLINE_SPENT'>) => `deadline exceeded after ${e.seconds}s`),
        },
        /** One attempt per start: trying again — lost, unstartable or failed — is the layer above's, a new filing. */
        ATTEMPT_ENDED: [
          { guard: 'endedDone', target: 'completed', actions: settle('succeeded') },
          { guard: 'endedStopped', target: 'canceled', actions: settle('stopped', () => 'session stopped') },
          { target: 'failed', actions: settle('failed', attemptNote) },
        ],
        /** A long-lived task's harness could not be read: its old session may still run, so nothing starts beside it. */
        UNREAD: { actions: nothing },
        /** A long-lived task's old session, still held: stopped before it is restarted, or two would share one conversation. */
        PREVIOUS_LIVE: {
          actions: act('stop', (e: Ev<'PREVIOUS_LIVE'>) => ({ do: 'stop', sessionId: e.sessionId, why: 'to restart it' })),
        },
        /** A long-lived task's session ended, no stop asked: it waits out the backoff (`backoffOf` in `domain.ts`). */
        BACKING_OFF: { actions: nothing },
        /** The backoff spent: the next attempt starts, continuing the latest session it had. */
        RESTART_DUE: {
          target: 'starting',
          actions: act('start', (e: Ev<'RESTART_DUE'>) => ({
            do: 'start',
            attempt: e.attempt,
            ...(e.resumeFrom ? { resumeFrom: e.resumeFrom } : {}),
            ...(e.nudge ? { nudge: e.nudge } : {}),
          })),
        },
      },
    },
    completed: { type: 'final' },
    failed: { type: 'final' },
    canceled: { type: 'final' },
  },
} as const;

const GUARDS = {
  holds: ({ event }: { event: LifecycleEvent }) => 'holds' in event && event.holds,
  live: ({ event }: { event: LifecycleEvent }) => event.type === 'DEADLINE_PASSED' && event.live,
  overdue: ({ event }: { event: LifecycleEvent }) => event.type === 'UNREAD' && event.overdue,
  lastDone: ({ event }: { event: LifecycleEvent }) => event.type === 'CLOSED' && event.last?.ended === 'done',
  endedDone: ({ event }: { event: LifecycleEvent }) => event.type === 'ATTEMPT_ENDED' && event.ended === 'done',
  endedStopped: ({ event }: { event: LifecycleEvent }) => event.type === 'ATTEMPT_ENDED' && event.ended === 'stopped',
};

type Config = { id: string; initial: string; states: Record<string, { type?: 'final'; on?: Record<string, unknown> }> };

/**
 * The machine a configuration makes. The configuration is checked by the tests (every edge, every state), not by XState's
 * types, which cannot follow a union of events through a table built from helpers.
 */
const machineOf = (config: Config) =>
  setup({ types: { events: {} as LifecycleEvent }, guards: GUARDS, actions: ACTIONS }).createMachine(config as any);

export const MACHINE = machineOf(CONFIG);

/**
 * A machine's move: `can` is asked first, since XState stays where it was on an event with no edge, and the event is
 * refused. Every edge names one action (`src/core/lifecycle.test.ts`): anything else is the table's mistake, not the task's, and
 * is thrown.
 */
const moveOn =
  (machine: ReturnType<typeof machineOf>): Move =>
  (from, event) => {
    const snapshot = machine.resolveState({ value: from });
    if (!snapshot.can(event)) return { refused: { state: from, event: event.type } };
    const [next, actions] = xTransition(machine, snapshot, event);
    const params = actions.map((a) => a.params as Action | undefined);
    if (params.length !== 1 || !params[0])
      throw new Error(`the lifecycle's edge from ${from} on ${event.type} gave ${params.length} actions, not one`);
    return { to: next.value as LifecycleState, action: params[0] };
  };

/** The shipped lifecycle's move: the one state and action an event leads to, or a refusal when the state has no edge for it. */
export const transition: Move = moveOn(MACHINE);

/** The machine with one state's edges for one event taken away. Never shipped: what a test plants a refusal with. */
export const machineWithout = (from: LifecycleState, event: EventType) => {
  const states = Object.fromEntries(
    Object.entries((CONFIG as unknown as Config).states).map(([name, node]) => [
      name,
      name === from && node.on ? { ...node, on: Object.fromEntries(Object.entries(node.on).filter(([type]) => type !== event)) } : node,
    ]),
  );
  return machineOf({ ...(CONFIG as unknown as Config), states });
};

/** The lifecycle with one edge taken away — the refusal a test plants, to prove a stalled task is reported. Never shipped. */
export const withoutEdge = (from: LifecycleState, event: EventType): Move => moveOn(machineWithout(from, event));

/** One edge of the machine, as its table says it: where it leaves from, on what, under which guard, to where, doing what. */
export type Edge = { from: LifecycleState; event: EventType; guard?: string; to: LifecycleState; action: string };

/** Each state of a machine, as XState's public graph of it (`toDirectedGraph`) gives it: its name, its kind, its edges. */
const nodesOf = (machine: ReturnType<typeof machineOf>) => toDirectedGraph(machine).children;

/** The states of a machine, in the order its table names them. */
export const statesOf = (machine = MACHINE): LifecycleState[] => nodesOf(machine).map((n) => n.stateNode.key as LifecycleState);

/**
 * Every edge of a machine, read off XState's public graph of it (`toDirectedGraph`), so the list is the machine and not a
 * copy of it. An edge with no target is drawn back to its source. A guard named in the table is kept as its name; one
 * given as an object, by its type.
 */
export const edgesOf = (machine = MACHINE): Edge[] =>
  nodesOf(machine).flatMap((node) =>
    node.edges.map(({ source, target, label, transition: t }) => ({
      from: source.key as LifecycleState,
      event: label.text as EventType,
      ...(t.guard ? { guard: typeof t.guard === 'string' ? t.guard : (t.guard as { type: string }).type } : {}),
      to: target.key as LifecycleState,
      action: t.actions.map((a) => (a as { type: string }).type).join(' '),
    })),
  );

/** The final states: a task settled, whose record takes no event. */
export const FINAL: ReadonlySet<LifecycleState> = new Set(
  nodesOf(MACHINE)
    .filter((n) => n.stateNode.type === 'final')
    .map((n) => n.stateNode.key as LifecycleState),
);

/**
 * The machine as a Mermaid state diagram, one line per edge, generated from `edgesOf`, then one per verb and state it is taken
 * from, labelled with its guard and who writes it and no action, since no pass takes it: the README's diagram is this text,
 * between its `diagram:lifecycle` markers, and the repository's diagram test fails when the two differ. Mermaid takes no `-`
 * in a state's id, so `input-required` is drawn under its own name, by an id without one.
 */
export const diagram = (machine = MACHINE, verbs: readonly Verb[] = VERBS): string => {
  const id = (s: string) => s.replace(/-/g, '_');
  return [
    'stateDiagram-v2',
    ...STATES.filter((s) => s !== id(s)).map((s) => `  state "${s}" as ${id(s)}`),
    `  [*] --> ${id(CONFIG.initial)}`,
    ...edgesOf(machine).map((e) => `  ${id(e.from)} --> ${id(e.to)}: ${e.event}${e.guard ? ` [${e.guard}]` : ''} / ${e.action}`),
    ...verbs.flatMap((v) => v.from.map((from) => `  ${id(from)} --> ${id(v.to)}: ${v.verb} [${v.guard}] (by ${v.by})`)),
    ...[...FINAL].map((s) => `  ${id(s)} --> [*]`),
  ].join('\n');
};

/** One edge of the lifecycle, as `lifecycleGraph` hands it to a board: plain strings, never a piece of the machine. */
export type LifecycleEdge = Edge;

/** One verb a person writes to a task, as `lifecycleGraph` hands it to a board: plain strings. */
export type LifecycleVerb = Omit<Verb, 'from'> & { from: LifecycleState[] };

/**
 * The lifecycle as plain data: its first state, every state in the table's order, the final ones, every edge, and every verb
 * written from outside it. A machine that has no verb says so with none.
 */
export type LifecycleGraph = {
  initial: LifecycleState;
  states: LifecycleState[];
  final: LifecycleState[];
  edges: LifecycleEdge[];
  verbs: LifecycleVerb[];
};

/**
 * The shipped lifecycle as data a board draws, read off the same graph as `diagram` (`statesOf`, `edgesOf`, `FINAL`, `VERBS`).
 * Each call returns a fresh copy that survives a JSON round trip: it takes nothing, and hands out no machine and no move.
 */
export const lifecycleGraph = (): LifecycleGraph => ({
  initial: CONFIG.initial,
  states: statesOf(),
  final: [...FINAL],
  edges: edgesOf(),
  verbs: VERBS.map((v) => ({ ...v, from: [...v.from] })),
});
