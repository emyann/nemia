/**
 * The api's client door: the types of the answers `nemia` (apps/cli) reads over HTTP that `objects` does not hold, and nothing else —
 * `export type` lines alone, so a client that imports them by `import type` takes no value of the api, the package or the runtime with
 * them. A read the CLI moves onto the api names its answer here, until its kind is an object of `objects`, which the CLI reads through
 * its client of the `Api` (`nemia show`'s Run, `nemia closeout`'s tries, `nemia inbox`'s CardList).
 *
 * - `RawRecord` — `GET /api/runs/:runId?raw=true`, the record, as `nemia show --raw` prints it.
 * - `RunsListed` — `GET /api/listing` and `GET /api/listing/:runId`, what `nemia ls` prints, with the pause it says first (`Paused`).
 * - `FeedLine` — a line of `GET /api/feed/stream`, what `nemia watch` prints.
 * - `FactoryAnswer` — each factory of `GET /api/factories`, whose one repository `nemia inbox` says a queued card's try was on.
 * - `ErrorBody` — what any route refuses with: its words, naming the fix.
 */
import type { Refusal } from '../guard.ts';

export type { RawRecord } from '../runs/runs.ts';
export type { FactoryAnswer } from '../factories/factories.ts';
export type { FeedLine, Paused, RunsListed } from 'agent-orchestrator';
export type ErrorBody = Pick<Refusal, 'error'>;
