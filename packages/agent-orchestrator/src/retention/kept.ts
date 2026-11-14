/** How long an upgrade's build logs are kept, and the last date a clock reads: read by `leftovers.ts` and its contract (`contracts/leftovers.contract.ts`). */

/** How many days a build log is kept after it was last written, long enough to read why an upgrade failed. */
export const LOGS_KEPT_DAYS = 30;

/** `LOGS_KEPT_DAYS` in milliseconds. */
export const LOGS_KEPT_MS = LOGS_KEPT_DAYS * 24 * 60 * 60 * 1000;

/** The last moment a `Date` can hold, in milliseconds since the epoch: no file's time is later. */
export const LAST_DATE_MS = 8.64e15;

