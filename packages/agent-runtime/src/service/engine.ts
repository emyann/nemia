/**
 * The engine as an Effect service: `Engine`, built by `Engine.layer(options)` over the harnesses, the store and the memo, whose verbs
 * are Effects with typed errors.
 */
import { Context, Effect, Exit, Fiber, Layer, Schema, type Scope, type Stream } from 'effect';
import path from 'node:path';
import os from 'node:os';
import { fold, nameFor, pathOf, type Input, type LifecycleStep, type Said, type Sighting, type State } from '../core/index.ts';
import {
  argsRefusalOf,
  Runner,
  RunnerError,
  isTranscriptCursor,
  noTranscript,
  composite,
  type ExpectedSession,
  type Followed,
  type HarnessArgs,
  type Observation,
  type HarnessQuota,
  type RunnerOps,
  type Transcript,
  type TranscriptCursor,
} from '../harness/index.ts';
import {
  Journal,
  JournalError,
  FileRefused,
  TickRefused,
  AdmitRefused,
  InputRefused,
  StopRefused,
  countsHere,
  ioCounts,
  noCounts,
  tallied,
  talliesHere,
  tickMemoLayer,
  admit,
  answer,
  answerRefusalOf,
  close,
  file,
  filingOf,
  refusalOf,
  requestStop,
  everyView,
  tick,
  tickRefusalOf,
  viewOfState,
  viewsOf,
  type Cursor,
  type FeedEntry,
  type FeedRefusal,
  type SweepReport,
  type TaskList,
  type TaskView,
  BodyRefused,
} from '../core/engine/index.ts';
import { OutputRefused, outputVerbOf } from './output.ts';
import { followVerbOf, type FollowRefused } from './follow.ts';
import { DEFAULT_HARNESSES } from './harnesses.ts';
import { a2aOps, type SeamOps } from '../a2a/index.ts';
import { bodyVerbsOf } from './bodies.ts';
import type { ForgetFailure, ForgetReport } from './forget.ts';
import { keepingVerbsOf, type KeptRefused, type KeptReport } from './kept.ts';
import type { CompactRefused, CompactReport } from './compact.ts';
import { watchOf } from './watch.ts';
import { sayVerbOf, type SayRefused, type SayUnsent } from './say.ts';
import { interruptVerbOf, type Interrupted, type InterruptRefused, type InterruptUnsent } from './interrupt.ts';
import {
  handleOf,
  isSpec,
  isRemote,
  isClaude,
  runnersOf,
  optionsRefusalOf,
  admissionOf,
  type EngineIo,
  type EngineOptions,
  type HarnessConfig,
  type ObserveCount,
  type TaskSpec,
  type TickReport,
} from './options.ts';
import { harnessRefusalOf } from './harness-refusal.ts';
import { traceparentOf } from '../harness/telemetry.ts';
import { attachedSessions, putDrain, liftDrain, type Attached } from '../harness/claude/index.ts';

/** Options an engine cannot be built from (`optionsRefusalOf`), and why. Nothing was built. */
export class EngineRefused extends Schema.TaggedError<EngineRefused>()('EngineRefused', {
  message: Schema.String,
}) {}

/** A `list` handed something other than task ids, or more than one argument, and why. Nothing was read. */
export class ListRefused extends Schema.TaggedError<ListRefused>()('ListRefused', {
  message: Schema.String,
}) {}

/** A transcript this engine will not read, and why: a task it has no record of, a harness that keeps none, a cursor no read gave. */
export class TranscriptRefused extends Schema.TaggedError<TranscriptRefused>()('TranscriptRefused', {
  message: Schema.String,
}) {}

/**
 * A quota this engine will not ask, and why: an argument that is no harness's name, a harness this engine does not have, or one that
 * reports no quota. Nothing was asked.
 */
export class QuotaRefused extends Schema.TaggedError<QuotaRefused>()('QuotaRefused', {
  message: Schema.String,
}) {}

/**
 * Why a transcript read refuses the attempt it names, or `undefined` where it names none or one the task has: `attempt` a whole number
 * among `attempts`' `n`.
 */
export const attemptRefusal = (attempts: readonly { readonly n: number }[], attempt: unknown): string | undefined => {
  if (attempt === undefined || attempts.some((a) => a.n === attempt)) return undefined;
  const has = attempts.length ? `its attempts are ${attempts.map((a) => a.n).join(', ')}` : 'it has no attempt yet';
  return `\`attempt: ${JSON.stringify(attempt)}\` is no attempt of this task: ${has}. Name one of them, or none to read the latest.`;
};

/** The cursor a transcript read from the start is handed, and whether a cursor is one a read of the engine's readers could give. */
export const TRANSCRIPT_START: TranscriptCursor = noTranscript().cursor;
export { isTranscriptCursor };

/** What a transcript read names of a task's attempts (`TranscriptRefused` naming those it has where it names none of them). */
type Asked = { readonly attempt?: number };

/** The attempt a transcript read names, the latest where it names none, or none where the task has none; refused as `attemptRefusal`. */
const attemptAsked = <A extends { readonly n: number }>(attempts: readonly A[], attempt: number | undefined) => {
  const refused = attemptRefusal(attempts, attempt);
  if (refused !== undefined) return Effect.fail(new TranscriptRefused({ message: refused }));
  return Effect.succeed(attempt === undefined ? attempts.at(-1) : attempts.find((a) => a.n === attempt));
};

/** A drain this engine will not put, and why: a holder that is no process id. Nothing was written. */
export class DrainRefused extends Schema.TaggedError<DrainRefused>()('DrainRefused', {
  message: Schema.String,
}) {}

/** Why `drain` refuses its holder, or `undefined` for a process id or null. */
export const drainRefusalOf = (holder: unknown): string | undefined =>
  holder === null || (Number.isInteger(holder) && (holder as number) > 0)
    ? undefined
    : `takes the process id of the engine that holds the attached sessions, a whole number from 1, or null to let their calls go; it was handed ${JSON.stringify(holder) ?? 'nothing'}.`;

/** Why `list` refuses what it was handed, or `undefined` for nothing or one list of task ids. */
export const listRefusalOf = (args: readonly unknown[]): string | undefined => {
  const [taskIds] = args;
  return args.length > 1 || (taskIds !== undefined && (!Array.isArray(taskIds) || !taskIds.every((id) => typeof id === 'string')))
    ? `takes the task ids to view, a list of strings, or nothing for every task; it was handed ${args.map((a) => JSON.stringify(a)).join(', ')}.`
    : undefined;
};

/**
 * The engine's verbs, each an Effect with what refuses it on its error channel, a tagged error whose message says what to do
 * instead: `FileRefused`, `TickRefused`, `AdmitRefused`, `ListRefused`, `TranscriptRefused`, `OutputRefused`, `FollowRefused`,
 * `SayRefused`, `QuotaRefused`, `StopRefused` for `stop`, `InputRefused` for `answer` and `close`, `BodyRefused` for `sweep` and
 * `removeBody`, `ForgetRefused` for `forget`, `KeptRefused` for `kept`, `CompactRefused` for `compact`, and `DrainRefused` for `drain`.
 * `SayUnsent` is `say`'s failure that is not a refusal; a `JournalError` or a `RunnerError` is the store's or the harness's.
 * `refusalWords(verb)` words a refusal as `ae` says it.
 * `watch`, `io` and `start` succeed at once: `watch` and `start` with a handle that stops them.
 */
export type EngineShape = {
  /**
   * File work. Returns the task id. Nothing runs until a tick. A task that names no harness is filed on the default one
   * (`defaultHarness`, else the first configured), named on its record and its view, so a layer above that pools by harness
   * counts it with an identical task that named it.
   *
   * Refused — `FileRefused`, and nothing journalled — when the task
   * names a harness this engine does not have; a `deadlineSeconds` that is not a number of seconds; a `maxAttempts` or a
   * `resume`, whatever its value, which are retired: the runtime makes one attempt per start; an empty brief, cwd or resumeFrom;
   * a `cwd` that is not absolute; a `priority` that is not a whole number in int32. And in its `config`: a
   * key that is no harness argument, or one filed beside `config` instead — `budgetUsd` among them; a `budgetUsd` that is not dollars above
   * 0, or one its harness would not keep (`codex`); an empty model or effort; a `tools` that is not a list of names; a `disallowedTools` or
   * `allowedTools` that is not a list of permission rules; an `mcp` whose entries are not MCP servers in a `.mcp.json`'s shape; a word its
   * harness does not take (a permission mode or an effort — a `HarnessSpec`'s own `refuses`, or Claude Code's lists); a `contextTokens`
   * that is not a whole number of tokens its harness takes, or any on a harness with no context window to set (`codex`); a `remoteControl`
   * under `config` or beside it, which is Claude Code's flag and goes in `config.claude`, and a `claude.remoteControl` on a harness with no
   * such flag (any but one brought as `'claude-bg'` or a `RunnerOps`, and one brought as `'claude'` in a task whose `background` is not
   * true); a `background` that is not true or false, or `true` on any harness not brought as `'claude'`; a `claude` on a `HarnessSpec`
   * without `claudeFlags`, which is not Claude Code; a `codex` that is not an object holding only `trustFrom`, an absolute path, or one on
   * any harness but a `HarnessSpec` with `codexArgs`, which is Codex; and, on `'claude'`, a
   * `budgetUsd` beside `background: true`, which `claude --bg` does not keep. A harness brought as a `RunnerOps` is asked
   * only its own `refuses`.
   */
  readonly file: (spec: TaskSpec) => Effect.Effect<string, FileRefused | JournalError>;
  /**
   * One pass: start what may start — every task not queued, and each queued one admitted — notice what ended, settle what
   * is over, and admit the queued tasks the ceiling has room for (`maxConcurrent`), which the next pass starts. Takes nothing:
   * refused with `TickRefused`, nothing read, when handed any argument — a ceiling or pools among them, which
   * are the engine's options.
   *
   * An engine keeps, for as long as it lives, the settled tasks its passes have folded (`core/engine/memo.ts`): a pass reads the
   * feed on from where the last stopped, and reads the journal of a task only when it is not settled, the feed has named
   * it since, or this engine has never folded it — so an engine's first pass reads every journal and the whole feed, and
   * the passes after it read only what changed. A store (`StoreOps`) must therefore put every append on its feed.
   */
  readonly tick: () => Effect.Effect<TickReport, TickRefused | JournalError | RunnerError>;
  /**
   * Let tasks filed `queued` start: journals an `admitted` entry for each whose current turn waits for one, and
   * returns their ids; the next tick starts them. Reads the tasks' records and asks no
   * harness. Idempotent: a task already admitted, not filed queued, or whose turn has started is left as it is, and not
   * returned. Refused — `AdmitRefused`, and nothing journalled for any of them — when one
   * is a task this engine has no record of, or has settled.
   */
  readonly admit: (taskIds: readonly string[]) => Effect.Effect<string[], AdmitRefused | JournalError>;
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
  readonly view: (taskId: string) => Effect.Effect<TaskView, JournalError>;
  /**
   * The task's path through its lifecycle, replayed off its journal alone: for each entry, from its filing to now, the state the journal
   * says once the entry is on it, the entry's kind and its `at` (`LifecycleStep`). Writes nothing and asks no harness. A task this engine
   * has no record of has an empty path; a journal that does not read fails with its `JournalError`.
   */
  readonly path: (taskId: string) => Effect.Effect<LifecycleStep[], JournalError>;
  /**
   * Every task on the board, each journal read, over one observation of every harness. Given `taskIds`, those tasks alone, in that order
   * with no id twice: each journal read once, and every harness looked at once for the tasks among them in flight — told which sessions
   * where it can be, so Claude Code jobs cost a listing of their run files and no `claude agents` — and not at all when none is. A view of
   * a settled one is read off its record, as `view` reads it, but for a session id no record has, which `view` looks up and this does not.
   *
   * A task whose journal does not read — an entry no runtime wrote — is left out of `views` and named in `unreadable`, once, with why in
   * the words the pass says it with (`TickReport.unreadable`): every other task is answered all the same. Any other failure, a store that
   * cannot be listed or a harness that cannot be observed for `list()`, fails the call. Handed anything but a list of task ids, or
   * more than one argument, it is refused with `ListRefused`, nothing read.
   */
  readonly list: (taskIds?: readonly string[]) => Effect.Effect<TaskList, ListRefused | JournalError | RunnerError>;
  /**
   * Ask a task to stop. Takes effect on the next tick, and confirms on the one after. Refused — `StopRefused`, and nothing
   * journalled — for a task this engine has no record of, one that has settled, and one asked to stop already.
   */
  readonly stop: (taskId: string) => Effect.Effect<void, StopRefused | JournalError>;
  /**
   * What the task's session printed, asked of the task's own harness rather than of whichever listed the session this pass: a
   * session its harness has released is in no observation, and its transcript is still there to read. `(no session yet)`
   * before its harness names one.
   */
  readonly logs: (taskId: string) => Effect.Effect<string, JournalError | RunnerError>;
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
   * Refused — `TranscriptRefused` — for a task this engine has no record of;
   * a harness that keeps no conversation this engine can read (a `HarnessSpec` or a `RunnerOps`
   * without `transcript`); and, for the engine's own readers (`claude`, `claude-bg` and a `HarnessSpec`), an
   * `after` that none of them gave. A brought runner's cursor is its own, and passed through.
   *
   * `options.attempt` names an earlier attempt to read, by its `n` — `kubectl logs --previous` — and the latest is read where it names
   * none; refused for a number that is no attempt the task has, naming those it has.
   */
  readonly transcript: (
    taskId: string,
    after?: TranscriptCursor,
    options?: { readonly attempt?: number },
  ) => Effect.Effect<Transcript, TranscriptRefused | JournalError | RunnerError>;
  /**
   * One stream of the task's latest attempt, `stdout` or `stderr`, as its harness kept it whole, or its last `lastBytes` bytes:
   * read from that stream alone, never the log both are mixed in. `undefined` before an attempt, or when the harness kept none
   * for it. Observes nothing. Refused — `OutputRefused` — for a `stream` that is neither, a
   * `lastBytes` that is not a positive whole number, a task this engine has no record of, and a harness that keeps no whole
   * streams (any but a `HarnessSpec` with `streams`, or a `RunnerOps` with `output`).
   */
  readonly output: (
    taskId: string,
    stream: 'stdout' | 'stderr',
    lastBytes?: number,
  ) => Effect.Effect<string | undefined, OutputRefused | JournalError | RunnerError>;
  /**
   * The session of the task's latest attempt followed live, as its harness says it: the session's state first, then each moment once
   * and in order — a piece of the text being written (`partial`), the transcript's whole events with the cursor after them, a state
   * changed — until the session is over. What was written before the follow is read by `transcript`. `undefined` before an attempt.
   * Observes nothing; the stream fails as a `RunnerError` where the harness refuses this session (one ended, `refused`) or cannot
   * read it. Refused — `FollowRefused` — for a task this engine has no record of, and a harness that does not stream (a `RunnerOps`
   * without `follow`).
   */
  readonly follow: (taskId: string) => Effect.Effect<Stream.Stream<Followed, RunnerError> | undefined, FollowRefused | JournalError>;
  /**
   * Tell the task's session something while it runs — `kubectl attach` with its audit line. `text` is handed, as
   * given, to the session of the attempt in flight through the task's own harness, and then journalled as a
   * `said` entry — `at`, `attempt`, `text`, `after` — which is returned, and which `view` carries as `state.said`. `after` is
   * the last event the session's transcript held, read before the words go (`transcriptEndOf`): what the session writes of
   * them comes after it in its transcript, whatever either clock reads.
   *
   * The words go before the entry: a `said` on the record is words a harness took, and a `say` that fails has
   * journalled nothing. What the session makes of them is its own affair, and `decide` never reads them. Words
   * taken are not words read: a harness may still set them aside (Claude Code: its `crossSessionInbound`
   * setting, a rate limit, an identical repeat), and says nothing back when it does. A session its harness lists
   * `blocked` is told too, as a working one is, and reads the words only if it moves again: one waiting on a permission
   * prompt nobody answers keeps them queued, and a stopped or continued one has lost them. `claude agents` does not say
   * which wait a session is in, so neither is refused. A quiet session is `working` too: its runner reports how long it
   * has been quiet, not an end, and an idle session's inbox starts a turn.
   *
   * Refused — `SayRefused`, and nothing sent or journalled — in this order, what the
   * record says before what the harness says, so a settled task's harness is not asked: an empty `text`; a task this
   * engine has no record of; a harness with no channel into a running session (a `HarnessSpec`, in its own words, or a
   * `RunnerOps` without `say`); what the harness cannot carry (Claude Code's background session: a task in
   * `bypassPermissions`, or words longer than its inbox reads), asked of a task whose config makes it one; a task that
   * has settled, or has been asked to stop; one with no attempt in flight; then, off its harness, an attempt its harness
   * does not list; what a background session cannot carry, asked again of a session on `claude` that is no job (one an older
   * runtime started `--bg` without `background` in its config); a session its harness lists ended; and a task on a remote A2A agent whose
   * Task is at work, since A2A lets its caller speak only once the Task asks for input. A registry that cannot be read
   * this time — on `claude`, a session Claude Code has registered that its listing does not show — or words the
   * harness did not take, fail with `SayUnsent`, its `cause` what failed: ask again.
   *
   * A Claude Code job (`claude -p`) is told on its stdin: the words go to an inbox its worker writes on as the
   * next user message, which the job takes into the turn it is working. Once it has given its result its input
   * is closed, and words said then are not taken — a `SayUnsent`, since the job is still
   * `working` until it exits, and its record settles on the next tick. Words said in the half second before its
   * result are taken and may never be read.
   */
  readonly say: (taskId: string, text: string) => Effect.Effect<Said, SayRefused | SayUnsent | JournalError>;
  /**
   * End the turn the task's session is in, and leave the session open — `kubectl exec` of an escape key, not a kill. The running turn
   * stops where it is, its own result closes it keeping what it wrote, and the session answers the next words said to it under the
   * same id. Answers when it was asked, and of which attempt (`Interrupted`).
   *
   * Journals nothing, and is no lifecycle verb: no entry of it is on the record, and the next pass reads the session's state as it
   * reads any other, so an interrupt asked twice ends one turn and refuses the second. What the session makes of being cut is its own
   * affair: nothing of ours is said to it.
   *
   * Refused — `InterruptRefused`, and nothing sent — in this order, what the record says before what the harness says: a task this
   * engine has no record of; a harness that cannot end a turn without ending its session (every harness but Claude Code attached on
   * the Agent SDK); a task that has settled, or has been asked to stop; one with no attempt in flight; then, off its harness, an
   * attempt its harness does not list; a session its harness lists ended; and a long-lived session open and waiting for its next
   * words, which has no turn in it (`idleOf`). A harness that could not be read, or that did not take the request, fails with
   * `InterruptUnsent`, its `cause` what failed: ask again.
   */
  readonly interrupt: (taskId: string) => Effect.Effect<Interrupted, InterruptRefused | InterruptUnsent | JournalError>;
  /**
   * What a harness's subscription has left (`HarnessQuota`), asked of `harness`, or of the default harness when none is named: the
   * plan's limits, each with its use and its reset, or why there are none. Claude Code answers it, as `claude` and as `claude-bg`, by
   * starting the `claude` on PATH with its `get_usage` request: no prompt, no model called. Every way the ask goes is an answer —
   * no `claude` on PATH is `missing`, one that ends or does not answer in time is `failed` or `timeout` — never a failure.
   *
   * Each call is one ask: nothing is kept, so a caller that reads often keeps the answer itself, since the usage endpoint behind
   * Claude Code's answer is reported to refuse an account that asks in bursts. No session is touched, and nothing is journalled.
   *
   * Refused — `QuotaRefused` — in this order: an argument that is not one harness's name; a harness this
   * engine does not have, naming the ones it has; and one that reports no quota (`codex`, a `HarnessSpec`, a remote A2A agent, a
   * runner without `quota`), naming the ones that do.
   */
  readonly quota: (harness?: string) => Effect.Effect<HarnessQuota, QuotaRefused | RunnerError>;
  /**
   * Answer a task held open (`holdOpen`) that waits for one — phase `input-required`. Journalled as an `input` entry — `at`,
   * `text`, and `config` if given — which is returned, and which `view` carries as `state.inputs`. The next tick starts
   * the task's next turn: an attempt that continues the session that signed (`--resume`), told `text` in place of the
   * brief, with `config` laid over the task's own if given. A turn gives its own spend cap and nothing else
   * (`config: { budgetUsd }`, `TURN_ARGS`): the rest of its configuration is the session's it continues. Nothing is
   * sent to any session: none is running.
   *
   * Refused — `InputRefused`, and nothing journalled — for an empty `text`; a `config`
   * with any key but `budgetUsd`, or a `budgetUsd` that is not dollars above 0, or one its harness would not keep (as
   * `file` refuses one); a `budgetUsd` given beside `config` rather than in it, naming where it goes; a task this engine has no
   * record of; one not filed to be held open; one settled, closed or asked to stop; and one not waiting — an attempt
   * running (`say` reaches it), between attempts, not started, or answered already and its next turn not yet begun.
   * Two answers journalled before the next turn begins are told to it both, in order.
   */
  readonly answer: (taskId: string, text: string, options?: { config?: HarnessArgs }) => Effect.Effect<Input, InputRefused | JournalError>;
  /**
   * Settle a task held open that waits for an answer: journalled as a `closed` entry, and settled `succeeded`, note
   * `closed`, by the next tick. Refused — `InputRefused`, nothing journalled — as `answer` is, for a task
   * that is not waiting for one. To end one that is running, `stop` it.
   */
  readonly close: (taskId: string) => Effect.Effect<void, InputRefused | JournalError>;
  /**
   * Count the bodies of the store no journal and no feed entry names, put more than a day ago (`BODY_GRACE_MS`), with their bytes;
   * given `{ yes: true }`, remove them, each only if no put came since it was counted, and say those removed and their bytes. A long
   * text a journal holds — a brief's part, a schema, a nudge, an answer — is kept once, as a body named by the sha256 of its text, and
   * read back whole. A store that keeps no bodies has none to count. Refused — `BodyRefused` — for an argument other than nothing or
   * `{ yes }`.
   */
  readonly sweep: (options?: { yes?: boolean }) => Effect.Effect<SweepReport, BodyRefused | JournalError>;
  /**
   * Remove the body `ref`, the sha256 of its text, as `sweep` would. Refused — `BodyRefused`, nothing removed — for a `ref` that is
   * no reference, a body the store does not have, one a journal or the feed still names (naming it), one put within a day, whose
   * line may still be on its way, and one put again while it was being removed.
   */
  readonly removeBody: (ref: string) => Effect.Effect<void, BodyRefused | JournalError>;
  /**
   * Forget the settled tasks `taskIds`: their journals, the files their harness keeps of each session, and their lines in the
   * feed, every cursor keeping its place. Without `{ yes: true }`, count what would go and remove nothing (`forgotten: false`). What
   * a harness keeps of its own, a transcript or a remote party's Task, stays and is named in `left`; a body goes only by `sweep`.
   * Refused — `ForgetRefused`, nothing removed, every id asked first — for an argument other than a list of ids and nothing or
   * `{ yes }`; a store with no `forget`; an id the store does not list; a journal that cannot be read; a task not settled; one
   * filed on a harness this engine does not have; and one whose harness still lists a session of it, or could not be read.
   */
  readonly forget: (taskIds: readonly string[], options?: { yes?: boolean }) => Effect.Effect<ForgetReport, ForgetFailure>;
  /**
   * What is kept on the disk for the sessions this engine ran, in bytes, by task (`KeptReport`): each listed task's journal, the
   * bodies it is first to name, the files its harness keeps of its sessions, and the harness's own record of each session its
   * journal names by id. Takes nothing, removes nothing and reads no body; a task at work is answered, its `files` as a settled
   * one's, and no record of an attempt still at work, whose id its journal names only once it has ended or the task settled. A
   * record whose task was forgotten is named by no journal, and is counted for none. What could not be measured of a task is said
   * on its `unread`, and stops no other. Refused — `KeptRefused`, nothing measured — for any argument.
   */
  readonly kept: () => Effect.Effect<KeptReport, KeptRefused | JournalError>;
  /**
   * Count the captures each harness keeps of its sessions whose worker has ended, with their bytes and what they would keep of the
   * conversation's lines: only what the harness's readers read, as a capture is once its session ends (`RunnerOps.compact`); given
   * `{ yes: true }`, rewrite them so, one at a time, and keep what was read of each anew. Each capture reads the same after as before,
   * or is left whole and named, as is one at work, one no run file names and one its reader refuses; no journal, no final answer and no
   * other file is written. A harness that keeps every capture whole is not asked. Refused — `CompactRefused`, nothing written — for
   * an argument other than nothing or `{ yes }`.
   */
  readonly compact: (options?: { yes?: boolean }) => Effect.Effect<CompactReport, CompactRefused | RunnerError>;
  /**
   * Everything that has happened since `after`, and where to resume. An entry no runtime wrote is skipped, the cursor past it, and
   * said on `refused` (`FeedRefusal`), so it is met by one read and stops no reader. Lines of tasks forgotten since are counted on
   * `forgotten`, the count of those after `after`.
   */
  readonly feed: (
    after?: Cursor,
  ) => Effect.Effect<{ entries: FeedEntry[]; cursor: Cursor; refused?: FeedRefusal[]; forgotten?: number }, JournalError>;
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
   * or out of order. The timer holds the process open until `stop()`, whatever the store: a store pushes only
   * where it can (`subscribe`), and one that cannot is watched all the same.
   */
  readonly watch: (options: {
    onEntry: (entry: FeedEntry) => void | Promise<void>;
    from?: Cursor;
    intervalMs?: number;
    onError?: (e: unknown) => void;
  }) => Effect.Effect<{ stop: () => void }>;
  /** What this engine's reads, spawns and observes have cost so far (`EngineIo`): running totals, read by nothing in the engine. */
  readonly io: () => Effect.Effect<EngineIo>;
  /**
   * `program` run in a tally of its own (`Tally`): inside it, `io` answers what the program and all it starts have read, spawned and
   * observed, and never another caller's work in the same moment, which the process's totals count beside it. Fails, dies and is
   * interrupted as `program` is.
   */
  readonly tallied: <A, E, R>(program: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
  /**
   * Make this process the holder of the Claude Code sessions the engine runs attached (`harness/claude/attached.ts`), for as long as the
   * scope it is taken in lasts: while held, a Claude Code task that runs to its end is spawned attached on the Agent SDK, and a session
   * parked, or left by a holder that is gone, is resumed under its own id on the next look. As the scope closes it holds back new tool
   * calls, waits with no bound for each call in flight to end, then stops each session and parks it for the next holder. An engine
   * that never takes it runs such a task as a `claude -p` job.
   */
  readonly hold: () => Effect.Effect<void, never, Scope.Scope>;
  /**
   * Hold back the new tool calls of the attached sessions the process `holder` holds, each at its hook until the drain is lifted, or with
   * `null` lift it. A call in flight runs on; another process's holder is not held. Refused — `DrainRefused` — for a holder that is
   * neither a process id nor null.
   */
  readonly drain: (holder: number | null) => Effect.Effect<void, DrainRefused>;
  /**
   * Tick on a timer until stopped. Ticks never overlap: a beat that comes while a tick runs is skipped, so a tick that
   * outruns the interval is not joined by a second pass over the same board. The timer holds the process open, as a control
   * loop must: `stop()` gives the process back.
   */
  readonly start: (options?: {
    intervalMs?: number;
    onTick?: (r: TickReport) => void;
    onError?: (e: unknown) => void;
  }) => Effect.Effect<{ stop: () => void }>;
};

/** The W3C trace context of the span this runs in (`traceparentOf`): the filing's, for its sessions to join; undefined where none is. */
const filingSpan = Effect.currentSpan.pipe(Effect.match({ onFailure: () => undefined, onSuccess: traceparentOf }));

/** An observe count with nothing counted: a harness this engine has not observed yet. */
const NONE: ObserveCount = { calls: 0, ms: 0, listed: 0, spawned: 0, unread: 0 };

/** The harnesses' observe counts as they stand, each copied, so a later call does not move what was read. */
const copyOf = (observed: Record<string, ObserveCount>): Record<string, ObserveCount> =>
  Object.fromEntries(Object.entries(observed).map(([name, o]) => [name, { ...o }]));

/** `Engine.io`: the innermost tally's open where it is asked, else the process's totals and this engine's observes; each a copy. */
const ioHere = (observedNow: () => Record<string, ObserveCount>): EngineIo => {
  const t = talliesHere().at(-1);
  return t ? { ...t.counts, observed: copyOf(t.observed) } : { ...ioCounts(), observed: observedNow() };
};

/** `Engine.io` over this engine's observes, and `Engine.tallied`. */
const ioVerbsOf = (observedNow: () => Record<string, ObserveCount>): Pick<EngineShape, 'io' | 'tallied'> => ({
  io: () => Effect.sync(() => ioHere(observedNow)),
  tallied: talliedVerb,
});

/** `Engine.tallied`: `program` forked as a fiber that starts with a fresh tally open, and joined; interrupted with its caller. */
const talliedVerb = <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.flatMap(Effect.context<R>(), (context) => {
    const fiber = tallied({ counts: noCounts(), observed: {} }, () => Effect.runForkWith(context)(program));
    return Effect.onInterrupt(Fiber.join(fiber), () => Fiber.interrupt(fiber));
  });

/**
 * `start` over `tick`, a pass: one pass every `intervalMs` (3 s by default), none while the last still runs, each report handed to
 * `onTick` and each failure to `onError`, until the handle's `stop`.
 */
const startOf =
  (tick: EngineShape['tick']): EngineShape['start'] =>
  (o = {}) =>
    Effect.sync(() => {
      const every = o.intervalMs ?? 3_000;
      let running = false;
      let stopped = false;
      const timer = setInterval(async () => {
        if (running || stopped) return;
        running = true;
        try {
          o.onTick?.(await Effect.runPromise(tick()));
        } catch (e) {
          o.onError?.(e);
        } finally {
          running = false;
        }
      }, every);
      return {
        stop: () => {
          stopped = true;
          clearInterval(timer);
        },
      };
    });

/** `logs` of the task `view` reads, asked of its own harness: `(no session yet)` before its harness names one. */
const logsOf = <E, R>(view: Effect.Effect<TaskView, E, R>, runners: Record<string, SeamOps>, harnessOf: (state: State) => string) =>
  Effect.gen(function* () {
    const v = yield* view;
    if (!v.sessionId) return '(no session yet)';
    return yield* runners[harnessOf(v.state)].logs(v.sessionId);
  });

/**
 * `quota` over `runners`, the engine's harnesses as the seam offers them: the quota of the harness named, or of `fallback`, the default
 * harness, when none is, as its runner answers it (`RunnerOps.quota`). Refused with `QuotaRefused`, in this order: an argument that is not
 * one harness's name; a harness this engine does not have, naming the ones it has; and one whose runner reports no quota, naming the
 * ones that do. Each call is one ask, and nothing is journalled.
 *
 * Traced only where it asks a harness, as `Engine.quota` with the `harness` asked: a refusal asks nothing and makes no span, so a
 * harness that reports no quota, asked as every harness is, is no error on a trace.
 */
const quotaVerbOf = (runners: Record<string, SeamOps>, fallback: string): EngineShape['quota'] =>
  Effect.fnUntraced(function* (harness?: string) {
    const refuse = (message: string) => Effect.fail(new QuotaRefused({ message }));
    const args = [...arguments];
    if (args.length > 1 || (harness !== undefined && typeof harness !== 'string')) {
      return yield* refuse(
        `takes one harness's name, or nothing for the default harness (\`${fallback}\`); it was handed ${args.map((a) => JSON.stringify(a)).join(', ')}.`,
      );
    }
    const name = harness ?? fallback;
    if (!Object.hasOwn(runners, name)) {
      return yield* refuse(`\`${name}\` is not a harness this engine has. Its harnesses are: ${Object.keys(runners).join(', ')}.`);
    }
    const ask = runners[name].quota;
    if (!ask) {
      const some = Object.keys(runners).filter((h) => runners[h].quota);
      return yield* refuse(
        `the \`${name}\` harness reports no quota. ${some.length ? `Ask one that does: ${some.join(', ')}.` : 'None of the harnesses this engine has does.'}`,
      );
    }
    return yield* ask.pipe(Effect.withSpan('Engine.quota', { attributes: { harness: name } }));
  });

/**
 * `ops` with its observes counted into `observed`, under `name`, on the way (`ObserveCount`): each call, its time, what it listed, the
 * registries it asked (`spawned`), and whether it left anything unread, a failed look counting as unread.
 */
const countedInto =
  (observed: Record<string, ObserveCount>) =>
  <R extends RunnerOps>(name: string, ops: R): R => {
    const count = <A>(look: Effect.Effect<A, RunnerError>, read: (a: A) => { listed: number; unread: boolean }) =>
      Effect.suspend(() => {
        const t0 = performance.now();
        const spawned = countsHere().spawned;
        return Effect.onExit(look, (exit) =>
          Effect.sync(() => {
            const ms = performance.now() - t0;
            const more = countsHere().spawned - spawned;
            const r = Exit.isSuccess(exit) ? read(exit.value) : { listed: 0, unread: true };
            for (const into of [observed, ...talliesHere().map((t) => t.observed)]) {
              const o = (into[name] ??= { ...NONE });
              o.calls++;
              o.ms += ms;
              o.spawned += more;
              o.listed += r.listed;
              if (r.unread) o.unread++;
            }
          }),
        );
      });
    const observeFor = ops.observeFor;
    return {
      ...ops,
      observe: count(ops.observe, (m) => ({ listed: m.size, unread: false })),
      ...(observeFor
        ? {
            observeFor: (expected: readonly ExpectedSession[]) =>
              count(observeFor(expected), (o) => ({ listed: o.seen.size, unread: o.unread.size > 0 })),
          }
        : {}),
    };
  };

/**
 * The engine over `options` that `Engine.layer` builds: the file-backed store under `root` (`~/.agent-engine` by default) or the
 * `journal` given, and the `harnesses` given — by default `claude`, `codex` and `claude-detached`. Built once, and shared by every verb:
 *
 * - the store, and its `subscribe` where it has one (the file store's does), which pushes to `watch`;
 * - each harness behind its A2A agent, reached through the SDK's client in this process (`a2a/client.ts`): the agent holds
 *   nothing, and answers a task it never started off the harness and this journal, so a restart loses no session. A remote
 *   agent is A2A already, spoken to by the SDK's client over HTTP, and wrapped in no seam of ours;
 * - every observe of a harness — a pass's, a view's, and an `observeFor`, an observe told what to look for — made through its
 *   runner and counted on the way (`ObserveCount`, `io`), where `spawned` says whether it asked a registry;
 * - one memo of the settled tasks its passes may skip (`core/engine/memo.ts`), which lives as long as this engine, so a new engine
 *   folds every task on its first pass;
 * - what its passes admit under (`admissionOf`): `maxConcurrent`, `unschedulable`, and each harness's pool.
 *
 * Fails with `EngineRefused` for what `optionsRefusalOf` refuses.
 */
const make = (options: EngineOptions) =>
  Effect.gen(function* () {
    const refused = optionsRefusalOf(options);
    if (refused) return yield* Effect.fail(new EngineRefused({ message: refused }));
    const root = options.root ?? path.join(os.homedir(), '.agent-engine');
    const harnesses = options.harnesses ?? DEFAULT_HARNESSES;
    const fallback = options.defaultHarness ?? Object.keys(harnesses)[0] ?? 'claude';

    const journalOps = options.journal ?? Journal.filesOps(root);
    const journal = Journal.layer(journalOps);
    const events = (taskId: string) => Effect.runPromise(Effect.flatMap(Journal, (j) => j.read(taskId)).pipe(Effect.provide(journal)));
    const observed: Record<string, ObserveCount> = {};
    const counted = countedInto(observed);
    const observedNow = () => copyOf(observed);
    const attached = attachedSessions(root);
    const { credentials, missingCredential, telemetry } = options;
    const made = runnersOf(harnesses, root, credentials, missingCredential, telemetry, attached);
    const runners = Object.fromEntries(Object.entries(made).map(seamOf(harnesses, events, counted)));
    const layer = Layer.mergeAll(journal, Runner.layer(composite(runners, fallback)), tickMemoLayer(), admissionOf(options, harnesses));
    const go = <A, E>(e: Effect.Effect<A, E, Journal | Runner>): Effect.Effect<A, E> => e.pipe(Effect.provide(layer));
    const read = (taskId: string) => go(Effect.flatMap(Journal, (j) => j.read(taskId)));

    const harnessOf = (state: State) => {
      const asked = state.harness ?? fallback;
      return Object.hasOwn(runners, asked) ? asked : fallback;
    };

    const viewOf = (taskId: string) =>
      Effect.gen(function* () {
        const events = yield* Effect.flatMap(Journal, (j) => j.read(taskId));
        const state = fold(taskId, events);
        const last = state.attempts.at(-1);
        const { find, observe, observeFor } = runners[harnessOf(state)];
        const look = observeFor
          ? observeFor(state.attempts.map((a) => ({ name: nameFor(taskId, a.n), harness: state.harness })))
          : observe.pipe(Effect.map((seen): Observation => ({ seen, unread: new Set() })));
        const observed = look.pipe(
          Effect.catchCause(() => Effect.succeed<Observation>({ seen: new Map<string, Sighting>(), unread: new Set() })),
          Effect.map((o) => viewOfState(state, o.seen, o.unreadWhy)),
        );
        const recorded = Effect.sync(() => viewOfState(state, new Map()));
        if (!Object.hasOwn(runners, state.harness ?? fallback)) return yield* recorded;
        if (!state.settled && (!find || last?.ended === null)) return yield* observed;
        if (!last || (find && last.nativeId)) return yield* recorded;
        const found = find ? yield* find(nameFor(taskId, last.n)).pipe(Effect.catchCause(() => Effect.succeed(undefined))) : undefined;
        if (found) return { ...(yield* recorded), sessionId: found.sessionId };
        if (!state.settled) return yield* observed;
        const v = yield* recorded;
        return { ...v, sessionId: handleOf(events, last.n) ?? v.sessionId };
      });

    const fileVerb = Effect.fn('Engine.file')(function* (spec: TaskSpec) {
      const task = { ...spec, harness: spec.harness ?? fallback, traceparent: options.telemetry ? yield* filingSpan : undefined };
      const refused = refusalOf(task) ?? argsRefusalOf(task) ?? harnessRefusalOf(task, harnesses);
      if (refused) return yield* Effect.fail(new FileRefused({ message: refused }));
      return yield* go(file(task));
    });

    const tickVerb = Effect.fn('Engine.tick')(function* () {
      const refused = tickRefusalOf([...arguments]);
      if (refused) return yield* Effect.fail(new TickRefused({ message: refused }));
      const t0 = performance.now();
      const before = observedNow();
      const report = yield* go(tick()).pipe(Effect.catchTag('TickMemoDiverged', (e) => Effect.die(e)));
      const during = Object.fromEntries(
        Object.entries(observedNow()).flatMap(([name, o]): Array<[string, ObserveCount]> => {
          const b = before[name] ?? NONE;
          return o.calls > b.calls
            ? [
                [
                  name,
                  {
                    calls: o.calls - b.calls,
                    ms: o.ms - b.ms,
                    listed: o.listed - b.listed,
                    spawned: o.spawned - b.spawned,
                    unread: o.unread - b.unread,
                  },
                ],
              ]
            : [];
        }),
      );
      return { ...report, ms: performance.now() - t0, observed: during };
    });

    const listVerb = Effect.fn('Engine.list')(function* (taskIds?: readonly string[]) {
      const refused = listRefusalOf([...arguments]);
      if (refused) return yield* Effect.fail(new ListRefused({ message: refused }));
      return yield* go(taskIds === undefined ? everyView() : viewsOf(taskIds));
    });

    const transcriptVerb = Effect.fn('Engine.transcript')(function* (taskId: string, after?: TranscriptCursor, asked: Asked = {}) {
      const refuse = (message: string) => Effect.fail(new TranscriptRefused({ message }));
      const events = yield* read(taskId);
      if (!events.length)
        return yield* refuse(`\`${taskId}\` is not a task on this board. \`ae ls\`, or \`list()\`, gives the ones it has.`);
      const state = fold(taskId, events);
      const harness = harnessOf(state);
      const transcriptOf = runners[harness].transcriptOf;
      if (!transcriptOf)
        return yield* refuse(
          `the \`${harness}\` harness keeps no conversation this engine can read. \`logs\` gives what its session printed.`,
        );
      const h = harnesses[harness];
      if (after !== undefined && (isClaude(h) || isSpec(h)) && !isTranscriptCursor(after)) {
        return yield* refuse(
          `\`${after}\` is not a cursor a transcript read gave. Pass the \`cursor\` the last read returned, or none to read from the start.`,
        );
      }
      const start = noTranscript().cursor;
      const nothing: Transcript = { events: [], cursor: after ?? start };
      const last = yield* attemptAsked(state.attempts, asked.attempt);
      if (!last) return nothing;
      return (yield* go(transcriptOf(nameFor(taskId, last.n), after === start ? undefined : after))) ?? nothing;
    });

    const answerVerb = Effect.fn('Engine.answer')(function* (taskId: string, text: string, options: { config?: HarnessArgs } = {}) {
      const refuse = (message: string) => Effect.fail(new InputRefused({ message }));
      if (Object.hasOwn(options, 'budgetUsd')) {
        return yield* refuse(
          "`budgetUsd` is the harness's configuration: give it under `config`, as `answer(id, text, { config: { budgetUsd: … } })`.",
        );
      }
      const { config } = options;
      const events = yield* read(taskId);
      const state = events.length ? fold(taskId, events) : undefined;
      const refused =
        answerRefusalOf(taskId, state, text, config) ??
        (state && config ? harnessRefusalOf({ ...filingOf(state, config), harness: harnessOf(state) }, harnesses) : undefined);
      if (refused) return yield* refuse(refused);
      return yield* go(answer(taskId, text, config));
    });

    const feedVerb = (after: Cursor = 0) => go(Effect.flatMap(Journal, (j) => j.feed(after)));

    return Engine.of({
      file: fileVerb,
      tick: tickVerb,
      admit: (taskIds) => go(admit(taskIds)),
      view: (taskId) => go(viewOf(taskId)),
      path: (taskId) => read(taskId).pipe(Effect.map((events) => pathOf(taskId, events))),
      list: listVerb,
      stop: (taskId) => go(requestStop(taskId)),
      logs: (taskId) => go(logsOf(viewOf(taskId), runners, harnessOf)),
      transcript: transcriptVerb,
      output: outputVerbOf(read, runners, harnessOf),
      follow: followVerbOf(read, runners, harnessOf),
      say: sayVerbOf(go, read, runners, harnesses, harnessOf),
      interrupt: interruptVerbOf(go, read, runners, harnesses, harnessOf),
      quota: quotaVerbOf(runners, fallback),
      answer: answerVerb,
      close: (taskId) => go(close(taskId)),
      feed: feedVerb,
      ...bodyVerbsOf(go),
      ...keepingVerbsOf(go, journalOps, runners, harnessOf, fallback),
      watch: watchOf(feedVerb, journalOps.subscribe),
      ...ioVerbsOf(observedNow),
      start: startOf(tickVerb),
      ...attachVerbsOf(attached, root),
    });
  });

/** A harness's runner as the engine runs it: through its A2A agent unless it is a remote one already, its observes counted. */
const seamOf =
  (harnesses: Record<string, HarnessConfig>, events: Parameters<typeof a2aOps>[2], counted: ReturnType<typeof countedInto>) =>
  ([name, ops]: [string, RunnerOps]): [string, SeamOps] => [
    name,
    counted(name, isRemote(harnesses[name]) ? ops : a2aOps(name, ops, events)),
  ];

/** The verbs of the sessions run attached: `hold`, and `drain`, which writes the drain's file or removes it. */
const attachVerbsOf = (attached: Attached, root: string): Pick<EngineShape, 'hold' | 'drain'> => ({
  hold: () => attached.hold,
  drain: Effect.fn('Engine.drain')(function* (holder: number | null) {
    const refused = drainRefusalOf(holder);
    if (refused) return yield* Effect.fail(new DrainRefused({ message: refused }));
    yield* Effect.sync(() => (holder === null ? liftDrain(root) : putDrain(root, holder)));
  }),
});

/**
 * The engine, as a service. `Engine.layer(options)` builds one from `EngineOptions`, failing with `EngineRefused` for what
 * `optionsRefusalOf` refuses; a test of a layer above takes the stand-in, `testEngine` of `agent-runtime/testing`. The default harness,
 * `defaultHarness` or else the first, takes a task that names none, and answers `logs`, `transcript` and `say` for a task whose
 * harness this engine does not have, whose `view` asks no harness.
 */
export class Engine extends Context.Service<Engine, EngineShape>()('agent-runtime/Engine') {
  static readonly layer = (options: EngineOptions = {}): Layer.Layer<Engine, EngineRefused> => Layer.effect(Engine, make(options));
}
