/**
 * A session's state, as a harness reports it and as every view above the runtime says it: A2A's names for a task's
 * state, the end each records, and where a task stands for a reader. `domain.ts` and `lifecycle.ts` both read these; neither is
 * read here.
 */

/**
 * What a harness reports for a session: A2A's `TaskState`, in the names `lifecycle.ts` gives its states — the protocol's
 * words, spelled as a literal union so the pure core imports no SDK (`test/a2a-boundary.test.ts`). Each driver translates
 * its harness's own words into these at its own edge, once (Claude Code's registry and the detached worker's run file in
 * their runners; a remote agent's Task is already in them), and nothing past a driver reads any other word.
 *
 *   submitted       accepted, not yet at work — a remote agent's Task it has not started. At work, as far as the
 *                   runtime can act on it: it runs until it ends or is stopped, and the deadline times it.
 *   working         at work. With `busy` and `quietMs` beside it, which say whether it computes and how long it is quiet.
 *   input-required  waiting on a person for words — a permission prompt, a question.
 *   auth-required   waiting on a person to sign in: the same wait for the runtime, a different thing for the person.
 *   completed       ended on its own. Its end is recorded `succeeded`.
 *   failed          ended on its own, and says it failed. Recorded `failed`.
 *   rejected        the agent refused the work once it had it. Recorded `failed`, as any end the harness calls a failure:
 *                   a refusal *at spawn*, before anything started, is `unstartable` and never a sighting.
 *   canceled        stopped under it, by its harness or a person at the harness's side. Recorded `stopped`.
 *
 * Whether the session's process computes is no state: it is a DIFFERENT field, `Sighting.busy`.
 */
export const SESSION_STATES = [
  'submitted',
  'working',
  'input-required',
  'auth-required',
  'completed',
  'failed',
  'canceled',
  'rejected',
] as const;
export type SessionState = (typeof SESSION_STATES)[number];
/** Whether a word is one of A2A's names for a session's state. */
export const isSessionState = (word: unknown): word is SessionState => (SESSION_STATES as readonly unknown[]).includes(word);

/** At work, as far as the runtime can act on it. */
export const RUNNING: ReadonlySet<SessionState> = new Set(['submitted', 'working']);
/** Waiting on a person — running, but nobody is coming unless the operator is told. */
export const NEEDS_HUMAN: ReadonlySet<SessionState> = new Set(['input-required', 'auth-required']);

/** A session its harness still holds and the engine still waits on: at work, or waiting on a person. */
export const isLive = (s: SessionState | undefined): boolean => s !== undefined && (RUNNING.has(s) || NEEDS_HUMAN.has(s));
/** A session waiting on a person: for words or to sign in. */
export const waitsOnPerson = (s: SessionState | undefined): boolean => s !== undefined && NEEDS_HUMAN.has(s);
/** A session at work: submitted or working. */
export const atWorkState = (s: SessionState | undefined): boolean => s !== undefined && RUNNING.has(s);

/**
 * The end each state records when its harness lets the session go, as the journal records it (`ended.observed`, the
 * `record-end` action, `Attempt.ended`): an `Outcome`. At work and let go of — quiet, or closed out — is an end the harness
 * vouches for, `succeeded`, as a quiet session is. Waiting on a person has not ended, and has none: no edge
 * records its end off such a sighting (`harnessEnd`).
 */
const ENDS: Record<SessionState, Outcome | undefined> = {
  submitted: 'succeeded',
  working: 'succeeded',
  completed: 'succeeded',
  failed: 'failed',
  rejected: 'failed',
  canceled: 'stopped',
  'input-required': undefined,
  'auth-required': undefined,
};

/** The end an attempt is recorded with when its harness lets the session go in `state`, or `undefined` for one waiting on a person. */
export const endOf = (state: SessionState): Outcome | undefined => ENDS[state];

/**
 * A2A's name for one of the runtime's own former words for a session's state — `working`, `blocked`, `done`, `failed`,
 * `stopped` — which `Sighting.state` spoke before A2A's: what a remote registry entry an older runtime wrote still says.
 * `blocked` is `input-required`, since those words never said which wait; `undefined` for any other word.
 */
export const formerStateOf = (word: unknown): SessionState | undefined =>
  typeof word === 'string' && Object.hasOwn(FORMER, word) ? FORMER[word as keyof typeof FORMER] : undefined;
const FORMER = {
  working: 'working',
  blocked: 'input-required',
  done: 'completed',
  failed: 'failed',
  stopped: 'canceled',
} as const satisfies Record<'working' | 'blocked' | 'done' | 'failed' | 'stopped', SessionState>;

/** How an attempt ended and how a task settled: the journal's words for both, and the end a sighting's state records (`endOf`). */
export type Outcome = 'succeeded' | 'failed' | 'stopped';

/**
 * Where a task stands for a reader, from its record and one observation (`viewOfState`): a closed set of literals, never a
 * sentence. The harness's own state of the attempt in flight is beside it, as `TaskView.session`, never folded in.
 */
export const TASK_PHASES = [
  'pending',
  'starting',
  'working',
  'quiescent',
  'needs-human',
  'input-required',
  'idle',
  'restarting',
  'between-attempts',
  'ending',
  'succeeded',
  'failed',
  'stopped',
] as const;
export type TaskPhase = (typeof TASK_PHASES)[number];

/**
 * The phase `viewOfState` gives a live session the look saw, by its state, where neither a respawn, an idle turn nor a wait on a
 * person said it first: at work, a wait on a person (which `needsHuman` names before this), or ended on the harness and not yet
 * recorded.
 */
export const LIVE_PHASE: Record<SessionState, TaskPhase> = {
  submitted: 'working',
  working: 'working',
  'input-required': 'needs-human',
  'auth-required': 'needs-human',
  completed: 'ending',
  failed: 'ending',
  rejected: 'ending',
  canceled: 'ending',
};
