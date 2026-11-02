/**
 * The api's client door: the types of the answers `nemia` (apps/cli) reads over HTTP, and nothing else — `export type` lines alone, so a
 * client that imports them by `import type` takes no value of the api, the package or the runtime with them. A read the CLI moves onto
 * the api names its answer here.
 *
 * - `RunAnswer` — `GET /api/runs/:runId`, the run object, as `nemia show` prints it; `RawRecord` — `?raw=true`, the record, as
 *   `nemia show --raw` prints it.
 * - `StepTry` — each of `GET /api/runs/:runId/steps/:step/tries`' `tries`; `TryCloseout` — `…/tries/:try/closeout`, what `nemia closeout`
 *   prints, of which `StepCloseout` is the closeout itself.
 * - `RunsListed` — `GET /api/listing` and `GET /api/listing/:runId`, what `nemia ls` prints, with the pause it says first (`Paused`).
 * - `InboxEntry` — each card of `GET /api/inbox`, what `nemia inbox` prints.
 * - `ErrorBody` — what any route refuses with: its words, naming the fix.
 */
import type { Refusal } from '../guard.ts';

export type { RawRecord, RunAnswer } from '../runs/runs.ts';
export type { InboxEntry } from '../inbox/inbox.ts';
export type { Paused, RunsListed, StepCloseout, StepTry, TryCloseout } from 'agent-orchestrator';
export type ErrorBody = Pick<Refusal, 'error'>;
