/**
 * The readiness read (`GET /api/readiness`, `objects`' `Readiness`): every piece the server needs to run its factories, in place
 * or missing, each with its fixes; a fix the server runs started (`POST /api/readiness/fixes`, a `Fix`), and its output followed as
 * server-sent events at `fixOutputPath`, each event's data decoded by `objects`' schema of it (`FIX_STREAM_SCHEMAS`).
 */
import { queryOptions } from '@tanstack/react-query';
import type { Schema } from 'effect';
import { Fix, type FixStart, Readiness } from 'objects';
import { call, read, write } from './objects.ts';

/** How often the read is made again while a page shows it: the server sweeps its needs once a minute. */
const READINESS_EVERY_MS = 60_000;

/** The readiness read, which the Setup page and the frame's banner both read: one key, so a fix's end reads both again. */
export const readinessQuery = queryOptions({
  queryKey: ['readiness'],
  queryFn: () => call((c) => c.readiness.read(), read(Readiness)),
  refetchInterval: READINESS_EVERY_MS,
});

/** A fix started by the server: its id and phase, the output it printed so far, and the pattern of the code its output shows. */
export const startFix = (start: FixStart): Promise<Fix> =>
  call(
    (c) => c.readiness.fix({ payload: start }),
    write(Fix, 'The fix may have started: read the Setup page again before starting it again.'),
  );

/** Where a fix's output is followed, as server-sent events: `output`, a chunk of what it printed; `ended`, its end, its data the `Fix`. */
export const fixOutputPath = (id: string): string => `/api/readiness/fixes/${encodeURIComponent(id)}/output`;

/** The data of the stream's events: `output` is text as printed, never JSON, so only `ended` is decoded. */
type FixStreamData = { ended: Fix };

/** The schema of each decoded event of a fix's stream: `ended`'s data is `objects`' `Fix`. */
export const FIX_STREAM_SCHEMAS: { readonly [K in keyof FixStreamData]: Schema.Decoder<FixStreamData[K]> } = { ended: Fix };
