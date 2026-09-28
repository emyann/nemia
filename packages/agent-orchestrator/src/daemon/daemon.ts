/**
 * Who ticks the store — pure: `$WF_ROOT/daemon.json`, the file `wf up` takes the store with, judged against a clock and a liveness answer the
 * caller brings, and the words a refusal, a takeover and `wf ls` say of it. `daemon-store.ts` reads the file, asks the process table and writes it;
 * nothing here reads a disk or signals a process.
 *
 * One `wf up` per store, since the tick keeps one writer per file and two ticks are two writers. The file is the daemon's alone: it writes it
 * as it takes the store, after every pass it completes, on a beat of its interval while it lives — a pass in flight included — and as it
 * stops. A second `wf up`, and a `wf tick` by hand, read it and are refused while it names a live process heard from recently (`ticking`);
 * anything else — no file, a file that does not read, a holder that stopped, is gone or has been silent for a long while — is free, and
 * `wf up` takes it over.
 */
import { durationWord } from '../radius.ts';

/** What `wf up` writes into `daemon.json`: who it is, where and how often it ticks, and when its last pass completed — none yet is `null`. */
export type DaemonFile = {
  pid: number;
  startedAt: string;
  cwd: string;
  /** Its pass interval, in milliseconds (`wf up [ms]`): how stale is stale is measured from it (`staleAfterMs`). */
  every: number;
  passedAt: string | null;
  /**
   * The daemon's beat: written on a timer of its interval whatever the pass is doing, so a pass that runs long — installs in several worktrees
   * one after another — still shows its process at work. Absent before the first beat.
   */
  beatAt?: string;
  /**
   * When its process started, in clock ticks since boot (`/proc/<pid>/stat`, field 22): with the pid, it names the process, so a pid reused
   * after the daemon died without a word — `kill -9`, the OOM killer — names another process and holds nothing. Absent where there is no
   * `/proc`, and then the pid cannot be confirmed (`Identity`).
   */
  procStart?: number;
  /** Written as it stops on a signal or a failure: a clean stop frees the store even when the pid is later reused. */
  stoppedAt?: string;
};

/**
 * What the process table says of the file's pid, as the caller finds it: the process that wrote the file (`same` — the pid alive and started
 * when `procStart` says); another under the pid reused (`other`), which holds nothing; a live pid whose start could not be compared (`unknown`
 * — no `/proc`, or a file with no `procStart`), which holds the store, since two writers are the worse mistake, but is never told to a person
 * as a process to kill without a way to check it first; or no process (`gone`).
 */
export type Identity = 'same' | 'other' | 'unknown' | 'gone';

/** The file's name under `WF_ROOT`. */
export const DAEMON_FILE = 'daemon.json';

/** How many of the holder's own intervals without a pass make it stalled — unless the floor below is longer. */
export const STALE_PASSES = 10;

/**
 * The least a holder must be silent to be taken over: fifteen minutes. A pass has no bound — it files every ready step of every run, each
 * perhaps behind an `npm ci` of up to ten minutes — so silence is not measured from the last pass but from the beat, which a timer writes
 * while the pass awaits. What keeps a timer from firing is the event loop held by synchronous work (a `git`, a `du`), or the process
 * stopped (`^Z`, `SIGSTOP`); the floor leaves those room. At the shipped interval of 4000 ms the floor decides.
 */
export const STALE_FLOOR_MS = 15 * 60_000;

/** How long a holder of interval `every` may be silent before it reads as stalled: ten of its intervals, never under fifteen minutes. */
export const staleAfterMs = (every: number): number => Math.max(STALE_PASSES * every, STALE_FLOOR_MS);

/** The longest interval a timer keeps: Node fires a longer one after 1 ms, so `wf up 1e10` would pass without pause and never go stale. */
export const MAX_EVERY_MS = 2 ** 31 - 1;

/** The interval `wf up` ticks at when it is given none. */
export const DEFAULT_EVERY_MS = 4_000;

/**
 * `wf up [ms]`'s interval, or why it is refused. A whole number of milliseconds from 1 to `MAX_EVERY_MS`: the interval is written into the
 * file, and one that does not read there — `-5`, or `1e400`, which JSON writes as `null` — would make the daemon no holder while it ticks.
 */
export function everyOf(arg: string | undefined): { every: number } | { refusal: string } {
  if (arg === undefined) return { every: DEFAULT_EVERY_MS };
  const every = Number(arg);
  if (arg.trim() !== '' && Number.isInteger(every) && every >= 1 && every <= MAX_EVERY_MS) return { every };
  return {
    refusal:
      `wf up takes its pass interval in whole milliseconds, from 1 to ${MAX_EVERY_MS}, and ${JSON.stringify(arg)} is not one: ` +
      `wf up [ms], ${DEFAULT_EVERY_MS} when none is given. The interval is written into ${DAEMON_FILE}, and a holder whose interval does not ` +
      `read there holds nothing: a second wf up would take the store from it while it ticks.`,
  };
}

/**
 * `daemon.json` as it was read: its text, and the file it holds — undefined when the text does not read as one (`parseDaemonFile` in
 * `daemon-store.ts`, which checks it against what `wf up` writes).
 */
export type DaemonRead = { text: string; file: DaemonFile | undefined };

/**
 * Where the store stands: nobody has held it (`none`); a file that does not read as a holder (`unreadable`); a holder that stopped and said so
 * (`stopped`); one whose process is gone (`gone`), its pid dead or now another process's; one alive that has been silent for longer than
 * `staleAfterMs` of its interval (`stalled`); or one ticking. `last` is when it last showed life — the latest of its start, its last pass and
 * its beat — `quiet` how long ago that was, and `identity` what the process table said of its pid.
 */
export type Standing = {
  kind: 'stopped' | 'gone' | 'stalled' | 'ticking';
  file: DaemonFile;
  last: number;
  quiet: number;
  identity: Identity;
};
export type DaemonStanding = { kind: 'none' } | { kind: 'unreadable'; text: string } | Standing;

/**
 * Judge the file as read, `undefined` when there is no file, at `now`, with `identify` answering what the process table says of the file's
 * pid. A stop said is read before the process, so a reused pid does not hold a store its daemon gave up; a process gone or another before
 * staleness, so a crash frees the store at once.
 */
export function daemonStanding(
  read: DaemonRead | undefined,
  { now, identify }: { now: number; identify: (file: DaemonFile) => Identity },
): DaemonStanding {
  if (read === undefined) return { kind: 'none' };
  const { text, file } = read;
  if (!file) return { kind: 'unreadable', text };
  const last = Math.max(...[file.startedAt, file.passedAt, file.beatAt].filter((t): t is string => !!t).map(Date.parse));
  const quiet = now - last;
  const identity = identify(file);
  const kind = file.stoppedAt
    ? 'stopped'
    : identity === 'gone' || identity === 'other'
      ? 'gone'
      : quiet > staleAfterMs(file.every)
        ? 'stalled'
        : 'ticking';
  return { kind, file, last, quiet, identity };
}

/** The holder that keeps `self` off the store — a daemon ticking that is not `self` — or undefined when the store is free to it. */
export const holderAgainst = (standing: DaemonStanding, self: number): Standing | undefined =>
  standing.kind === 'ticking' && standing.file.pid !== self ? standing : undefined;

/**
 * When a holder last passed, in words: `last pass 3s ago (2026-09-22T10:00:04.000Z)`, or `no pass completed yet, started 3s ago (…)` — and,
 * when its beat is more than two intervals past that, that a pass is under way and when the process was last heard from, so a pass that
 * runs long, or never ends, is read as that and not as a daemon at rest.
 */
export function lastPassWords(file: DaemonFile, now: number): string {
  const ago = (t: string) => `${durationWord(now - Date.parse(t))} ago (${t})`;
  const passed = file.passedAt ? `last pass ${ago(file.passedAt)}` : `no pass completed yet, started ${ago(file.startedAt)}`;
  const since = Date.parse(file.passedAt ?? file.startedAt);
  return file.beatAt && Date.parse(file.beatAt) - since > 2 * file.every
    ? `${passed}, a pass under way since — alive ${ago(file.beatAt)}`
    : passed;
}

/**
 * How to stop a daemon, said wherever one is named: its own pid, since an `npm exec` wrapper killed leaves the node child ticking — and, when
 * the pid could not be confirmed as the process that wrote the file, how to check it first, since a pid is reused once its process ends.
 */
const stopWords = ({ file, identity }: Pick<Standing, 'file' | 'identity'>): string =>
  identity === 'same'
    ? `kill ${file.pid} — that pid is the node process that ticks, not an npm exec wrapper around it, which can be killed and leave it ticking`
    : `its pid, once checked: ${file.pid} could not be confirmed here as the process that wrote ${DAEMON_FILE} (${file.procStart === undefined ? 'the file names no process start' : `no /proc/${file.pid}/stat to compare its start with`}), ` +
      `and a pid is reused once its process ends — if ps -p ${file.pid} -o lstart=,args= shows a wf up started at ${file.startedAt}, kill ${file.pid}`;

/**
 * Why `wf up` or a `wf tick` by hand may not tick `store`, held by `holder`: which pid, where and since when, its last pass, how to stop it,
 * and when it would be taken over on its own. A hand tick has no force: a live daemon runs the same pass within its interval.
 */
export function holdRefusal(standing: Standing, verb: 'up' | 'tick', store: string, now: number): string {
  const holder = standing.file;
  const who = `the wf up of pid ${holder.pid}, started ${holder.startedAt} in ${holder.cwd}, every ${holder.every}ms — ${lastPassWords(holder, now)}`;
  const stale = durationWord(staleAfterMs(holder.every));
  return verb === 'up'
    ? `wf up: ${store} is held by ${who}. One store takes one wf up: a second would be a second writer of every file the tick writes. ` +
        `Leave it ticking, or stop it with ${stopWords(standing)}; a holder silent for ${stale} is taken over by the next wf up.`
    : `wf tick: ${store} is held by ${who}, which runs this same pass within its interval: a pass by hand beside it would be a second writer. ` +
        `Wait for its next pass — wf ls says when it was — or stop it with ${stopWords(standing)}, and tick by hand then.`;
}

/** Why a holder is gone: its process ended, or its pid is another process's now — never a pid to kill. */
const goneWords = ({ identity }: Standing): string =>
  identity === 'other'
    ? `whose process is gone — that pid is another process's now, started after the wf up that wrote ${DAEMON_FILE}`
    : 'whose process is gone';

/** What `wf up` says of the holder it took the store from, when that was not a clean stop — or undefined when there is nothing to say. */
export function takeoverLine(replaced: DaemonStanding, store: string, now: number): string | undefined {
  if (replaced.kind === 'unreadable') return `took ${store} over from a ${DAEMON_FILE} that did not read as a holder`;
  if (replaced.kind === 'gone')
    return `took ${store} over from pid ${replaced.file.pid}, ${goneWords(replaced)} — its ${lastPassWords(replaced.file, now)}`;
  if (replaced.kind === 'stalled') {
    return (
      `took ${store} over from pid ${replaced.file.pid}, alive but silent for ${durationWord(replaced.quiet)}, over the ${durationWord(staleAfterMs(replaced.file.every))} that is stale at every ${replaced.file.every}ms — ` +
      `it stops at its next pass, on reading the store is no longer its; to stop it now, ${stopWords(replaced)}`
    );
  }
  return undefined;
}

/** What `wf up` says when, at the start of a pass, the store names another holder: it stops rather than be a second writer. */
export const takenFromLine = (by: DaemonFile | undefined, store: string): string =>
  by
    ? `wf up: ${store} was taken over by the wf up of pid ${by.pid}, started ${by.startedAt} in ${by.cwd} — this one stops rather than be a second writer.`
    : `wf up: ${store} no longer names this wf up as its holder — this one stops rather than be a second writer.`;

/** Said after a holder ticking whose pid could not be confirmed: that it was not, so a person does not take the pid for certain. */
const unconfirmed = ({ file, identity }: Standing): string =>
  identity === 'same' ? '' : ` (pid ${file.pid} not confirmed here as the process that wrote ${DAEMON_FILE})`;

/** `wf ls`'s last line: whether a daemon is ticking the store, and when its last pass was. */
export function daemonLine(standing: DaemonStanding, now: number): string {
  switch (standing.kind) {
    case 'none':
      return 'wf up: none has held this store — nothing ticks it; start one with wf up';
    case 'unreadable':
      return `wf up: none known — ${DAEMON_FILE} does not read as a holder, so nothing is known to tick this store; wf up takes it over`;
    case 'ticking':
      return `wf up: ticking, pid ${standing.file.pid}, every ${standing.file.every}ms — ${lastPassWords(standing.file, now)}${unconfirmed(standing)}`;
    case 'stalled':
      return (
        `wf up: stalled, pid ${standing.file.pid}, every ${standing.file.every}ms — alive, but silent for ${durationWord(standing.quiet)}: ${lastPassWords(standing.file, now)}; ` +
        `the next wf up takes the store over, and ${standing.identity === 'same' ? `kill ${standing.file.pid} stops it` : `stopping it now is by ${stopWords(standing)}`}`
      );
    case 'gone':
      return standing.identity === 'other'
        ? `wf up: none ticking — the wf up of pid ${standing.file.pid} is gone, that pid another process's now; its ${lastPassWords(standing.file, now)}; start one with wf up`
        : `wf up: none ticking — pid ${standing.file.pid} is gone, its ${lastPassWords(standing.file, now)}; start one with wf up`;
    case 'stopped':
      return `wf up: none ticking — pid ${standing.file.pid} stopped ${durationWord(now - Date.parse(standing.file.stoppedAt!))} ago (${standing.file.stoppedAt}), its ${lastPassWords(standing.file, now)}; start one with wf up`;
  }
}

/** The file's text, as `wf up` writes it. */
export const daemonText = (file: DaemonFile): string => `${JSON.stringify(file, null, 2)}\n`;
