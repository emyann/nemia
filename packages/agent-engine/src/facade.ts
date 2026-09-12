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
  feed(after?: Cursor): Promise<{ entries: FeedEntry[]; cursor: Cursor }>;
  /**
   * Watch everything that happens, as it happens.
   *
   * The engine's event-driven surface: a consumer reacts to work finishing without polling a task
   * or knowing what a tick is. Pushed by the store when it can signal (the file store watches the
   * feed), and backed by a timer so that a store which cannot — or an OS that drops the event —
   * costs latency rather than correctness.
   *
   * Delivery is at-least-once in order, and the cursor never expires, so a consumer that starts
   * at 0 replays the whole history first.
   */
  watch(options: {
    onEntry: (entry: FeedEntry) => void | Promise<void>;
    from?: Cursor;
    intervalMs?: number;
    onError?: (e: unknown) => void;
  }): { stop(): void };
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
  /**
   * A path under `cwd` whose existence means this workload has finished.
   *
   * The workload's own word, taken over anything the engine could infer. Existence only — the
   * engine never opens it, so whatever you write there is yours and stays yours.
   */
  doneFile?: string;
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
  /**
   * Watch everything that happens, as it happens — the engine's event-driven surface.
   *
   * A consumer reacts to work finishing without polling a task or knowing what a tick is. Pushed
   * by the store when it can signal (the file store watches the feed), and backed by a timer so
   * that a store which cannot signal — or an OS that drops the event — costs latency rather than
   * correctness. Delivery is in order and at-least-once; the cursor never expires, so starting at
   * 0 replays the whole history first.
   */
  watch(options: {
    onEntry: (entry: FeedEntry) => void | Promise<void>;
    from?: Cursor;
    intervalMs?: number;
    onError?: (e: unknown) => void;
  }): { stop(): void };
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

  // Kept beside the Layer so `watch` can use an optional `subscribe` when the store has one.
  const journalOps = options.journal ? undefined : Journal.filesOps(root);
  const layer = Layer.mergeAll(
    options.journal ? journalOf(options.journal) : Journal.layer(journalOps!),
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

    watch: ({ onEntry, from = 0, intervalMs = 1_000, onError }) => {
      let cursor = from;
      let stopped = false;
      let draining = false;

      // One drain at a time: a push and a tick can arrive together, and delivering an entry twice
      // because two reads overlapped would make "at-least-once in order" a lie.
      const drain = async () => {
        if (stopped || draining) return;
        draining = true;
        try {
          for (;;) {
            const got = await engine.feed(cursor);
            if (!got.entries.length) break;
            cursor = got.cursor;
            for (const entry of got.entries) {
              if (stopped) return;
              await onEntry(entry);
            }
          }
        } catch (e) { onError?.(e); }
        finally { draining = false; }
      };

      const unsubscribe = journalOps?.subscribe?.(() => void drain());
      // Also not unref'd, for the same reason. The file store's `fs.watch` happens to hold the
      // loop open, which is exactly why this hid here: a store WITHOUT `subscribe` would have
      // exited on the spot, and the store is the part a consumer is invited to replace.
      const timer = setInterval(() => void drain(), intervalMs);
      void drain();

      return {
        stop: () => { stopped = true; clearInterval(timer); unsubscribe?.(); },
      };
    },

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
      // NOT unref'd. A control loop that lets its host exit is a control loop that does nothing:
      // `ae up` printed its banner and returned, because an unref'd interval does not hold the
      // event loop open. `stop()` is how a consumer gets their process back.
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
