/**
 * The engine, without Effect.
 *
 * Effect is how this engine is written, not how it is used. Everything here takes and returns
 * plain values and Promises, so a consumer needs to know three functions and no library: `file`
 * what you want done, `tick` to move it along, `feed` to react to what happened.
 *
 * The Effect API is still there for anyone who wants `Layer` composition and typed error channels
 * — `import { ... } from 'agent-runtime/effect'`. Keeping it behind a subpath is deliberate: two
 * copies of Effect in one dependency tree break service resolution, and a consumer who never
 * imports Effect can never have two.
 */
import { Effect, Layer } from 'effect';
import path from 'node:path';
import os from 'node:os';
import { fold, nameFor, type Event, type ResumePolicy, type Said, type Sighting, type State } from './domain.ts';
import { argsRefusalOf, type HarnessArgs } from './harness-args.ts';
import { Journal, type Cursor, type FeedEntry, JournalError } from './journal.ts';
import {
  claudeOps, Runner, RunnerError, type RunnerOps, type Transcript, type TranscriptCursor,
} from './runner.ts';
import { claudeSayRefuses } from './runner-claude-inbox.ts';
import { CLAUDE_CONTEXT_TOKENS, CLAUDE_POOL, claudeBgRefuses, claudeCodeRefuses } from './runner-claude-vocabulary.ts';
import { claudeCodeOps, claudeJob } from './runner-claude-code.ts';
import { isTranscriptCursor, noTranscript } from './runner-transcript.ts';
import { detachedOps, type HarnessSpec } from './runner-detached.ts';
import { codex } from './runner-codex.ts';
import { claudeDetached } from './runner-claude-detached.ts';
import { composite } from './runner-composite.ts';
import { a2aOps } from './a2a-client.ts';
import { promiseOps, wrap, type PromiseRunner } from './runner-promise.ts';
import { DEFAULT_MAX_CONCURRENT, file, refusalOf, requestStop, tick, view, type TaskView } from './engine.ts';

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

/**
 * A harness, as one of four things:
 *   `'claude'`      Claude Code as the engine runs it by default: each task a job (`claude -p`, detached by us), or a
 *                   background session (`claude --bg`, its registry Claude Code's) when its `config.background` is true
 *   `'claude-bg'`   Claude Code's own background sessions, every task — it keeps the registry
 *   a `HarnessSpec` any CLI that runs a prompt and exits — we keep the registry
 *   a `PromiseRunner` anything else at all
 *
 * Each is counted in a pool under the ceiling: `'claude'` and `'claude-bg'` in Claude Code's, `claude`, as the engine's
 * `claudeDetached` is, whatever each is called; any other in the `pool` it names, or in its own name's.
 */
export type HarnessConfig = 'claude' | 'claude-bg' | HarnessSpec | PromiseRunner;

export type EngineOptions = {
  /** Where the file-backed store lives. Ignored when you bring your own `journal`. */
  root?: string;
  journal?: PromiseJournal;
  harnesses?: Record<string, HarnessConfig>;
  defaultHarness?: string;
  /**
   * Sessions that may be at work at once in EACH pool — `claude`, which both of the engine's Claude Code harnesses are
   * counted in, and each other harness's own unless it names one (`pool`). Your rate limit, mostly. A `blocked` session
   * is not counted: it makes no API calls.
   */
  maxConcurrent?: number;
};

export type TaskSpec = {
  brief: string;
  cwd: string;
  harness?: string;
  maxAttempts?: number;
  deadlineSeconds?: number;
  resume?: ResumePolicy;
  /** Continue an existing session of this harness instead of starting cold. */
  resumeFrom?: string;
  /**
   * How the harness starts the session — its model, permission mode, tools, effort, MCP servers, context window, Remote
   * Control and worktree (`HarnessArgs`, each key described there). The adapter's configuration: carried on the task,
   * handed to the runner at every spawn, and read by nothing else — `decide` and the loop never open it. Refused, before
   * anything is journalled, when a key is no harness argument, a value is one no harness could use, or its harness does
   * not take it; and a harness argument filed beside `config` rather than in it is refused, naming where it goes.
   */
  config?: HarnessArgs;
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
   * The most one attempt's session may spend, in dollars — `0.25`, `5`. Given to Claude Code as `--max-budget-usd`:
   * `claude -p` ends the session once a response takes it past the cap, and the attempt ends `failed`, reason `budget`,
   * with what it cost — and the task settles `failed`, saying so: a budget spent is spent, so no attempt follows, whatever
   * `maxAttempts` or `resume` says. File the task again with a larger one to run it again. The harness counts one
   * session's spend, so an attempt that fails under the cap is retried under the same cap. Refused unless a positive
   * number, and on a harness that keeps no cap: `claude`, whose `--bg`
   * sessions spend past one (measured), and `codex`. Carried on the task; `decide` never reads it.
   */
  budgetUsd?: number;
  /**
   * Which waiting task a free slot goes to first, when a pool is at its ceiling — `1`, `-1`, `0.5`. Higher first, and
   * filing order within one; absent is 0. Read by a pass when it orders the board, and nowhere else: no runner is told it,
   * `decide` never reads it, and nothing running is stopped for a higher one. Kubernetes' `priorityClassName`, without the
   * preemption. Refused unless a finite number.
   */
  priority?: number;
  /** Choose the id yourself, to keep it in step with a row in your own database. */
  id?: string;
};

/** One pass: how many tasks it read, how many actions it took, and the sessions at work in each pool as it left them. */
export type TickReport = { tasks: number; actions: number; running: Record<string, number> };

export type Engine = {
  /**
   * File work. Returns the task id. Nothing runs until a tick.
   *
   * Refused — rejected with an `Error` whose `exitCode` is 2, and nothing journalled — when the task
   * names a harness this engine does not have; a `maxAttempts` or `deadlineSeconds` that is not a
   * count or a number of seconds; a `resume` that is not a policy; an empty brief, cwd or resumeFrom;
   * a `cwd` that is not absolute; a `budgetUsd` that is not dollars above 0, or one its harness would not keep
   * (`claude`, `codex`); a `priority` that is not a finite number. And in its `config`: a key that is no harness
   * argument, or one filed beside `config` instead; an empty model or effort; a `tools` that is not a list of names; a
   * `disallowedTools` or `allowedTools` that is not a list of permission rules; an `mcp` whose entries are not MCP servers
   * in a `.mcp.json`'s shape; a word its harness does not take (a permission mode or an effort — a `HarnessSpec`'s own
   * `refuses`, or Claude Code's lists); a `contextTokens` that is not a whole number of tokens its harness takes, or any
   * on a harness with no context window to set (`codex`); a `remoteControl` that is not true or false, or `true` on a
   * harness with no such flag (any but one brought as `'claude-bg'` or a `PromiseRunner`, and one brought as `'claude'` in
   * a task whose `background` is not true); a `background` that is not true or false, or `true` on any harness not
   * brought as `'claude'`; and, on `'claude'`, a `budgetUsd` beside `background: true`, which `claude --bg` does not keep.
   * A harness brought as a `PromiseRunner` is asked nothing of its own.
   */
  file(spec: TaskSpec): Promise<string>;
  /** One pass: start what may start, notice what ended, settle what is over. */
  tick(): Promise<TickReport>;
  /**
   * One task. An attempt in flight is observed, as a pass observes: its phase is its session's state, and only a
   * registry has that. Any other task is read off its record — its phase is there, and so is its session's id once an
   * attempt has ended — and the registry is not asked. A session whose id the record lacks is found by name when its
   * harness can `find` one, and observed when it cannot or finds none; a harness without `find` is observed as ever.
   * Whatever is observed is observed on the task's own harness — the one `logs` and `transcript` ask — and no other.
   * `usage` is the attempt in flight's; an ended attempt's is on `state.attempts`.
   */
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
   * One in flight is found by name when its harness can `find` it, and by observing its harness when it
   * cannot or finds none; a registry that cannot be read this time is nothing observed, as a pass reads
   * it: no events, and the cursor given back.
   *
   * Refused — rejected with an `Error` whose `exitCode` is 2 — for a task this engine has no record of;
   * a harness that keeps no conversation this engine can read (a `HarnessSpec` or `PromiseRunner`
   * without `transcript`); and, for the engine's own readers (`claude`, `claude-bg` and a `HarnessSpec`), an
   * `after` that none of them gave. A `PromiseRunner`'s cursor is its own, and passed through.
   */
  transcript(taskId: string, after?: TranscriptCursor): Promise<Transcript>;
  /**
   * Tell the task's session something while it runs — `kubectl attach` with its audit line. `text` is handed, as
   * given, to the session of the attempt in flight through the task's own harness, and then journalled as a
   * `said` entry — `at`, `attempt`, `text` — which is returned, and which `view` carries as `state.said`.
   *
   * The words go before the entry: a `said` on the record is words a harness took, and a `say` that rejects has
   * journalled nothing. What the session makes of them is its own affair, and `decide` never reads them. Words
   * taken are not words read: a harness may still set them aside (Claude Code: its `crossSessionInbound`
   * setting, a rate limit, an identical repeat), and says nothing back when it does. A session its harness lists
   * `blocked` is told too, and reads the words only if it moves again: one waiting on a permission prompt nobody
   * answers keeps them queued, and a stopped or continued one has lost them (open issue 16).
   *
   * Refused — rejected with an `Error` whose `exitCode` is 2, and nothing sent or journalled — for an empty
   * `text`; a task this engine has no record of; a harness with no channel into a running session (a
   * `HarnessSpec`, in its own words, or a `PromiseRunner` without `say`); what the harness cannot carry (Claude
   * Code: a task in `bypassPermissions`, or words longer than its inbox reads); a task that has settled, or has
   * been asked to stop; one with no attempt in flight; and one whose attempt its harness does not list running.
   * A registry that cannot be read this time, or words the harness did not take, reject with the harness's
   * error and no `exitCode`: ask again.
   */
  say(taskId: string, text: string): Promise<Said>;
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
/** Claude Code as the engine runs it itself, in either of the two ways it is brought. */
const isClaude = (h: HarnessConfig): h is 'claude' | 'claude-bg' => h === 'claude' || h === 'claude-bg';

/** Each configured harness as the seam's value, by name: composed into one `Runner`, and asked directly for a task's logs. */
const runnersOf = (harnesses: Record<string, HarnessConfig>, root: string): Record<string, RunnerOps> =>
  Object.fromEntries(Object.entries(harnesses).map(([name, h]): [string, RunnerOps] => [
    name,
    h === 'claude' ? claudeCodeOps({ root })
      : h === 'claude-bg' ? claudeOps({ root })
      : isSpec(h) ? detachedOps(h, root)
      : promiseOps(h),
  ]));

/**
 * The pool each configured harness is counted in under the ceiling: Claude Code's for `'claude'` and `'claude-bg'` — the
 * pool the engine's `claudeDetached` names — whatever each is configured as; the one a spec or a runner names; or its own name.
 */
const poolsOf = (harnesses: Record<string, HarnessConfig>): Record<string, string> =>
  Object.fromEntries(Object.entries(harnesses).map(([name, h]) => [name, isClaude(h) ? CLAUDE_POOL : h.pool ?? name]));

// ─── what the door refuses ──────────────────────────────────────────────────

/**
 * Why a task cannot be filed on its harness, in that harness's words — or `undefined`. Asked after `refusalOf`, the
 * half every door refuses (`engine.ts`), whose type checks the ranges here rest on.
 *
 * Checked at the API, so the CLI is not the only door that checks: a permission mode the harness rejects failed the
 * spawn, which failed the whole tick. Which words a harness takes is asked of the harness; the engine never learns
 * them, and the Effect door, which has no harnesses to ask, refuses none of them (open issue 6).
 */
const harnessRefusalOf = (spec: TaskSpec & { harness: string }, harnesses: Record<string, HarnessConfig>): string | undefined => {
  if (!Object.hasOwn(harnesses, spec.harness)) {
    return `\`harness: ${spec.harness}\` is not a harness this engine has. Its harnesses are: ${Object.keys(harnesses).join(', ')}.`;
  }
  const h = harnesses[spec.harness]!;
  // A window the harness has no knob for would be dropped without a word, and one outside its range fails every spawn: Claude
  // Code refuses it while it parses its arguments. A `PromiseRunner` is the consumer's own, and is handed it.
  const { contextTokens, remoteControl, background } = spec.config ?? {};
  // A mode of the engine's own Claude Code, and of no other harness: dropped without a word, a task that asked for a
  // session a person can reach would run as whatever the harness runs.
  if (background && h !== 'claude') {
    const modal = Object.keys(harnesses).filter((name) => harnesses[name] === 'claude').map((name) => `\`${name}\``);
    return `\`background: true\` asks for a Claude Code background session, and the \`${spec.harness}\` harness has no such mode${h === 'claude-bg' ? ': every session of it is one already. Leave `background` off' : `. ${modal.length ? `File the task on ${modal.join(' or ')}, or leave \`background\` off` : "Leave `background` off: none of this engine's harnesses has the mode"}`}.`;
  }
  if (contextTokens !== undefined && (isClaude(h) || isSpec(h))) {
    const range = isClaude(h) ? CLAUDE_CONTEXT_TOKENS : h.contextTokens;
    if (!range) {
      const windowed = Object.keys(harnesses).filter((name) => { const o = harnesses[name]!; return isClaude(o) || (isSpec(o) && o.contextTokens); }).map((name) => `\`${name}\``);
      return `\`contextTokens: ${contextTokens}\` sets the session's context window, and the \`${spec.harness}\` harness has no such knob: it would run on its own window, whatever the task says. ${windowed.length ? `File the task on ${windowed.join(' or ')}, whose sessions compact past it, or leave \`contextTokens\` off.` : "Leave `contextTokens` off: none of this engine's harnesses sets a session's window."}`;
    }
    if (contextTokens < range.least || contextTokens > range.most) {
      return `\`contextTokens: ${contextTokens}\` is outside the windows the \`${spec.harness}\` harness takes, and it would refuse the session at every spawn. Give a whole number of tokens from ${range.least} to ${range.most}, or leave it out for the harness's own window.`;
    }
  }
  // Only Claude Code's background sessions are bridged. A spec's harness runs a prompt and exits — `claude -p` among them,
  // whose help offers Remote Control only to an interactive session — so the flag would be dropped without a word.
  if (remoteControl && isSpec(h)) {
    const bridged = Object.keys(harnesses).filter((name) => isClaude(harnesses[name]!))
      .map((name) => (harnesses[name] === 'claude' ? `\`${name}\` with \`config.background: true\`` : `\`${name}\``));
    return `\`remoteControl: true\` asks for a session bridged to claude.ai, and the \`${spec.harness}\` harness has no such flag: it runs a prompt and exits, and only a Claude Code background session (\`claude --bg --remote-control\`) is bridged. ${bridged.length ? `File the task on ${bridged.join(' or ')}, or leave \`remoteControl\` off.` : "Leave `remoteControl` off: none of this engine's harnesses bridges a session."}`;
  }
  return (h === 'claude' ? claudeCodeRefuses : h === 'claude-bg' ? claudeBgRefuses : isSpec(h) ? h.refuses : undefined)?.(spec);
};

// ─── the engine ─────────────────────────────────────────────────────────────

export function createEngine(options: EngineOptions = {}): Engine {
  const root = options.root ?? path.join(os.homedir(), '.agent-engine');
  const harnesses = options.harnesses ?? {
    claude: 'claude',
    codex,
    'claude-detached': claudeDetached,
  };
  const fallback = options.defaultHarness ?? Object.keys(harnesses)[0] ?? 'claude';
  const max = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;

  // Kept beside the Layer so `watch` can use an optional `subscribe` when the store has one.
  const journalOps = options.journal ? undefined : Journal.filesOps(root);
  const journal = options.journal ? journalOf(options.journal) : Journal.layer(journalOps!);
  // Each harness behind its A2A agent, reached through the SDK's client in this process (`a2a-client.ts`). Its agent
  // holds nothing: it answers a task it never started off the harness and this journal, so a restart loses no session.
  const events = (taskId: string) => Effect.runPromise(Effect.flatMap(Journal, (j) => j.read(taskId)).pipe(Effect.provide(journal)));
  const runners = Object.fromEntries(Object.entries(runnersOf(harnesses, root)).map(([name, ops]) => [name, a2aOps(name, ops, events)]));
  const pools = poolsOf(harnesses);
  const layer = Layer.mergeAll(journal, Runner.layer(composite(runners, fallback)));
  // Every method is the same shape: an Effect, provided and run. The layer is built once, so
  // services are shared across calls exactly as they would be inside one Effect program.
  const go = <A, E>(e: Effect.Effect<A, E, Journal | Runner>): Promise<A> =>
    Effect.runPromise(e.pipe(Effect.provide(layer)));

  /** The harness a task runs on: the one it was filed with, or the fallback for one this engine no longer has. */
  const harnessOf = (state: State) => {
    const asked = state.harness ?? fallback;
    return Object.hasOwn(runners, asked) ? asked : fallback;
  };

  /**
   * One task's view, asking a registry only what the record cannot answer (`Engine.view`).
   *
   * Observed for an attempt in flight, whose phase is its session's state; and for a harness that cannot `find`, since
   * a detached runner's handle for a session is not the id on the record. Otherwise the record holds the phase and,
   * once an attempt has ended, its session's id, which a registry could only confirm. A session whose id the record
   * lacks — a task settled with its attempt open, before `settled` carried one — is found by name, or observed.
   *
   * Observed on the task's own harness alone, as `transcript` and `logs` reach it: no other registry can name its
   * session, and asking every one made a view of a `check` or a Codex task a `claude agents` call. A registry that
   * cannot be read this time is nothing observed, as `composite` reads it for a pass.
   */
  const viewOf = (taskId: string) => Effect.gen(function* () {
    const state = fold(taskId, yield* Effect.flatMap(Journal, (j) => j.read(taskId)));
    const last = state.attempts.at(-1);
    const { find, observe } = runners[harnessOf(state)]!;
    const observed = observe.pipe(
      Effect.catchCause(() => Effect.succeed(new Map<string, Sighting>())),
      Effect.flatMap((o) => view(taskId, o)),
    );
    if (!find || (!state.settled && last?.ended === null)) return yield* observed;
    if (!last || last.nativeId) return yield* view(taskId, new Map());
    const found = yield* find(nameFor(taskId, last.n)).pipe(Effect.catchCause(() => Effect.succeed(undefined)));
    return found ? { ...(yield* view(taskId, new Map())), sessionId: found.sessionId } : yield* observed;
  });

  const engine: Engine = {
    // The harness is RESOLVED here, never left implicit. A task filed without one would otherwise
    // be counted in a pool called 'default' while an identical task that named its harness went
    // in another — two ceilings for one subscription, each the full size.
    file: async (spec) => {
      const task = { ...spec, harness: spec.harness ?? fallback };
      const refused = refusalOf(task) ?? argsRefusalOf(task) ?? harnessRefusalOf(task, harnesses);
      if (refused) throw Object.assign(new Error(`file: ${refused}`), { exitCode: 2 });
      return go(file(task));
    },
    tick: () => go(tick(max, pools)),
    view: (taskId) => go(viewOf(taskId)),
    list: () => go(Effect.gen(function* () {
      const observed = yield* (yield* Runner).observe;
      const ids = yield* (yield* Journal).list;
      return yield* Effect.forEach(ids, (id) => view(id, observed));
    })),
    stop: (taskId) => go(requestStop(taskId)),
    logs: (taskId) => go(Effect.gen(function* () {
      const v = yield* viewOf(taskId);
      if (!v.sessionId) return '(no session yet)';
      // Asked of the task's own harness, not of whichever reported the session this pass: a session its
      // harness has released is in no observation, and its transcript is still there to read.
      return yield* runners[harnessOf(v.state)]!.logs(v.sessionId);
    })),
    transcript: async (taskId, after) => {
      const refuse = (why: string) => Object.assign(new Error(`transcript: ${why}`), { exitCode: 2 });
      const events = await go(Effect.flatMap(Journal, (j) => j.read(taskId)));
      if (!events.length) throw refuse(`\`${taskId}\` is not a task on this board. \`ae ls\`, or \`list()\`, gives the ones it has.`);
      const state = fold(taskId, events);
      // The task's own harness, as for `logs`, and observed by that harness alone: a board asks this every
      // second while a session runs, and no other harness's registry can name the session.
      const harness = harnessOf(state);
      const runner = runners[harness]!;
      const read = runner.transcriptOf;
      if (!read) throw refuse(`the \`${harness}\` harness keeps no conversation this engine can read. \`logs\` gives what its session printed.`);
      // A cursor is its reader's. The engine's own readers give one shape, and one they did not give is
      // refused at the door; a PromiseRunner's is passed through as it gave it.
      const h = harnesses[harness]!;
      if (after !== undefined && (isClaude(h) || isSpec(h)) && !isTranscriptCursor(after)) {
        throw refuse(`\`${after}\` is not a cursor a transcript read gave. Pass the \`cursor\` the last read returned, or none to read from the start.`);
      }
      // The start, as a read of no session gives it, is handed to no runner: it is asked from the start.
      const start = noTranscript().cursor;
      // No session to read — none started yet, or none its harness can name this time: nothing new, and the cursor
      // asked with, so a moment the registry could not be read costs a caller a poll rather than a read from the start.
      const nothing = { events: [], cursor: after ?? start };
      const last = state.attempts.at(-1);
      if (!last) return nothing;
      // The session is asked for by name, and its harness's agent finds its id: the one on the record for an attempt
      // that has ended, else found or observed on the harness (`sessionTranscript` in `a2a-handler.ts`).
      return (await go(read(nameFor(taskId, last.n), after === start ? undefined : after))) ?? nothing;
    },
    say: async (taskId, text) => {
      const refuse = (why: string) => Object.assign(new Error(`say: ${why}`), { exitCode: 2 });
      const resume = 'Continue its session with a new task that carries the words (`resumeFrom`), as `wf retry --message` does.';
      if (typeof text !== 'string' || !text.trim()) throw refuse('`text` is empty. Give the words the session should hear.');
      const events = await go(Effect.flatMap(Journal, (j) => j.read(taskId)));
      if (!events.length) throw refuse(`\`${taskId}\` is not a task on this board. \`ae ls\`, or \`list()\`, gives the ones it has.`);
      const state = fold(taskId, events);
      // The task's own harness, as for `transcript`: only its registry can name the session, and only it has a way in.
      const harness = harnessOf(state);
      const runner = runners[harness]!;
      const h = harnesses[harness]!;
      const deliver = runner.say;
      // A job takes its brief and nothing after it; only a background session has an inbox.
      if (h === 'claude' && !state.config?.background) throw refuse(claudeJob.noChannel!);
      if (!deliver) {
        throw refuse((isSpec(h) ? h.noChannel : undefined) ?? `the \`${harness}\` harness has no channel into a running session. ${resume}`);
      }
      const cannot = isClaude(h) ? claudeSayRefuses(state.config ?? {}, text) : undefined;
      if (cannot) throw refuse(cannot);
      // What the record says first, then what the harness says: a settled task is not asked about.
      if (state.settled) throw refuse(`\`${taskId}\` has settled (${state.settled}): no session of it is running to hear anything. ${resume}`);
      if (state.stopRequested) throw refuse(`\`${taskId}\` has been asked to stop: its session is being stopped, not steered. ${resume}`);
      const last = state.attempts.at(-1);
      if (!last) throw refuse(`\`${taskId}\` has not started an attempt yet, so there is no session to hear anything. Ask again once \`ae ls\` shows it running.`);
      if (last.ended !== null) throw refuse(`\`${taskId}\` has no attempt running: attempt ${last.n} ended \`${last.ended}\`. ${resume}`);
      const name = nameFor(taskId, last.n);
      let observed: Map<string, Sighting>;
      try { observed = await go(runner.observe); } catch (e) {
        throw new Error(`say: the \`${harness}\` registry could not be read (${e instanceof Error ? e.message : String(e)}), so ${name} could not be found. Nothing was said; ask again.`);
      }
      const sighting = observed.get(name);
      // Registered and not listed: on `claude`, whose listing reads past a registry that failed so its jobs stay seen, that
      // is the registry failing (or a session between states), not a session that is not running. Rejected, as above.
      if (!sighting && isClaude(h) && runner.find) {
        const registered = await go(runner.find(name)).catch(() => undefined);
        if (registered) throw new Error(`say: the \`${harness}\` registry could not be read, or did not list ${name}, which Claude Code has registered. Nothing was said; ask again.`);
      }
      if (!sighting) throw refuse(`\`${taskId}\`'s attempt ${last.n} is not running yet: its harness lists no \`${name}\`. Ask again once \`ae ls\` shows it running.`);
      // A session waiting on a person is running, and its inbox takes words as a working one's does. It reads them
      // only if it moves again: one stalled on a login refresh moved on when a message came (2026-09-13); one waiting
      // on a permission prompt nobody answers keeps them queued, and loses them when stopped or continued (open issue
      // 16). `claude agents` does not say which wait a session is in, so neither is refused. A quiet session is
      // `working` too: its runner reports how long it has been quiet, not an end, and an idle session's inbox
      // starts a turn (open issue 14).
      if (sighting.state !== 'working' && sighting.state !== 'blocked') {
        throw refuse(`\`${taskId}\`'s session is \`${sighting.state}\` on its harness, not running: the next pass writes its end. ${resume}`);
      }
      try { await go(deliver({ name, sessionId: sighting.sessionId }, text)); } catch (e) {
        throw new Error(`say: ${name} was not given the words (${e instanceof Error ? e.message : String(e)}). Nothing was journalled.`);
      }
      const said: Said = { at: new Date().toISOString(), attempt: last.n, text };
      try { await go(Effect.flatMap(Journal, (j) => j.append(taskId, { kind: 'said', ...said }))); } catch (e) {
        throw new Error(`say: ${name} was given the words, but they could not be journalled (${e instanceof Error ? e.message : String(e)}): the record does not show them.`);
      }
      return said;
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
export type { PromiseRunner } from './runner-promise.ts';
export { codex } from './runner-codex.ts';
export { claudeDetached } from './runner-claude-detached.ts';
// The words each harness takes, as lists: what an upper layer that checks a task before filing it holds its own copy to.
export { CLAUDE_CONTEXT_TOKENS, CLAUDE_EFFORTS, CLAUDE_PERMISSION_MODES } from './runner-claude-vocabulary.ts';
export { CODEX_EFFORTS, CODEX_SANDBOXES } from './runner-codex.ts';
export type { HarnessSpec } from './runner-detached.ts';
export { denialText, nameFor } from './domain.ts';
export type { Event, Observed, Outcome, Sighting, EndReason, ResumePolicy, State, Attempt, Usage, Said, Denial } from './domain.ts';
export { HARNESS_ARGS, type HarnessArgs } from './harness-args.ts';
export type { McpServer, SpawnRequest, Transcript, TranscriptCursor, TranscriptEvent } from './runner.ts';
export type { FeedEntry, Cursor } from './journal.ts';
export type { TaskView } from './engine.ts';
