/**
 * A task's lifecycle, as a statechart: which states a task can be in, and for each event that can be observed in a state, the
 * one state it moves to and the one action that moves it (thin runtime stage 5, `docs/eval-thin-runtime.md` §5).
 *
 * **A transition function, never an interpreter.** Nothing here runs: no actor is created, no action executes, no timer is
 * set. `transition` asks XState's pure `transition(machine, snapshot, event)` what an edge does, from a state `lifecycleOf`
 * read off the journal that pass, for an event `observe` read off the journal and the pass's observation. The journal stays
 * the state, a pass carries nothing, and a restart reads the same state from the same journal (`domain.ts`, which is where
 * both readings live). XState is imported by this file alone (`test/xstate-boundary.test.ts`); no entry exports the
 * machine, as none exports `decide`.
 *
 * **The states are A2A's `TaskState`, and three of the runtime's own.** `submitted`, `working`, `input-required`,
 * `completed`, `failed` and `canceled` are the protocol's words for what they say. The runtime's own:
 *
 *   - `starting`  an attempt's intent is journalled and no spawn is. The crash window: the name is derivable from the
 *                 intent, so a session found under it is adopted (a self-edge) rather than spawned a second time.
 *   - `stopping`  a person asked it to stop. Outranks every other reading but a settled one, as the stop always has.
 *   - `ending`    no attempt runs and the current turn's end is on the record, or a person closed a task held open:
 *                 the task settles on that end, and on nothing observed.
 *
 * A2A's `rejected` is not a state: a spawn its harness refused is one attempt's end (`unstartable`), and the task settles
 * `failed` from `ending` as on any failed end. A sighting may say `rejected` — a remote agent that refused the work once it
 * had it — and that is the harness ending the attempt, `SESSION_ENDED`, recorded `failed` as any failure the harness
 * reports. A sighting's `submitted` — a remote Task accepted and not yet started — is `SESSION_LIVE`, as `working` is:
 * every edge of it (wait, stop for a person or the deadline, stop before continuing) is right for it, and a new event
 * would copy them. `auth-required` is not a task's state either: a sighting says it, and it is `SESSION_BLOCKED`, as
 * `input-required` is. A session blocked on a person is a self-edge of `working`, not a state: the journal cannot tell it
 * from working, only a sighting can, and a state is what the journal says.
 *
 * **A person's verbs are not edges.** `requestStop`, `answer` and `close` write an entry to the journal, and the next
 * pass reads the state that entry makes: `stopping`, a new turn's `submitted`, `ending`. The edges are what a pass does,
 * and a pass never writes a person's word, so `stopping` is entered by no edge (the reachability test counts it a root).
 *
 * **An event with no edge is refused, not guessed at.** `transition` answers `{ refused }`, `decide` turns it into
 * `nothing` with the refusal on it, the engine's pass reports it (`TickReport.refused`) and `wf up` logs it. Before
 * stage 5 `decide`'s branches were total by construction; a missing edge now stalls a task out loud.
 *
 * Measured of XState 5.33.2 before it was used this way (2026-09-25): `machine.resolveState({ value })` builds a snapshot
 * of any state; `snapshot.can(event)` evaluates guards against the event's payload; `transition(machine, snapshot, event)`
 * returns `[next, actions]`, each action `{ type, params }` and none executed; on an event with no edge it returns the same
 * snapshot and no action, and throws nothing — which is why `can` is asked first, since a self-edge also leaves the state
 * where it was. A final state's snapshot is `status: 'done'` and `can` is false there for every event.
 */
import { setup, transition as xTransition } from 'xstate';
import { endOf, phaseWordOf, type Action, type Ended, type EndReason, type Outcome, type Sighting } from './domain.ts';

/** Where a task stands, read off its journal alone (`lifecycleOf` in `domain.ts`). */
export const STATES = ['submitted', 'starting', 'working', 'input-required', 'stopping', 'ending', 'completed', 'failed', 'canceled'] as const;
export type LifecycleState = typeof STATES[number];

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
 */
export type LifecycleEvent =
  // nothing in flight, the turn not started
  | { type: 'READY'; attempt: number; resumeFrom?: string; nudge?: string }
  | { type: 'QUEUED' }
  | { type: 'PREVIOUS_LIVE'; sessionId: string }
  | { type: 'NO_SESSION_TO_CONTINUE'; turn: number }
  // an attempt in flight, and what its harness says of the name
  | ({ type: 'SESSION_LIVE' } & Seen)
  | ({ type: 'SESSION_BLOCKED' } & Seen)
  | ({ type: 'SESSION_QUIET' } & Seen)
  | ({ type: 'SESSION_ENDED' } & Seen)
  | ({ type: 'SESSION_STOPPED' } & Seen)
  | { type: 'UNSPAWNED'; attempt: number; name: string }
  | { type: 'UNSEEN_IN_GRACE'; attempt: number }
  | { type: 'LOST'; attempt: number }
  /** In flight — spawned, or only intended — and its harness could not be read this pass (`Now.unread`): neither seen nor gone. `overdue`: past its deadline. */
  | { type: 'UNREAD'; attempt: number; overdue: boolean }
  | { type: 'DEADLINE_PASSED'; attempt: number; sighting?: Sighting; live: boolean }
  /** The engine's own: the harness refused the spawn, and nothing started. Never observed, since only the spawn call knows. */
  | { type: 'SPAWN_REFUSED'; attempt: number; error: string }
  // nothing in flight, and the record says why
  | { type: 'NOTHING_OPEN' }
  | { type: 'AWAITING_INPUT' }
  | { type: 'CLOSED'; last?: { n: number; ended: Ended | null } }
  | { type: 'DEADLINE_SPENT'; seconds: number }
  | { type: 'ATTEMPT_ENDED'; ended: Ended | null; reason: EndReason | null; attempts: number; turn: number }
  /** A settled task: every state it can be in is final, and takes no event. `decide` never asks (`settledQuiet`). */
  | { type: 'SETTLED'; outcome: Outcome };

export type EventType = LifecycleEvent['type'];

/** A move the machine has no edge for: the state it was read in and the event it was handed. */
export type Refusal = { state: LifecycleState; event: EventType };

export type Moved = { to: LifecycleState; action: Action } | { refused: Refusal };

/** One pass's move: from a state, on an event, to the next state and the one action that takes it there. */
export type Move = (from: LifecycleState, event: LifecycleEvent) => Moved;

// ─── what an edge does ──────────────────────────────────────────────────────
// Each edge names one action, and these give its words: the `Action` `decide` returns, from the event's payload alone.

type Ev<T extends EventType> = Extract<LifecycleEvent, { type: T }>;
type Sessioned = Ev<'SESSION_LIVE' | 'SESSION_BLOCKED' | 'SESSION_QUIET' | 'SESSION_ENDED' | 'SESSION_STOPPED'>;
type Open = Ev<'UNSPAWNED' | 'UNSEEN_IN_GRACE' | 'LOST' | 'UNREAD'>;

const said = (event: LifecycleEvent): Action => {
  switch (event.type) {
    // In the words views have always printed (`phaseWordOf`): a remote Task `submitted` runs as `working` does.
    case 'SESSION_LIVE': return { do: 'nothing', why: `running (${phaseWordOf(event.sighting.state)})` };
    case 'SESSION_BLOCKED': return { do: 'nothing', why: 'blocked — needs a person' };
    case 'UNSEEN_IN_GRACE': return { do: 'nothing', why: 'spawned, waiting for the harness to register it' };
    case 'UNREAD': return { do: 'nothing', why: 'its harness could not be read this pass' };
    case 'QUEUED': return { do: 'nothing', why: 'queued — waits to be admitted' };
    case 'AWAITING_INPUT': return { do: 'nothing', why: 'input-required' };
    default: return { do: 'nothing', why: event.type };
  }
};

/**
 * The end of an attempt its harness has let go of, or that went quiet: what it said, untouched, or why it said nothing. Its
 * word is `endOf` the sighting's state — the journal's `done`, `failed` or `stopped`. No edge takes a session waiting on a
 * person here (`SESSION_BLOCKED` waits or stops), so one that did is the table's mistake, thrown as `moveOn` throws one.
 */
const harnessEnd = (e: Sessioned): Action => ({
  do: 'record-end', attempt: e.attempt, sessionId: e.sighting.sessionId, observed: endedOf(e),
  reason: 'harness', nativeId: e.sighting.nativeId, closeout: e.sighting.closeout?.payload,
  // Whether the statement its task asked for came: a fact for the layer above, which judges it.
  ...(e.asked ? { stated: e.sighting.closeout !== undefined } : {}),
});

const endedOf = (e: Sessioned): Ended => {
  const end = endOf(e.sighting.state);
  if (!end) throw new Error(`the lifecycle recorded the end of a session its harness says is \`${e.sighting.state}\` on ${e.type}: it has not ended`);
  return end;
};

/**
 * An attempt cut short with its harness holding no end of its own: the cut is its reason. A person's stop records it
 * `stopped`, the deadline `failed`; whatever the harness last showed of it is kept.
 */
const cutEnd = (reason: 'operator' | 'deadline', attempt: number, sighting?: Sighting): Action => ({
  do: 'record-end', attempt, sessionId: sighting?.sessionId ?? '(never seen)', observed: reason === 'operator' ? 'stopped' : 'failed',
  reason, nativeId: sighting?.nativeId, closeout: sighting?.closeout?.payload,
});

const attemptNote = (e: Ev<'ATTEMPT_ENDED'>) => {
  // A journal from before stage 4a part 2 may hold several attempts of a turn: the note counts them all.
  const none = `${e.attempts} attempt(s)${e.turn ? ` of turn ${e.turn}` : ''}, none succeeded`;
  // An end the engine judged `unsigned`, in a journal from before stage 4a: settled with the note it always had.
  return e.reason === 'unsigned' ? `${none}: the last ended without the closing statement it was asked for` : none;
};

// The actions, named for the `Action` each gives. Their bodies are empty and never run: XState is asked what an edge
// does, never to do it, and the engine applies the `Action` (`step` in `engine.ts`).
const ACTIONS = { nothing: () => {}, start: () => {}, spawn: () => {}, 'record-end': () => {}, stop: () => {}, settle: () => {} };

/** An edge's action, whose params are the `Action` it gives. Typed loosely here; `transition` hands back only `params`. */
const act = (type: keyof typeof ACTIONS, params: (event: any) => Action) => ({ type, params: ({ event }: { event: LifecycleEvent }) => params(event) });

const nothing = act('nothing', said);
const harness = [
  { guard: 'holds', target: 'input-required', actions: act('record-end', harnessEnd) },
  { target: 'ending', actions: act('record-end', harnessEnd) },
];
const deadline = [
  { guard: 'live', actions: act('stop', (e: Ev<'DEADLINE_PASSED'>) => ({ do: 'stop', sessionId: e.sighting!.sessionId, why: 'deadline' })) },
  { target: 'ending', actions: act('record-end', (e: Ev<'DEADLINE_PASSED'>) => cutEnd('deadline', e.attempt, e.sighting)) },
];
/** An attempt in flight, as its harness sees the name — the same in `starting` and `working`. */
const inFlight = {
  SESSION_LIVE: { actions: nothing },
  SESSION_BLOCKED: { actions: nothing },
  SESSION_QUIET: harness,
  SESSION_ENDED: harness,
  // Stopped under it, by its harness or a person at the harness's side: an end that never holds, since only `done` does.
  SESSION_STOPPED: { target: 'ending', actions: act('record-end', harnessEnd) },
  DEADLINE_PASSED: deadline,
};
const settle = (outcome: Outcome, note?: (e: any) => string | undefined) =>
  act('settle', (e) => { const n = note?.(e); return { do: 'settle', outcome, ...(n !== undefined ? { note: n } : {}) }; });

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
        READY: { target: 'starting', actions: act('start', (e: Ev<'READY'>) => ({ do: 'start', attempt: e.attempt, resumeFrom: e.resumeFrom, ...(e.nudge ? { nudge: e.nudge } : {}) })) },
        QUEUED: { actions: nothing },
        // A session its harness still holds — one that went quiet is not gone — is stopped before it is continued, or two
        // would share one conversation.
        PREVIOUS_LIVE: { actions: act('stop', (e: Ev<'PREVIOUS_LIVE'>) => ({ do: 'stop', sessionId: e.sessionId, why: 'to continue it' })) },
        // A later turn is an answer to a session, and one that never heard the question has nothing to answer.
        NO_SESSION_TO_CONTINUE: { target: 'failed', actions: settle('failed', (e: Ev<'NO_SESSION_TO_CONTINUE'>) => `turn ${e.turn} has no session to continue: its harness recorded none for the attempt that signed`) },
      },
    },
    /**
     * The intent journalled, no spawn: spawned now, or — a crash between the spawn and its entry — the session found
     * under the name is adopted, and its end recorded as any other.
     */
    starting: {
      on: {
        ...inFlight,
        UNSPAWNED: { target: 'working', actions: act('spawn', (e: Ev<'UNSPAWNED'>) => ({ do: 'spawn', attempt: e.attempt, name: e.name })) },
        // Its harness could not be read, so a session the crash left under the name is not ruled out: spawned by a pass that
        // reads it, never twice. The deadline is read before this, and ends it.
        UNREAD: { actions: nothing },
        // Nothing started: the attempt ends `failed`, `unstartable`, in the harness's words.
        SPAWN_REFUSED: { target: 'ending', actions: act('record-end', (e: Ev<'SPAWN_REFUSED'>) => ({ do: 'record-end', attempt: e.attempt, sessionId: '(never started)', observed: 'failed', reason: 'unstartable', error: e.error })) },
      },
    },
    /** Spawned. Followed while its harness holds it, its end recorded when it lets go or goes quiet. */
    working: {
      on: {
        ...inFlight,
        // Not registered yet, a race measured in seconds, or gone: the grace window tells the two apart.
        UNSEEN_IN_GRACE: { actions: nothing },
        // Its harness could not be read: nothing is known, so nothing is done. The deadline is read before this, and ends it.
        UNREAD: { actions: nothing },
        LOST: { target: 'ending', actions: act('record-end', (e: Ev<'LOST'>) => ({ do: 'record-end', attempt: e.attempt, sessionId: '(never seen)', observed: 'failed', reason: 'lost' })) },
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
        SESSION_BLOCKED: { actions: act('stop', (e: Sessioned) => ({ do: 'stop', sessionId: e.sighting.sessionId, why: 'operator' })) },
        SESSION_QUIET: { actions: act('stop', (e: Sessioned) => ({ do: 'stop', sessionId: e.sighting.sessionId, why: 'operator' })) },
        SESSION_ENDED: { actions: act('record-end', harnessEnd) },
        SESSION_STOPPED: { actions: act('record-end', (e: Sessioned) => cutEnd('operator', e.attempt, e.sighting)) },
        UNSPAWNED: { actions: act('record-end', (e: Open) => cutEnd('operator', e.attempt)) },
        UNSEEN_IN_GRACE: { actions: act('record-end', (e: Open) => cutEnd('operator', e.attempt)) },
        LOST: { actions: act('record-end', (e: Open) => cutEnd('operator', e.attempt)) },
        // Its harness could not be read: the stop waits for a read that says what runs, and once the deadline has passed
        // it is cut as a lost one is, so a person's stop is bounded by a harness that is never read again.
        UNREAD: [
          { guard: 'overdue', actions: act('record-end', (e: Open) => cutEnd('operator', e.attempt)) },
          { actions: nothing },
        ],
        NOTHING_OPEN: { target: 'canceled', actions: settle('stopped', () => 'operator') },
      },
    },
    /** Nothing runs, and the record says how the turn ended, or that a person closed it: it settles on that. */
    ending: {
      on: {
        CLOSED: [
          { guard: 'lastDone', target: 'completed', actions: settle('succeeded', () => 'closed') },
          { target: 'failed', actions: settle('failed', (e: Ev<'CLOSED'>) => `closed${e.last ? `: attempt ${e.last.n} ended ${e.last.ended}` : ' before any attempt'}`) },
        ],
        DEADLINE_SPENT: { target: 'failed', actions: settle('failed', (e: Ev<'DEADLINE_SPENT'>) => `deadline exceeded after ${e.seconds}s`) },
        // One attempt per start: trying again — lost, unstartable or failed — is the layer above's, a new filing.
        ATTEMPT_ENDED: [
          { guard: 'endedDone', target: 'completed', actions: settle('succeeded') },
          { guard: 'endedStopped', target: 'canceled', actions: settle('stopped', () => 'session stopped') },
          { target: 'failed', actions: settle('failed', attemptNote) },
        ],
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

const machineOf = (config: Config) =>
  // The configuration is checked by the tests (every edge, every state), not by XState's types, which cannot follow a
  // union of events through a table built from helpers.
  setup({ types: { events: {} as LifecycleEvent }, guards: GUARDS, actions: ACTIONS }).createMachine(config as any);

export const MACHINE = machineOf(CONFIG as unknown as Config);

const moveOn = (machine: ReturnType<typeof machineOf>): Move => (from, event) => {
  const snapshot = machine.resolveState({ value: from });
  if (!snapshot.can(event)) return { refused: { state: from, event: event.type } };
  const [next, actions] = xTransition(machine, snapshot, event);
  const params = actions.map((a) => a.params as Action | undefined);
  // Every edge names one action (`test/lifecycle.test.ts`): anything else is the table's mistake, not the task's.
  if (params.length !== 1 || !params[0]) throw new Error(`the lifecycle's edge from ${from} on ${event.type} gave ${params.length} actions, not one`);
  return { to: next.value as LifecycleState, action: params[0] };
};

/** The shipped lifecycle's move: the one state and action an event leads to, or a refusal when the state has no edge for it. */
export const transition: Move = moveOn(MACHINE);

/** The machine with one state's edges for one event taken away. Never shipped: what a test plants a refusal with. */
export const machineWithout = (from: LifecycleState, event: EventType) => {
  const states = Object.fromEntries(Object.entries((CONFIG as unknown as Config).states).map(([name, node]) => [name,
    name === from && node.on ? { ...node, on: Object.fromEntries(Object.entries(node.on).filter(([type]) => type !== event)) } : node]));
  return machineOf({ ...(CONFIG as unknown as Config), states });
};

/** The lifecycle with one edge taken away — the refusal a test plants, to prove a stalled task is reported. Never shipped. */
export const withoutEdge = (from: LifecycleState, event: EventType): Move => moveOn(machineWithout(from, event));

/** One edge of the machine, as its table says it: where it leaves from, on what, under which guard, to where, doing what. */
export type Edge = { from: LifecycleState; event: EventType; guard?: string; to: LifecycleState; action: string };

/** Every edge of a machine, read off XState's own nodes, so the list is the machine and not a copy of it. */
export const edgesOf = (machine = MACHINE): Edge[] =>
  Object.entries(machine.root.states).flatMap(([from, node]) =>
    [...node.transitions.entries()].flatMap(([event, defs]) => defs.map((d) => ({
      from: from as LifecycleState, event: event as EventType,
      // A guard named in the table is kept as its name; one given as an object, by its type.
      ...(d.guard ? { guard: typeof d.guard === 'string' ? d.guard : (d.guard as { type: string }).type } : {}),
      to: (d.target?.[0]?.key ?? from) as LifecycleState,
      action: d.actions.map((a) => (a as { type: string }).type).join(' '),
    }))));

/** The final states: a task settled, whose record takes no event. */
export const FINAL: ReadonlySet<LifecycleState> = new Set(Object.entries(MACHINE.root.states).filter(([, n]) => n.type === 'final').map(([k]) => k as LifecycleState));

/**
 * The machine as a Mermaid state diagram, one line per edge, generated from `edgesOf`: the README's diagram is this text,
 * and `test/lifecycle.test.ts` fails when the two differ.
 */
export const diagram = (machine = MACHINE): string => {
  // Mermaid takes no `-` in a state's id: `input-required` is drawn under its own name, by an id without one.
  const id = (s: string) => s.replace(/-/g, '_');
  return [
    'stateDiagram-v2',
    ...STATES.filter((s) => s !== id(s)).map((s) => `  state "${s}" as ${id(s)}`),
    `  [*] --> ${id(CONFIG.initial)}`,
    ...edgesOf(machine).map((e) => `  ${id(e.from)} --> ${id(e.to)}: ${e.event}${e.guard ? ` [${e.guard}]` : ''} / ${e.action}`),
    ...[...FINAL].map((s) => `  ${id(s)} --> [*]`),
  ].join('\n');
};
