/**
 * Who ticks the store — pure: `$WF_ROOT/daemon.json`, the lease a daemon takes the store with, judged against a clock and a liveness answer
 * the caller brings, and the words a refusal, a takeover and `nemia ls` say of it. `daemon.store.ts` reads the file, asks the process table
 * and writes it; nothing here reads a disk or signals a process.
 *
 * One daemon per store, since the tick keeps one writer per file and two ticks are two writers: the api's process, which serves the board
 * and ticks (`by: 'api'`), or a `nemia up` on a machine with no board (`by: 'up'`). The file is the daemon's alone: it writes it as it
 * takes the store, after every pass it completes, on a beat of its interval while it lives — a pass in flight included — and as it stops.
 * A second daemon of either kind, and a `nemia tick` by hand, read it and are refused while it names a live process heard from recently
 * (`ticking`); anything else — no file, a file that does not read, a holder that stopped, is gone or has been silent for a long while — is
 * free, and the next daemon takes it over.
 */
import { durationWord } from '../status/status.ts';

/**
 * A reading of the machine's monotonic clock, in whole milliseconds, under the id of the boot it was taken in: shared by every process of
 * that boot. The runtime's own `Monotonic` (its `core/clock.ts`), copied for the daemon's lease: the pure judgement and the store that read
 * `daemon.json` may not import the runtime's client, and the copy goes with the lease when it moves into the runtime.
 */
export type Monotonic = { boot: string; ms: number };

/** A moment as the daemon stamps it: its wall-clock time `at`, in epoch milliseconds, and its monotonic reading when it had one. */
export type Instant = { at: number; mono?: Monotonic };

/**
 * How many milliseconds passed from `from` to `to`: the monotonic difference when both carry a reading of the same boot, the wall-clock
 * difference otherwise — a reading missing on either side, or the two from different boots. The runtime's `elapsedMs`, copied with
 * `Monotonic`.
 */
export const elapsedMs = (from: Instant, to: Instant): number =>
  from.mono && to.mono && from.mono.boot === to.mono.boot ? to.mono.ms - from.mono.ms : to.at - from.at;

/** Which daemon holds the store: the api's process, or a `nemia up`. */
export type HolderKind = 'api' | 'up';

/**
 * What a daemon writes into `daemon.json`: who it is, where and how often it ticks, and when its last pass completed — none yet is `null`.
 * Each of its start, its last pass and its beat is stamped on the wall clock (`startedAt`, `passedAt`, `beatAt`) and, where the machine
 * says its boot, on the monotonic clock beside it (`startedMono`, `passedMono`, `beatMono`), written together or the reading left out.
 */
export type DaemonFile = {
  pid: number;
  /** Which daemon it is; a file with none was written by a `nemia up` before the api held the store, and reads as `up`. */
  by: HolderKind;
  /** Where the api serves the board, written once it listens (`holdUrl`); never for a `nemia up`. */
  url?: string;
  startedAt: string;
  startedMono?: Monotonic;
  cwd: string;
  /** Its pass interval, in milliseconds (`nemia up [ms]`): how stale is stale is measured from it (`staleAfterMs`). */
  every: number;
  passedAt: string | null;
  passedMono?: Monotonic;
  /**
   * The daemon's beat: written on a timer of its interval whatever the pass is doing, so a pass that runs long — installs in several
   * worktrees one after another — still shows its process at work. Absent before the first beat.
   */
  beatAt?: string;
  beatMono?: Monotonic;
  /**
   * When its process started, in clock ticks since boot (`/proc/<pid>/stat`, field 22): with the pid, it names the process, so a pid reused
   * after the daemon died without a word — `kill -9`, the OOM killer — names another process and holds nothing. Absent where there is no
   * `/proc`, and then the pid cannot be confirmed (`Identity`).
   */
  procStart?: number;
  /** Written as it stops on a signal or a failure: a clean stop frees the store even when the pid is later reused. */
  stoppedAt?: string;
  /** The code it runs, written as it takes the store (`leaseRelease`); absent from a daemon started before releases. */
  release?: LeaseRelease;
  /**
   * What the engine of the process that holds the lease serves on its own port, by the harness each card is for: written beside its
   * `url` right after it took the lease and held its engine (`heldServes`), by that process alone, and read by any other process
   * on this store that wants to follow one of those sessions live rather than off the files (`servesOnStore`).
   *
   * The cards are opaque here: this layer neither reads nor judges them — the runtime does, at the follow it configures with
   * them. Nothing secret is on them, and nothing secret is on this file: the token a viewer needs to dial that port is kept by the
   * holder's own engine, 0600 in its store, and is asked for there. Absent from a daemon that holds no such session, and from one
   * started before this.
   */
  serves?: Record<string, Record<string, unknown>>;
};

/** The code a daemon runs, as its lease records it: a checkout or an install, its folder, and an install's tag and commit. */
export type LeaseRelease = { kind: 'checkout' | 'install'; root: string; tag?: string; commit?: string };

/**
 * What the process table says of the file's pid, as the caller finds it: the process that wrote the file (`same` — the pid alive and
 * started when `procStart` says); another under the pid reused (`other`), which holds nothing; a live pid whose start could not be compared
 * (`unknown` — no `/proc`, or a file with no `procStart`), which holds the store, since two writers are the worse mistake, but is never
 * told to a person as a process to kill without a way to check it first; or no process (`gone`).
 */
export type Identity = 'same' | 'other' | 'unknown' | 'gone';

/** A holder's kind as a line says it: `api`, or `nemia up`. */
export const holderName = (kind: HolderKind): string => (kind === 'up' ? 'nemia up' : kind);

/** A holder named for a person: `the api of pid 12 at http://127.0.0.1:8787`, `the api of pid 12`, or `the nemia up of pid 12`. */
export const holderWords = (file: Pick<DaemonFile, 'by' | 'pid' | 'url'>): string =>
  file.by === 'api' ? `the api of pid ${file.pid}${file.url ? ` at ${file.url}` : ''}` : `the nemia up of pid ${file.pid}`;

/**
 * How a daemon is started, said wherever none ticks: the api, which serves the board too, a `nemia up` where none is served, or a command
 * that ticks (`ensureDaemon`).
 */
export const START_WORDS =
  'start one with npm start in apps/api, or nemia up where no board is served — or any nemia command that files work starts one';

/** The file's name under `WF_ROOT`. */
export const DAEMON_FILE = 'daemon.json';

/** How many of the holder's own intervals without a pass make it stalled — unless the floor below is longer. */
export const STALE_PASSES = 10;

/**
 * The least a holder must be silent to be taken over: fifteen minutes. A pass has no bound — it files every ready step of every run, each
 * perhaps behind an `npm ci` of up to ten minutes — so silence is not measured from the last pass but from the beat, which a timer writes
 * while the pass awaits. What keeps a timer from firing is the event loop held by synchronous work (a `git`, a `du`), or the process
 * stopped (`^Z`, `SIGSTOP`); the floor leaves those room. At the default interval of 4000 ms the floor decides.
 */
export const STALE_FLOOR_MS = 15 * 60_000;

/** How long a holder of interval `every` may be silent before it reads as stalled: ten of its intervals, never under fifteen minutes. */
export const staleAfterMs = (every: number): number => Math.max(STALE_PASSES * every, STALE_FLOOR_MS);

/**
 * The longest interval a timer keeps: Node fires a longer one after 1 ms, so `nemia up 1e10` would pass without pause and never go stale.
 */
export const MAX_EVERY_MS = 2 ** 31 - 1;

/** The interval `nemia up` ticks at when it is given none. */
export const DEFAULT_EVERY_MS = 4_000;

/**
 * `nemia up [ms]`'s interval, or why it is refused. A whole number of milliseconds from 1 to `MAX_EVERY_MS`: the interval is written into
 * the file, and one that does not read there — `-5`, or `1e400`, which JSON writes as `null` — would make the daemon no holder while it
 * ticks.
 */
export function everyOf(arg: string | undefined): { every: number } | { refusal: string } {
  if (arg === undefined) return { every: DEFAULT_EVERY_MS };
  const every = Number(arg);
  if (arg.trim() !== '' && Number.isInteger(every) && every >= 1 && every <= MAX_EVERY_MS) return { every };
  return {
    refusal:
      `nemia up takes its pass interval in whole milliseconds, from 1 to ${MAX_EVERY_MS}, and ${JSON.stringify(arg)} is not one: ` +
      `nemia up [ms], ${DEFAULT_EVERY_MS} when none is given. The interval is written into ${DAEMON_FILE}, and a holder whose interval does not ` +
      `read there holds nothing: a second nemia up would take the store from it while it ticks.`,
  };
}

/**
 * `daemon.json` as it was read: its text, and the file it holds — undefined when the text does not read as one (`parseDaemonFile` in
 * `daemon.store.ts`, which checks it against what `nemia up` writes).
 */
export type DaemonRead = { text: string; file: DaemonFile | undefined };

/**
 * Where the store stands: nobody has held it (`none`); a file that does not read as a holder (`unreadable`); a holder that stopped and said
 * so (`stopped`); one whose process is gone (`gone`), its pid dead or now another process's; one alive that has been silent for longer than
 * `staleAfterMs` of its interval (`stalled`); or one ticking. `quiet` is how long it has been silent: the least time since its start, its
 * last pass and its beat, each measured with `elapsedMs`, so on the monotonic clock within a boot and a stepped wall clock never makes a
 * live daemon stalled. `last` is the latest of those stamps on the wall clock, and is only said to a person, as are the ages
 * `lastPassWords`, `daemonLine`, `holdRefusal` and `takeoverLine` print. `identity` is what the process table said of its pid.
 */
export type Standing = {
  kind: 'stopped' | 'gone' | 'stalled' | 'ticking';
  file: DaemonFile;
  last: number;
  quiet: number;
  identity: Identity;
};
export type DaemonStanding = { kind: 'none' } | { kind: 'unreadable'; text: string } | Standing;

/** The file's stamps of life, each its wall time with the monotonic reading written beside it: its start, its last pass and its beat. */
const stampsOf = (file: DaemonFile): Instant[] =>
  [
    { at: file.startedAt, mono: file.startedMono },
    { at: file.passedAt, mono: file.passedMono },
    { at: file.beatAt, mono: file.beatMono },
  ].flatMap(({ at, mono }) => (at ? [{ at: Date.parse(at), ...(mono ? { mono } : {}) }] : []));

/**
 * Judge the file as read, `undefined` when there is no file, at `now` (both clocks), with `identify` answering what the process table says
 * of the file's pid. A stop said is read before the process, so a reused pid does not hold a store its daemon gave up; a process gone or
 * another before staleness, so a crash frees the store at once.
 */
export function daemonStanding(
  read: DaemonRead | undefined,
  { now, identify }: { now: Instant; identify: (file: DaemonFile) => Identity },
): DaemonStanding {
  if (read === undefined) return { kind: 'none' };
  const { text, file } = read;
  if (!file) return { kind: 'unreadable', text };
  const stamps = stampsOf(file);
  const last = Math.max(...stamps.map((s) => s.at));
  const quiet = Math.min(...stamps.map((s) => elapsedMs(s, now)));
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
 * How to stop a daemon, said wherever one is named: its own pid, since an `npm exec` wrapper killed leaves the node child ticking — and,
 * when the pid could not be confirmed as the process that wrote the file, how to check it first, since a pid is reused once its process
 * ends.
 */
const stopWords = ({ file, identity }: Pick<Standing, 'file' | 'identity'>): string =>
  identity === 'same'
    ? `kill ${file.pid} — that pid is the node process that ticks, not an npm wrapper around it, which can be killed and leave it ticking`
    : `its pid, once checked: ${file.pid} could not be confirmed here as the process that wrote ${DAEMON_FILE} (${file.procStart === undefined ? 'the file names no process start' : `no /proc/${file.pid}/stat to compare its start with`}), ` +
      `and a pid is reused once its process ends — if ps -p ${file.pid} -o lstart=,args= shows ${file.by === 'api' ? 'the api' : 'a nemia up'} started at ${file.startedAt}, kill ${file.pid}`;

/**
 * Why a daemon — `nemia up`, or the api (`verb`) — or a `nemia tick` by hand may not tick `store`, held by `holder` of either kind: which
 * one, its pid, url, where and since when, its last pass, how to stop it, and when it would be taken over on its own. An api is told it can
 * serve beside it with `--no-tick`. A hand tick has no force: a live daemon runs the same pass within its interval.
 */
export function holdRefusal(standing: Standing, verb: 'up' | 'api' | 'tick', store: string, now: number): string {
  const holder = standing.file;
  const who = `${holderWords(holder)}, started ${holder.startedAt} in ${holder.cwd}, every ${holder.every}ms — ${lastPassWords(holder, now)}`;
  const stale = durationWord(staleAfterMs(holder.every));
  const second = `One store takes one daemon, the api or a nemia up: a second would be a second writer of every file the tick writes.`;
  if (verb === 'tick')
    return (
      `nemia tick: ${store} is held by ${who}, which runs this same pass within its interval: a pass by hand beside it would be a second writer. ` +
      `Wait for its next pass — nemia ls says when it was — or stop it with ${stopWords(standing)}, and tick by hand then.`
    );
  return verb === 'up'
    ? `nemia up: ${store} is held by ${who}. ${second} Leave it ticking, or stop it with ${stopWords(standing)}; a holder silent for ${stale} is taken over by the next daemon.`
    : `api: ${store} is held by ${who}. ${second} Leave it ticking and serve a board beside it with --no-tick, or start this api again once it has stopped: ` +
        `stop it with ${stopWords(standing)}; a holder silent for ${stale} is taken over by the next daemon.`;
}

/** Why a holder is gone: its process ended, or its pid is another process's now — never a pid to kill. */
const goneWords = ({ identity }: Standing): string =>
  identity === 'other'
    ? `whose process is gone — that pid is another process's now, started after the nemia up that wrote ${DAEMON_FILE}`
    : 'whose process is gone';

/** What a daemon says of the holder it took the store from, when that was not a clean stop — or undefined when there is nothing to say. */
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

/**
 * What a daemon of kind `self` says when, at the start of a pass, the store names another holder: it stops rather than be a second
 * writer.
 */
export const takenFromLine = (by: DaemonFile | undefined, store: string, self: HolderKind = 'up'): string =>
  by
    ? `${holderName(self)}: ${store} was taken over by ${holderWords(by)}, started ${by.startedAt} in ${by.cwd} — this one stops rather than be a second writer.`
    : `${holderName(self)}: ${store} no longer names this ${holderName(self)} as its holder — this one stops rather than be a second writer.`;

/** Said after a holder ticking whose pid could not be confirmed: that it was not, so a person does not take the pid for certain. */
const unconfirmed = ({ file, identity }: Standing): string =>
  identity === 'same' ? '' : ` (pid ${file.pid} not confirmed here as the process that wrote ${DAEMON_FILE})`;

/** Where an api holder serves, said after its pid: ` at http://127.0.0.1:8787`, or nothing. */
const at = (file: DaemonFile): string => (file.url ? ` at ${file.url}` : '');

/**
 * `nemia ls`'s last line: whether a daemon is ticking the store, which — the api, with its url, or a `nemia up` — and when its last pass
 * was. The line starts with the holder's kind, `daemon` when the store names none.
 */
export function daemonLine(standing: DaemonStanding, now: number): string {
  switch (standing.kind) {
    case 'none':
      return `daemon: none has held this store — nothing ticks it; ${START_WORDS}`;
    case 'unreadable':
      return `daemon: none known — ${DAEMON_FILE} does not read as a holder, so nothing is known to tick this store; the next daemon takes it over`;
    case 'ticking':
      return `${holderName(standing.file.by)}: ticking, pid ${standing.file.pid}${at(standing.file)}, every ${standing.file.every}ms — ${lastPassWords(standing.file, now)}${unconfirmed(standing)}`;
    case 'stalled':
      return (
        `${holderName(standing.file.by)}: stalled, pid ${standing.file.pid}${at(standing.file)}, every ${standing.file.every}ms — alive, but silent for ${durationWord(standing.quiet)}: ${lastPassWords(standing.file, now)}; ` +
        `the next daemon takes the store over, and ${standing.identity === 'same' ? `kill ${standing.file.pid} stops it` : `stopping it now is by ${stopWords(standing)}`}`
      );
    case 'gone':
      return standing.identity === 'other'
        ? `${holderName(standing.file.by)}: none ticking — ${holderWords(standing.file)} is gone, that pid another process's now; its ${lastPassWords(standing.file, now)}; ${START_WORDS}`
        : `${holderName(standing.file.by)}: none ticking — pid ${standing.file.pid} is gone, its ${lastPassWords(standing.file, now)}; ${START_WORDS}`;
    case 'stopped':
      return `${holderName(standing.file.by)}: none ticking — pid ${standing.file.pid} stopped ${durationWord(now - Date.parse(standing.file.stoppedAt!))} ago (${standing.file.stoppedAt}), its ${lastPassWords(standing.file, now)}; ${START_WORDS}`;
  }
}

/** The file's text, as `nemia up` writes it. */
export const daemonText = (file: DaemonFile): string => `${JSON.stringify(file, null, 2)}\n`;

/** Whether a daemon ticks the store, read off its lease at `at`, with its line (`daemonLine`): what `nemia watch` says when it changes. */
export type Liveness = { state: 'up' | 'down'; at: string; text: string };

/** The store's liveness at `now`: `up` while a daemon is ticking it, `down` while none is — stopped, gone, stalled, unreadable or none. */
export const livenessLine = (standing: DaemonStanding, now: number): Liveness => ({
  state: standing.kind === 'ticking' ? 'up' : 'down',
  at: new Date(now).toISOString(),
  text: daemonLine(standing, now),
});

/** A liveness line as `nemia watch` prints it: `12:00:00  daemon down  · <its daemon line>`, or one JSON object, which no cursor has. */
export const livenessWords = (l: Liveness, json = false): string =>
  json ? JSON.stringify({ liveness: l.state, at: l.at, note: l.text }) : `${l.at.slice(11, 19)}  daemon ${l.state}  · ${l.text}`;
