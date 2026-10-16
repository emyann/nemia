/** The face of `stats/`: the fold of the store's runs into flow numbers, and those numbers in words, re-exported by name. */
export { BY_KEYS, keysOf, statsQueryOf } from './stats.ts';
export type { ByKey, QueryKey, RunFact, RunKeys, Stats, StatsQuery, TryFact } from './stats.ts';
export { statsLine, statsLines } from './stats-words.ts';
export { deniedCallsOf } from './discipline.ts';
