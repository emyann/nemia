/**
 * `nemia daemon`: the store's daemon started where none ticks it, then said as its lease stands — its state, its kind, its pid and the url
 * the api serves at. The start is the table's (`ticks`): the command line runs `ensureDaemon` before the handler, as for every command
 * that ticks, so a client that finds no daemon serving a store (`apps/cli`) asks this command for one and reads the lease again. Served on
 * the command line alone: the api is the daemon.
 */
import { Effect, Schedule } from 'effect';
import type { Command } from '../command/entry.verb.ts';
import { DEMAND_POLL_MS, DEMAND_WAIT_MS } from '../demand/demand.ts';
import { tried } from '../runtime-client.ts';
import { daemonLine, type DaemonStanding, type HolderKind } from './daemon.ts';
import { daemonStanding } from './daemon.store.ts';
import { StoreRoot } from '../config/root.store.ts';

/** Where the store's daemon stands: the lease's state (`DaemonStanding`'s kind), and its holder's kind and pid where it names them, and
 * the url it serves at while it ticks: a lease that stopped or whose process is gone serves nothing. */
export type DaemonAnswer = {
  readonly state: DaemonStanding['kind'];
  readonly by: HolderKind | null;
  readonly pid: number | null;
  readonly url: string | null;
  readonly line: string;
};

/** The lease read now. */
const standingNow = Effect.flatMap(StoreRoot, (home) => tried(() => daemonStanding(home)));

/** Whether `s` is an api that ticks and has not yet written where it listens: its url comes once it listens. */
const listening = (s: DaemonStanding): boolean => s.kind === 'ticking' && s.file.by === 'api' && s.file.url === undefined;

/**
 * The lease once it says all it will: an api that took the store but does not listen yet is read again every `DEMAND_POLL_MS`, at most
 * `DEMAND_WAIT_MS`, until it writes its url; any other standing is answered as read.
 */
const settledStanding = standingNow.pipe(
  Effect.repeat({ schedule: Schedule.spaced(DEMAND_POLL_MS), until: (s) => !listening(s) }),
  Effect.timeoutOrElse({ duration: DEMAND_WAIT_MS, orElse: () => standingNow }),
);

/** Reads where the store's daemon stands, once a starting api listens. */
export const daemonRead = Effect.fn('daemonRead')(function* () {
  const standing = yield* settledStanding;
  const file = 'file' in standing ? standing.file : undefined;
  return {
    state: standing.kind,
    by: file?.by ?? null,
    pid: file?.pid ?? null,
    url: standing.kind === 'ticking' ? (file?.url ?? null) : null,
    line: daemonLine(standing, Date.now()),
  } satisfies DaemonAnswer;
});

/** `nemia daemon`. */
export const DAEMON: Command<DaemonAnswer> = {
  name: 'daemon',
  usage: '[--json]',
  help: [
    "the store's daemon, started where none ticks it (as any command that",
    'ticks starts it, unless NEMIA_DAEMON_START=off): its state, its pid and',
    'the url the api serves at, from its lease. --json: the whole answer',
  ],
  spec: {
    positionals: [],
    flags: [{ flag: '--json', kind: 'switch', key: 'json' }],
    unknown: (arg) => `nemia daemon does not take ${arg}: nemia daemon [--json].`,
  },
  writes: true,
  class: 'act',
  ticks: true,
  only: { side: 'cli', why: 'the api is the daemon: it answers where it stands at GET /api/daemon' },
  handler: () => daemonRead(),
  print: (data, args) => {
    if (args.json !== true) return [data.line];
    const { line: _line, ...answer } = data;
    return [JSON.stringify(answer)];
  },
};
