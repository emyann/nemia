/**
 * The api's client door: the types of the answers `nemia` (apps/cli) reads over HTTP that `objects` does not hold, and nothing else —
 * `export type` lines alone, so a client that imports them by `import type` takes no value of the api, the package or the runtime with
 * them. Every answer the cli reads now has its Schema in `objects` (`Run`, `RunRecord`, `RunDecision`, `Table`, `Paused`, …), read
 * through its client of the `Api`, so the door re-exports none of the orchestrator's shapes: what is left is the refusal's body.
 *
 * - `ErrorBody` — what any route refuses with: its words, naming the fix.
 */
import type { Refusal } from '../guard.ts';

export type ErrorBody = Pick<Refusal, 'error'>;
