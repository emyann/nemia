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
 * - filing work, asking about it and stopping it (`filing.ts`, `engine.ts`);
 * - the feed: how an upper layer reacts without polling a task (`journal.ts`);
 * - the harnesses: bring your own (`Runner`, and each runner the package ships);
 * - the vocabulary (`domain.ts`), with the words each harness takes, as lists: what an upper layer
 *   that checks a task before filing it holds its own copy to.
 */

export { file, FileRefused, requestStop, answer, close, InputRefused, admit, AdmitRefused } from './core/engine/filing.ts';
export { view, viewOfState, tick, TickRefused, step, settleTask, StepRefused, GRACE_MS } from './core/engine/engine.ts';
export type { Filing } from './core/engine/filing.ts';
export type { RefusedMove, TaskView } from './core/engine/engine.ts';

export { Journal, JournalError } from './core/engine/journal.ts';
export type { FeedEntry, FeedRefusal, Cursor, JournalOps } from './core/engine/journal.ts';

export { Runner, RunnerError, testOps } from './harness/seam.ts';
export { claudeOps } from './harness/claude/bg.ts';
export type {
  ExpectedSession,
  McpServer,
  Observation,
  RunnerOps,
  SpawnRequest,
  Transcript,
  TranscriptCursor,
  TranscriptEvent,
} from './harness/seam.ts';
export { HARNESS_ARGS, TURN_ARGS, argsRefusalOf } from './harness/args.ts';
export type { HarnessArgs } from './harness/args.ts';
export type { ClaudeFlags } from './harness/claude/vocabulary.ts';
export { detachedOps, STALE_MS } from './harness/detached/detached.ts';
export type { HarnessSpec } from './harness/detached/detached.ts';
export { remoteOps } from './a2a-remote.ts';
export type { Credentials, RemoteAgent } from './a2a-remote.ts';
export { codex } from './harness/codex/codex.ts';
export { claudeDetached } from './harness/claude/code.ts';
export { composite } from './harness/seam.ts';
export { sdkRunner } from './harness/sdk.ts';
export { a2aRunner } from './a2a-client.ts';

export type { Event, State, Attempt, Sighting, EndReason, Usage, Said, Denial, Input } from './core/domain.ts';
export type { SessionState, Ended, Outcome } from './core/session.ts';
export { denialText, fold, nameFor } from './core/domain.ts';
export { CLAUDE_CONTEXT_TOKENS, CLAUDE_EFFORTS, CLAUDE_PERMISSION_MODES } from './harness/claude/vocabulary.ts';
export { CODEX_EFFORTS, CODEX_SANDBOXES } from './harness/codex/codex.ts';
