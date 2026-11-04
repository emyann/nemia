/**
 * Which leftovers of a crashed upgrade go: the rule kept by `leftovers` and proved by `contracts/leftovers.contract.ts`. A build's folder
 * (`.building-<tag>-<pid>`, its `tree/` and `trial/` store inside) or a pointer link made beside `current` (`.current-<pid>`) whose
 * process is gone is removed; one whose process lives is a build under way, and stays. A build log is kept `LOGS_KEPT_DAYS` after it was
 * last written, so a person can read why an upgrade failed, then removed. Pure: `release/release.store.ts` reads and removes them, and
 * `retention.verb.ts` sweeps.
 */
import type { UpgradeLeftovers } from '../../contracts/leftovers.contract.ts';

/** How many days a build log is kept after it was last written, long enough to read why an upgrade failed. */
export const LOGS_KEPT_DAYS = 30;

/** `LOGS_KEPT_DAYS` in milliseconds. */
export const LOGS_KEPT_MS = LOGS_KEPT_DAYS * 24 * 60 * 60 * 1000;

/** The last moment a `Date` can hold, in milliseconds since the epoch: no file's time is later. */
export const LAST_DATE_MS = 8.64e15;

/** A pid-named entry under `releases/`: its name, and whether the process its name ends on is alive. */
export type PidEntry = { readonly name: string; readonly live: boolean };

/** A build log under `releases/.logs/`: its name, and when it was last written, in whole milliseconds since the epoch. */
export type BuildLog = { readonly name: string; readonly modifiedMs: number };

/** What a sweep removes of the leftovers: the entries under `releases/` and the logs under `releases/.logs/`, by name. */
export type Leftovers = { readonly entries: readonly string[]; readonly logs: readonly string[] };

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
