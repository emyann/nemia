/**
 * The orchestrator's **Effect** face — `import { ... } from 'agent-orchestrator/effect'`.
 *
 * Most callers want `agent-orchestrator`, `agent-orchestrator/run` or `agent-orchestrator/workflow`, which have no Effect in any signature.
 * Use this one when you write Effect over the orchestrator: its refusals are tagged errors, so an Effect picks one out with
 * `Effect.catchTag('Missing', ...)`, and a caller that answers each kind with a status or an exit code reads `_tag` off a `Refusal` and is
 * checked by the compiler for every kind.
 *
 * - `Missing`, `Conflict` and `Invalid`: what is asked of is not there, the state forbids it, what is given is wrong; each an `Error` with
 *   its words and `exitCode` 2 (`refusal/refusal.ts`);
 * - `Refusal`, the union of the three, and `isRefusal`, which tells one from any other error.
 *
 * Loads `effect/Data` alone, never the `effect` barrel: `test/refusal.test.ts` pins how many modules it loads.
 */
export { Conflict, Invalid, isRefusal, Missing } from './refusal/refusal.ts';
export type { Refusal } from './refusal/refusal.ts';
