/**
 * The engine's **Effect** surface — `import { ... } from 'agent-runtime/effect'`.
 *
 * Most consumers want `agent-runtime` instead, which is the same engine with Promises at the
 * boundary and no Effect in any signature. Use this one when you are already writing Effect and
 * want Layer composition and typed error channels — and then keep your `effect` version aligned
 * with this package's, because Context tags are identity-based and two copies do not see each
 * other's services.
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
 * - the engine as a service (`Engine`, `service/engine.ts`): a layer made from the engine's options, whose verbs are Effects with
 *   typed errors, and `promiseEngine`, which runs each verb of a layer's `Engine` as a Promise: `promiseEngine(Engine.layer(options))`
 *   is the engine a consumer uses without writing Effect;
 * - filing work, asking about it and stopping it, verb by verb (`filing.ts`, `engine.ts`);
 * - the feed: how an upper layer reacts without polling a task (`journal.ts`);
 * - the harnesses: bring your own (`Runner`, and each runner the package ships);
 * - the vocabulary (`domain.ts`), with the words each harness takes, as lists: what an upper layer
 *   that checks a task before filing it holds its own copy to.
 */

export {
  Engine,
  EngineRefused,
  ListRefused,
  TranscriptRefused,
  OutputRefused,
  SayRefused,
  SayUnsent,
  QuotaRefused,
} from './service/index.ts';
export type { EngineShape } from './service/index.ts';
export { promiseEngine } from './facade/engine.ts';
export type { EngineOptions, TaskSpec, TickReport, EngineIo, ObserveCount } from './facade/consumer.ts';

export { file, FileRefused, requestStop, StopRefused, answer, close, InputRefused, admit, AdmitRefused } from './core/engine/index.ts';
export { view, viewOfState, tick, TickRefused, step, settleTask, StepRefused, GRACE_MS } from './core/engine/index.ts';
export type { Filing } from './core/engine/index.ts';
export type { RefusedMove, TaskView } from './core/engine/index.ts';

export { Journal, JournalError } from './core/engine/index.ts';
export type { FeedEntry, FeedRefusal, Cursor, JournalOps } from './core/engine/index.ts';

export { Runner, RunnerError, testOps } from './harness/index.ts';
export { claudeOps } from './harness/claude/index.ts';
export type {
  ExpectedSession,
  HarnessQuota,
  McpServer,
  Observation,
  QuotaLimit,
  RunnerOps,
  SpawnRequest,
  Transcript,
  TranscriptCursor,
  TranscriptEvent,
} from './harness/index.ts';
export { HARNESS_ARGS, TURN_ARGS, argsRefusalOf } from './harness/index.ts';
export type { CodexArgs, HarnessArgs } from './harness/index.ts';
export type { ClaudeFlags } from './harness/claude/index.ts';
export { detachedOps, STALE_MS } from './harness/detached/detached.ts';
export type { HarnessSpec } from './harness/detached/detached.ts';
export { remoteOps } from './a2a/index.ts';
export type { Credentials, RemoteAgent } from './a2a/index.ts';
export { codex } from './harness/codex/codex.ts';
export { claudeDetached } from './harness/claude/index.ts';
export { commandHarness } from './harness/command/command.ts';
export { composite } from './harness/index.ts';
export { sdkRunner } from './harness/index.ts';
export { a2aRunner } from './a2a/index.ts';

export type { Event, State, Attempt, Sighting, EndReason, Usage, Said, Denial, Input } from './core/index.ts';
export type { SessionState, Ended, Outcome } from './core/index.ts';
export type { LifecycleStep, LifecycleState } from './core/index.ts';
export { denialText, fold, nameFor } from './core/index.ts';
export { CLAUDE_CONTEXT_TOKENS, CLAUDE_EFFORTS, CLAUDE_PERMISSION_MODES } from './harness/claude/index.ts';
export { CODEX_EFFORTS, CODEX_SANDBOXES } from './harness/codex/codex.ts';
