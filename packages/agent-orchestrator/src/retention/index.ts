/**
 * The face of `retention/`: which installed releases go (`retention`, `newestFirst`, `retentionLines`) and which of a crashed upgrade's
 * leftovers go (`leftovers`, `leftoverLines`, `LOGS_KEPT_DAYS`), each pure.
 */
export { newestFirst, RELEASES_KEPT, retention, retentionLines, type Installed, type InUse, type Retention } from './retention.ts';
export { leftoverLines, leftovers, type BuildLog, type Leftovers, type PidEntry } from './leftovers.ts';
export { LAST_DATE_MS, LOGS_KEPT_DAYS, LOGS_KEPT_MS } from './kept.ts';
