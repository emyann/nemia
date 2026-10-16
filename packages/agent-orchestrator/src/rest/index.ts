/**
 * The face of `rest/`: what makes a run at rest, and the stamp-keyed memo of a projection of each run's record, re-exported by name.
 */
export { atRest, evictedBy, restBlockers } from './rest.ts';
export type { RestFacts } from './rest.ts';
export { keptRecords, recordMemo } from './kept.ts';
export type { RecordMemo, RecordsRead } from './kept.ts';
