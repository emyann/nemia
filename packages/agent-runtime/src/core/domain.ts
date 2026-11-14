import type { PermissionFacts } from '../harness/seam.ts';
import { transition, VERBS, type LifecycleEvent, type Move, type VerbGuard, type VerbName } from './lifecycle.ts';
import { elapsedMs, type Instant, type Monotonic } from './clock.ts';
import { backoffOf, endedWhen, restartWords } from './restart.ts';
import { deadlineOf, heldNow, holdFacts } from './deadline.ts';
import { turnOf } from './turn.ts';
import { endOf, isLive, NEEDS_HUMAN, RUNNING, waitsOnPerson, type SessionState } from './session.ts';
import { foldInto } from './attempt-fold.ts';
import type { AdmissionWait } from './admission.ts';
import type { Decide } from '../../contracts/decide.contract.ts';
import type { LifecycleOf } from '../../contracts/lifecycle.contract.ts';
import type { Observe } from '../../contracts/observe.contract.ts';
import type { Sighting, Parked, Denial, Event, Attempt, State, Action, Now } from './state.ts';
import { nameFor } from './name.ts';
import { waitsForInput, awaitsAdmission } from './waiting.ts';

export { waitsForInput, awaitsAdmission, admissionOf } from './waiting.ts';

export { nameFor } from './name.ts';

export type {
  TaskResources,
  Sighting,
  SessionAsk,
  SessionAskKind,
  AskQuestion,
  AskOption,
  Parked,
  Bridge,
  Denial,
  Usage,
  EndReason,
  Event,
  Said,
  Input,
  Attempt,
  State,
  Action,
  Now,
} from './state.ts';

/** Ended by the session itself, not stopped under it: an end on record that no deadline overrules. */
const ENDED_OWN: ReadonlySet<SessionState> = new Set(['completed', 'failed', 'rejected']);

export type { PermissionFacts };

/** A denial as a person reads it, and as a permission rule is written: `Bash(pytest)`, `Skill(look)`, `WebFetch`. */
export const denialText = (d: Denial): string => (d.what ? `${d.tool}(${d.what})` : d.tool);

/** The runtime's task and the attempt a session name carries, or `undefined` for a name that is not `ae/<task>/<n>`. */
export const nameParts = (name: string): { taskId: string; n: number } | undefined => {
  const [, taskId, n] = /^ae\/(.+)\/([1-9][0-9]*)$/.exec(name) ?? [];
  if (taskId === undefined || n === undefined) return undefined;
  const parts = { taskId, n: Number(n) };
  return nameFor(parts.taskId, parts.n) === name ? parts : undefined;
};

/** The optional parts of the attempt a `starting` event `e` opens on `s`: its monotonic start, what it is told and runs under, its turn. */
const startedParts = (s: State, e: Extract<Event, { kind: 'starting' }>) => ({
  ...(e.mono ? { startedMono: e.mono } : {}),
  ...(e.nudge ? { nudge: e.nudge } : {}),
  ...(e.resources ? { resources: e.resources } : {}),
  ...(s.inputs.length ? { turn: s.inputs.length } : {}),
});

/**
 * Ends the attempt `a` as the `ended` event `e` says: an empty list of skills, files or denials kept — measured, none — though an empty
 * one of denials never takes away a denial seen while it ran (`denied`), and an end with no usage keeping what was counted while it ran
 * (`counted`).
 */
function endAttempt(a: Attempt, e: Extract<Event, { kind: 'ended' }>): void {
  a.ended = e.observed;
  a.endedAt = e.at;
  if (e.mono) a.endedMono = e.mono;
  a.reason = e.reason;
  a.nativeId = e.nativeId ?? a.nativeId;
  a.closeout = e.closeout;
  if (e.closedOut !== undefined) a.closedOut = e.closedOut;
  if (e.former !== undefined) a.former = e.former;
  a.usage = e.usage ?? a.usage;
  a.exitCode = e.exitCode ?? null;
  if (e.terminationMessage !== undefined) a.terminationMessage = e.terminationMessage;
  if (e.memory !== undefined) a.memory = e.memory;
  if (e.denials) a.denials = e.denials.length ? e.denials : (a.denials ?? []);
  if (e.skills) a.skills = e.skills;
  if (e.files) a.files = e.files;
  if (e.ranOn) a.ranOn = e.ranOn;
  if (e.ranIn) a.ranIn = e.ranIn;
  if (e.limit) a.limit = e.limit;
  if (e.parked) a.parked = e.parked;
  a.error = e.error ?? a.error;
}

/** An event about one attempt, `e`, written into that attempt's fold when `s` holds it: its end here, every other in `foldInto`. */
function intoAttempt(s: State, e: Extract<Event, { kind: 'ended' } | Parameters<typeof foldInto>[1]>): void {
  const a = s.attempts.find((x) => x.n === e.attempt);
  if (a && e.kind === 'ended') endAttempt(a, e);
  else if (a && e.kind !== 'ended') foldInto(a, e);
}

/** The task as the `filed` event `e` states it, written into the fold `s`. */
function fileInto(s: State, e: Extract<Event, { kind: 'filed' }>): void {
  s.filedAt = e.at;
  s.brief = e.brief;
  s.cwd = e.cwd;
  s.harness = e.harness;
  s.deadlineSeconds = e.deadlineSeconds;
  s.resumeFrom = e.resumeFrom;
  s.config = e.config;
  s.closeoutSchema = e.closeoutSchema;
  if (e.holdOpen) s.holdOpen = true;
  if (e.restartPolicy === 'Always') s.restartPolicy = 'Always';
  if (e.queued !== undefined) s.queued = e.queued;
  if (e.priority !== undefined) s.priority = e.priority;
  if (e.labels !== undefined) s.labels = e.labels;
  if (e.traceparent !== undefined) s.traceparent = e.traceparent;
  if (e.resources !== undefined) s.resources = e.resources;
}

/** A `waits` entry into `s`: the wait it says, or none where it says none (a pass that judged nothing took it off). */
function waitInto(s: State, wait: AdmissionWait | undefined): void {
  if (wait === undefined) delete s.waits;
  else s.waits = wait;
}

/** Observed state, folded. A `State` is never stored — it is always re-derived from the journal. */
export function fold(taskId: string, events: readonly Event[]): State {
  const s: State = {
    taskId,
    brief: '',
    cwd: '',
    attempts: [],
    said: [],
    inputs: [],
    closed: false,
    stopRequested: false,
    settled: null,
  };
  for (const e of events) {
    switch (e.kind) {
      case 'filed':
        fileInto(s, e);
        break;
      case 'admitted':
        s.admitted = s.inputs.length;
        delete s.waits;
        break;
      case 'waits':
        waitInto(s, e.wait);
        break;
      case 'starting':
        delete s.waits;
        s.attempts.push({
          n: e.attempt,
          startedAt: e.at,
          spawnedAt: null,
          ended: null,
          endedAt: null,
          reason: null,
          nativeId: null,
          resumeFrom: e.resumeFrom,
          usage: null,
          exitCode: null,
          ...startedParts(s, e),
        });
        break;
      case 'stop-requested':
        s.stopRequested = true;
        break;
      case 'said':
        s.said.push({ at: e.at, attempt: e.attempt, text: e.text, after: e.after ?? null });
        break;
      case 'input':
        s.inputs.push({ at: e.at, text: e.text, ...(e.config ? { config: e.config } : {}) });
        break;
      case 'closed':
        s.closed = true;
        break;
      case 'settled': {
        s.settled = e.outcome;
        const open = s.attempts.at(-1);
        if (open && open.ended === null && e.nativeId) open.nativeId = e.nativeId;
        break;
      }
      default:
        intoAttempt(s, e);
    }
  }
  return s;
}

export { turnOf } from './turn.ts';

/** A task a person may ask to stop (`requestStop`): not settled, and not asked to stop already. */
const stoppable = (state: State): boolean => !state.settled && !state.stopRequested;

/** A task a person may answer or close: waiting on their word (`waitsForInput`), and not asked to stop, which outranks it. */
const awaitsWord = (state: State): boolean => waitsForInput(state) && !state.stopRequested;

/**
 * Each guard a verb of `VERBS` names, by that name: the predicate its refusal asks of the task's state.
 * Exported only for the tests that import it.
 */
export const VERB_GUARDS: Record<VerbGuard, (state: State) => boolean> = { stoppable, awaitsWord };

/** Whether a person's verb is taken in this state: the guard `VERBS` names for it, asked of the state. */
export const verbTakes = (verb: VerbName, state: State): boolean => {
  const guard = VERBS.find((v) => v.verb === verb)?.guard;
  return guard !== undefined && VERB_GUARDS[guard](state);
};

/**
 * How long a long-lived task's session may be listed with no process before the runtime ends its attempt `lost`: Claude Code
 * respawns a process it lost within some ten seconds, and one listed so for two minutes is not coming back.
 * Exported only for the tests that import it.
 */
export const RESPAWN_GAP_MS = 120_000;

export { backoffOf, cutWords, PARKED_WORDS, RESTART_BACKOFF, RESTART_WORDS } from './restart.ts';

/**
 * A settled task: nothing is observed of it and nothing is decided, on any pass. `decide`'s first question, ahead of the
 * lifecycle — a settled task's state is final and takes no event, so asking would refuse every settled task in the store
 * on every pass — and the one a pass may ask to skip a settled task before it reads anything else of it.
 */
export const settledQuiet = (state: State): boolean => state.settled !== null;

/**
 * One step toward the desired state. Pure, total, and safe to call as often as you like —
 * calling it twice in a row with the same inputs returns the same answer, which is the whole
 * definition of level-triggered.
 *
 * Three readings and a move: where the task stands, read off its journal (`lifecycleOf`);
 * what the pass saw of it (`observe`); and the lifecycle's edge for that event in that state (`transition`, in
 * `lifecycle.ts`), which names the next state and the one action. An event with no edge is refused, and the refusal is
 * the answer: nothing is done, and the pass reports it. `move` is the lifecycle's; a test hands another to plant a refusal.
 */
export const decide: Decide = (state, observed, now, move = transition) => {
  if (settledQuiet(state)) return { do: 'nothing', why: `settled: ${state.settled}` };
  const from = lifecycleOf(state);
  const event = observe(state, observed, now);
  const moved = move(from, event);
  return 'refused' in moved
    ? { do: 'nothing', why: `refused: no edge from ${from} on ${event.type}`, refused: moved.refused }
    : moved.action;
};

/**
 * Where a task stands in its lifecycle, off its journal alone: the state `decide` moves it from. The same journal reads the
 * same state after any restart, so the machine keeps nothing, and a state is only what the record can tell apart — a
 * session blocked on a person is `working` here, and its sighting says the rest.
 *
 * The rules, in order, the first that holds answering:
 *
 * 1. Settled: the final state its outcome names — `completed`, `canceled` or `failed`.
 * 2. A person asked it to stop: `stopping`. The operator's intent outranks everything except a terminal state.
 * 3. Its last attempt has not ended: `working` once spawned, else `starting`.
 * 4. Held open and closed by a person: `ending`.
 * 5. Held open and waiting on a person's answer (`waitsForInput`): `input-required`.
 * 6. Its current turn has an attempt, all ended: `ending`; else `submitted`.
 */
export const lifecycleOf: LifecycleOf = (state) => {
  if (state.settled) return state.settled === 'succeeded' ? 'completed' : state.settled === 'stopped' ? 'canceled' : 'failed';
  if (state.stopRequested) return 'stopping';
  const last = state.attempts.at(-1);
  if (last && last.ended === null) return last.spawnedAt !== null ? 'working' : 'starting';
  if (state.holdOpen && state.closed) return 'ending';
  if (waitsForInput(state)) return 'input-required';
  return turnOf(state).attempts.length > 0 ? 'ending' : 'submitted';
};

/**
 * What a pass saw of a task: one event, from its journal and the pass's sightings, recomputed on every pass. It names what
 * was seen — the harness let the session go, the deadline passed, nothing runs and the turn ended `failed` — and never
 * what to do about it, which is the edge's.
 *
 * The deadline is measured over the time the task has been RUNNING — its current turn, for a task held open — from the
 * first attempt's intent rather than from filing: a task queued for admission has not started burning its time, and a
 * deadline that expired in the queue would be a ceiling that quietly fails work instead of delaying it. No pause ends a try by
 * it: the clock counts again from when the session last went on — a release from its hook, or the start of an attempt that
 * continues a parked one (`deadlineFrom`, `deadline.ts`). It is also the
 * only thing that ends a blocked session: one waiting on a person is running, forever, as far as every other rule here is
 * concerned. Every duration judged here — the deadline, the grace window, a respawn's gap, a restart's backoff and its
 * reset — is measured by `elapsedMs`: on the monotonic clock between two moments journalled in one boot, so a stepped wall
 * clock ends none early nor holds one past its due, and on the wall clock otherwise.
 *
 * With an attempt in flight, the first rule that holds answers:
 *
 * 1. `DEADLINE_PASSED`, when it is overdue, a person has not asked it to stop, and its sighting has not ended on its own; never
 *    while a sessions' drain stands (`Now.drained`) or the attempt is held back at its hook (`heldNow`).
 *    The deadline stops what runs and ends what it cut; an end its harness recorded is judged by that end, as it would be
 *    in time, since a pass steps a task until nothing moves and so reads an end recorded past the deadline past it too. A
 *    person's stop outranks the deadline.
 * 2. Its sighting, read before the journal's own `spawnedAt`: a crash between the spawn call and its journal entry leaves
 *    a session running under a name that can still be found, so it is adopted rather than started a second time — the
 *    whole reason the name is ours. A long-lived task's session its harness is respawning (`respawning`),
 *    `SESSION_RESPAWNING` — or `RESPAWN_OVERDUE`, listed so `RESPAWN_GAP_MS` since the gap opened. Its idle session
 *    (`idleOf`), `SESSION_IDLE`: its turn's end, its idle listing and its silence are not its end. Waiting on a person,
 *    `SESSION_BLOCKED`. At work, `SESSION_QUIET` once quiet — its runner holds it has stopped, and that is its end; whether
 *    it gave the statement its task asked for is recorded beside it (`closedOut`) and judged by the layer above, for the
 *    engine reports and never nudges — else `SESSION_LIVE`.
 *    Canceled, `SESSION_STOPPED`; any other end, `SESSION_ENDED`.
 * 3. `UNREAD`, when its harness could not be read this pass: nothing is known of the session, and an absence read off a
 *    failed look is no absence, so it never counts toward `lost`. Read before `spawnedAt` for the reason above: an intent
 *    with no spawn on the record may be a session a crash left running, which an unread harness cannot rule out, so it is
 *    neither spawned again nor cut. The deadline, read above, still bounds it; for a person's stop, the edge reads
 *    `overdue`.
 * 4. `UNSPAWNED`, when its spawn is not on the record.
 * 5. Spawned, and the harness has never heard of the name: either it has not registered yet — a race measured in seconds
 *    — or the session is gone. A grace window tells the two apart: `UNSEEN_IN_GRACE` inside it, `LOST` past it.
 *
 * With nothing in flight, the first rule that holds answers:
 *
 * 1. `NOTHING_OPEN`, when a person asked it to stop.
 * 2. `CLOSED`, for a task held open and closed: it settles on how its last attempt ended.
 * 3. `AWAITING_INPUT`, for a task held open whose turn ended: it waits on a person for as long as they take — ahead of
 *    the deadline, which times work, not a person reading it.
 * 4. `DEADLINE_SPENT`, when it is overdue and its last attempt ended at the deadline.
 * 5. For a long-lived task whose attempt ended, no stop asked: its restart (`restartOf`) — unless its harness refused the
 *    spawn (`unstartable`), which waiting would not change, and it settles on that end, as a job does. For a job whose attempt
 *    ended parked, no stop asked: its continuation, by the same road — `PARK_HELD` while a sessions' drain stands (`Now.drained`).
 * 6. `ATTEMPT_ENDED`, judged on the current turn's attempts, which are all of them for a task not held open. One attempt
 *    per start. For an `unstartable` end, the harness's words (`error`).
 * 7. `NO_SESSION_TO_CONTINUE`, for a later turn with no session to continue.
 * 8. `QUEUED`, while the turn waits for the layer above's word; it is started by the pass after the one that wrote it.
 *    Read after every terminal answer, so a queued task can still settle.
 * 9. `PREVIOUS_LIVE`, when the session the turn continues — for the first turn, what the task was filed against; for a
 *    later one, the session that ended the turn before it — is still held by its harness: it is stopped first.
 * 10. `READY` otherwise: in a later turn, told the person's answer; else the brief.
 * Exported only for the tests that import it.
 */
export const observe: Observe = (state, observed, now) => {
  if (state.settled) return { type: 'SETTLED', outcome: state.settled };
  const last = state.attempts.at(-1);
  const sighting = last ? observed.get(nameFor(state.taskId, last.n)) : undefined;
  const turn = turnOf(state);

  const { ranFor, overdue } = deadlineOf(state, now);

  if (last && last.ended === null) return flightEvent(state, last, sighting, now, overdue);

  if (state.stopRequested) return { type: 'NOTHING_OPEN' };
  if (state.holdOpen && state.closed) return { type: 'CLOSED', ...(last ? { last: { n: last.n, ended: last.ended } } : {}) };
  if (waitsForInput(state)) return { type: 'AWAITING_INPUT' };
  if (overdue && last?.reason === 'deadline') return { type: 'DEADLINE_SPENT', seconds: Math.round(ranFor / 1000) };
  const ended = turn.attempts.at(-1);
  const restart = restartFrom(state, last, ended);
  if (restart) return restartOf(state, restart.from, sighting, now, restart.parked);
  if (ended) return attemptEnded(ended, turn.attempts.length, turn.n);
  if (turn.n > 0 && !turn.continues) return { type: 'NO_SESSION_TO_CONTINUE', turn: turn.n };
  if (awaitsAdmission(state)) return { type: 'QUEUED' };
  if (turn.continues && sighting && isLive(sighting.state)) return { type: 'PREVIOUS_LIVE', sessionId: sighting.sessionId };
  return { type: 'READY', attempt: state.attempts.length + 1, resumeFrom: turn.continues, ...(turn.words ? { nudge: turn.words } : {}) };
};

/**
 * The ended attempt a task with nothing in flight and no stop asked restarts from, and the park it continues, or none: its `last`,
 * where that attempt of the current turn was parked — a restart inside the task, never a new try; else, for a long-lived task, the
 * current turn's `ended`, unless its harness refused the spawn (`unstartable`), which waiting would not change.
 */
const restartFrom = (state: State, last?: Attempt, ended?: Attempt): { from: Attempt; parked?: Parked } | undefined => {
  if (last?.parked && (last.turn ?? 0) === state.inputs.length) return { from: last, parked: last.parked };
  return ended && state.restartPolicy === 'Always' && ended.reason !== 'unstartable' ? { from: ended } : undefined;
};

/**
 * `ATTEMPT_ENDED` for `ended`, the last of `attempts` in turn `turn`: with the harness's words (`error`) only when it
 * refused the spawn, since a spawn error on an attempt that ended otherwise is not why it ended, and the reason an older
 * runtime gave its end (`former`) where it gave one.
 */
function attemptEnded(ended: Attempt, attempts: number, turn: number): LifecycleEvent {
  const refusal = ended.reason === 'unstartable' && ended.error !== undefined ? { error: ended.error } : {};
  const former = ended.former === undefined ? {} : { former: ended.former };
  return { type: 'ATTEMPT_ENDED', ended: ended.ended, reason: ended.reason, attempts, turn, ...refusal, ...former };
}

/** Whether an overdue attempt's session is live, with the sighting that says so: a stop needs a session to send to. */
const liveOf = (sighting: Sighting | undefined): { live: true; sighting: Sighting } | { live: false; sighting?: Sighting } =>
  sighting && isLive(sighting.state) ? { live: true, sighting } : { live: false, sighting };

/** What `observe` reads off an attempt in flight, by its rules 2 to 4: its deadline, its sighting, or its absence. */
function flightEvent(state: State, last: Attempt, sighting: Sighting | undefined, now: Now, overdue: boolean): LifecycleEvent {
  const endedOwn = sighting !== undefined && ENDED_OWN.has(sighting.state);
  const paused = now.drained === true || heldNow(last);
  if (overdue && !paused && !state.stopRequested && !endedOwn) return { type: 'DEADLINE_PASSED', attempt: last.n, ...liveOf(sighting) };
  if (sighting) return sessionEvent(state, last, sighting, now);
  if (now.unread?.has(nameFor(state.taskId, last.n))) return { type: 'UNREAD', attempt: last.n, overdue };
  if (!last.spawnedAt) return { type: 'UNSPAWNED', attempt: last.n, name: nameFor(state.taskId, last.n) };
  return elapsedMs({ at: Date.parse(last.spawnedAt), mono: last.spawnedMono }, instantOf(now)) < now.graceMs
    ? { type: 'UNSEEN_IN_GRACE', attempt: last.n }
    : { type: 'LOST', attempt: last.n };
}

/**
 * Whether a long-lived task's session is idle as `sighting` shows it, open between turns: its harness still holds its process
 * (`held`), it computes nothing (`busy`), and its turn has ended — waiting on nobody it names (`input-required` with no
 * `waitingFor`, Claude Code's idle `blocked`), `completed`, or at work and quiet. Never for a job, whose turn's end is its end,
 * and never for a session that waits on a person for something it names, or to sign in.
 */
export const idleOf = (state: State, sighting: Sighting | undefined): boolean => {
  if (state.restartPolicy !== 'Always' || sighting?.held !== true || sighting.busy === true) return false;
  if (sighting.state === 'input-required') return sighting.waitingFor === undefined;
  return sighting.state === 'completed' || (RUNNING.has(sighting.state) && sighting.quietMs !== undefined);
};

/**
 * Whether a long-lived task's harness is respawning its session as `sighting` shows it: listed live, with no process
 * (`held: false`) — Claude Code's row for a session whose process died, which it restarts on the same conversation. Never for
 * a job, for a task asked to stop, or for a harness that cannot say whether it holds a process.
 */
export const respawning = (state: State, sighting: Sighting | undefined): boolean =>
  state.restartPolicy === 'Always' && !state.stopRequested && sighting?.held === false && isLive(sighting.state);

/**
 * What the sighting of the attempt in flight, `last`, says of its session: the second of `observe`'s rules for an attempt in
 * flight, with what ending it now would lead to.
 */
function sessionEvent(state: State, last: Attempt, sighting: Sighting, now: Now): LifecycleEvent {
  const ending = endOf(sighting.state);
  const seen = {
    attempt: last.n,
    sighting,
    asked: state.closeoutSchema !== undefined,
    holds: state.holdOpen === true && !state.closed && ending === 'succeeded' && (last.turn ?? 0) === state.inputs.length,
  };
  if (respawning(state, sighting)) {
    const gap = last.gapSince === undefined ? 0 : elapsedMs({ at: Date.parse(last.gapSince), mono: last.gapMono }, instantOf(now));
    return { type: gap < RESPAWN_GAP_MS ? 'SESSION_RESPAWNING' : 'RESPAWN_OVERDUE', ...seen };
  }
  if (idleOf(state, sighting)) return { type: 'SESSION_IDLE', ...seen };
  if (NEEDS_HUMAN.has(sighting.state)) return { type: 'SESSION_BLOCKED', ...seen };
  if (RUNNING.has(sighting.state)) return { type: sighting.quietMs !== undefined ? 'SESSION_QUIET' : 'SESSION_LIVE', ...seen };
  return { type: sighting.state === 'canceled' ? 'SESSION_STOPPED' : 'SESSION_ENDED', ...seen };
}

/**
 * The answer to a spawn its harness refused — nothing started — as the lifecycle gives it: the attempt's `unstartable` end,
 * in the harness's words, or the refusal when the lifecycle has no edge for it. Asked by the engine, the one place that
 * learns of it, so that every move of a task is an edge.
 */
export function spawnRefused(state: State, attempt: number, error: string, move: Move = transition): Action {
  const from = lifecycleOf(state);
  const moved = move(from, { type: 'SPAWN_REFUSED', attempt, error });
  return 'refused' in moved
    ? { do: 'nothing', why: `refused: no edge from ${from} on SPAWN_REFUSED`, refused: moved.refused }
    : moved.action;
}

/** Is this task waiting on a person? The one thing a fleet operator must be told about. A long-lived task's idle session is not. */
export function needsHuman(state: State, observed: ReadonlyMap<string, Sighting>): boolean {
  const last = state.attempts.at(-1);
  if (!last || last.ended !== null) return false;
  const seen = observed.get(nameFor(state.taskId, last.n));
  return waitsOnPerson(seen?.state) && !idleOf(state, seen) && !respawning(state, seen);
}

/**
 * The restart of a long-lived task whose last attempt, `last`, ended with no stop asked, and not refused at its spawn (that settles),
 * or of a task whose last attempt was `parked` (its end's), `observe`'s fifth rule with nothing in flight: `PARK_HELD` for a parked
 * one while a sessions' drain stands; `UNREAD` while its harness could not read the old name, `PREVIOUS_LIVE` while it still holds the
 * old session, `BACKING_OFF` within `backoffOf` the end, then `RESTART_DUE` — continuing the latest session an attempt recorded,
 * told `RESTART_WORDS`, or, parked, the call that did not finish (`cutWords`) or `PARKED_WORDS` (`restartWords`, `restart.ts`); with
 * none recorded, what the turn continues, told the brief.
 */
function restartOf(state: State, last: Attempt, sighting: Sighting | undefined, now: Now, parked?: Parked): LifecycleEvent {
  if (parked && now.drained === true) return { type: 'PARK_HELD', attempt: last.n };
  if (now.unread?.has(nameFor(state.taskId, last.n))) return { type: 'UNREAD', attempt: last.n, overdue: false };
  if (sighting && (sighting.held === true || isLive(sighting.state))) return { type: 'PREVIOUS_LIVE', sessionId: sighting.sessionId };
  const backoffMs = backoffOf(state.attempts);
  if (elapsedMs(endedWhen(last), instantOf(now)) < backoffMs) return { type: 'BACKING_OFF', attempt: last.n, backoffMs };
  const session = [...state.attempts].reverse().find((a) => a.nativeId !== null)?.nativeId ?? undefined;
  const from = session ? { resumeFrom: session, nudge: restartWords(parked) } : { resumeFrom: turnOf(state).continues };
  return { type: 'RESTART_DUE', attempt: state.attempts.length + 1, ...from };
}

/** Now as `decide` is handed it, as an `Instant`. */
const instantOf = (now: Now): Instant => ({ at: now.at.getTime(), mono: now.mono });

/**
 * What the engine journals of an attempt in flight off its sighting, before it decides: for any task, its hold and its release
 * (`holdFacts`); for a long-lived one, a `gap` the first time its session is seen respawning, and a `process` once it is seen held
 * again after one, or held in a process it had not been seen in. Nothing for a settled task, an ended attempt or a session the
 * pass did not see. Each is stamped `at`; a gap, a hold and a release also `mono`, the same moment on the monotonic clock when the
 * engine read one, since `decide` measures from them.
 */
export function sightingFacts(state: State, sighting: Sighting | undefined, at: string, mono?: Monotonic): Event[] {
  const last = state.attempts.at(-1);
  if (state.settled || !sighting || !last || last.ended !== null) return [];
  const held = holdFacts(last, sighting, at, mono);
  return state.restartPolicy === 'Always' ? [...held, ...processFacts(state, last, sighting, at, mono)] : held;
}

/** A long-lived attempt in flight's `gap` and `process`, as `sightingFacts` says. */
function processFacts(state: State, last: Attempt, sighting: Sighting, at: string, mono?: Monotonic): Event[] {
  if (respawning(state, sighting))
    return last.gapSince === undefined ? [{ kind: 'gap', at, attempt: last.n, ...(mono ? { mono } : {}) }] : [];
  if (sighting.held !== true) return [];
  const moved = sighting.pid !== undefined && sighting.pid !== last.processes?.at(-1);
  if (last.gapSince === undefined && !moved) return [];
  return [{ kind: 'process', at, attempt: last.n, ...(sighting.pid !== undefined ? { pid: sighting.pid } : {}) }];
}
