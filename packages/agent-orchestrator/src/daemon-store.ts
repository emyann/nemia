/**
 * The store's two files about the tick itself: `tick.json`, the ceilings the last pass ran with, and `daemon.json`, who ticks the store —
 * read, judged by `daemon.ts`'s pure half against the process table, and written.
 *
 * Beneath the controllers, beside `store.ts`: it imports neither the engine nor a controller, and `runner.ts` re-exports what it exported of
 * this before.
 */
import fs from 'node:fs';
import path from 'node:path';
import { HOME } from './store.ts';
import { runCapOf } from './run.ts';
import { parsePassCost, type PassCost } from './meter.ts';
import { DAEMON_FILE, daemonStanding as standingOf, daemonText, holderAgainst, holdRefusal, parseDaemonFile, type DaemonFile, type DaemonStanding, type Identity } from './daemon.ts';

/**
 * The daemon's two ceilings, read from the environment when asked. `sessions` (`WF_MAX_CONCURRENT`, 2 unless set) is the tick's admission's
 * (`toAdmit` in `admission.ts`): sessions per pool at once, counted apart for each — a check on the `check` harness is in a pool of its own,
 * and a `dev` run's review competes with another run's implement, both on `claude`. `runs` (`WF_MAX_RUNS`, `runCapOf`) is the tick's: runs in flight at once, 0 — or unset — for no cap.
 */
export const ceilings = (): { sessions: number; runs: number } => ({
  sessions: Number(process.env.WF_MAX_CONCURRENT) || 2,
  runs: runCapOf(process.env.WF_MAX_RUNS),
});

/**
 * What the last pass ran with: `$WF_ROOT/tick.json`, the tick's to write — the ceilings of the process that ran it, `wf up`'s or `wf tick`'s.
 * `wf ls` and `wf decide` run in a shell of their own, whose environment is not the daemon's: `WF_MAX_CONCURRENT=4 WF_MAX_RUNS=2 wf up` sets
 * the cap on the daemon alone, and read from the shell, a run the daemon holds read as plain `waiting`.
 */
const tickFile = (): string => path.join(HOME, 'tick.json');

/** The ceilings the last pass ran with (`tickFile`), or undefined before any pass has written them, or when the file does not read as them. */
export function lastCeilings(): { sessions: number; runs: number } | undefined {
  try {
    const c = JSON.parse(fs.readFileSync(tickFile(), 'utf8')) as { sessions?: unknown; runs?: unknown };
    const count = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
    return typeof c.sessions === 'number' && count(c.runs) ? { sessions: c.sessions, runs: c.runs } : undefined;
  } catch { return undefined; }
}

/**
 * The ceilings a pass runs with, written down for `wf ls` and `wf decide` — only when they differ from what is there, and through a hidden file
 * renamed over it, so a reader never reads half of it. A store that cannot be written loses only this: a reader falls back to its own
 * environment, and the pass goes on.
 */
export function recordCeilings(c: { sessions: number; runs: number }): void {
  const last = lastCeilings();
  if (last && last.sessions === c.sessions && last.runs === c.runs) return;
  const hidden = path.join(HOME, `.tick.json.${process.pid}`);
  try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(hidden, JSON.stringify({ sessions: c.sessions, runs: c.runs }, null, 2));
    fs.renameSync(hidden, tickFile());
  } catch { /* read from the reader's own environment instead */ }
}

/**
 * What the last pass cost, phase by phase: `$WF_ROOT/tick-stats.json`, written by the pass that measured it, `wf up`'s or `wf tick`'s, and
 * read by `wf up --stats` and the api. One pass's numbers, replaced by the next's: nothing reads it to decide.
 */
export const statsFile = (): string => path.join(HOME, 'tick-stats.json');

/** The last pass's cost (`statsFile`), or undefined before any pass has written one, or when the file does not read as one. */
export function lastPassCost(): PassCost | undefined {
  let text: string;
  try { text = fs.readFileSync(statsFile(), 'utf8'); } catch { return undefined; }
  return parsePassCost(text);
}

/**
 * A pass's cost written down, through a hidden file renamed over the last, so a reader never reads half of it. A store that cannot be written
 * loses only this, and the pass goes on. Answers with the time the write took, which is measuring's too.
 */
export function recordPassCost(cost: PassCost): number {
  const t0 = performance.now();
  const hidden = path.join(HOME, `.tick-stats.json.${process.pid}`);
  try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(hidden, JSON.stringify(cost, null, 2));
    fs.renameSync(hidden, statsFile());
  } catch { /* the next pass writes it again */ }
  return performance.now() - t0;
}

// ─── who ticks the store ────────────────────────────────────────────────────

/** `$WF_ROOT/daemon.json`: the store taken by one `wf up`, written by it alone (`daemon.ts`). */
export const daemonFile = (): string => path.join(HOME, DAEMON_FILE);

/** The file's text, or undefined when there is none. Any other failure to read it is thrown: a store that cannot be read cannot be judged free. */
function readDaemon(): string | undefined {
  try { return fs.readFileSync(daemonFile(), 'utf8'); } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

/** Whether `pid` is a live process on this host: a signal 0 delivered, or refused for want of permission, which still means it is there. */
export function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (err) { return (err as NodeJS.ErrnoException).code === 'EPERM'; }
}

/**
 * When process `pid` started, in clock ticks since boot: field 22 of `/proc/<pid>/stat`, read after the last `)`, since the command name
 * before it may hold spaces and parentheses. Undefined where there is no `/proc`, or the process is gone.
 */
export function procStartOf(pid: number): number | undefined {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const start = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]);
    return Number.isInteger(start) ? start : undefined;
  } catch { return undefined; }
}

/** What the process table says of the file's pid (`Identity` in daemon.ts): alive, and whether it is the process that wrote the file. */
export function identify(file: DaemonFile): Identity {
  if (!alive(file.pid)) return 'gone';
  const start = file.procStart === undefined ? undefined : procStartOf(file.pid);
  if (start === undefined) return alive(file.pid) ? 'unknown' : 'gone';
  return start === file.procStart ? 'same' : 'other';
}

/** Where the store stands now: who holds it, and whether it ticks (`daemonStanding` in daemon.ts, off the file and the process table). */
export const daemonStanding = (now = Date.now()): DaemonStanding => standingOf(readDaemon(), { now, identify });

/** The file written whole, through a hidden file renamed over it, so a reader never reads half of it. */
function writeDaemon(file: DaemonFile): void {
  const hidden = path.join(HOME, `.${DAEMON_FILE}.${process.pid}`);
  fs.writeFileSync(hidden, daemonText(file));
  fs.renameSync(hidden, daemonFile());
}

/** What `takeStore` took: the file this daemon now holds the store by, and where the store stood before it. */
export type TakenStore = { held: DaemonFile; replaced: DaemonStanding };

/**
 * `wf up` takes the store: refused by name, exit 2, while another daemon ticks it (`holdRefusal`); otherwise the file names this process. An
 * empty store is claimed with a link, which fails when the file appeared in between, so two starts on an empty store cannot both win — the
 * loser judges again. A file already there is replaced by a rename; two takeovers of one stale file both rename, and the loser learns it at
 * its first pass (`stillHeld`).
 */
export function takeStore({ every, cwd, now = Date.now() }: { every: number; cwd: string; now?: number }): TakenStore {
  fs.mkdirSync(HOME, { recursive: true });
  const procStart = procStartOf(process.pid);
  const held: DaemonFile = { pid: process.pid, startedAt: new Date(now).toISOString(), cwd, every, passedAt: null, ...(procStart !== undefined ? { procStart } : {}) };
  for (let tries = 0; ; tries++) {
    const replaced = daemonStanding(now);
    const holder = holderAgainst(replaced, process.pid);
    if (holder) throw Object.assign(new Error(holdRefusal(holder, 'up', HOME, now)), { exitCode: 2 });
    if (replaced.kind !== 'none') {
      writeDaemon(held);
      return { held, replaced };
    }
    const hidden = path.join(HOME, `.${DAEMON_FILE}.${process.pid}`);
    fs.writeFileSync(hidden, daemonText(held));
    try {
      fs.linkSync(hidden, daemonFile());
      return { held, replaced };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST' || tries >= 2) throw err;
    } finally {
      fs.rmSync(hidden, { force: true });
    }
  }
}

/**
 * Whether the store is still this daemon's, read at the start of each pass: undefined when it is — the file names this process, or there is no
 * file or none that reads, which the next write puts right — or the file of whoever took it over.
 */
export function stillHeld(held: DaemonFile): DaemonFile | undefined {
  const text = readDaemon();
  const file = text === undefined ? undefined : parseDaemonFile(text);
  return file && file.pid !== held.pid ? file : undefined;
}

/**
 * Write down a pass this daemon completed — only while the store is still its own: a file that names another holder is that holder's to
 * write. Answers the file as it now stands.
 */
export function passed(held: DaemonFile, at = new Date().toISOString()): DaemonFile {
  const now = { ...held, passedAt: at };
  if (!stillHeld(held)) writeDaemon(now);
  return now;
}

/**
 * The daemon's beat, on a timer of its interval: `beatAt` written into its own file, whatever the pass is doing — only while the file names
 * this daemon, as it took the store, and it has not let it go; a file gone or unreadable is the next pass's to write. Never thrown: it runs
 * on a timer, where a throw would end the process mid-pass.
 */
export function beat(held: DaemonFile, at = new Date().toISOString()): void {
  try {
    const text = readDaemon();
    const file = text === undefined ? undefined : parseDaemonFile(text);
    if (file?.pid === held.pid && file.startedAt === held.startedAt && !file.stoppedAt) writeDaemon({ ...file, beatAt: at });
  } catch { /* the next pass writes the file, or fails saying why */ }
}

/**
 * Let the store go: `stoppedAt` written, so the store reads free at once and a reused pid never holds it — only while the file still names
 * this daemon. Never thrown: it runs as the process stops, on a signal or a failure, and a store that cannot be written is read free anyway
 * once the process is gone.
 */
export function releaseStore(held: DaemonFile, at = new Date().toISOString()): void {
  try {
    const text = readDaemon();
    const file = text === undefined ? undefined : parseDaemonFile(text);
    if (file?.pid === held.pid && !file.stoppedAt) writeDaemon({ ...file, stoppedAt: at });
  } catch { /* read as gone once the process is */ }
}

/** Why a pass by hand may not run now — a daemon ticks the store — or undefined when it may. A `wf tick` never writes the file. */
export function storeRefusal(verb: 'tick', now = Date.now()): string | undefined {
  const holder = holderAgainst(daemonStanding(now), process.pid);
  return holder ? holdRefusal(holder, verb, HOME, now) : undefined;
}
