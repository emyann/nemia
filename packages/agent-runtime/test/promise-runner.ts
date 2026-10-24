/**
 * A test's fakes written with async methods, as the engine takes them: a harness (`AsyncRunner`) as a `RunnerOps`, and a store
 * (`AsyncJournal`) as a `StoreOps`, each rejection an Effect failure with the engine's error on it. Test-only, read by the package's
 * typecheck.
 */
import { Effect } from 'effect';
import { formerStateOf, isSessionState, SESSION_STATES, type SessionState, type Sighting, type Usage } from '../src/core/index.ts';
import { RunnerError, type RunnerOps, type SpawnRequest, type Transcript, type TranscriptCursor } from '../src/harness/index.ts';
import { JournalError, type BodiedJournalOps, type Cursor, type Event, type FeedEntry, type StoreOps } from '../src/index.ts';

/**
 * A session as an `AsyncRunner` reports it: a `Sighting` whose state is one of A2A's names — or one of the five former
 * words (`working`, `blocked`, `done`, `failed`, `stopped`), which `asyncOps` reads as their names (`formerStateOf`:
 * `blocked` is `input-required`), so a fake may keep the words it was written in. Any other word is refused.
 */
export type AsyncSighting = Omit<Sighting, 'state'> & { state: SessionState | 'working' | 'blocked' | 'done' | 'failed' | 'stopped' };

/** A fake harness, in async methods: what `asyncOps` makes a `RunnerOps` of. */
export type AsyncRunner = {
  /**
   * Start the session; reject if that fails. When you know nothing started under `r.name`, reject
   * with an error whose `refused` is `true`, and the attempt ends `unstartable` at once. Otherwise
   * the engine cannot rule a session out, and its grace window finds out: the session is adopted if
   * it appears, the attempt `lost` if it never does.
   */
  spawn(r: SpawnRequest): Promise<void>;
  observe(): Promise<Map<string, AsyncSighting>>;
  /**
   * Optional. The session running under `name` — a name the engine chose — found without observing every other, or
   * `undefined` when none runs. Only which session it is: a read that needs its state asks `observe`, and takes
   * `observe`'s word. Without it, `view`, `transcript` and `logs` observe this harness.
   */
  find?(name: string): Promise<{ sessionId: string } | undefined>;
  stop(sessionId: string): Promise<void>;
  logs(sessionId: string): Promise<string>;
  /**
   * Optional. One stream of the session under `name`, the name the engine chose: `stdout` or `stderr`, as your harness kept
   * it whole, or its last `lastBytes` bytes; `undefined` when it kept none. Without it, `output` refuses this harness's tasks.
   */
  output?(name: string, stream: 'stdout' | 'stderr', lastBytes?: number): Promise<string | undefined>;
  /**
   * Optional. Let go of a session whose attempt's end the engine has written down — stop it if it
   * runs, drop it from your registry. Called on every pass that still observes it, so make it
   * idempotent; a rejection is asked again on the next. Resolve with what the session consumed, read
   * once you stopped it, when your harness writes part of that only as a session exits: the engine
   * records it on the attempt (a `measured` entry). Resolve with nothing when you stopped nothing.
   */
  release?(session: Sighting, task: { worktree?: string | boolean }): Promise<Usage | void>;
  /**
   * Optional. The session's conversation as events from `after` — a cursor this method returned, in
   * whatever shape you chose, or none for the start — and the cursor to ask again with. The engine passes
   * your cursor through as you gave it, and never hands you one of its own. Asked with the session's id as
   * observed while its attempt runs, and with the `nativeId` recorded once the attempt has ended — as
   * `logs` is once a session is released. Without it, `transcript` refuses this harness's tasks, and
   * `logs` is what they have.
   */
  transcript?(sessionId: string, after?: TranscriptCursor): Promise<Transcript>;
  /**
   * Optional. Hand `text` to the running session `session` names — the name the engine chose, and the id your
   * `observe` listed it under on the pass just made — and resolve once your harness has taken it; reject when it
   * did not, and nothing is journalled. Without it, `say` refuses this harness's tasks.
   */
  say?(session: { name: string; sessionId: string }, text: string): Promise<void>;
};

/**
 * An `AsyncRunner` as the engine's verbs. A rejected `spawn` is not taken as proof that nothing started: it is a
 * refusal (`refused`) only when the error it rejects with says `refused: true`.
 */
export const asyncOps = (h: AsyncRunner): RunnerOps => ({
  spawn: (r: SpawnRequest) =>
    Effect.tryPromise({
      try: () => h.spawn(r),
      catch: (cause) =>
        new RunnerError({
          verb: 'spawn',
          message: cause instanceof Error ? cause.message : String(cause),
          ...((cause as { refused?: unknown } | null)?.refused === true ? { refused: true } : {}),
        }),
    }),
  observe: wrap(
    () => h.observe(),
    (m) => new RunnerError({ verb: 'observe', message: m }),
  ).pipe(Effect.flatMap(inNames)),
  ...(h.find
    ? {
        find: (name: string) =>
          wrap(
            () => h.find!(name),
            (m) => new RunnerError({ verb: 'find', message: m }),
          ),
      }
    : {}),
  stop: (id: string) =>
    wrap(
      () => h.stop(id),
      (m) => new RunnerError({ verb: 'stop', message: m }),
    ),
  logs: (id: string) =>
    wrap(
      () => h.logs(id),
      (m) => new RunnerError({ verb: 'logs', message: m }),
    ),
  ...(h.output
    ? {
        output: (name: string, stream: 'stdout' | 'stderr', lastBytes?: number) =>
          wrap(
            () => h.output!(name, stream, lastBytes),
            (m) => new RunnerError({ verb: 'output', message: m }),
          ),
      }
    : {}),
  ...(h.release
    ? {
        release: (session: Sighting, task: { worktree?: string | boolean }) =>
          wrap(
            () => h.release!(session, task),
            (m) => new RunnerError({ verb: 'release', message: m }),
          ).pipe(Effect.map((used) => used || undefined)),
      }
    : {}),
  ...(h.transcript
    ? {
        transcript: (id: string, after?: TranscriptCursor) =>
          wrap(
            () => h.transcript!(id, after),
            (m) => new RunnerError({ verb: 'transcript', message: m }),
          ),
      }
    : {}),
  ...(h.say
    ? {
        say: (session: { name: string; sessionId: string }, text: string) =>
          wrap(
            () => h.say!(session, text),
            (m) => new RunnerError({ verb: 'say', message: m }),
          ),
      }
    : {}),
});

/** What an `AsyncRunner` observed, every state in A2A's names — or refused, naming the session and the words it takes. */
const inNames = (seen: Map<string, AsyncSighting>): Effect.Effect<Map<string, Sighting>, RunnerError> => {
  const out = new Map<string, Sighting>();
  for (const [name, s] of seen) {
    const state = isSessionState(s.state) ? s.state : formerStateOf(s.state);
    if (!state) {
      return Effect.fail(
        new RunnerError({
          verb: 'observe',
          message: `the harness reported session \`${name}\` as \`${String(s.state)}\`, which is no session state: report one of A2A's, ${SESSION_STATES.join(', ')} (or a former word, working, blocked, done, failed, stopped).`,
        }),
      );
    }
    out.set(name, { ...s, state });
  }
  return Effect.succeed(out);
};

/** A Promise a fake answers becomes an Effect with the engine's error type on it. */
const wrap = <A, E>(f: () => Promise<A>, onError: (message: string) => E) =>
  Effect.tryPromise({ try: f, catch: (cause) => onError(cause instanceof Error ? cause.message : String(cause)) });

/** A fake store, in async methods: what `asyncStore` makes a `StoreOps` of. */
export type AsyncJournal = {
  append(taskId: string, event: Event): Promise<void>;
  read(taskId: string): Promise<Event[]>;
  list(): Promise<string[]>;
  feed(after?: Cursor): Promise<{ entries: FeedEntry[]; cursor: Cursor }>;
};

/** An `AsyncJournal` as a store of whole events: each rejection a `JournalError`, on the task it was asked of, or `*`. */
export const asyncStore = (j: AsyncJournal): Exclude<StoreOps, BodiedJournalOps> => ({
  append: (taskId, event) =>
    wrap(
      () => j.append(taskId, event),
      (m) => new JournalError({ taskId, message: m }),
    ),
  read: (taskId) =>
    wrap(
      () => j.read(taskId),
      (m) => new JournalError({ taskId, message: m }),
    ),
  list: wrap(
    () => j.list(),
    (m) => new JournalError({ taskId: '*', message: m }),
  ),
  feed: (after) =>
    wrap(
      () => j.feed(after),
      (m) => new JournalError({ taskId: '*', message: m }),
    ),
});
