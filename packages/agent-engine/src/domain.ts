/**
 * The whole engine, as data and one pure function.
 *
 * Two states, one join key:
 *
 *   DESIRED   what I asked for            -> the journal, append-only JSONL      (ours)
 *   OBSERVED  what the machine is doing   -> `claude agents --json`, run files   (the harness's)
 *   join key  a NAME we choose before spawning and pass as `--name`
 *
 * The name is the whole trick, and it is Kubernetes' label selector: because we decide it rather
 * than learning it, a session we started is findable after a crash that lost every other trace of
 * it. The harness's own session id is a handle we look up when we need one — never a key.
 *
 * `decide()` compares the two states and names ONE step. It touches no database, spawns no
 * process and reads no clock it was not handed — so the interesting half of this engine is a pure
 * function with an exhaustive test, and the I/O half has no decisions in it.
 *
 * Why there are no leases here: for a harness that keeps its own registry, the session is owned by
 * the harness and outlives us, so "is it still running" is a question we ASK. For one that does
 * not, `runner-detached.ts` keeps the registry and a heartbeat, and answers the same question with
 * the same word. Either way the answer arrives as `Observed`, and nothing in this file can tell
 * which kind of harness produced it.
 */

import type { McpServer } from './runner.ts';

/**
 * What a harness reports for a session. Exactly the documented `state` values, no more.
 *
 * `busy` used to be in here and did not belong: it is a value of a DIFFERENT field. See
 * `Sighting.busy`.
 */
export type Observed = 'working' | 'blocked' | 'done' | 'failed' | 'stopped';

const RUNNING: ReadonlySet<Observed> = new Set(['working']);
/** Waiting on a person — running, but nobody is coming unless the operator is told. */
const NEEDS_HUMAN: ReadonlySet<Observed> = new Set(['blocked']);

export type Outcome = 'succeeded' | 'failed' | 'stopped';

/**
 * One session as the machine sees it. Keyed by name, because the name is ours.
 *
 * `nativeId` is the harness's own identifier — the thing `--resume` takes. It is not the key and
 * is often not known until the session has started, which is exactly why it is not the key.
 * `usage` is present only when the runner can see inside a session, `exitCode` only for a harness
 * that ends by exiting.
 */
export type Sighting = {
  sessionId: string;
  state: Observed;
  /**
   * Is the session's process doing something *right now*?
   *
   * A second, independent fact — not a finer grade of `state`. `working` means "a turn is running
   * OR the session is between steps of work it drives itself"; `busy` is what tells those apart.
   * So `working` + not busy is a session that believes it has work and is computing nothing, which
   * is what a stalled step looks like from outside. Reported, not acted on: being between steps is
   * legitimate, and only a deadline can honestly end an ambiguous wait.
   */
  busy?: boolean;
  nativeId?: string;
  /** What the session has consumed, as far as its runner could measure. Absent when it could not. */
  usage?: Usage;
  /** How the harness's process exited. A fact about the process, not a verdict on the work. */
  exitCode?: number;
  /**
   * What the workload said when it finished, and WHEN it said it — present only for a harness that
   * can take a structured final answer, and only once one was given.
   *
   * The time is not decoration. A resumed session can carry a statement its parent made, and the
   * engine keeps one only if it was made after this attempt began.
   */
  closeout?: { payload: unknown; at: number };
  /**
   * How long the session has been quiet — working, not busy, nothing written — present once that is long enough that
   * its runner holds it has stopped rather than paused between steps it drives itself (Claude Code: ninety seconds).
   * A fact about the session, not a verdict on the work: a quiet session is the end of a task that asked for nothing,
   * and an unsigned attempt of one that asked for a closing statement and was told none. Only the journal knows which,
   * so `decide` reads this, and no runner turns it into `done`.
   */
  quietMs?: number;
};

/**
 * What a session consumed, as its runner measured it.
 *
 * Every field is a measurement. A count the runner could not see is absent, never 0, and a runner
 * that measured nothing reports no usage at all, so its attempt records `null`. A zero that means
 * "nobody counted" reads as "cost nothing", which is the one reading a record must never allow.
 */
export type Usage = {
  /**
   * Model responses, each counted once however many lines it was written as. Absent from a runner
   * that cannot see them: Codex's stream reports turns of a prompt, not the responses inside one.
   */
  turns?: number;
  /** Tool calls the model made. Absent when its runner could not count them. */
  toolCalls?: number;
  /** Every input token the model read, cached ones included. */
  inputTokens?: number;
  outputTokens?: number;
  /**
   * What the session cost, in dollars, as its harness priced it — never computed here from tokens. Claude Code writes a
   * session's total into its transcript as its process exits (`cost-state`), and `claude -p` prints it as it exits
   * (`total_cost_usd`). This attempt's own: a resumed session's total, which carries the one before it, less that one.
   */
  costUsd?: number;
  /** Milliseconds spent waiting on the model's API, as the harness counted them. This attempt's own, as `costUsd` is. */
  apiMs?: number;
  /** Milliseconds spent running tools, as the harness counted them. This attempt's own, as `costUsd` is. */
  toolMs?: number;
  /**
   * The harness used a model it has no price for, so its total is not the whole cost: `costUsd` is absent rather than
   * too low, and this says why (Claude Code's `hasUnknownModelCost`).
   */
  unpricedModel?: true;
};

/** The join key. Deterministic, so it survives anything that kills this process. */
export const nameFor = (taskId: string, attempt: number) => `ae/${taskId}/${attempt}`;

/**
 * What a session that stopped without its closing statement is told when it is continued: not the brief, which it has,
 * but why it is back. Shape-free, since what a statement says is the task's vocabulary, not the engine's.
 */
const NUDGE = 'You stopped without giving your closing statement, and this task asks for one. If the work is done, give it now. If it is not, finish the work, then give it. If you cannot finish, give it anyway, saying what stops you.';

/**
 * Why an attempt ended, in the only four categories the engine can tell apart.
 *
 *   `harness`      the harness reported a terminal state — or the session went quiet, and its task asked for no
 *                  closing statement, so quiet is the only end it has. It ran, and this is what it concluded.
 *   `lost`         we never heard: the session vanished, or a detached worker stopped beating.
 *                  The work in the transcript is real; nobody said it was finished.
 *   `unsigned`     the session went quiet without the closing statement its task asked for. It stopped; it may
 *                  have finished, and it did not say so, which is all a statement is for. Recorded `failed`.
 *   `unstartable`  the spawn failed and the harness vouched that nothing started. Nothing ran.
 *
 * Everything about resume policy hangs on this distinction, which is why it is recorded rather
 * than inferred later.
 */
export type EndReason = 'harness' | 'lost' | 'unsigned' | 'unstartable';

/** What a new attempt does with the one before it. A workload property, not a callback. */
export type ResumePolicy =
  /** Continue only when the last attempt was LOST, or UNSIGNED: work nobody has judged, the session
   *  included. A harness that reached a conclusion we did not like is usually not improved by being
   *  dropped back into the context that produced it. */
  | 'interrupted'
  /** Always continue. Right for long, expensive work where any progress beats a clean start. */
  | 'always'
  /** Never continue. Right when an attempt's context is the thing suspected of being wrong. */
  | 'never';

// ─── the journal ────────────────────────────────────────────────────────────
// Every side effect is bracketed by two entries: the intent, then the result. That bracket is
// what makes a crash between them recoverable — `decide` can always tell which side it is on.

export type Event =
  /** The desired state, stated once. */
  | {
      kind: 'filed'; at: string; brief: string; cwd: string; maxAttempts: number;
      model?: string; permissionMode?: string; harness?: string;
      deadlineSeconds?: number; resume?: ResumePolicy;
      /** A session of this harness that the FIRST attempt should continue rather than start cold. */
      resumeFrom?: string;
      /** Isolation: true for a harness-named worktree, a string to name it. */
      worktree?: string | boolean;
      /**
       * A JSON Schema for the workload's closing statement, handed to the harness verbatim.
       *
       * The workload's own word on whether it has finished, which is worth more than anything we
       * can infer from outside. The engine passes the schema through and records what comes back;
       * it never learns the shape, because the shape is somebody else's vocabulary.
       */
      closeoutSchema?: object;
      /**
       * The only tools the session may have, in its harness's names for them. Carried, never read
       * here: a runner turns it into whatever fence its harness has, and `decide` never learns what
       * a tool is. Absent means the harness's own set.
       */
      tools?: string[];
      /**
       * What the session may not have, in its harness's permission rules. Carried, never read here, as
       * `tools` is: a runner hands it to its harness, and `decide` never learns what a rule is.
       */
      disallowedTools?: string[];
      /** How hard the harness should think, in its own words. Carried, never read here. */
      effort?: string;
      /**
       * The MCP servers the session may have, by name, beside its checkout's own. Carried, never
       * read here: a runner hands them to its harness, and `decide` never learns what a server is.
       */
      mcp?: Record<string, McpServer>;
    }
  /**
   * INTENT: we are about to spawn `nameFor(taskId, attempt)`. `nudge` is what a continued session is told instead of
   * the brief — why it is back — decided here with `resumeFrom`, and never re-derived.
   */
  | { kind: 'starting'; at: string; attempt: number; resumeFrom?: string; nudge?: string }
  /**
   * RESULT: the spawn call returned. The session is the harness's problem now. `error` when the call
   * failed without the harness vouching that nothing started: whether a session exists is then the
   * grace window's to find out.
   */
  | { kind: 'spawned'; at: string; attempt: number; error?: string }
  /**
   * An attempt reached a terminal state, as observed — never as assumed. `usage` and `exitCode`
   * come from the same sighting, when its runner measured them; `decide` reads neither.
   */
  | { kind: 'ended'; at: string; attempt: number; sessionId: string; observed: Observed; reason: EndReason; nativeId?: string; closeout?: unknown; usage?: Usage; exitCode?: number; error?: string }
  /**
   * What an ended attempt consumed, read once its session was let go — for a harness that writes part of it only as the
   * session's process exits, which is after the end was written (Claude Code's cost). Merged into the attempt's `usage`.
   * A fact for the record, written once; `decide` never reads it.
   */
  | { kind: 'measured'; at: string; attempt: number; usage: Usage }
  /** The operator asked for it to stop. */
  | { kind: 'stop-requested'; at: string }
  /**
   * A person's words, handed to the session of the attempt in flight through its harness (`say`). Written
   * once the harness took them, so it means they were handed over — not that the session read them, or
   * did what they asked. `decide` never reads it: what was said to a session is a fact for whoever
   * reviews the work, not a judgement on it.
   */
  | ({ kind: 'said' } & Said)
  /**
   * Terminal. Nothing moves after this. `nativeId` is the session of an attempt it left open —
   * stopped by a person, or past its deadline, with no `ended` to carry it — as the harness still
   * listed it: what `logs` reads once that session has been let go. `decide` never reads it.
   */
  | { kind: 'settled'; at: string; outcome: Outcome; note?: string; nativeId?: string };

/** Words said to a running attempt's session, and when the engine wrote them down. See the `said` event. */
export type Said = { at: string; attempt: number; text: string };

export type Attempt = {
  n: number;
  /** When the intent was journalled. The deadline runs from the FIRST of these, not from filing:
   *  a task queued behind the ceiling has not started burning its time. */
  startedAt: string;
  /** Null until the spawn call returned: the window a crash can land in. */
  spawnedAt: string | null;
  ended: Observed | null;
  /** The `at` of the `ended` entry: when the engine wrote the end down. Null while the attempt runs. */
  endedAt: string | null;
  reason: EndReason | null;
  /** The harness's own id for this attempt, once something has seen it. What `--resume` takes. */
  nativeId: string | null;
  /** What this attempt was told to continue, decided when it started and never re-derived. */
  resumeFrom?: string;
  /** What it was told instead of the task's brief, continuing a session that stopped unsigned. Carried, never read. */
  nudge?: string;
  /** What the workload said when this attempt ended, if it said anything. Carried, never read. */
  closeout?: unknown;
  /** What this attempt consumed; `null` when its runner measured nothing, never zeros. Carried, never read. */
  usage: Usage | null;
  /** How its process exited; `null` for a harness whose process is not ours, or one that never exited. */
  exitCode: number | null;
  /** What a failed spawn call said: the refusal behind `unstartable`, or an error after which a session may still exist. */
  error?: string;
};

export type State = {
  taskId: string;
  brief: string;
  cwd: string;
  maxAttempts: number;
  model?: string;
  permissionMode?: string;
  /** Which harness runs it. `decide` never reads this — only the runner dispatches on it. */
  harness?: string;
  /** Wall clock across all attempts. Absent means no limit. */
  deadlineSeconds?: number;
  resume: ResumePolicy;
  /** What attempt 1 continues. Set at filing; later attempts follow `resume` policy instead. */
  resumeFrom?: string;
  worktree?: string | boolean;
  /** The shape of the workload's closing statement. See the `filed` event. */
  closeoutSchema?: object;
  /** The session's tools, what it may not have, effort and MCP servers. See the `filed` event. `decide` never reads any of them. */
  tools?: string[];
  disallowedTools?: string[];
  effort?: string;
  mcp?: Record<string, McpServer>;
  attempts: Attempt[];
  /** What a person said to the task's sessions while they ran, in the order it was said. Carried, never read. */
  said: Said[];
  stopRequested: boolean;
  settled: Outcome | null;
};

/** Observed state, folded. A `State` is never stored — it is always re-derived from the journal. */
export function fold(taskId: string, events: readonly Event[]): State {
  const s: State = {
    taskId, brief: '', cwd: '', maxAttempts: 1, resume: 'interrupted',
    attempts: [], said: [], stopRequested: false, settled: null,
  };
  for (const e of events) {
    switch (e.kind) {
      case 'filed':
        s.brief = e.brief; s.cwd = e.cwd; s.maxAttempts = e.maxAttempts;
        s.model = e.model; s.permissionMode = e.permissionMode; s.harness = e.harness;
        s.deadlineSeconds = e.deadlineSeconds; s.resume = e.resume ?? 'interrupted';
        s.resumeFrom = e.resumeFrom;
        s.worktree = e.worktree; s.closeoutSchema = e.closeoutSchema;
        s.tools = e.tools; s.disallowedTools = e.disallowedTools; s.effort = e.effort; s.mcp = e.mcp;
        break;
      case 'starting':
        s.attempts.push({ n: e.attempt, startedAt: e.at, spawnedAt: null, ended: null, endedAt: null, reason: null, nativeId: null, resumeFrom: e.resumeFrom, ...(e.nudge ? { nudge: e.nudge } : {}), usage: null, exitCode: null });
        break;
      case 'spawned': {
        const a = s.attempts.find((x) => x.n === e.attempt);
        if (a) { a.spawnedAt = e.at; a.error = e.error; }
        break;
      }
      case 'ended': {
        const a = s.attempts.find((x) => x.n === e.attempt);
        if (a) { a.ended = e.observed; a.endedAt = e.at; a.reason = e.reason; a.nativeId = e.nativeId ?? a.nativeId; a.closeout = e.closeout; a.usage = e.usage ?? null; a.exitCode = e.exitCode ?? null; a.error = e.error ?? a.error; }
        break;
      }
      case 'measured': {
        const a = s.attempts.find((x) => x.n === e.attempt);
        if (a) a.usage = { ...a.usage, ...e.usage };
        break;
      }
      case 'stop-requested': s.stopRequested = true; break;
      case 'said': s.said.push({ at: e.at, attempt: e.attempt, text: e.text }); break;
      case 'settled': {
        s.settled = e.outcome;
        const open = s.attempts.at(-1);
        if (open && open.ended === null && e.nativeId) open.nativeId = e.nativeId;
        break;
      }
    }
  }
  return s;
}

// ─── the decision ───────────────────────────────────────────────────────────

export type Action =
  /** Nothing to do. Not an error — the common case on a busy board. */
  | { do: 'nothing'; why: string }
  /** Journal the intent to run attempt N, continuing `resumeFrom` when policy says so — told `nudge`, when that session stopped unsigned. */
  | { do: 'start'; attempt: number; resumeFrom?: string; nudge?: string }
  /** An intent with no spawn behind it. Named in advance, so this cannot double-start. */
  | { do: 'spawn'; attempt: number; name: string }
  /** The harness says this attempt is over. Write it down. */
  | { do: 'record-end'; attempt: number; sessionId: string; observed: Observed; reason: EndReason; nativeId?: string; closeout?: unknown }
  | { do: 'stop'; sessionId: string; why: string }
  | { do: 'settle'; outcome: Outcome; note?: string };

export type Now = {
  at: Date;
  graceMs: number;
  /**
   * How many sessions of THIS TASK'S harness are already running, and how many may.
   *
   * Resolved by the caller rather than looked up here, because the ceiling is per harness — two
   * subscriptions are two independent pools, and a Codex session must not use up a Claude slot.
   * `decide` only ever compares two numbers, which is all a pure function should need.
   */
  used: number;
  max: number;
};

/**
 * One step toward the desired state. Pure, total, and safe to call as often as you like —
 * calling it twice in a row with the same inputs returns the same answer, which is the whole
 * definition of level-triggered.
 */
export function decide(state: State, observed: ReadonlyMap<string, Sighting>, now: Now): Action {
  if (state.settled) return { do: 'nothing', why: `settled: ${state.settled}` };

  const last = state.attempts.at(-1);
  const sighting = last ? observed.get(nameFor(state.taskId, last.n)) : undefined;
  const live = last !== undefined && last.ended === null && sighting !== undefined && isLive(sighting.state);

  // The operator's intent outranks everything except a terminal state.
  if (state.stopRequested) {
    if (live) return { do: 'stop', sessionId: sighting!.sessionId, why: 'operator' };
    return { do: 'settle', outcome: 'stopped', note: 'operator' };
  }

  // ---- the deadline, over the time the task has actually been RUNNING.
  //
  // Measured from the first attempt's intent rather than from filing: a task queued behind the
  // ceiling has not started burning its time, and a deadline that expires in the queue would be
  // a ceiling that quietly fails work instead of delaying it.
  //
  // This is also the only thing that frees a slot held by a `blocked` session — one waiting on a
  // person is running, forever, as far as every other rule here is concerned.
  if (state.deadlineSeconds !== undefined && state.attempts.length > 0) {
    const ranFor = now.at.getTime() - new Date(state.attempts[0]!.startedAt).getTime();
    if (ranFor > state.deadlineSeconds * 1000) {
      if (live) return { do: 'stop', sessionId: sighting!.sessionId, why: 'deadline' };
      return { do: 'settle', outcome: 'failed', note: `deadline exceeded after ${Math.round(ranFor / 1000)}s` };
    }
  }

  // ---- no attempt in flight: either we are done, out of attempts, or we start one.
  if (!last || last.ended !== null) {
    if (last?.ended === 'done') return { do: 'settle', outcome: 'succeeded' };
    if (last?.ended === 'stopped') return { do: 'settle', outcome: 'stopped', note: 'session stopped' };
    if (state.attempts.length >= state.maxAttempts) {
      const why = last?.reason === 'unsigned' ? ': the last went quiet without the closing statement it was asked for' : '';
      return { do: 'settle', outcome: 'failed', note: `${state.attempts.length} attempt(s), none succeeded${why}` };
    }
    // The ceiling is checked LAST, after every terminal answer. A task that is finished must still
    // be allowed to settle when the board is full — otherwise a full board could never drain.
    if (now.used >= now.max) {
      return { do: 'nothing', why: `at the ${state.harness ?? 'default'} ceiling (${now.used}/${now.max})` };
    }
    const resumeFrom = resumeTarget(state, last);
    // An unsigned session is quiet, not gone: stopped before it is continued, or two would share one conversation.
    if (resumeFrom && sighting && isLive(sighting.state)) return { do: 'stop', sessionId: sighting.sessionId, why: 'to continue it' };
    return { do: 'start', attempt: state.attempts.length + 1, resumeFrom, ...(resumeFrom && last?.reason === 'unsigned' ? { nudge: NUDGE } : {}) };
  }

  // ---- an attempt is in flight. What does the machine say about the name we gave it?
  //
  // Note the order: the SIGHTING is checked before our own `spawnedAt`. A crash between the
  // spawn call and its journal entry leaves a session running under a name we can still find,
  // so it is adopted rather than started a second time. That is the whole reason the name is ours.
  if (sighting) {
    // Quiet and working: its runner holds it has stopped. The end of a task that asked for no statement; for one that
    // asked and was told none, an UNSIGNED end — it never said it had finished, and that is not a success.
    const quiet = sighting.state === 'working' && sighting.quietMs !== undefined;
    if (isLive(sighting.state) && !quiet) {
      return { do: 'nothing', why: NEEDS_HUMAN.has(sighting.state) ? 'blocked — needs a person' : `running (${sighting.state})` };
    }
    const unsigned = quiet && state.closeoutSchema !== undefined && sighting.closeout === undefined;
    return { do: 'record-end', attempt: last.n, sessionId: sighting.sessionId, observed: unsigned ? 'failed' : quiet ? 'done' : sighting.state,
      reason: unsigned ? 'unsigned' : 'harness', nativeId: sighting.nativeId, closeout: sighting.closeout?.payload };
  }

  if (!last.spawnedAt) return { do: 'spawn', attempt: last.n, name: nameFor(state.taskId, last.n) };

  // Spawned, and the harness has never heard of the name. Either it has not registered yet (a
  // race measured in seconds) or the session is gone. A grace window tells the two apart.
  const age = now.at.getTime() - new Date(last.spawnedAt).getTime();
  return age < now.graceMs
    ? { do: 'nothing', why: 'spawned, waiting for the harness to register it' }
    : { do: 'record-end', attempt: last.n, sessionId: '(never seen)', observed: 'failed', reason: 'lost' };
}

/**
 * The session a new attempt should continue, if any. THE policy call of this engine.
 *
 * Default `interrupted`: resume what was lost or stopped unsigned, start clean after a harness verdict.
 * A lost session's transcript is real work nobody has judged, and so is an unsigned one's, whose
 * session did not judge it either; a failed one is a conclusion, and dropping
 * a model back into the context that produced a conclusion tends to reproduce it. Both other
 * answers are defensible for particular work, which is why this is a field on the task.
 */
function resumeTarget(state: State, last: Attempt | undefined): string | undefined {
  // Attempt 1 continues whatever the task was filed against — a previous step's session, usually.
  // That is a fact about the work, not a retry policy, so `resume: 'never'` does not override it:
  // "do not resume a failure" and "this task IS a continuation" are different statements.
  if (!last) return state.resumeFrom;
  if (!last.nativeId || state.resume === 'never') return undefined;
  if (state.resume === 'always') return last.nativeId;
  return last.reason === 'lost' || last.reason === 'unsigned' ? last.nativeId : undefined;
}

const isLive = (o: Observed | undefined): boolean =>
  o !== undefined && (RUNNING.has(o) || NEEDS_HUMAN.has(o));

/** Is this task waiting on a person? The one thing a fleet operator must be told about. */
export function needsHuman(state: State, observed: ReadonlyMap<string, Sighting>): boolean {
  const last = state.attempts.at(-1);
  if (!last || last.ended !== null) return false;
  const seen = observed.get(nameFor(state.taskId, last.n))?.state;
  return seen !== undefined && NEEDS_HUMAN.has(seen);
}
