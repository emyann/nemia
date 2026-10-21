/**
 * The engine — `import { ... } from 'agent-runtime'`: the package's one face, Effect. Its verbs are Effects with typed errors, run
 * by a program that provides `Engine.layer(options)`; a caller that writes no Effect reaches the system through the api. Keep your
 * `effect` version aligned with this package's: Context tags are identity-based, and two copies do not see each other's services.
 *
 * Everything an upper layer may use, and nothing else.
 *
 * ## The boundary this file exists to hold
 *
 *   **The engine runs ONE workload on ONE harness. Anything that knows about a SECOND workload
 *   is the upper layer.**
 *
 * "Implement, then review" knows about two. So does a dependency graph, a board, a column, a
 * pull request. None of them belong here, and none of them need to: a workflow layer files
 * tasks with `file`, watches `feed` for the ones that settle, and files the next. That is the
 * whole contract, and it is three functions wide.
 *
 * The reason this is a file rather than a rule is that a rule gets re-broken every session and
 * an export list does not. If something on top needs `decide`, the answer is not to export it —
 * it is that the thing on top is trying to make a scheduling decision that belongs in here, or a
 * workflow decision that belongs out there. `decide` is the engine's judgement, and a consumer that
 * wants to influence it is asking for a knob on the workload, which is a field on the task, not a
 * callback.
 *
 * The list, in groups:
 *
 * - the engine as a service (`Engine`, `service/engine.ts`): a layer made from the engine's options (`service/options.ts`), whose
 *   verbs are Effects with typed errors, and `refusalWords`, which words a refusal as `ae` says it;
 * - filing work, asking about it and stopping it, verb by verb (`filing.ts`, `engine.ts`);
 * - the feed: how an upper layer reacts without polling a task (`journal.ts`);
 * - the harnesses: bring your own (`Runner`, and each runner the package ships);
 * - the vocabulary (`domain.ts`), with the words each harness takes, as lists: what an upper layer
 *   that checks a task before filing it holds its own copy to, and the lifecycle as plain data for a board to draw.
 */

export {
  Engine,
  EngineRefused,
  ListRefused,
  TranscriptRefused,
  OutputRefused,
  FollowRefused,
  InterruptRefused,
  InterruptUnsent,
  AnswerRefused,
  AnswerUnsent,
  SayRefused,
  SayUnsent,
  QuotaRefused,
  McpStateRefused,
  DrainRefused,
  ForgetRefused,
  KeptRefused,
  CompactRefused,
  refusalWords,
} from './service/index.ts';
export type { Answering, AskAnswered, CompactReport, EngineShape, ForgetReport, KeptReport } from './service/index.ts';
export type { EngineOptions, HarnessConfig, Pooled, TaskSpec, TickReport, EngineIo, ObserveCount } from './service/options.ts';
/**
 * Why a task's configuration on one of the harnesses an engine runs by default is one `file()` refuses, in the runtime's words, or
 * `undefined`: for a caller that checks a task before it files it, and words the refusal in its own keys.
 */
export { configRefusal } from './service/harnesses.ts';

export { file, FileRefused, requestStop, StopRefused, answer, close, InputRefused, admit, AdmitRefused } from './core/engine/index.ts';
export { view, viewOfState, tick, TickRefused, step, settleTask, StepRefused, GRACE_MS } from './core/engine/index.ts';
export type { Filing } from './core/engine/index.ts';
export type { RefusedMove, TaskList, TaskView, UnreadableTask } from './core/engine/index.ts';
export { refusedText, retiredKeyRefusal } from './core/engine/index.ts';

export { Journal, JournalError, BodyRefused, FEED_LOCK_WAIT_MS } from './core/engine/index.ts';
export type {
  FeedEntry,
  FeedRefusal,
  Cursor,
  JournalOps,
  StoreOps,
  PlainJournalOps,
  BodiedJournalOps,
  SweepReport,
} from './core/engine/index.ts';
export type { BodyEntry, BodyOps, BodyRef } from './core/engine/index.ts';
export type { IoCounts } from './core/engine/index.ts';

export { Runner, RunnerError, testOps } from './harness/index.ts';
export { claudeOps } from './harness/claude/index.ts';
export type {
  ExpectedSession,
  Followed,
  HarnessQuota,
  McpServer,
  Observation,
  QuotaLimit,
  RunnerOps,
  SpawnRequest,
  Transcript,
  TranscriptCursor,
  TranscriptEvent,
  TranscriptMark,
} from './harness/index.ts';
export { HARNESS_ARGS, TURN_ARGS, argsRefusalOf } from './harness/index.ts';
export type { Admission, AdmissionAnswer, AdmissionCall, CodexArgs, HarnessArgs, Mount } from './harness/index.ts';
export type { ClaudeFlags } from './harness/claude/index.ts';
export { detachedOps, STALE_MS } from './harness/detached/detached.ts';
export type { HarnessSpec } from './harness/detached/detached.ts';
export { remoteOps } from './a2a/index.ts';
export type { Credentials, MissingCredential, RemoteAgent } from './a2a/index.ts';
/**
 * What a holder serves on its own port, as `hold()` answers it (`Served`), and the holder a viewer's engine is given by its
 * served card (`HolderAgent`, `EngineOptions.holder`).
 */
export type { Served, HolderAgent } from './a2a/index.ts';
/**
 * The name the served card gives its bearer scheme, and the name a viewer's `credentials` is asked for (`BEARER`); the token that
 * holder minted, read off its own store (`holderTokenOf`), which is where it is written and the only place it is; and which of a
 * configuration's harnesses a holder holds (`heldHarnessesOf`) — the rule a layer above reads rather than copying the literal.
 */
export { BEARER, holderTokenOf } from './a2a/index.ts';
export { heldHarnessesOf } from './service/options.ts';
/**
 * Why a remote agent's entry is not one the runtime can reach, or `undefined`: what `Engine.layer` refuses, for a caller that reads entries
 * from a file of its own and words the refusal there.
 */
export { remoteConfigRefusal } from './a2a/index.ts';
export { codex } from './harness/codex/codex.ts';
export { claudeDetached } from './harness/claude/index.ts';
/**
 * How long a holder's whole let-go takes at most, in milliseconds: for a caller that waits for such a process to stop — a service
 * unit's stop timeout, a restart's wait for the lease — which is set above it rather than repeating the number.
 */
export { LET_GO_MS } from './harness/claude/index.ts';
export { commandHarness } from './harness/command/command.ts';
export { composite } from './harness/index.ts';
export { admissionHook, sdkRunner } from './harness/index.ts';
export { a2aRunner } from './a2a/index.ts';

export type { Event, State, Attempt, Sighting, EndReason, Usage, Said, Denial, Input, Bridge } from './core/index.ts';
export type { AskOption, AskQuestion, SessionAsk } from './core/index.ts';
export type { SessionState, Ended, Outcome } from './core/index.ts';
/**
 * The task's lifecycle as plain data — states, edges, first and final states, and the verbs written from outside it — for a board to
 * draw; never the machine or its move.
 */
export { lifecycleGraph } from './core/index.ts';
export type { LifecycleEdge, LifecycleGraph, LifecycleState, LifecycleStep, LifecycleVerb } from './core/index.ts';
export { denialText, fold, nameFor } from './core/index.ts';
export { CLAUDE_AUTO_DROPPED, CLAUDE_CONTEXT_TOKENS, CLAUDE_EFFORTS, CLAUDE_PERMISSION_MODES } from './harness/claude/index.ts';
export { fenceReach, unruledIn, type FenceReach } from './harness/reach.ts';
export { CODEX_EFFORTS, CODEX_SANDBOXES } from './harness/codex/vocabulary.ts';
export { HARNESS_CHOICES, HARNESS_KNOBS } from './harness/choices.ts';
export { CONFIG_FOLDERS, configFolderIn } from './harness/config-folders.ts';
/**
 * A harness's trust of a folder, off its own file: whether it is given (`trustedFolder`), what it is in a person's words
 * (`folderTrust`), and the act of giving it (`trustFolder`); each `undefined` for a harness that keeps none.
 */
export { folderTrust, trustFolder, trustedFolder, type FolderTrust, type FolderTrusted } from './harness/trust.ts';
/**
 * What a harness says of the MCP servers a caller records: the five words it has for a state (`MCP_STATES`), one server's state as it
 * says it, and what a whole read answers — the states, or that the look failed and why, never an empty list. Read through the engine's
 * `mcpState`, the one verb that opens a session to ask.
 */
export { MCP_STATES } from './harness/mcp-state.ts';
export type { McpServerState, McpServersRead } from './harness/mcp-state.ts';
/** One MCP server a caller records and a harness is handed, and the one producer of its bytes (`mcpServerOf`). */
export { mcpServerOf } from './harness/mcp.ts';
export type { LocalMcpServer, RemoteMcpServer } from './harness/seam.ts';
/**
 * The allow rules a harness's own project configuration in a directory grants a session started there; `undefined` for a harness that
 * reads none.
 */
export { projectAllows } from './harness/settings.ts';
