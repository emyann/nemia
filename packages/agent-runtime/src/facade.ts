/**
 * The engine, without Effect: its types and plain helpers.
 *
 * Effect is how this engine is written, not how it is used. The engine is built with
 * `promiseEngine(Engine.layer(options))` from `agent-runtime/effect`, and everything it gives takes and returns plain values and
 * Promises, so a consumer needs to know three functions and writes no Effect: `file` what you want done, `tick` to move it along,
 * `feed` to react to what happened.
 *
 * The Effect API is there for anyone who wants `Layer` composition and typed error channels
 * — `import { ... } from 'agent-runtime/effect'`. Keeping it behind a subpath is deliberate: two
 * copies of Effect in one dependency tree break service resolution, and a consumer who never
 * imports Effect can never have two.
 *
 * This file names what the door gives, and holds nothing of its own: what a consumer writes and the adapters over it are
 * in `facade/consumer.ts`, the engine it gets in `facade/engine.ts` (the `Engine` service of `service/engine.ts`, each verb run as a
 * Promise, whose `promiseEngine` the Effect face exports), and a harness written in Promises in `facade/promise.ts`.
 */
export type {
  PromiseJournal,
  HarnessConfig,
  EngineOptions,
  TaskSpec,
  TickReport,
  ObserveCount,
  EngineIo,
  Engine,
} from './facade/consumer.ts';
export type { PromiseRunner, PromiseSighting } from './facade/promise.ts';
export { codex } from './harness/codex/codex.ts';
export { claudeDetached } from './harness/claude/index.ts';
/** The words each harness takes, as lists: what an upper layer that checks a task before filing it holds its own copy to. */
export { CLAUDE_CONTEXT_TOKENS, CLAUDE_EFFORTS, CLAUDE_PERMISSION_MODES } from './harness/claude/index.ts';
export { CODEX_EFFORTS, CODEX_SANDBOXES } from './harness/codex/codex.ts';
export type { HarnessSpec } from './harness/detached/detached.ts';
export type { Credentials, MissingCredential, RemoteAgent } from './a2a/index.ts';
/** Why a remote agent's entry is not one the runtime can reach, or `undefined`: what `Engine.layer` refuses, for a caller that reads entries from a file of its own and words the refusal there. */
export { remoteConfigRefusal } from './a2a/index.ts';
export { denialText, nameFor } from './core/index.ts';
/** The task's lifecycle as plain data — states, edges, first and final states — for a board to draw; never the machine or its move. */
export { lifecycleGraph } from './core/index.ts';
export type { LifecycleEdge, LifecycleGraph, LifecycleState, LifecycleStep } from './core/index.ts';
export { refusedText } from './core/engine/index.ts';
export { retiredKeyRefusal } from './core/engine/index.ts';
export type { Event, Sighting, EndReason, State, Attempt, Usage, Said, Denial, Input } from './core/index.ts';
export type { SessionState, Ended, Outcome } from './core/index.ts';
export { HARNESS_ARGS, TURN_ARGS, type CodexArgs, type HarnessArgs } from './harness/index.ts';
export type { ClaudeFlags } from './harness/claude/index.ts';
export type { McpServer, SpawnRequest, Transcript, TranscriptCursor, TranscriptEvent } from './harness/index.ts';
export type { FeedEntry, FeedRefusal, Cursor } from './core/engine/index.ts';
export type { IoCounts } from './core/engine/index.ts';
export type { RefusedMove, TaskList, TaskView, UnreadableTask } from './core/engine/index.ts';
