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
import { Effect, Exit, Layer } from 'effect';
import path from 'node:path';
import os from 'node:os';
import { fold, isLive, nameFor, phaseWordOf, waitsOnPerson, type Event, type Input, type Said, type Sighting, type State } from './domain.ts';
import { argsRefusalOf, type HarnessArgs } from './harness-args.ts';
import { Journal, type Cursor, type FeedEntry, JournalError } from './journal.ts';
import {
  claudeOps, Runner, RunnerError, type ExpectedSession, type RunnerOps, type Transcript, type TranscriptCursor,
} from './runner.ts';
import { claudeSayRefuses } from './runner-claude-inbox.ts';
import { CLAUDE_CONTEXT_TOKENS, claudeBgRefuses, claudeCodeRefuses } from './runner-claude-vocabulary.ts';
import { claudeCodeOps, isClaudeJob } from './runner-claude-code.ts';
import { isTranscriptCursor, noTranscript } from './runner-transcript.ts';
import { detachedOps, type HarnessSpec } from './runner-detached.ts';
import { codex } from './runner-codex.ts';
import { claudeDetached } from './runner-claude-detached.ts';
import { composite } from './runner-composite.ts';
import { a2aOps, type SeamOps } from './a2a-client.ts';
import { remoteConfigRefusal, remoteOps, remoteRefuses, type Credentials, type RemoteAgent } from './a2a-remote.ts';
import { ioCounts, type IoCounts } from './io-tally.ts';
import { tickMemoLayer } from './tick-memo.ts';
import { promiseOps, wrap, type PromiseRunner } from './runner-promise.ts';
import {
  ADMIT_INSTEAD, admit, answer, answerRefusalOf, close, closeRefusalOf, file, filingOf, refusalOf, requestStop, tick, tickRefusalOf, view, type RefusedMove, type TaskView,
} from './engine.ts';

// ─── what a consumer implements, if anything ────────────────────────────────

/**
 * A store, in Promises. Implement this to keep the engine's records in your own database. Every `append` goes on the `feed`
 * too: a running engine reads a settled task's record again only once the feed names it (`Engine.tick`).
 */
export type PromiseJournal = {
  append(taskId: string, event: Event): Promise<void>;
  read(taskId: string): Promise<Event[]>;
  list(): Promise<string[]>;
  feed(after?: Cursor): Promise<{ entries: FeedEntry[]; cursor: Cursor }>;
  // No `watch` here: a store only has to answer `feed`. `Engine.watch` is built on it, and a
  // required `watch` on the store was a method nothing ever called.
};

/**
 * A harness, as one of five things:
 *   `'claude'`      Claude Code as the engine runs it by default: each task a job (`claude -p`, detached by us), or a
 *                   background session (`claude --bg`, its registry Claude Code's) when its `config.background` is true
 *   `'claude-bg'`   Claude Code's own background sessions, every task — it keeps the registry
 *   a `HarnessSpec` any CLI that runs a prompt and exits — we keep the registry
 *   a `RemoteAgent` an A2A agent another party runs, by its URL or its card (`a2a-remote.ts`) — we keep the registry of
 *                   what we sent it; its secrets come from `credentials`
 *   a `PromiseRunner` anything else at all
 *
 * None is counted under a ceiling: the runtime starts what it is given, and a layer above that pools its harnesses under
 * one rate limit files them `queued` and `admit`s them (stage 4c). A spec or a runner that still names a `pool` is refused.
 */
export type HarnessConfig = 'claude' | 'claude-bg' | HarnessSpec | RemoteAgent | PromiseRunner;

export type EngineOptions = {
  /** Where the file-backed store lives. Ignored when you bring your own `journal`. */
  root?: string;
  journal?: PromiseJournal;
  harnesses?: Record<string, HarnessConfig>;
  defaultHarness?: string;
  /**
   * The secret for a remote agent's security scheme, asked on every request that needs one: `scheme` is the scheme's name on
   * the agent's card, `agentUrl` the agent's configured URL (for an agent given by its card, the URL of the interface it is
   * reached on). `undefined` when there is none, and a task on an agent whose card asks for it is refused before anything is
   * sent. A secret is sent as a header and written nowhere: not on the task, the journal, the registry or the feed.
   */
  credentials?: Credentials;
  /*
   * `maxConcurrent`, the sessions that could be at work at once in each pool, is retired (stage 4c part 2, 2026-09-25):
   * given, `createEngine` refuses it. How many run at once is the layer above's, which files `queued` and `admit`s.
   */
};

export type TaskSpec = {
  brief: string;
  cwd: string;
  harness?: string;
  deadlineSeconds?: number;
  /** Continue an existing session of this harness instead of starting cold. */
  resumeFrom?: string;
  /**
   * How the harness starts the session — its model, permission mode, tools, effort, MCP servers, context window, Remote
   * Control, worktree and spend cap (`HarnessArgs`, each key described there). The adapter's configuration: carried on the task,
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
  /*
   * `priority`, which waiting task a free slot went to first, is retired with the runtime's ceiling (stage 4c part 2): a
   * task that carries it, at any value, is refused. Which task starts first is the layer above's, when it `admit`s.
   */
  /**
   * Hold the task open when an attempt signs, rather than settle it (R1): the task waits, phase `input-required` — A2A's
   * `TASK_STATE_INPUT_REQUIRED` — with no process running, until a person `answer`s it, which starts its next turn, or
   * `close`s it, which settles it. A turn is one attempt, under `deadlineSeconds` and a budget of its own, so a task may
   * wait on a person for as long as they take; a turn that does not end `done` settles the task `failed`. `stop` settles it `stopped`, waiting or not. Refused unless `true`.
   */
  holdOpen?: true;
  /**
   * Wait for the word to start (stage 4c): the task is filed and a pass starts nothing of it until `admit` names it — then
   * the next pass starts it. A task held open waits for the word again before each later
   * turn. For a layer above that decides itself what runs when; `view` says `admission: 'queued'` while it waits, and its
   * phase stays `pending`. Absent, or `false`, starts it on the next pass as ever. Refused unless true or false.
   */
  queued?: boolean;
  /** Choose the id yourself, to keep it in step with a row in your own database. */
  id?: string;
};

/**
 * One pass: how many tasks it read, how many actions it took, the sessions at work on each harness as it left them — its
 * last attempt open, and `working` or not yet listed; a `blocked` one is not — and the
 * view of every task it left unsettled — built off the pass's one observation of each harness and the fold it made, so a
 * layer above that decides what to `admit` reads the board without asking any harness again (stage 4c) — and what the pass
 * cost, as facts: `ms`, its wall time, and `observed`, each harness's observes made during it (`ObserveCount`). Nothing decides on them.
 *
 * `refused` is every move the task's lifecycle had no edge for in this pass (stage 5), off the same steps: the task, the state
 * it was in and the event it was handed. Such a task did nothing and will be asked again next pass, so a refusal that persists
 * is on every report until something changes; a layer above says it once (`wf up`). Empty on a healthy board, and a settled
 * task is never on it.
 */
export type TickReport = {
  tasks: number; actions: number; running: Record<string, number>; views: TaskView[]; ms: number; observed: Record<string, ObserveCount>;
  refused: RefusedMove[];
};

/**
 * One harness's observes, counted: how many were made, their wall time in ms, the sessions or run files they listed, and the processes
 * started while they ran (`claude agents` for Claude Code's background sessions; none for a directory of run files). The harnesses of a
 * pass observe at once, so their `ms` can add up to more than the pass's, and a process another harness started in the same moment is
 * counted in both.
 */
export type ObserveCount = { calls: number; ms: number; listed: number; spawned: number };

/**
 * What this engine's reads and spawns have cost since the process started, as running totals: the runtime's own reads and spawns
 * (`IoCounts`, per process), and each harness's observes, whichever call made them — a pass, a `view`, a `transcript` (per engine). A caller
 * that wants one call's cost takes the difference before and after it.
 */
export type EngineIo = IoCounts & { observed: Record<string, ObserveCount> };

export type Engine = {
  /**
   * File work. Returns the task id. Nothing runs until a tick.
   *
   * Refused — rejected with an `Error` whose `exitCode` is 2, and nothing journalled — when the task
   * names a harness this engine does not have; a `deadlineSeconds` that is not a number of seconds; a `maxAttempts` or a
   * `resume`, whatever its value, which are retired: the runtime makes one attempt per start; an empty brief, cwd or resumeFrom;
   * a `cwd` that is not absolute; a `priority`, whatever its value, which is retired: the runtime chooses no order. And in its `config`: a key that is no harness
   * argument, or one filed beside `config` instead — `budgetUsd` among them, the spend cap the runtime kept as its own
   * until stage 4b; a `budgetUsd` that is not dollars above 0, or one its harness would not keep (`codex`); an empty model or effort; a `tools` that is not a list of names; a
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
  /**
   * One pass: start what may start — every task not queued, and each queued one `admit`ted — notice what ended, settle what
   * is over. Takes nothing: refused, an `Error` whose `exitCode` is 2 and nothing read, when handed any argument, since the
   * ceiling and the pools it once took are retired.
   *
   * An engine keeps, for as long as it lives, the settled tasks its passes have folded (`tick-memo.ts`): a pass reads the
   * feed on from where the last stopped, and reads the journal of a task only when it is not settled, the feed has named
   * it since, or this engine has never folded it — so an engine's first pass reads every journal and the whole feed, and
   * the passes after it read only what changed. A store (`PromiseJournal`) must therefore put every append on its feed.
   */
  tick(): Promise<TickReport>;
  /**
   * Let tasks filed `queued` start (stage 4c): journals an `admitted` entry for each whose current turn waits for one, and
   * returns their ids; the next tick starts them. Reads the tasks' records and asks no
   * harness. Idempotent: a task already admitted, not filed queued, or whose turn has started is left as it is, and not
   * returned. Refused — rejected with an `Error` whose `exitCode` is 2, and nothing journalled for any of them — when one
   * is a task this engine has no record of, or has settled.
   */
  admit(taskIds: readonly string[]): Promise<string[]>;
  /**
   * One task. A settled task is read off its record, on every harness, and no registry is asked: its phase is its
   * outcome, and its session's id is the harness's own where it can `find` one, found by name when the record lacks it,
   * and otherwise the id its harness reported when the attempt ended. An attempt in flight is observed, as a pass
   * observes: its phase is its session's state, and only a registry has that. A task not settled with no attempt in
   * flight is read off its record on a harness that can `find`, and observed on one that cannot.
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
   * Code's background session: a task in `bypassPermissions`, or words longer than its inbox reads); a task that
   * has settled, or has been asked to stop; one with no attempt in flight; and one whose attempt its harness does
   * not list running. A registry that cannot be read this time, or words the harness did not take, reject with the
   * harness's error and no `exitCode`: ask again.
   *
   * A Claude Code job (`claude -p`) is told on its stdin: the words go to an inbox its worker writes on as the
   * next user message, which the job takes into the turn it is working. Once it has given its result its input
   * is closed, and words said then are not taken — a rejection with no `exitCode`, since the job is still
   * `working` until it exits, and its record settles on the next tick. Words said in the half second before its
   * result are taken and may never be read (open issue 29).
   */
  say(taskId: string, text: string): Promise<Said>;
  /**
   * Answer a task held open (`holdOpen`) that waits for one — phase `input-required`. Journalled as an `input` entry — `at`,
   * `text`, and `config` if given — which is returned, and which `view` carries as `state.inputs`. The next tick starts
   * the task's next turn: an attempt that continues the session that signed (`--resume`), told `text` in place of the
   * brief, with `config` laid over the task's own if given. A turn gives its own spend cap and nothing else
   * (`config: { budgetUsd }`, `TURN_ARGS`): the rest of its configuration is the session's it continues. Nothing is
   * sent to any session: none is running.
   *
   * Refused — rejected with an `Error` whose `exitCode` is 2, and nothing journalled — for an empty `text`; a `config`
   * with any key but `budgetUsd`, or a `budgetUsd` that is not dollars above 0, or one its harness would not keep (as
   * `file` refuses one); a `budgetUsd` given beside `config` rather than in it, naming where it goes; a task this engine has no
   * record of; one not filed to be held open; one settled, closed or asked to stop; and one not waiting — an attempt
   * running (`say` reaches it), between attempts, not started, or answered already and its next turn not yet begun.
   * Two answers journalled before the next turn begins are told to it both, in order.
   */
  answer(taskId: string, text: string, options?: { config?: HarnessArgs }): Promise<Input>;
  /**
   * Settle a task held open that waits for an answer: journalled as a `closed` entry, and settled `succeeded`, note
   * `closed`, by the next tick. Refused — an `Error` whose `exitCode` is 2, nothing journalled — as `answer` is, for a task
   * that is not waiting for one. To end one that is running, `stop` it.
   */
  close(taskId: string): Promise<void>;
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
  /** What this engine's reads, spawns and observes have cost so far (`EngineIo`): running totals, read by nothing in the engine. */
  io(): EngineIo;
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

/**
 * The session an attempt ended as, as its harness named it then (the `ended` entry's `sessionId`, the sighting's): what an
 * observe would have listed it by. Undefined for an attempt no harness ever named, whose end says so in parentheses.
 */
const handleOf = (events: readonly Event[], attempt: number): string | undefined => {
  const end = [...events].reverse().find((e) => e.kind === 'ended' && e.attempt === attempt);
  return end?.kind === 'ended' && !['(never seen)', '(never started)'].includes(end.sessionId) ? end.sessionId : undefined;
};

const isSpec = (h: HarnessConfig): h is HarnessSpec => typeof h === 'object' && 'command' in h;
/** A remote A2A agent: an object that is neither a spec (`command`) nor a runner (`spawn`). */
const isRemote = (h: HarnessConfig): h is RemoteAgent => typeof h === 'object' && h !== null && !('command' in h) && !('spawn' in h);
/** Claude Code as the engine runs it itself, in either of the two ways it is brought. */
const isClaude = (h: HarnessConfig): h is 'claude' | 'claude-bg' => h === 'claude' || h === 'claude-bg';

/** Each configured harness as the seam's value, by name: composed into one `Runner`, and asked directly for a task's logs. */
const runnersOf = (harnesses: Record<string, HarnessConfig>, root: string, credentials?: Credentials): Record<string, RunnerOps> =>
  Object.fromEntries(Object.entries(harnesses).map(([name, h]): [string, RunnerOps] => [
    name,
    h === 'claude' ? claudeCodeOps({ root })
      : h === 'claude-bg' ? claudeOps({ root })
      : isSpec(h) ? detachedOps(h, root)
      : isRemote(h) ? remoteOps(name, h, root, credentials)
      : promiseOps(h),
  ]));

/**
 * Why an engine cannot be built from these options, in a sentence that says what to do instead — or `undefined`. Asked of the
 * options as handed in, untyped: a caller built against the options before stage 4c part 2 still sends the ceiling, and a
 * harness brought as an object may still name its pool. Each would be taken and dropped, a ceiling nobody keeps.
 */
const optionsRefusalOf = (options: EngineOptions): string | undefined => {
  if (Object.hasOwn(options, 'maxConcurrent')) {
    return `\`maxConcurrent\` is retired: the runtime keeps no ceiling, and starts every task it is given. ${ADMIT_INSTEAD}`;
  }
  for (const [name, h] of Object.entries(options.harnesses ?? {})) {
    if (typeof h === 'object' && h !== null && Object.hasOwn(h, 'pool')) {
      return `the \`${name}\` harness names a \`pool\`, which is retired: the runtime counts no pools. Take \`pool\` off it; a layer above that pools harnesses under one rate limit keeps its own list (the orchestrator's \`POOLS\` in \`admission.ts\`). ${ADMIT_INSTEAD}`;
    }
    const remote = typeof h === 'object' && h !== null && isRemote(h) ? remoteConfigRefusal(name, h as Record<string, unknown>) : undefined;
    if (remote) return remote;
  }
  if (options.credentials !== undefined && typeof options.credentials !== 'function') {
    return '`credentials` is a function, `(scheme, agentUrl) => secret | undefined`: give one, or leave it out.';
  }
  return undefined;
};

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
  return (h === 'claude' ? claudeCodeRefuses : h === 'claude-bg' ? claudeBgRefuses : isSpec(h) ? h.refuses : isRemote(h) ? remoteRefuses(spec.harness) : undefined)?.(spec);
};

// ─── the engine ─────────────────────────────────────────────────────────────

export function createEngine(options: EngineOptions = {}): Engine {
  const refused = optionsRefusalOf(options);
  if (refused) throw Object.assign(new Error(`createEngine: ${refused}`), { exitCode: 2 });
  const root = options.root ?? path.join(os.homedir(), '.agent-engine');
  const harnesses = options.harnesses ?? {
    claude: 'claude',
    codex,
    'claude-detached': claudeDetached,
  };
  const fallback = options.defaultHarness ?? Object.keys(harnesses)[0] ?? 'claude';

  // Kept beside the Layer so `watch` can use an optional `subscribe` when the store has one.
  const journalOps = options.journal ? undefined : Journal.filesOps(root);
  const journal = options.journal ? journalOf(options.journal) : Journal.layer(journalOps!);
  // Each harness behind its A2A agent, reached through the SDK's client in this process (`a2a-client.ts`). Its agent
  // holds nothing: it answers a task it never started off the harness and this journal, so a restart loses no session.
  const events = (taskId: string) => Effect.runPromise(Effect.flatMap(Journal, (j) => j.read(taskId)).pipe(Effect.provide(journal)));
  // Every observe of a harness, a pass's and a view's alike, goes through its runner here, and is counted on the way (`ObserveCount`).
  const observed: Record<string, ObserveCount> = {};
  // `observeFor` is an observe too, told what to look for, and counted as one: `spawned` is what says whether it asked a registry.
  const counted = <R extends RunnerOps>(name: string, ops: R): R => {
    const count = (look: Effect.Effect<Map<string, Sighting>, RunnerError>) => Effect.suspend(() => {
      const t0 = performance.now();
      const spawned = ioCounts().spawned;
      return Effect.onExit(look, (exit) => Effect.sync(() => {
        const o = (observed[name] ??= { calls: 0, ms: 0, listed: 0, spawned: 0 });
        o.calls++;
        o.ms += performance.now() - t0;
        o.spawned += ioCounts().spawned - spawned;
        if (Exit.isSuccess(exit)) o.listed += exit.value.size;
      }));
    });
    const observeFor = ops.observeFor;
    return { ...ops, observe: count(ops.observe), ...(observeFor ? { observeFor: (expected: readonly ExpectedSession[]) => count(observeFor(expected)) } : {}) };
  };
  const observedNow = (): Record<string, ObserveCount> => Object.fromEntries(Object.entries(observed).map(([name, o]) => [name, { ...o }]));
  // A remote agent is A2A already, spoken to by the SDK's client over HTTP: counted, and wrapped in no seam of ours.
  const runners = Object.fromEntries(Object.entries(runnersOf(harnesses, root, options.credentials))
    .map(([name, ops]): [string, SeamOps] => [name, counted(name, isRemote(harnesses[name]!) ? ops : a2aOps(name, ops, events))]));
  // The engine's one memo of the settled tasks its passes may skip (`tick-memo.ts`): made here, once, so it lives as long as
  // this engine and a new one folds every task on its first pass.
  const layer = Layer.mergeAll(journal, Runner.layer(composite(runners, fallback)), tickMemoLayer());
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
   * A settled task is read off its record alone, on every harness: its phase is its outcome, and a sighting gives such
   * a view nothing else but its session's id — `waitingFor` is only a `needs-human` phase's, and `usage` only an
   * attempt in flight's (an ended one's is on its `ended` entry, read off the sighting it ended on). That id is on the
   * record too: the harness's own (`nativeId`) where the harness can `find`, as a registry would confirm it; and where
   * it cannot, the handle the harness reported the session under when its attempt ended, which is what it lists it by
   * and what its `logs` take (a detached runner's is the attempt's name, never `nativeId`: a check's `logs` are its verdict).
   * Before 2026-09-25 a harness that cannot `find` was observed for every view, even of a task settled days ago: a
   * `check` harness listing every run file it ever ran, once for each check of each run the tick viewed, every pass.
   *
   * A task not settled is observed while an attempt is in flight, whose phase is its session's state, and on a harness
   * that cannot `find`, for its session's id. Otherwise the record holds the phase and, once an attempt has ended, its
   * session's id. A session whose id the record lacks is found by name, or observed.
   *
   * Observed on the task's own harness alone, as `transcript` and `logs` reach it: no other registry can name its
   * session, and asking every one made a view of a `check` or a Codex task a `claude agents` call. A registry that
   * cannot be read this time is nothing observed, as `composite` reads it for a pass.
   */
  const viewOf = (taskId: string) => Effect.gen(function* () {
    const events = yield* Effect.flatMap(Journal, (j) => j.read(taskId));
    const state = fold(taskId, events);
    const last = state.attempts.at(-1);
    const { find, observe, observeFor } = runners[harnessOf(state)]!;
    // Told this task's own sessions, where the harness can be: a view of a Claude Code job lists the jobs and asks no `claude agents`.
    const look = observeFor ? observeFor(state.attempts.map((a) => ({ name: nameFor(taskId, a.n), harness: state.harness }))) : observe;
    const observed = look.pipe(
      Effect.catchCause(() => Effect.succeed(new Map<string, Sighting>())),
      Effect.flatMap((o) => view(taskId, o)),
    );
    const recorded = view(taskId, new Map());
    if (!state.settled && (!find || last?.ended === null)) return yield* observed;
    if (!last || (find && last.nativeId)) return yield* recorded;
    const found = find ? yield* find(nameFor(taskId, last.n)).pipe(Effect.catchCause(() => Effect.succeed(undefined))) : undefined;
    if (found) return { ...(yield* recorded), sessionId: found.sessionId };
    if (!state.settled) return yield* observed;
    const v = yield* recorded;
    return { ...v, sessionId: handleOf(events, last.n) ?? v.sessionId };
  });

  const engine: Engine = {
    // The harness is RESOLVED here, never left implicit: a task filed without one would otherwise read
    // `default` on its record and its view, and a layer above that pools by harness would count it apart
    // from an identical task that named its harness.
    file: async (spec) => {
      const task = { ...spec, harness: spec.harness ?? fallback };
      const refused = refusalOf(task) ?? argsRefusalOf(task) ?? harnessRefusalOf(task, harnesses);
      if (refused) throw Object.assign(new Error(`file: ${refused}`), { exitCode: 2 });
      return go(file(task));
    },
    tick: async (...args: unknown[]) => {
      const refused = tickRefusalOf(args);
      if (refused) throw Object.assign(new Error(`tick: ${refused}`), { exitCode: 2 });
      const t0 = performance.now();
      const before = observedNow();
      const report = await go(tick());
      const during = Object.fromEntries(Object.entries(observedNow()).flatMap(([name, o]): Array<[string, ObserveCount]> => {
        const b = before[name] ?? { calls: 0, ms: 0, listed: 0, spawned: 0 };
        return o.calls > b.calls ? [[name, { calls: o.calls - b.calls, ms: o.ms - b.ms, listed: o.listed - b.listed, spawned: o.spawned - b.spawned }]] : [];
      }));
      return { ...report, ms: performance.now() - t0, observed: during };
    },
    admit: async (taskIds) => {
      const refuse = (why: string) => Object.assign(new Error(`admit: ${why}`), { exitCode: 2 });
      return go(admit(taskIds).pipe(Effect.catchTag('AdmitRefused', (e) => Effect.fail(refuse(e.message)))));
    },
    io: () => ({ ...ioCounts(), observed: observedNow() }),
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
      const last = state.attempts.at(-1);
      if (!deliver) {
        throw refuse((isSpec(h) ? h.noChannel : undefined) ?? `the \`${harness}\` harness has no channel into a running session. ${resume}`);
      }
      // What Claude Code's inbox cannot carry is a background session's: a job's words go on its stdin. Asked here of a
      // session that is one by its config, and below, once it is found, of one on `claude` that runs `--bg` without saying
      // so — a task filed on it before jobs were its default.
      const bgRefuses = () => claudeSayRefuses(state.config ?? {}, text);
      const cannot = h === 'claude-bg' || (h === 'claude' && state.config?.background) ? bgRefuses() : undefined;
      if (cannot) throw refuse(cannot);
      // What the record says first, then what the harness says: a settled task is not asked about.
      if (state.settled) throw refuse(`\`${taskId}\` has settled (${state.settled}): no session of it is running to hear anything. ${resume}`);
      if (state.stopRequested) throw refuse(`\`${taskId}\` has been asked to stop: its session is being stopped, not steered. ${resume}`);
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
      const cannotBg = h === 'claude' && !isClaudeJob(sighting.sessionId) ? bgRefuses() : undefined;
      if (cannotBg) throw refuse(cannotBg);
      // A session waiting on a person is running, and its inbox takes words as a working one's does. It reads them
      // only if it moves again: one stalled on a login refresh moved on when a message came (2026-09-13); one waiting
      // on a permission prompt nobody answers keeps them queued, and loses them when stopped or continued (open issue
      // 16). `claude agents` does not say which wait a session is in, so neither is refused. A quiet session is
      // `working` too: its runner reports how long it has been quiet, not an end, and an idle session's inbox
      // starts a turn (open issue 14).
      if (!isLive(sighting.state)) {
        throw refuse(`\`${taskId}\`'s session is \`${phaseWordOf(sighting.state)}\` on its harness, not running: the next pass writes its end. ${resume}`);
      }
      // A remote agent's Task takes a message only where A2A lets its caller speak: once it asks for input. At work, a
      // message would be a second turn the agent never asked for.
      if (isRemote(h) && !waitsOnPerson(sighting.state)) {
        throw refuse(`\`${taskId}\` runs on the \`${harness}\` remote A2A agent, whose Task takes words only once it asks for input, and it is at work. Say them when \`ae ls\` shows it waiting, or ${resume.charAt(0).toLowerCase()}${resume.slice(1)}`);
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
    answer: async (taskId, text, options = {}) => {
      const refuse = (why: string) => Object.assign(new Error(`answer: ${why}`), { exitCode: 2 });
      // Asked of the options as handed in, untyped: a caller built before stage 4b still sends the cap as its own option.
      if (Object.hasOwn(options, 'budgetUsd')) {
        throw refuse('`budgetUsd` is the harness\'s configuration: give it under `config`, as `answer(id, text, { config: { budgetUsd: … } })`.');
      }
      const { config } = options;
      const events = await go(Effect.flatMap(Journal, (j) => j.read(taskId)));
      const state = events.length ? fold(taskId, events) : undefined;
      // The turn's configuration is asked of the task's harness as a filing's is: `claude --bg` keeps no cap, and `codex` has none.
      const refused = answerRefusalOf(taskId, state, text, config)
        ?? (state && config ? harnessRefusalOf({ ...filingOf(state, config), harness: harnessOf(state) }, harnesses) : undefined);
      if (refused) throw refuse(refused);
      return go(answer(taskId, text, config).pipe(Effect.catchTag('InputRefused', (e) => Effect.fail(refuse(e.message)))));
    },
    close: async (taskId) => {
      const refuse = (why: string) => Object.assign(new Error(`close: ${why}`), { exitCode: 2 });
      return go(close(taskId).pipe(Effect.catchTag('InputRefused', (e) => Effect.fail(refuse(e.message)))));
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
export type { PromiseRunner, PromiseSighting } from './runner-promise.ts';
export { codex } from './runner-codex.ts';
export { claudeDetached } from './runner-claude-detached.ts';
// The words each harness takes, as lists: what an upper layer that checks a task before filing it holds its own copy to.
export { CLAUDE_CONTEXT_TOKENS, CLAUDE_EFFORTS, CLAUDE_PERMISSION_MODES } from './runner-claude-vocabulary.ts';
export { CODEX_EFFORTS, CODEX_SANDBOXES } from './runner-codex.ts';
export type { HarnessSpec } from './runner-detached.ts';
export type { Credentials, RemoteAgent } from './a2a-remote.ts';
export { denialText, nameFor } from './domain.ts';
export { refusedText, retiredKeyRefusal } from './engine.ts';
export type { Event, SessionState, Ended, Outcome, Sighting, EndReason, State, Attempt, Usage, Said, Denial, Input } from './domain.ts';
export { HARNESS_ARGS, TURN_ARGS, type HarnessArgs } from './harness-args.ts';
export type { McpServer, SpawnRequest, Transcript, TranscriptCursor, TranscriptEvent } from './runner.ts';
export type { FeedEntry, Cursor } from './journal.ts';
export type { IoCounts } from './io-tally.ts';
export type { RefusedMove, TaskView } from './engine.ts';
