/**
 * The engine, without Effect.
 *
 * Effect is how this engine is written, not how it is used. Everything here takes and returns
 * plain values and Promises, so a consumer needs to know three functions and no library: `file`
 * what you want done, `tick` to move it along, `feed` to react to what happened.
 *
 * The Effect API is still there for anyone who wants `Layer` composition and typed error channels
 * — `import { ... } from 'agent-engine/effect'`. Keeping it behind a subpath is deliberate: two
 * copies of Effect in one dependency tree break service resolution, and a consumer who never
 * imports Effect can never have two.
 */
import { Effect, Layer } from 'effect';
import path from 'node:path';
import os from 'node:os';
import type { Event, ResumePolicy, Sighting } from './domain.ts';
import { Journal, type Cursor, type FeedEntry, JournalError } from './journal.ts';
import { claudeOps, Runner, RunnerError, type SpawnRequest } from './runner.ts';
import { claudeDetached, codex, detachedOps, type HarnessSpec } from './runner-detached.ts';
import { composite } from './runner-composite.ts';
import { DEFAULT_MAX_CONCURRENT, file, requestStop, tick, view, type TaskView } from './engine.ts';

// ─── what a consumer implements, if anything ────────────────────────────────

/** A store, in Promises. Implement this to keep the engine's records in your own database. */
export type PromiseJournal = {
  append(taskId: string, event: Event): Promise<void>;
  read(taskId: string): Promise<Event[]>;
  list(): Promise<string[]>;
  feed(after: Cursor): Promise<{ entries: FeedEntry[]; cursor: Cursor }>;
};

/** A harness, in Promises. Only needed for one that `HarnessSpec` cannot describe. */
export type PromiseRunner = {
  spawn(r: SpawnRequest): Promise<void>;
  observe(): Promise<Map<string, Sighting>>;
  stop(sessionId: string): Promise<void>;
  logs(sessionId: string): Promise<string>;
};

/**
 * A harness, as one of three things:
 *   `'claude-bg'`   Claude Code's own background sessions — it keeps the registry
 *   a `HarnessSpec` any CLI that runs a prompt and exits — we keep the registry
 *   a `PromiseRunner` anything else at all
 */
export type HarnessConfig = 'claude-bg' | HarnessSpec | PromiseRunner;

export type EngineOptions = {
  /** Where the file-backed store lives. Ignored when you bring your own `journal`. */
  root?: string;
  journal?: PromiseJournal;
  harnesses?: Record<string, HarnessConfig>;
  defaultHarness?: string;
  /** Sessions of EACH harness that may run at once. Your rate limit, mostly. */
  maxConcurrent?: number;
};

export type TaskSpec = {
  brief: string;
  cwd: string;
  harness?: string;
  maxAttempts?: number;
  model?: string;
  permissionMode?: string;
  deadlineSeconds?: number;
  resume?: ResumePolicy;
  /** Continue an existing session of this harness instead of starting cold. */
  resumeFrom?: string;
  worktree?: string | boolean;
  /** Choose the id yourself, to keep it in step with a row in your own database. */
  id?: string;
};

export type TickReport = { tasks: number; actions: number; running: Record<string, number> };

export type Engine = {
  /** File work. Returns the task id. Nothing runs until a tick. */
  file(spec: TaskSpec): Promise<string>;
  /** One pass: start what may start, notice what ended, settle what is over. */
  tick(): Promise<TickReport>;
  view(taskId: string): Promise<TaskView>;
  list(): Promise<TaskView[]>;
  /** Ask a task to stop. Takes effect on the next tick, and confirms on the one after. */
  stop(taskId: string): Promise<void>;
  logs(taskId: string): Promise<string>;
  /** Everything that has happened since `after`, and where to resume. */
  feed(after?: Cursor): Promise<{ entries: FeedEntry[]; cursor: Cursor }>;
  /** Tick on a timer until stopped. Ticks never overlap. */
  start(options?: { intervalMs?: number; onTick?: (r: TickReport) => void; onError?: (e: unknown) => void }): { stop(): void };
};

// ─── the adapters ───────────────────────────────────────────────────────────

const journalOf = (j: PromiseJournal) => Journal.layer({
  append: (taskId, event) => wrap(() => j.append(taskId, event), (m) => new JournalError({ taskId, message: m })),
  read: (taskId) => wrap(() => j.read(taskId), (m) => new JournalError({ taskId, message: m })),
  list: wrap(() => j.list(), (m) => new JournalError({ taskId: '*', message: m })),
  feed: (after) => wrap(() => j.feed(after), (m) => new JournalError({ taskId: '*', message: m })),
});

const isSpec = (h: HarnessConfig): h is HarnessSpec => typeof h === 'object' && 'command' in h;

const runnerOf = (harnesses: Record<string, HarnessConfig>, fallback: string, root: string) =>
  Runner.layer(composite(
    Object.fromEntries(Object.entries(harnesses).map(([name, h]) => [
      name,
      h === 'claude-bg' ? claudeOps()
        : isSpec(h) ? detachedOps(h, root)
        : {
            spawn: (r: SpawnRequest) => wrap(() => h.spawn(r), (m) => new RunnerError({ verb: 'spawn', message: m })),
            observe: wrap(() => h.observe(), (m) => new RunnerError({ verb: 'observe', message: m })),
            stop: (id: string) => wrap(() => h.stop(id), (m) => new RunnerError({ verb: 'stop', message: m })),
            logs: (id: string) => wrap(() => h.logs(id), (m) => new RunnerError({ verb: 'logs', message: m })),
          },
    ])),
    fallback,
  ));

/** A Promise the consumer wrote becomes an Effect with the engine's error type on it. */
const wrap = <A, E>(f: () => Promise<A>, onError: (message: string) => E) =>
  Effect.tryPromise({ try: f, catch: (cause) => onError(cause instanceof Error ? cause.message : String(cause)) });

// ─── the engine ─────────────────────────────────────────────────────────────

export function createEngine(options: EngineOptions = {}): Engine {
  const root = options.root ?? path.join(os.homedir(), '.agent-engine');
  const harnesses = options.harnesses ?? {
    claude: 'claude-bg',
    codex,
    'claude-detached': claudeDetached,
  };
  const fallback = options.defaultHarness ?? Object.keys(harnesses)[0] ?? 'claude';
  const max = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;

  const layer = Layer.mergeAll(
    options.journal ? journalOf(options.journal) : Journal.files(root),
    runnerOf(harnesses, fallback, root),
  );
  // Every method is the same shape: an Effect, provided and run. The layer is built once, so
  // services are shared across calls exactly as they would be inside one Effect program.
  const go = <A, E>(e: Effect.Effect<A, E, Journal | Runner>): Promise<A> =>
    Effect.runPromise(e.pipe(Effect.provide(layer)));

  const engine: Engine = {
    // The harness is RESOLVED here, never left implicit. A task filed without one would otherwise
    // be counted in a pool called 'default' while an identical task that named its harness went
    // in another — two ceilings for one subscription, each the full size.
    file: (spec) => go(file({ ...spec, harness: spec.harness ?? fallback })),
    tick: () => go(tick(max)),
    view: (taskId) => go(Effect.flatMap(Runner, (r) => Effect.flatMap(r.observe, (o) => view(taskId, o)))),
    list: () => go(Effect.gen(function* () {
      const observed = yield* (yield* Runner).observe;
      const ids = yield* (yield* Journal).list;
      return yield* Effect.forEach(ids, (id) => view(id, observed));
    })),
    stop: (taskId) => go(requestStop(taskId)),
    logs: (taskId) => go(Effect.gen(function* () {
      const runner = yield* Runner;
      const v = yield* view(taskId, yield* runner.observe);
      return v.sessionId ? yield* runner.logs(v.sessionId) : '(no session yet)';
    })),
    feed: (after = 0) => go(Effect.flatMap(Journal, (j) => j.feed(after))),

    start: (o = {}) => {
      const every = o.intervalMs ?? 3_000;
      let running = false;
      let stopped = false;
      // Re-entrancy guard rather than a fixed schedule: a tick that outruns the interval must not
      // be joined by a second one, or two passes would admit against the same count.
      const timer = setInterval(async () => {
        if (running || stopped) return;
        running = true;
        try { o.onTick?.(await engine.tick()); }
        catch (e) { o.onError?.(e); }
        finally { running = false; }
      }, every);
      timer.unref?.();
      return { stop: () => { stopped = true; clearInterval(timer); } };
    },
  };

  return engine;
}

// ─── the vocabulary, all plain data ─────────────────────────────────────────
export { codex, claudeDetached } from './runner-detached.ts';
export type { HarnessSpec } from './runner-detached.ts';
export { nameFor } from './domain.ts';
export type { Event, Observed, Outcome, Sighting, EndReason, ResumePolicy, State, Attempt } from './domain.ts';
export type { SpawnRequest } from './runner.ts';
export type { FeedEntry, Cursor } from './journal.ts';
export type { TaskView } from './engine.ts';
