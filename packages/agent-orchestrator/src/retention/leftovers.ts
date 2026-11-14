/**
 * Which leftovers of a crashed upgrade go: the rule kept by `leftovers` and proved by `contracts/leftovers.contract.ts`. A build's folder
 * (`.building-<tag>-<pid>`, its `tree/` and `trial/` store inside) or a pointer link made beside `current` (`.current-<pid>`) whose
 * process is gone is removed; one whose process lives is a build under way, and stays. A build log is kept `LOGS_KEPT_DAYS` after it was
 * last written, so a person can read why an upgrade failed, then removed. Pure: `release/release.store.ts` reads and removes them, and
 * `retention.verb.ts` sweeps.
 */
import type { UpgradeLeftovers } from '../../contracts/leftovers.contract.ts';
import type { Leftovers } from '../../contracts/leftovers.contract.ts';
import { LOGS_KEPT_DAYS, LOGS_KEPT_MS } from './kept.ts';

export { LOGS_KEPT_DAYS, LOGS_KEPT_MS, LAST_DATE_MS } from './kept.ts';

export type { PidEntry, BuildLog, Leftovers } from '../../contracts/leftovers.contract.ts';

/** The leftovers to remove: each entry whose process is gone, each log older than `LOGS_KEPT_MS` at `nowMs`. */
export const leftovers: UpgradeLeftovers = (entries, logs, nowMs) => ({
  entries: entries.filter((e) => !e.live).map((e) => e.name),
  logs: logs.filter((l) => l.modifiedMs + LOGS_KEPT_MS < nowMs).map((l) => l.name),
});

/** What a sweep says of the leftovers it removed: each entry, its process gone, and each log, older than `LOGS_KEPT_DAYS`. */
export const leftoverLines = (swept: Leftovers): string[] => [
  ...swept.entries.map((name) => `removed releases/${name}: the upgrade that made it is gone`),
  ...swept.logs.map((name) => `removed the build log releases/.logs/${name}: older than ${LOGS_KEPT_DAYS} days`),
];
