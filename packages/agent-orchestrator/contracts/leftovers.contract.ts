/**
 * Which leftovers of a crashed upgrade go (agent-orchestrator, src/retention/leftovers.ts): `leftovers`, given the pid-named entries
 * under the store's `releases/` — a `.building-<tag>-<pid>` folder or a `.current-<pid>` link, each with whether its process is alive —
 * the build logs under `releases/.logs/` with when each was last written, and the time now. An entry whose process is gone goes, one
 * whose process lives stays; a log goes once it is older than `LOGS_KEPT_DAYS`, so a person can read why an upgrade failed until then.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import { LAST_DATE_MS, LOGS_KEPT_MS } from '../src/retention/kept.ts';

/** A pid-named entry under `releases/`: its name, and whether the process its name ends on is alive. */
export type PidEntry = { readonly name: string; readonly live: boolean };

/** A build log under `releases/.logs/`: its name, and when it was last written, in whole milliseconds since the epoch. */
export type BuildLog = { readonly name: string; readonly modifiedMs: number };

/** What a sweep removes of the leftovers: the entries under `releases/` and the logs under `releases/.logs/`, by name. */
export type Leftovers = { readonly entries: readonly string[]; readonly logs: readonly string[] };

const leftoversSpec = spec<(entries: readonly PidEntry[], logs: readonly BuildLog[], nowMs: number) => Leftovers>({
  /**
   * The entries are distinct names under one folder, and so are the logs; every time is a whole millisecond a `Date` can hold, none
   * before the epoch (the sweep floors a file's `mtimeMs`), so a log's age is reckoned exactly.
   */
  requires: ({ input: [entries, logs, nowMs] }) =>
    entries.every((e, i) => entries.every((o, j) => j <= i || o.name !== e.name)) &&
    logs.every((l, i) => logs.every((o, j) => j <= i || o.name !== l.name)) &&
    logs.every((l) => Number.isSafeInteger(l.modifiedMs) && l.modifiedMs >= 0 && l.modifiedMs <= LAST_DATE_MS) &&
    Number.isSafeInteger(nowMs) &&
    nowMs >= 0 &&
    nowMs <= LAST_DATE_MS,
  ensures: {
    neverWhatLives: {
      description: 'A build folder or pointer link whose process is alive is never removed',
      condition: ({ input: [entries], output }) => output.entries.every((name) => entries.every((e) => !e.live || e.name !== name)),
    },
    onlyWhatIsFound: {
      description: 'Only a leftover that was found is removed',
      condition: ({ input: [entries, logs], output }) =>
        output.entries.every((name) => entries.some((e) => e.name === name)) &&
        output.logs.every((name) => logs.some((l) => l.name === name)),
    },
    aFreshLogIsKept: {
      description: 'A build log written within the last 30 days is never removed',
      condition: ({ input: [, logs, nowMs], output }) =>
        output.logs.every((name) => logs.every((l) => l.name !== name || l.modifiedMs + LOGS_KEPT_MS < nowMs)),
    },
    everyDeadGoes: {
      description: 'A build folder or link whose process is gone is removed',
      condition: ({ input: [entries], output }) => entries.every((e) => e.live || output.entries.includes(e.name)),
    },
    everyOldLogGoes: {
      description: 'A build log older than 30 days is removed',
      condition: ({ input: [, logs, nowMs], output }) =>
        logs.every((l) => !(l.modifiedMs + LOGS_KEPT_MS < nowMs) || output.logs.includes(l.name)),
    },
  },
});

/** `leftovers`' type, which the code takes: it then imports nothing of tsverify. */
export type UpgradeLeftovers = Implementation<typeof leftoversSpec>;
