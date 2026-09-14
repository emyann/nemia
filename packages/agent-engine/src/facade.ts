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
import { fold, type Event, type ResumePolicy, type Sighting } from './domain.ts';
import { Journal, type Cursor, type FeedEntry, JournalError } from './journal.ts';
import {
  claudeOps, claudeRefuses, isTranscriptCursor, mcpRefuses, noTranscript, Runner, RunnerError,
  type McpServer, type RunnerOps, type SpawnRequest, type Transcript, type TranscriptCursor,
} from './runner.ts';
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
  // No `watch` here: a store only has to answer `feed`. `Engine.watch` is built on it, and a
  // required `watch` on the store was a method nothing ever called.
};

/** A harness, in Promises. Only needed for one that `HarnessSpec` cannot describe. */
export type PromiseRunner = {
  /**
   * Start the session; reject if that fails. When you know nothing started under `r.name`, reject
   * with an error whose `refused` is `true`, and the attempt ends `unstartable` at once. Otherwise
   * the engine cannot rule a session out, and its grace window finds out: the session is adopted if
   * it appears, the attempt `lost` if it never does.
   */
  spawn(r: SpawnRequest): Promise<void>;
  observe(): Promise<Map<string, Sighting>>;
  stop(sessionId: string): Promise<void>;
  logs(sessionId: string): Promise<string>;
  /**
   * Optional. Let go of a session whose attempt's end the engine has written down — stop it if it
   * runs, drop it from your registry. Called on every pass that still observes it, so make it
   * idempotent; a rejection is asked again on the next.
   */
  release?(session: Sighting, task: { worktree?: string | boolean }): Promise<void>;
  /**
   * Optional. The session's conversation as events from `after` — a cursor this method returned, in
   * whatever shape you chose, or none for the start — and the cursor to ask again with. The engine passes
   * your cursor through as you gave it, and never hands you one of its own. Asked with the session's id as
   * observed while its attempt runs, and with the `nativeId` recorded once the attempt has ended — as
   * `logs` is once a session is released. Without it, `transcript` refuses this harness's tasks, and
   * `logs` is what they have.
   */
  transcript?(sessionId: string, after?: TranscriptCursor): Promise<Transcript>;
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
   * A JSON Schema for the workload's closing statement, handed to the harness verbatim.
   *
   * A harness that can take a structured final answer uses it — Claude Code as its StructuredOutput
   * tool, Codex as `--output-schema` — and the moment the workload gives one, the attempt is over.
   * The statement is recorded on the attempt (`state.attempts[n].closeout`) and never read by the
   * engine: its shape is yours.
   */
  closeoutSchema?: object;
  /**
   * The only tools the session may have, in its harness's names — `['Read', 'Grep', 'Glob']`.
   * Absent: the harness's own set; empty: none at all. Claude Code is given exactly the list
   * (`--tools`). Codex has no tool list, so it runs `read-only` when the list has none of Bash,
   * Write or Edit, and is not narrowed otherwise. Carried on the task; `decide` never reads it.
   */
  tools?: string[];
  /**
   * What the session may not have, in Claude Code's permission rules — `['SendMessage', 'Bash(npm run build)']`,
   * one rule per entry: a tool, or a tool and what it may not run. Claude Code is given the list as
   * `--disallowedTools`, and a deny beats an allow — the checkout's settings, `--allowedTools`, any permission
   * mode. Absent or empty: nothing denied beyond the harness's own settings. Codex has no tool list, and refuses
   * a task that names one. Carried on the task; `decide` never reads it.
   */
  disallowedTools?: string[];
  /**
   * How hard the harness should think, in its own words: `--effort` for Claude Code,
   * `model_reasoning_effort` for Codex. Carried on the task; `decide` never reads it.
   */
  effort?: string;
  /**
   * MCP servers the session may have, by name, as a `.mcp.json` gives them —
   * `{ browser: { command: 'npx', args: ['@playwright/mcp'] } }`. Claude Code gets these and its
   * checkout's `.mcp.json`, and never the operator's own servers: every spawn is
   * `--strict-mcp-config`. Codex gets these as config overrides, on top of its own config's. Carried
   * on the task; `decide` never reads it.
   */
  mcp?: Record<string, McpServer>;
  /** Choose the id yourself, to keep it in step with a row in your own database. */
  id?: string;
};

export type TickReport = { tasks: number; actions: number; running: Record<string, number> };

export type Engine = {
  /**
   * File work. Returns the task id. Nothing runs until a tick.
   *
   * Refused — rejected with an `Error` whose `exitCode` is 2, and nothing journalled — when the task
   * names a harness this engine does not have; a `maxAttempts` or `deadlineSeconds` that is not a
   * count or a number of seconds; a `resume` that is not a policy; an empty brief, cwd, model,
   * resumeFrom or effort; a `cwd` that is not absolute; a `tools` that is not a list of names; a
   * `disallowedTools` that is not a list of permission rules; an
   * `mcp` whose entries are not MCP servers in a `.mcp.json`'s shape; or a word its harness does not take
   * (a permission mode or an effort — a `HarnessSpec`'s own `refuses`, or Claude Code's lists).
   * A harness brought as a `PromiseRunner` is asked nothing.
   */
  file(spec: TaskSpec): Promise<string>;
  /** One pass: start what may start, notice what ended, settle what is over. */
  tick(): Promise<TickReport>;
  view(taskId: string): Promise<TaskView>;
  list(): Promise<TaskView[]>;
  /** Ask a task to stop. Takes effect on the next tick, and confirms on the one after. */
  stop(taskId: string): Promise<void>;
  logs(taskId: string): Promise<string>;
  /**
   * The conversation of the task's session — the one `logs` reads, asked of the task's own harness — as
   * events from `after` on, and the `cursor` to ask again from. Pull-only: poll with the cursor the last
   * read returned; nothing is pushed. No session yet is no events, and the cursor asked with — or one
   * from the start.
   *
   * An attempt that has ended is read by the session id the journal recorded, and no registry is asked.
   * One in flight is found by observing its harness, and a registry that cannot be read this time is
   * nothing observed, as a pass reads it: no events, and the cursor given back.
   *
   * Refused — rejected with an `Error` whose `exitCode` is 2 — for a task this engine has no record of;
   * a harness that keeps no conversation this engine can read (a `HarnessSpec` or `PromiseRunner`
   * without `transcript`); and, for the engine's own readers (`claude-bg` and a `HarnessSpec`), an
   * `after` that none of them gave. A `PromiseRunner`'s cursor is its own, and passed through.
   */
  transcript(taskId: string, after?: TranscriptCursor): Promise<Transcript>;
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

/** Each configured harness as the seam's value, by name: composed into one `Runner`, and asked directly for a task's logs. */
const runnersOf = (harnesses: Record<string, HarnessConfig>, root: string): Record<string, RunnerOps> =>
  Object.fromEntries(Object.entries(harnesses).map(([name, h]): [string, RunnerOps] => [
    name,
    h === 'claude-bg' ? claudeOps({ root })
      : isSpec(h) ? detachedOps(h, root)
      : {
          spawn: (r: SpawnRequest) => Effect.tryPromise({
            try: () => h.spawn(r),
            // A rejection is not proof that nothing started; a runner that knows says `refused`.
            catch: (cause) => new RunnerError({
              verb: 'spawn', message: cause instanceof Error ? cause.message : String(cause),
              ...((cause as { refused?: unknown } | null)?.refused === true ? { refused: true } : {}),
            }),
          }),
          observe: wrap(() => h.observe(), (m) => new RunnerError({ verb: 'observe', message: m })),
          stop: (id: string) => wrap(() => h.stop(id), (m) => new RunnerError({ verb: 'stop', message: m })),
          logs: (id: string) => wrap(() => h.logs(id), (m) => new RunnerError({ verb: 'logs', message: m })),
          ...(h.release ? {
            release: (session: Sighting, task: { worktree?: string | boolean }) =>
              wrap(() => h.release!(session, task), (m) => new RunnerError({ verb: 'release', message: m })),
          } : {}),
          ...(h.transcript ? {
            transcript: (id: string, after?: TranscriptCursor) =>
              wrap(() => h.transcript!(id, after), (m) => new RunnerError({ verb: 'transcript', message: m })),
          } : {}),
        },
  ]));

/** A Promise the consumer wrote becomes an Effect with the engine's error type on it. */
const wrap = <A, E>(f: () => Promise<A>, onError: (message: string) => E) =>
  Effect.tryPromise({ try: f, catch: (cause) => onError(cause instanceof Error ? cause.message : String(cause)) });

// ─── what the door refuses ──────────────────────────────────────────────────

/** Exhaustive by type: a policy added to `ResumePolicy` and not here does not compile. */
const RESUME_POLICIES: Record<ResumePolicy, true> = { interrupted: true, always: true, never: true };

/**
 * One permission rule as Claude Code writes one: a tool's name, and what it may not run in parentheses —
 * `SendMessage`, `Bash(npm run build)`. A space or a comma outside the parentheses separates two rules on
 * the harness's side, so an entry that has one is not one rule.
 */
const RULE = /^[A-Za-z][^\s,()]*(?:\([^()]+\))?$/;

/**
 * Why a task cannot be filed, as a sentence that says what to write instead — or `undefined`.
 *
 * Checked at the API, so the CLI is not the only door that checks. A journalled task is a promise
 * the loop keeps trying to honour, so a value it cannot use is cheapest refused before it is
 * written: `deadlineSeconds: NaN` was journalled as `null` and stopped its task on the first pass,
 * and a permission mode the harness rejects failed the spawn, which failed the whole tick. Which
 * words a harness takes is asked of the harness; the engine never learns them.
 */
const refusalOf = (spec: TaskSpec & { harness: string }, harnesses: Record<string, HarnessConfig>): string | undefined => {
  if (typeof spec.brief !== 'string' || !spec.brief.trim()) return '`brief` is empty. Say what the session should do.';
  if (typeof spec.cwd !== 'string' || !spec.cwd) return '`cwd` is empty. Give the directory the session should work in.';
  // Resolved against whichever process ticks the task, which need not be the one filing it — and a
  // detached worker resolved it twice, from inside itself (`spawn sh ENOENT`, open issue 10).
  if (!path.isAbsolute(spec.cwd)) {
    return `\`cwd: ${spec.cwd}\` is not an absolute path, and the process that runs the task need not be the one filing it. Give the directory resolved — from here that is ${path.resolve(spec.cwd)}.`;
  }
  if (!Object.hasOwn(harnesses, spec.harness)) {
    return `\`harness: ${spec.harness}\` is not a harness this engine has. Its harnesses are: ${Object.keys(harnesses).join(', ')}.`;
  }
  if (spec.maxAttempts !== undefined && !(Number.isInteger(spec.maxAttempts) && spec.maxAttempts >= 1)) {
    return `\`maxAttempts: ${spec.maxAttempts}\` is not a number of attempts. Give a whole number from 1.`;
  }
  if (spec.deadlineSeconds !== undefined && !(Number.isFinite(spec.deadlineSeconds) && spec.deadlineSeconds > 0)) {
    return `\`deadlineSeconds: ${spec.deadlineSeconds}\` is not a number of seconds. Give seconds above 0, or leave it out for no deadline.`;
  }
  if (spec.resume !== undefined && !Object.hasOwn(RESUME_POLICIES, spec.resume)) {
    return `\`resume: ${spec.resume}\` is not a retry policy. It is one of: ${Object.keys(RESUME_POLICIES).join(', ')}.`;
  }
  if (spec.model === '') return "`model` is empty. Leave it out for the harness's default.";
  if (spec.resumeFrom === '') return '`resumeFrom` is empty. Leave it out to start cold.';
  if (spec.effort === '') return "`effort` is empty. Leave it out for the harness's default.";
  // One name per entry: a comma inside one would split into two names on the way to the harness.
  if (spec.tools !== undefined && !(Array.isArray(spec.tools) && spec.tools.every((t) => typeof t === 'string' && t !== '' && t.trim() === t && !t.includes(',')))) {
    return `\`tools: ${JSON.stringify(spec.tools)}\` is not a list of tool names. Give one name per entry, like ["Read", "Grep", "Glob"].`;
  }
  if (spec.disallowedTools !== undefined && !(Array.isArray(spec.disallowedTools) && spec.disallowedTools.every((r) => typeof r === 'string' && RULE.test(r)))) {
    return `\`disallowedTools: ${JSON.stringify(spec.disallowedTools)}\` is not a list of permission rules. Give one rule per entry, a tool or a tool and what it may not run, like ["SendMessage", "Bash(npm run build)"].`;
  }
  const mcp = spec.mcp === undefined ? undefined : mcpRefuses(spec.mcp);
  if (mcp) return mcp;
  const h = harnesses[spec.harness]!;
  return (h === 'claude-bg' ? claudeRefuses : isSpec(h) ? h.refuses : undefined)?.(spec);
};

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
  const runners = runnersOf(harnesses, root);
  const layer = Layer.mergeAll(
    options.journal ? journalOf(options.journal) : Journal.layer(journalOps!),
    Runner.layer(composite(runners, fallback)),
  );
  // Every method is the same shape: an Effect, provided and run. The layer is built once, so
  // services are shared across calls exactly as they would be inside one Effect program.
  const go = <A, E>(e: Effect.Effect<A, E, Journal | Runner>): Promise<A> =>
    Effect.runPromise(e.pipe(Effect.provide(layer)));

  const engine: Engine = {
    // The harness is RESOLVED here, never left implicit. A task filed without one would otherwise
    // be counted in a pool called 'default' while an identical task that named its harness went
    // in another — two ceilings for one subscription, each the full size.
    file: async (spec) => {
      const task = { ...spec, harness: spec.harness ?? fallback };
      const refused = refusalOf(task, harnesses);
      if (refused) throw Object.assign(new Error(`file: ${refused}`), { exitCode: 2 });
      return go(file(task));
    },
    tick: () => go(tick(max)),
    view: (taskId) => go(Effect.flatMap(Runner, (r) => Effect.flatMap(r.observe, (o) => view(taskId, o)))),
    list: () => go(Effect.gen(function* () {
      const observed = yield* (yield* Runner).observe;
      const ids = yield* (yield* Journal).list;
      return yield* Effect.forEach(ids, (id) => view(id, observed));
    })),
    stop: (taskId) => go(requestStop(taskId)),
    logs: (taskId) => go(Effect.gen(function* () {
      const v = yield* view(taskId, yield* (yield* Runner).observe);
      if (!v.sessionId) return '(no session yet)';
      // Asked of the task's own harness, not of whichever reported the session this pass: a session its
      // harness has released is in no observation, and its transcript is still there to read.
      return yield* (runners[v.state.harness ?? fallback] ?? runners[fallback]!).logs(v.sessionId);
    })),
    transcript: async (taskId, after) => {
      const refuse = (why: string) => Object.assign(new Error(`transcript: ${why}`), { exitCode: 2 });
      const events = await go(Effect.flatMap(Journal, (j) => j.read(taskId)));
      if (!events.length) throw refuse(`\`${taskId}\` is not a task on this board. \`ae ls\`, or \`list()\`, gives the ones it has.`);
      const state = fold(taskId, events);
      // The task's own harness, as for `logs`, and observed by that harness alone: a board asks this every
      // second while a session runs, and no other harness's registry can name the session.
      const asked = state.harness ?? fallback;
      const harness = Object.hasOwn(runners, asked) ? asked : fallback;
      const runner = runners[harness]!;
      const read = runner.transcript;
      if (!read) throw refuse(`the \`${harness}\` harness keeps no conversation this engine can read. \`logs\` gives what its session printed.`);
      // A cursor is its reader's. The engine's own readers give one shape, and one they did not give is
      // refused at the door; a PromiseRunner's is passed through as it gave it.
      const h = harnesses[harness]!;
      if (after !== undefined && (h === 'claude-bg' || isSpec(h)) && !isTranscriptCursor(after)) {
        throw refuse(`\`${after}\` is not a cursor a transcript read gave. Pass the \`cursor\` the last read returned, or none to read from the start.`);
      }
      // The start, as a read of no session gives it, is handed to no runner: it is asked from the start.
      const start = noTranscript().cursor;
      // An attempt that has ended — or whose task settled with it open — has its session's id on the record,
      // and no registry is asked for it: what `logs` falls back to. Only an attempt in flight needs one, and a
      // registry that cannot be read this time is nothing observed, as `composite` reads it for a pass.
      const sessionId = state.attempts.at(-1)?.nativeId ?? (await go(runner.observe.pipe(
        Effect.catchCause(() => Effect.succeed(new Map<string, Sighting>())),
        Effect.flatMap((observed) => view(taskId, observed)),
      ))).sessionId;
      // No session to read: nothing new, and the cursor asked with, so a moment the registry could not be
      // read costs a caller a poll rather than a read from the start.
      if (!sessionId) return { events: [], cursor: after ?? start };
      return go(read(sessionId, after === start ? undefined : after));
    },
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
export type { Event, Observed, Outcome, Sighting, EndReason, ResumePolicy, State, Attempt, Usage } from './domain.ts';
export type { McpServer, SpawnRequest, Transcript, TranscriptCursor, TranscriptEvent } from './runner.ts';
export type { FeedEntry, Cursor } from './journal.ts';
export type { TaskView } from './engine.ts';
