/**
 * What a consumer of the engine without Effect writes and is given: its store in Promises, the harnesses it names, its
 * options, the task it files and the engine it gets — each adapted to the engine's services here, and what the door
 * refuses of them.
 */
import type { Event, Input, LifecycleStep, Said } from '../core/index.ts';
import type { HarnessArgs, RunnerOps, Transcript, TranscriptCursor } from '../harness/index.ts';
import {
  Journal,
  JournalError,
  ADMIT_INSTEAD,
  type Cursor,
  type FeedEntry,
  type FeedRefusal,
  type IoCounts,
  type RefusedMove,
  type TaskList,
  type TaskView,
} from '../core/engine/index.ts';
import {
  claudeOps,
  CLAUDE_CONTEXT_TOKENS,
  bridgeAsked,
  claudeBgRefuses,
  claudeCodeRefuses,
  claudeCodeOps,
} from '../harness/claude/index.ts';
import { detachedOps, type HarnessSpec } from '../harness/detached/detached.ts';
import { remoteConfigRefusal, remoteOps, remoteRefuses, type Credentials, type MissingCredential, type RemoteAgent } from '../a2a/index.ts';
import { promiseOps, wrap, type PromiseRunner } from './promise.ts';

/**
 * A store, in Promises. Implement this to keep the engine's records in your own database. Every `append` goes on the `feed`
 * too: a running engine reads a settled task's record again only once the feed names it (`Engine.tick`). A store answers `feed`
 * and has no `watch`: `Engine.watch` is built on `feed`.
 */
export type PromiseJournal = {
  append(taskId: string, event: Event): Promise<void>;
  read(taskId: string): Promise<Event[]>;
  list(): Promise<string[]>;
  feed(after?: Cursor): Promise<{ entries: FeedEntry[]; cursor: Cursor }>;
};

/**
 * A harness, as one of five things:
 *   `'claude'`      Claude Code as the engine runs it by default: each task a job (`claude -p`, detached by us), or a
 *                   background session (`claude --bg`, its registry Claude Code's) when its `config.background` is true
 *   `'claude-bg'`   Claude Code's own background sessions, every task — it keeps the registry
 *   a `HarnessSpec` any CLI that runs a prompt and exits — we keep the registry
 *   a `RemoteAgent` an A2A agent another party runs, by its URL or its card (`a2a/remote.ts`) — we keep the registry of
 *                   what we sent it; its secrets come from `credentials`
 *   a `PromiseRunner` anything else at all
 *
 * None is counted under a ceiling: the runtime starts what it is given, and a layer above that pools its harnesses under
 * one rate limit files them `queued` and `admit`s them. A harness brought as an object that names a `pool` is refused
 * (`createEngine`).
 */
export type HarnessConfig = 'claude' | 'claude-bg' | HarnessSpec | RemoteAgent | PromiseRunner;

/**
 * What `createEngine` builds an engine from. It takes no `maxConcurrent`: given, at any value, it is refused, since the runtime keeps
 * no ceiling and starts every task it is given; how many run at once is the layer above's, which files `queued` and `admit`s.
 */
export type EngineOptions = {
  /** Where the file-backed store lives. Ignored when you bring your own `journal`. */
  root?: string;
  journal?: PromiseJournal;
  harnesses?: Record<string, HarnessConfig>;
  defaultHarness?: string;
  /**
   * The secret for a remote agent's security scheme, asked on every request that needs one: `scheme` is the scheme's name on
   * the agent's card, `agentUrl` the agent's configured URL (for an agent given by its card, the URL of the interface it is
   * reached on), `harness` the name the agent is configured under. `undefined` when there is none, and a task on an agent
   * whose card asks for it is refused before anything is sent. A secret is sent as a header and written nowhere: not on the
   * task, the journal, the registry or the feed.
   */
  credentials?: Credentials;
  /**
   * What to do when `credentials` gives no secret for a scheme, in words: the end of the refusal a task on that agent is
   * refused with, `unstartable`. A caller that keeps its secrets somewhere of its own names the place — the variable to
   * set, say. Absent, the refusal says to give `createEngine` a `credentials` that answers for the scheme.
   */
  missingCredential?: MissingCredential;
};

/**
 * A task to file (`Engine.file`). It takes no `priority`: a task that carries one, at any value, is refused, since the runtime keeps
 * no slots to give first; which task starts first is the layer above's, when it `admit`s.
 */
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
  /**
   * Hold the task open when an attempt signs, rather than settle it: the task waits, phase `input-required` — A2A's
   * `TASK_STATE_INPUT_REQUIRED` — with no process running, until a person `answer`s it, which starts its next turn, or
   * `close`s it, which settles it. A turn is one attempt, under `deadlineSeconds` and a budget of its own, so a task may
   * wait on a person for as long as they take; a turn that does not end `done` settles the task `failed`. `stop` settles it `stopped`,
   * waiting or not. Refused unless `true`.
   */
  holdOpen?: true;
  /**
   * Wait for the word to start: the task is filed and a pass starts nothing of it until `admit` names it — then
   * the next pass starts it. A task held open waits for the word again before each later
   * turn. For a layer above that decides itself what runs when; `view` says `admission: 'queued'` while it waits, and its
   * phase stays `pending`. Absent, or `false`, starts it on the next pass. Refused unless true or false.
   */
  queued?: boolean;
  /** Choose the id yourself, to keep it in step with a row in your own database. */
  id?: string;
};

/**
 * One pass: how many tasks it read, how many actions it took, the sessions at work on each harness as it left them — its
 * last attempt open, and `working` or not yet listed; a `blocked` one is not — and the
 * view of every task it left unsettled — built off the pass's one observation of each harness and the fold it made, so a
 * layer above that decides what to `admit` reads the board without asking any harness again — and what the pass
 * cost, as facts: `ms`, its wall time, and `observed`, each harness's observes made during it (`ObserveCount`). Nothing decides on them.
 *
 * `refused` is every move the task's lifecycle had no edge for in this pass, off the same steps: the task, the state
 * it was in and the event it was handed. Such a task did nothing and will be asked again next pass, so a refusal that persists
 * is on every report until something changes; a layer above says it once (`wf up`). Empty on a healthy board, and a settled
 * task is never on it.
 *
 * `unreadable` says why each task whose journal did not read was left out of the pass, naming its file, the entry and the field —
 * on every report while it lasts, as a refusal is — and each feed entry no runtime wrote that the pass skipped, on the report of
 * the pass that met it. Every other task is moved all the same. Empty on a healthy board.
 */
export type TickReport = {
  tasks: number;
  actions: number;
  running: Record<string, number>;
  views: TaskView[];
  ms: number;
  observed: Record<string, ObserveCount>;
  refused: RefusedMove[];
  unreadable: string[];
};

/**
 * One harness's observes, counted: how many were made, their wall time in ms, the sessions or run files they listed, and the processes
 * started while they ran (`claude agents` for Claude Code's background sessions; none for a directory of run files). The harnesses of a
 * pass observe at once, so their `ms` can add up to more than the pass's, and a process another harness started in the same moment is
 * counted in both. `unread` is how many of the observes could not read all they were to: one that failed, or one that left an
 * expected name unread (`Observation`) — a harness that keeps failing shows there, where the pass waits on it rather than reading its
 * sessions gone.
 */
export type ObserveCount = { calls: number; ms: number; listed: number; spawned: number; unread: number };

/**
 * What this engine's reads and spawns have cost since the process started, as running totals: the runtime's own reads and spawns
 * (`IoCounts`, per process), and each harness's observes, whichever call made them — a pass, a `view`, a `transcript` (per engine). A
 * caller that wants one call's cost takes the difference before and after it.
 */
export type EngineIo = IoCounts & { observed: Record<string, ObserveCount> };

export type Engine = {
  /**
   * File work. Returns the task id. Nothing runs until a tick. A task that names no harness is filed on the default one
   * (`defaultHarness`, else the first configured), named on its record and its view, so a layer above that pools by harness
   * counts it with an identical task that named it.
   *
   * Refused — rejected with an `Error` whose `exitCode` is 2, and nothing journalled — when the task
   * names a harness this engine does not have; a `deadlineSeconds` that is not a number of seconds; a `maxAttempts` or a
   * `resume`, whatever its value, which are retired: the runtime makes one attempt per start; an empty brief, cwd or resumeFrom;
   * a `cwd` that is not absolute; a `priority`, whatever its value, which is retired: the runtime chooses no order. And in its `config`: a
   * key that is no harness argument, or one filed beside `config` instead — `budgetUsd` among them; a `budgetUsd` that is not dollars above
   * 0, or one its harness would not keep (`codex`); an empty model or effort; a `tools` that is not a list of names; a `disallowedTools` or
   * `allowedTools` that is not a list of permission rules; an `mcp` whose entries are not MCP servers in a `.mcp.json`'s shape; a word its
   * harness does not take (a permission mode or an effort — a `HarnessSpec`'s own `refuses`, or Claude Code's lists); a `contextTokens`
   * that is not a whole number of tokens its harness takes, or any on a harness with no context window to set (`codex`); a `remoteControl`
   * under `config` or beside it, which is Claude Code's flag and goes in `config.claude`, and a `claude.remoteControl` on a harness with no
   * such flag (any but one brought as `'claude-bg'` or a `PromiseRunner`, and one brought as `'claude'` in a task whose `background` is not
   * true); a `background` that is not true or false, or `true` on any harness not brought as `'claude'`; a `claude` on a `HarnessSpec`
   * without `claudeFlags`, which is not Claude Code; a `codex` that is not an object holding only `trustFrom`, an absolute path, or one on
   * any harness but a `HarnessSpec` with `codexArgs`, which is Codex; and, on `'claude'`, a
   * `budgetUsd` beside `background: true`, which `claude --bg` does not keep. A harness brought as a `PromiseRunner` is asked
   * nothing of its own.
   */
  file: (spec: TaskSpec) => Promise<string>;
  /**
   * One pass: start what may start — every task not queued, and each queued one `admit`ted — notice what ended, settle what
   * is over. Takes nothing: refused, an `Error` whose `exitCode` is 2 and nothing read, when handed any argument — a ceiling
   * or pools among them, which the runtime does not keep.
   *
   * An engine keeps, for as long as it lives, the settled tasks its passes have folded (`core/engine/memo.ts`): a pass reads the
   * feed on from where the last stopped, and reads the journal of a task only when it is not settled, the feed has named
   * it since, or this engine has never folded it — so an engine's first pass reads every journal and the whole feed, and
   * the passes after it read only what changed. A store (`PromiseJournal`) must therefore put every append on its feed.
   */
  tick: () => Promise<TickReport>;
  /**
   * Let tasks filed `queued` start: journals an `admitted` entry for each whose current turn waits for one, and
   * returns their ids; the next tick starts them. Reads the tasks' records and asks no
   * harness. Idempotent: a task already admitted, not filed queued, or whose turn has started is left as it is, and not
   * returned. Refused — rejected with an `Error` whose `exitCode` is 2, and nothing journalled for any of them — when one
   * is a task this engine has no record of, or has settled.
   */
  admit: (taskIds: readonly string[]) => Promise<string[]>;
  /**
   * One task, off one read of its journal. A settled task is read off its record, on every harness, and no registry is asked:
   * its phase is its outcome, and a sighting would give it nothing else but its session's id — `waitingFor` is only a
   * `needs-human` phase's, and `usage` only an attempt in flight's. Its session's id is the harness's own (`nativeId`) where it
   * can `find` one, found by name when the record lacks it, and otherwise the handle its harness reported when the attempt
   * ended: what the harness lists the session by and what its `logs` take (a detached runner's is the attempt's name, never
   * `nativeId`: a check's `logs` are its verdict). An attempt in flight is observed, as a pass observes: its phase is its
   * session's state, and only a registry has that. A task not settled with no attempt in flight is read off its record on a
   * harness that can `find`, and observed on one that cannot.
   *
   * Whatever is observed is observed on the task's own harness — the one `logs` and `transcript` ask — and no other, since no
   * other registry can name its session; a harness that can be told which sessions (`observeFor`) is told this task's own, so a
   * view of a Claude Code job lists the jobs and asks no `claude agents`. A registry that cannot be read this time is nothing
   * observed, as a pass reads it. A task on a harness this engine does not have is read off its record, and no harness is
   * asked. `usage` is the attempt in flight's; an ended attempt's is on `state.attempts`.
   */
  view: (taskId: string) => Promise<TaskView>;
  /**
   * The task's path through its lifecycle, replayed off its journal alone: for each entry, from its filing to now, the state the journal
   * says once the entry is on it, the entry's kind and its `at` (`LifecycleStep`). Writes nothing and asks no harness. A task this engine
   * has no record of has an empty path; a journal that does not read rejects with its `JournalError`.
   */
  path: (taskId: string) => Promise<LifecycleStep[]>;
  /**
   * Every task on the board, each journal read, over one observation of every harness. Given `taskIds`, those tasks alone, in that order
   * with no id twice: each journal read once, and every harness looked at once for the tasks among them in flight — told which sessions
   * where it can be, so Claude Code jobs cost a listing of their run files and no `claude agents` — and not at all when none is. A view of
   * a settled one is read off its record, as `view` reads it, but for a session id no record has, which `view` looks up and this does not.
   *
   * A task whose journal does not read — an entry no runtime wrote — is left out of `views` and named in `unreadable`, once, with why in
   * the words the pass says it with (`TickReport.unreadable`): every other task is answered all the same. Any other failure, a store that
   * cannot be listed or a harness that cannot be observed for `list()`, rejects the call.
   */
  list: (taskIds?: readonly string[]) => Promise<TaskList>;
  /** Ask a task to stop. Takes effect on the next tick, and confirms on the one after. */
  stop: (taskId: string) => Promise<void>;
  /**
   * What the task's session printed, asked of the task's own harness rather than of whichever listed the session this pass: a
   * session its harness has released is in no observation, and its transcript is still there to read. `(no session yet)`
   * before its harness names one.
   */
  logs: (taskId: string) => Promise<string>;
  /**
   * The conversation of the task's session — the one `logs` reads, asked of the task's own harness alone, since no other
   * registry can name it — as events from `after` on, and the `cursor` to ask again from. Pull-only: poll with the cursor
   * the last read returned; nothing is pushed. No session yet is no events, and the cursor asked with — or one from the
   * start — so a moment the registry could not be read costs a caller a poll, not a read from the start. The cursor of the
   * start is handed to no runner: the session is read from its start.
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
  transcript: (taskId: string, after?: TranscriptCursor) => Promise<Transcript>;
  /**
   * Tell the task's session something while it runs — `kubectl attach` with its audit line. `text` is handed, as
   * given, to the session of the attempt in flight through the task's own harness, and then journalled as a
   * `said` entry — `at`, `attempt`, `text` — which is returned, and which `view` carries as `state.said`.
   *
   * The words go before the entry: a `said` on the record is words a harness took, and a `say` that rejects has
   * journalled nothing. What the session makes of them is its own affair, and `decide` never reads them. Words
   * taken are not words read: a harness may still set them aside (Claude Code: its `crossSessionInbound`
   * setting, a rate limit, an identical repeat), and says nothing back when it does. A session its harness lists
   * `blocked` is told too, as a working one is, and reads the words only if it moves again: one waiting on a permission
   * prompt nobody answers keeps them queued, and a stopped or continued one has lost them. `claude agents` does not say
   * which wait a session is in, so neither is refused. A quiet session is `working` too: its runner reports how long it
   * has been quiet, not an end, and an idle session's inbox starts a turn.
   *
   * Refused — rejected with an `Error` whose `exitCode` is 2, and nothing sent or journalled — in this order, what the
   * record says before what the harness says, so a settled task's harness is not asked: an empty `text`; a task this
   * engine has no record of; a harness with no channel into a running session (a `HarnessSpec`, in its own words, or a
   * `PromiseRunner` without `say`); what the harness cannot carry (Claude Code's background session: a task in
   * `bypassPermissions`, or words longer than its inbox reads), asked of a task whose config makes it one; a task that
   * has settled, or has been asked to stop; one with no attempt in flight; then, off its harness, an attempt its harness
   * does not list; what a background session cannot carry, asked again of a session on `claude` that is no job (one an older
   * runtime started `--bg` without `background` in its config); a session its harness lists ended; and a task on a remote A2A agent whose
   * Task is at work, since A2A lets its caller speak only once the Task asks for input. A registry that cannot be read
   * this time — on `claude`, a session Claude Code has registered that its listing does not show — or words the
   * harness did not take, reject with the harness's error and no `exitCode`: ask again.
   *
   * A Claude Code job (`claude -p`) is told on its stdin: the words go to an inbox its worker writes on as the
   * next user message, which the job takes into the turn it is working. Once it has given its result its input
   * is closed, and words said then are not taken — a rejection with no `exitCode`, since the job is still
   * `working` until it exits, and its record settles on the next tick. Words said in the half second before its
   * result are taken and may never be read.
   */
  say: (taskId: string, text: string) => Promise<Said>;
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
  answer: (taskId: string, text: string, options?: { config?: HarnessArgs }) => Promise<Input>;
  /**
   * Settle a task held open that waits for an answer: journalled as a `closed` entry, and settled `succeeded`, note
   * `closed`, by the next tick. Refused — an `Error` whose `exitCode` is 2, nothing journalled — as `answer` is, for a task
   * that is not waiting for one. To end one that is running, `stop` it.
   */
  close: (taskId: string) => Promise<void>;
  /**
   * Everything that has happened since `after`, and where to resume. An entry no runtime wrote is skipped, the cursor past it, and
   * said on `refused` (`FeedRefusal`), so it is met by one read and stops no reader.
   */
  feed: (after?: Cursor) => Promise<{ entries: FeedEntry[]; cursor: Cursor; refused?: FeedRefusal[] }>;
  /**
   * Watch everything that happens, as it happens — the engine's event-driven surface.
   *
   * A consumer reacts to work finishing without polling a task or knowing what a tick is. Pushed
   * by the store when it can signal (the file store watches the feed), and backed by a timer so
   * that a store which cannot signal — or an OS that drops the event — costs latency rather than
   * correctness. Delivery is in order and at-least-once; the cursor never expires, so starting at
   * 0 replays the whole history first. An entry no runtime wrote is skipped, and said to `onError` as an `Error` naming it.
   *
   * One read of the feed runs at a time, so a push and a tick of the timer that arrive together never deliver an entry twice
   * or out of order. The timer holds the process open until `stop()`, whatever the store: only the file store pushes
   * (`subscribe`), and a store a consumer brings, which cannot, is watched all the same.
   */
  watch: (options: {
    onEntry: (entry: FeedEntry) => void | Promise<void>;
    from?: Cursor;
    intervalMs?: number;
    onError?: (e: unknown) => void;
  }) => { stop: () => void };
  /** What this engine's reads, spawns and observes have cost so far (`EngineIo`): running totals, read by nothing in the engine. */
  io: () => EngineIo;
  /**
   * Tick on a timer until stopped. Ticks never overlap: a beat that comes while a tick runs is skipped, so a tick that
   * outruns the interval is not joined by a second pass over the same board. The timer holds the process open, as a control
   * loop must: `stop()` gives the process back.
   */
  start: (options?: { intervalMs?: number; onTick?: (r: TickReport) => void; onError?: (e: unknown) => void }) => { stop: () => void };
};

/** A store in Promises as the engine's `Journal`: each rejection a `JournalError`, on the task it was asked of, or `*`. */
export const journalOf = (j: PromiseJournal) =>
  Journal.layer({
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

/**
 * The session an attempt ended as, as its harness named it then (the `ended` entry's `sessionId`, the sighting's): what an
 * observe would have listed it by. Undefined for an attempt no harness ever named, whose end says so in parentheses.
 */
export const handleOf = (events: readonly Event[], attempt: number): string | undefined => {
  const end = [...events].reverse().find((e) => e.kind === 'ended' && e.attempt === attempt);
  return end?.kind === 'ended' && !['(never seen)', '(never started)'].includes(end.sessionId) ? end.sessionId : undefined;
};

export const isSpec = (h: HarnessConfig): h is HarnessSpec => typeof h === 'object' && 'command' in h;
/** A remote A2A agent: an object that is neither a spec (`command`) nor a runner (`spawn`). */
export const isRemote = (h: HarnessConfig): h is RemoteAgent => typeof h === 'object' && h !== null && !('command' in h) && !('spawn' in h);
/** Claude Code as the engine runs it itself, in either of the two ways it is brought. */
export const isClaude = (h: HarnessConfig): h is 'claude' | 'claude-bg' => h === 'claude' || h === 'claude-bg';

/** Each configured harness as the seam's value, by name: composed into one `Runner`, and asked directly for a task's logs. */
export const runnersOf = (
  harnesses: Record<string, HarnessConfig>,
  root: string,
  credentials?: Credentials,
  missingCredential?: MissingCredential,
): Record<string, RunnerOps> =>
  Object.fromEntries(
    Object.entries(harnesses).map(([name, h]): [string, RunnerOps] => [
      name,
      h === 'claude'
        ? claudeCodeOps({ root })
        : h === 'claude-bg'
          ? claudeOps({ root })
          : isSpec(h)
            ? detachedOps(h, root)
            : isRemote(h)
              ? remoteOps(name, h, root, credentials, undefined, { missingCredential })
              : promiseOps(h),
    ]),
  );

/**
 * Why an engine cannot be built from these options, in a sentence that says what to do instead — or `undefined`. Asked of the
 * options as handed in, untyped, and refuses, in this order: a `maxConcurrent` at any value, and a harness brought as an object
 * that names a `pool` — each, taken and dropped, a ceiling nobody keeps; a remote agent's entry `remoteConfigRefusal` refuses;
 * and a `credentials` or `missingCredential` that is not a function.
 */
export const optionsRefusalOf = (options: EngineOptions): string | undefined => {
  if (Object.hasOwn(options, 'maxConcurrent')) {
    return `\`maxConcurrent\` is retired: the runtime keeps no ceiling, and starts every task it is given. ${ADMIT_INSTEAD}`;
  }
  for (const [name, h] of Object.entries(options.harnesses ?? {})) {
    if (typeof h === 'object' && h !== null && Object.hasOwn(h, 'pool')) {
      return `the \`${name}\` harness names a \`pool\`, which is retired: the runtime counts no pools. Take \`pool\` off it; a layer above that pools harnesses under one rate limit keeps its own list (the orchestrator's \`POOLS\` in \`src/cap/cap.ts\`). ${ADMIT_INSTEAD}`;
    }
    const remote = typeof h === 'object' && h !== null && isRemote(h) ? remoteConfigRefusal(name, h) : undefined;
    if (remote) return remote;
  }
  if (options.credentials !== undefined && typeof options.credentials !== 'function') {
    return '`credentials` is a function, `(scheme, agentUrl, harness) => secret | undefined`: give one, or leave it out.';
  }
  if (options.missingCredential !== undefined && typeof options.missingCredential !== 'function') {
    return '`missingCredential` is a function, `(scheme, agentUrl, harness) => words`: give one, or leave it out.';
  }
  return undefined;
};

/**
 * Why a task cannot be filed on its harness, in that harness's words — or `undefined`. Asked after `refusalOf`, the
 * half every door refuses (`filing.ts`), whose type checks the ranges here rest on.
 *
 * Checked at the API, not only at the CLI: a word the harness rejects would fail its spawn, and with it the whole tick. Which
 * words a harness takes is asked of the harness; the engine never learns them, and the Effect door, which has no harnesses to
 * ask, refuses none of them. Refuses, in this order:
 *
 * 1. a harness this engine does not have;
 * 2. `background: true` on any harness but one brought as `'claude'`, the one mode of the engine's own Claude Code: dropped
 *    without a word, a task that asked for a session a person can reach would run as whatever the harness runs;
 * 3. a `contextTokens` on Claude Code or a `HarnessSpec` that has no window to set, or one outside the harness's range: a
 *    window the harness has no knob for would be dropped without a word, and Claude Code refuses one outside its range while
 *    it parses its arguments, at every spawn;
 * 4. a `claude.remoteControl` on a `HarnessSpec`: only Claude Code's background sessions are bridged, and a spec's harness
 *    runs a prompt and exits — `claude -p` among them, whose help offers Remote Control only to an interactive session;
 * 5. a `claude` on a `HarnessSpec` without `claudeFlags`: its session would start without them, and a body meant for the
 *    system prompt would be read by nobody;
 * 6. a `codex` on any harness but a `HarnessSpec` with `codexArgs` (`codexArgsMisplaced`): its session would start without
 *    the trust it names;
 * 7. what the harness's own `refuses` refuses: Claude Code's lists, a spec's, or a remote agent's (`remoteRefuses`).
 *
 * A `PromiseRunner` is the consumer's own: it is handed a `contextTokens`, a `claude.remoteControl`, a `claude` and a
 * `codex`, and asked nothing of its own.
 */
export const harnessRefusalOf = (spec: TaskSpec & { harness: string }, harnesses: Record<string, HarnessConfig>): string | undefined => {
  if (!Object.hasOwn(harnesses, spec.harness)) {
    return `\`harness: ${spec.harness}\` is not a harness this engine has. Its harnesses are: ${Object.keys(harnesses).join(', ')}.`;
  }
  const h = harnesses[spec.harness];
  const { contextTokens, background } = spec.config ?? {};
  if (background && h !== 'claude') {
    const modal = Object.keys(harnesses)
      .filter((name) => harnesses[name] === 'claude')
      .map((name) => `\`${name}\``);
    return `\`background: true\` asks for a Claude Code background session, and the \`${spec.harness}\` harness has no such mode${h === 'claude-bg' ? ': every session of it is one already. Leave `background` off' : `. ${modal.length ? `File the task on ${modal.join(' or ')}, or leave \`background\` off` : "Leave `background` off: none of this engine's harnesses has the mode"}`}.`;
  }
  if (contextTokens !== undefined && (isClaude(h) || isSpec(h))) {
    const range = isClaude(h) ? CLAUDE_CONTEXT_TOKENS : h.contextTokens;
    if (!range) {
      const windowed = Object.keys(harnesses)
        .filter((name) => {
          const o = harnesses[name];
          return isClaude(o) || (isSpec(o) && o.contextTokens);
        })
        .map((name) => `\`${name}\``);
      return `\`contextTokens: ${contextTokens}\` sets the session's context window, and the \`${spec.harness}\` harness has no such knob: it would run on its own window, whatever the task says. ${windowed.length ? `File the task on ${windowed.join(' or ')}, whose sessions compact past it, or leave \`contextTokens\` off.` : "Leave `contextTokens` off: none of this engine's harnesses sets a session's window."}`;
    }
    if (contextTokens < range.least || contextTokens > range.most) {
      return `\`contextTokens: ${contextTokens}\` is outside the windows the \`${spec.harness}\` harness takes, and it would refuse the session at every spawn. Give a whole number of tokens from ${range.least} to ${range.most}, or leave it out for the harness's own window.`;
    }
  }
  if (bridgeAsked(spec) && isSpec(h)) {
    const bridged = Object.keys(harnesses)
      .filter((name) => isClaude(harnesses[name]))
      .map((name) => (harnesses[name] === 'claude' ? `\`${name}\` with \`config.background: true\`` : `\`${name}\``));
    return `\`claude.remoteControl\` asks for a session bridged to claude.ai, and the \`${spec.harness}\` harness has no such flag: it runs a prompt and exits, and only a Claude Code background session (\`claude --bg --remote-control\`) is bridged. ${bridged.length ? `File the task on ${bridged.join(' or ')}, or leave \`claude.remoteControl\` off.` : "Leave `claude.remoteControl` off: none of this engine's harnesses bridges a session."}`;
  }
  if (spec.config?.claude !== undefined && isSpec(h) && !h.claudeFlags) {
    const takers = Object.keys(harnesses)
      .filter((name) => {
        const o = harnesses[name];
        return isClaude(o) || (isSpec(o) && o.claudeFlags);
      })
      .map((name) => `\`${name}\``);
    return `\`claude\` gives Claude Code flags of its own, and the \`${spec.harness}\` harness is not Claude Code: its session would start without them. ${takers.length ? `File the task on ${takers.join(' or ')}, or leave \`claude\` off.` : "Leave `claude` off: none of this engine's harnesses is Claude Code."}`;
  }
  return codexArgsMisplaced(spec, harnesses) ?? ownRefuses(h, spec.harness)?.(spec);
};

/** What a harness refuses in its own words: Claude Code's lists, a spec's `refuses`, a remote agent's; a `PromiseRunner`, nothing. */
const ownRefuses = (h: HarnessConfig, name: string): ((task: TaskSpec) => string | undefined) | undefined =>
  h === 'claude'
    ? claudeCodeRefuses
    : h === 'claude-bg'
      ? claudeBgRefuses
      : isSpec(h)
        ? h.refuses
        : isRemote(h)
          ? remoteRefuses(name)
          : undefined;

/**
 * Why a task's `config.codex` cannot go to its harness — or `undefined`: Codex's arguments on a harness that is not Codex,
 * Claude Code or a remote agent or a `HarnessSpec` without `codexArgs`, which would start its session without them. The
 * refusal names the harnesses of this engine that take them. A `PromiseRunner` is the consumer's own, and asked nothing.
 */
const codexArgsMisplaced = (spec: TaskSpec & { harness: string }, harnesses: Record<string, HarnessConfig>): string | undefined => {
  const isCodex = (o: HarnessConfig) => isSpec(o) && o.codexArgs === true;
  const h = harnesses[spec.harness];
  const ownRunner = !(isClaude(h) || isSpec(h) || isRemote(h));
  if (spec.config?.codex === undefined || ownRunner || isCodex(h)) return undefined;
  const takers = Object.keys(harnesses)
    .filter((name) => isCodex(harnesses[name]))
    .map((name) => `\`${name}\``);
  return `\`codex\` gives Codex arguments of its own, and the \`${spec.harness}\` harness is not Codex: its session would start without them. ${takers.length ? `File the task on ${takers.join(' or ')}, or leave \`codex\` off.` : "Leave `codex` off: none of this engine's harnesses is Codex."}`;
};
