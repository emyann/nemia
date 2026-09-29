/**
 * A refusal: an `Error` whose words say what to do next and whose `exitCode` is 2, tagged with what it refuses, so an Effect picks it out
 * with `Effect.catchTag` and a caller of `wf` or the api reads its kind from `_tag`.
 *
 * Imported from `effect/Data` alone, never the `effect` barrel: `agent-orchestrator/run` and `agent-orchestrator/workflow` load this file,
 * and `test/refusal.test.ts` pins how many modules they load. A reader of `exitCode === 2` needs no change, since each class carries it.
 */
import { TaggedError } from 'effect/Data';

/** What is asked of is not there: no run by that id. */
export class Missing extends TaggedError('Missing')<{ readonly message: string }> {
  readonly exitCode = 2;
}

/** What is asked is well formed, and the state of a run or of the store forbids it: a step already approved, a store another process holds. */
export class Conflict extends TaggedError('Conflict')<{ readonly message: string }> {
  readonly exitCode = 2;
}

/** What is given is wrong: an id, a flag, a cap, a workflow's shape, a file of settings. */
export class Invalid extends TaggedError('Invalid')<{ readonly message: string }> {
  readonly exitCode = 2;
}

/** Every refusal the orchestrator throws, by its kind. */
export type Refusal = Missing | Conflict | Invalid;

/** Whether `err` is one of the orchestrator's refusals, by its class: a plain `Error` carrying `exitCode` 2 is not. */
export const isRefusal = (err: unknown): err is Refusal => err instanceof Missing || err instanceof Conflict || err instanceof Invalid;
