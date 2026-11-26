/**
 * The face of `rest/`: what makes a run at rest, and the stamp-keyed memo of a projection of each run's record, re-exported by name.
 */
export { evictedBy, restBlockers } from './rest.ts';
export type { InputsWatchedBy, RestFacts } from './rest.ts';
export { keptRecords, recordMemo } from './kept.ts';
export type { RecordMemo } from './kept.ts';
