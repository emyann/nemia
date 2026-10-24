/**
 * Whether a daemon ticks the store — the api's process or a `nemia up` — as the board asks it: the package's own judgement of
 * `$WF_ROOT/daemon.json` (`daemonStanding`), read and never written — the file is the daemon's alone — turned into facts the board words in
 * the person's own time. `line` is `nemia ls`'s last line, so the board and the terminal say the same thing of the same file.
 */
import {
  daemonLine,
  daemonStanding,
  type DaemonStanding,
  holderName,
  type Identity,
  lastPassCost,
  type PassCostRead,
  staleAfterMs,
} from 'agent-orchestrator';

/** How a person starts the store's daemon where none ticks: the api's own process, which serves the board as it ticks. */
export const START = 'npm start in apps/api';

/**
 * Where the store stands (`kind`, the package's `DaemonStanding`): `ticking` alone is a daemon moving the runs. Every time is ISO, and null
 * where the file says none: `startedAt` since when the daemon has held the store, `passedAt` its last pass completed, `lastHeardAt` the
 * latest of its start, its last pass and its beat on the wall clock, said to a person; the package measures the silence beside it on the
 * monotonic clock, and `staleAfterMs` of silence makes a live daemon `stalled`.
 * `identity` is what the api's own process table said of the pid (the package's `Identity`). `by` is which kind of daemon wrote the file,
 * as a line says it: `api` or `nemia up` (`holderName`), and `url` where an api holder serves the board, null for a `nemia
 * up`. `start` is how a person starts one (`START`). A file that does not read has no fields.
 * `unobserved` is why the daemon's last pass could not read a harness, in the runtime's words (`PassCost.unobserved`): said only while it
 * ticks and of a pass since it started, empty otherwise.
 */
export type Daemon = {
  kind: DaemonStanding['kind'];
  by: string | null;
  url: string | null;
  start: string;
  ticking: boolean;
  pid: number | null;
  cwd: string | null;
  every: number | null;
  startedAt: string | null;
  passedAt: string | null;
  lastHeardAt: string | null;
  stoppedAt: string | null;
  staleAfterMs: number | null;
  identity: Identity | null;
  line: string;
  unobserved: readonly string[];
};

/**
 * The standing as the board reads it, at `now`: pure. `pass` is the last pass's cost as the store kept it (`lastPassCost`), null where
 * none reads; its `unobserved` is the daemon's only while it ticks and the pass is not older than its start.
 */
export function daemonOf(standing: DaemonStanding, now: number, pass: PassCostRead | null = null): Daemon {
  const line = daemonLine(standing, now);
  if (standing.kind === 'none' || standing.kind === 'unreadable') {
    return {
      kind: standing.kind,
      by: null,
      url: null,
      start: START,
      ticking: false,
      pid: null,
      cwd: null,
      every: null,
      startedAt: null,
      passedAt: null,
      lastHeardAt: null,
      stoppedAt: null,
      staleAfterMs: null,
      identity: null,
      line,
      unobserved: [],
    };
  }
  const { file } = standing;
  return {
    kind: standing.kind,
    by: holderName(file.by),
    url: file.url ?? null,
    start: START,
    ticking: standing.kind === 'ticking',
    pid: file.pid,
    cwd: file.cwd,
    every: file.every,
    startedAt: file.startedAt,
    passedAt: file.passedAt,
    lastHeardAt: new Date(standing.last).toISOString(),
    stoppedAt: file.stoppedAt ?? null,
    staleAfterMs: staleAfterMs(file.every),
    identity: standing.identity,
    line,
    unobserved:
      standing.kind === 'ticking' && pass && Date.parse(pass.at) >= Date.parse(file.startedAt) ? [...(pass.unobserved ?? [])] : [],
  };
}

/**
 * Whether a daemon ticks the store now: the file read and the process table asked, as `nemia ls` asks them, the package reading both
 * clocks, with the last pass's cost; `now` is the wall time its ages are worded at. Throws what the package throws of a file that is
 * there and cannot be read — a store that cannot be read cannot be said to tick or not.
 */
export const readDaemon = (now = Date.now()): Daemon => daemonOf(daemonStanding(), now, lastPassCost() ?? null);
