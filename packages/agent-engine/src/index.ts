/**
 * The engine's **Effect** surface — `import { ... } from 'agent-engine/effect'`.
 *
 * Most consumers want `agent-engine` instead, which is the same engine with Promises at the
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
 * workflow decision that belongs out there.
 */

// ─── file work, ask about it, stop it ───────────────────────────────────────
export { file, requestStop, view, tick, step, settleTask, GRACE_MS, DEFAULT_MAX_CONCURRENT } from './engine.ts';
export type { TaskView } from './engine.ts';

// ─── the feed: how an upper layer reacts without polling a task ─────────────
export { Journal, JournalError } from './journal.ts';
export type { FeedEntry, Cursor, JournalOps } from './journal.ts';

// ─── harnesses: bring your own ──────────────────────────────────────────────
export { Runner, RunnerError, claudeOps, testOps } from './runner.ts';
export type { McpServer, RunnerOps, SpawnRequest } from './runner.ts';
export { detachedOps, codex, claudeDetached, STALE_MS } from './runner-detached.ts';
export type { HarnessSpec } from './runner-detached.ts';
export { composite } from './runner-composite.ts';
export { sdkRunner } from './runner-sdk.ts';

// ─── the vocabulary ─────────────────────────────────────────────────────────
export type { Event, State, Attempt, Observed, Outcome, Sighting, EndReason, ResumePolicy, Usage } from './domain.ts';
export { fold, nameFor } from './domain.ts';

// NOT exported, on purpose: `decide`. It is the engine's judgement, and a consumer that wants to
// influence it is asking for a knob on the workload (attempts, ceiling, harness) — which is a
// field, not a callback.
