/**
 * Who ticks the store — pure: `$WF_ROOT/daemon.json`, the file `wf up` takes the store with, judged against a clock and a liveness answer the
 * caller brings, and the words a refusal, a takeover and `wf ls` say of it. `runner.ts` reads the file, asks the process table and writes it;
 * nothing here reads a disk or signals a process.
 *
 * One `wf up` per store, since the tick keeps one writer per file and two ticks are two writers. The file is the daemon's alone: it writes it
 * as it takes the store, after every pass it completes, and as it stops. A second `wf up`, and a `wf tick` by hand, read it and are refused
 * while it names a live process whose last pass is recent (`ticking`); anything else — no file, a file that does not read, a holder that
 * stopped, is gone or has not passed for a long while — is free, and `wf up` takes it over.
 */
import { durationWord } from './radius.ts';

/** What `wf up` writes into `daemon.json`: who it is, where and how often it ticks, and when its last pass completed — none yet is `null`. */
export type DaemonFile = {
  pid: number;
  startedAt: string;
  cwd: string;
  /** Its pass interval, in milliseconds (`wf up [ms]`): how stale is stale is measured from it (`staleAfterMs`). */
  every: number;
  passedAt: string | null;
  /** Written as it stops on a signal or a failure: a clean stop frees the store even when the pid is later reused. */
  stoppedAt?: string;
};

/** The file's name under `WF_ROOT`. */
export const DAEMON_FILE = 'daemon.json';

/** How many of the holder's own intervals without a pass make it stalled — unless the floor below is longer. */
export const STALE_PASSES = 10;

/**
 * The least a holder must go without a pass to be taken over: fifteen minutes. The heartbeat is written only when a pass completes, and one
 * pass may run an `npm ci` in a worktree for up to ten minutes (`NPM_CI_TIMEOUT_MS` in runner.ts, held below this by a test): a threshold
 * under the longest pass would take the store from a daemon that is working. At the shipped interval of 4000 ms the floor decides.
 */
export const STALE_FLOOR_MS = 15 * 60_000;

/** How long a holder of interval `every` may go without a pass before it reads as stalled: ten of its intervals, never under fifteen minutes. */
export const staleAfterMs = (every: number): number => Math.max(STALE_PASSES * every, STALE_FLOOR_MS);

const isTime = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/**
 * The file as `wf up` writes it, or undefined when the text does not read as one. A pid that is not a positive whole number is not read as
 * one: `kill(0)` and `kill(-n)` signal process groups, not a process.
 */
export function parseDaemonFile(text: string): DaemonFile | undefined {
  let v: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    v = parsed as Record<string, unknown>;
  } catch { return undefined; }
  const { pid, startedAt, cwd, every, passedAt, stoppedAt } = v;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return undefined;
  if (!isTime(startedAt) || typeof cwd !== 'string') return undefined;
  if (typeof every !== 'number' || !Number.isFinite(every) || every <= 0) return undefined;
  if (passedAt !== null && passedAt !== undefined && !isTime(passedAt)) return undefined;
  if (stoppedAt !== undefined && !isTime(stoppedAt)) return undefined;
  return { pid, startedAt, cwd, every, passedAt: passedAt ?? null, ...(stoppedAt !== undefined ? { stoppedAt } : {}) };
}

/**
 * Where the store stands: nobody has held it (`none`); a file that does not read as a holder (`unreadable`); a holder that stopped and said so
 * (`stopped`); one whose process is gone (`gone`); one alive that has not passed within `staleAfterMs` of its interval (`stalled`); or one
 * ticking. `last` is when it last showed life — its last pass, or its start before any — and `quiet` how long ago that was.
 */
export type DaemonStanding =
  | { kind: 'none' }
  | { kind: 'unreadable'; text: string }
  | { kind: 'stopped' | 'gone' | 'stalled' | 'ticking'; file: DaemonFile; last: number; quiet: number };

/**
 * Judge the file's text, `undefined` when there is no file, at `now`, with `alive` answering whether a pid is a live process. A stop said is
 * read before liveness, so a reused pid does not hold a store its daemon gave up; a dead process before staleness, so a crash frees the store
 * at once.
 */
export function daemonStanding(text: string | undefined, { now, alive }: { now: number; alive: (pid: number) => boolean }): DaemonStanding {
  if (text === undefined) return { kind: 'none' };
  const file = parseDaemonFile(text);
  if (!file) return { kind: 'unreadable', text };
  const last = Math.max(Date.parse(file.startedAt), file.passedAt ? Date.parse(file.passedAt) : -Infinity);
  const quiet = now - last;
  const kind = file.stoppedAt ? 'stopped' : !alive(file.pid) ? 'gone' : quiet > staleAfterMs(file.every) ? 'stalled' : 'ticking';
  return { kind, file, last, quiet };
}

/** The holder that keeps `self` off the store — a daemon ticking that is not `self` — or undefined when the store is free to it. */
export const holderAgainst = (standing: DaemonStanding, self: number): DaemonFile | undefined =>
  standing.kind === 'ticking' && standing.file.pid !== self ? standing.file : undefined;

/** When a holder last showed life, in words: `last pass 3s ago (2026-09-22T10:00:04.000Z)`, or `no pass yet, started 3s ago (…)`. */
export function lastPassWords(file: DaemonFile, now: number): string {
  const ago = (t: string) => `${durationWord(now - Date.parse(t))} ago (${t})`;
  return file.passedAt ? `last pass ${ago(file.passedAt)}` : `no pass completed yet, started ${ago(file.startedAt)}`;
}

/** How to stop a daemon, said wherever one is named: its own pid, since an `npm exec` wrapper killed leaves the node child ticking. */
const stopWords = (pid: number): string =>
  `kill ${pid} — that pid is the node process that ticks, not an npm exec wrapper around it, which can be killed and leave it ticking`;

/**
 * Why `wf up` or a `wf tick` by hand may not tick `store`, held by `holder`: which pid, where and since when, its last pass, how to stop it,
 * and when it would be taken over on its own. A hand tick has no force: a live daemon runs the same pass within its interval.
 */
export function holdRefusal(holder: DaemonFile, verb: 'up' | 'tick', store: string, now: number): string {
  const who = `the wf up of pid ${holder.pid}, started ${holder.startedAt} in ${holder.cwd}, every ${holder.every}ms — ${lastPassWords(holder, now)}`;
  const stale = durationWord(staleAfterMs(holder.every));
  return verb === 'up'
    ? `wf up: ${store} is held by ${who}. One store takes one wf up: a second would be a second writer of every file the tick writes. ` +
      `Leave it ticking, or stop it with ${stopWords(holder.pid)}; a holder that has not passed for ${stale} is taken over by the next wf up.`
    : `wf tick: ${store} is held by ${who}, which runs this same pass within its interval: a pass by hand beside it would be a second writer. ` +
      `Wait for its next pass — wf ls says when it was — or stop it with ${stopWords(holder.pid)}, and tick by hand then.`;
}

/** What `wf up` says of the holder it took the store from, when that was not a clean stop — or undefined when there is nothing to say. */
export function takeoverLine(replaced: DaemonStanding, store: string, now: number): string | undefined {
  if (replaced.kind === 'unreadable') return `took ${store} over from a ${DAEMON_FILE} that did not read as a holder`;
  if (replaced.kind === 'gone') return `took ${store} over from pid ${replaced.file.pid}, whose process is gone — its ${lastPassWords(replaced.file, now)}`;
  if (replaced.kind === 'stalled') {
    return `took ${store} over from pid ${replaced.file.pid}, alive but with no pass for ${durationWord(replaced.quiet)}, over the ${durationWord(staleAfterMs(replaced.file.every))} that is stale at every ${replaced.file.every}ms — ` +
      `it stops at its next pass, on reading the store is no longer its; ${stopWords(replaced.file.pid)}`;
  }
  return undefined;
}

/** What `wf up` says when, at the start of a pass, the store names another holder: it stops rather than be a second writer. */
export const takenFromLine = (by: DaemonFile | undefined, store: string): string =>
  by
    ? `wf up: ${store} was taken over by the wf up of pid ${by.pid}, started ${by.startedAt} in ${by.cwd} — this one stops rather than be a second writer.`
    : `wf up: ${store} no longer names this wf up as its holder — this one stops rather than be a second writer.`;

/** `wf ls`'s last line: whether a daemon is ticking the store, and when its last pass was. */
export function daemonLine(standing: DaemonStanding, now: number): string {
  switch (standing.kind) {
    case 'none': return 'wf up: none has held this store — nothing ticks it; start one with wf up';
    case 'unreadable': return `wf up: none known — ${DAEMON_FILE} does not read as a holder, so nothing is known to tick this store; wf up takes it over`;
    case 'ticking': return `wf up: ticking, pid ${standing.file.pid}, every ${standing.file.every}ms — ${lastPassWords(standing.file, now)}`;
    case 'stalled':
      return `wf up: stalled, pid ${standing.file.pid}, every ${standing.file.every}ms — alive, but ${lastPassWords(standing.file, now)}; ` +
        `the next wf up takes the store over, and kill ${standing.file.pid} stops it`;
    case 'gone': return `wf up: none ticking — pid ${standing.file.pid} is gone, its ${lastPassWords(standing.file, now)}; start one with wf up`;
    case 'stopped':
      return `wf up: none ticking — pid ${standing.file.pid} stopped ${durationWord(now - Date.parse(standing.file.stoppedAt!))} ago (${standing.file.stoppedAt}), its ${lastPassWords(standing.file, now)}; start one with wf up`;
  }
}

/** The file's text, as `wf up` writes it. */
export const daemonText = (file: DaemonFile): string => `${JSON.stringify(file, null, 2)}\n`;
