/**
 * The store's files about the tick itself: `tick.json`, the ceilings the last pass ran with; `tick-stats.json` and `tick-recent.json`,
 * what the last pass and the recent ones cost; and `daemon.json`, who ticks the store — read, judged by `daemon.ts`'s pure half against
 * the process table, and written.
 *
 * Beneath the controllers, beside `record.store.ts`: it imports neither the engine nor a controller, and `runner.ts` re-exports what the
 * package exports of it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { HOME } from '../record/record.store.ts';
import { maxConcurrent, maxRuns } from '../config/config.store.ts';
import {
  PHASES,
  RECENT_KEPT,
  recentOf,
  type AlsoKept,
  type PassCost,
  type PassCostRead,
  type Phase,
  type RecentPass,
} from '../meter/index.ts';
import {
  DAEMON_FILE,
  daemonStanding as standingOf,
  daemonText,
  holderAgainst,
  holdRefusal,
  type DaemonFile,
  type DaemonRead,
  type DaemonStanding,
  type HolderKind,
  type Identity,
  type Instant,
  type LeaseRelease,
  type Monotonic,
} from './daemon.ts';
import { Conflict } from '../refusal/refusal.ts';
import { ALL_KINDS, DISK_PARTS } from '../disk/disk.ts';

/** The text as JSON, or undefined where it is not: a file half written, or another program's. */
const jsonOr = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** A count as the meter writes one: a number, never below zero. */
const Count = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
const Rest = [Schema.Record(Schema.String, Schema.Unknown)] as const;

/**
 * The daemon's two ceilings, read from the environment when asked. `sessions` (`WF_MAX_CONCURRENT`, `maxConcurrent`) is handed to the
 * runtime, which admits under it (`engine()` in `runtime-client.ts`): sessions per pool at once, counted apart for each — a check on the
 * `check` harness is in a pool of its own, and a `dev` run's review competes with another run's implement, both in the `claude` pool.
 * `runs` (`WF_MAX_RUNS`, `maxRuns`) is the tick's: runs in flight at once, 0 — or unset — for no cap.
 */
export const ceilings = (): { sessions: number; runs: number } => ({
  sessions: maxConcurrent(),
  runs: maxRuns(),
});

/**
 * What the last pass ran with: `$WF_ROOT/tick.json`, the tick's to write — the ceilings of the process that ran it, `nemia up`'s or
 * `nemia tick`'s. `nemia ls` and `nemia decide` run in a shell of their own, whose environment is not the daemon's:
 * `WF_MAX_CONCURRENT=4 WF_MAX_RUNS=2 nemia up` sets the cap on the daemon alone, and read from the shell, a run the daemon holds read as
 * plain `waiting`.
 */
const tickFile = (): string => path.join(HOME, 'tick.json');

/** `tick.json` as the tick writes it: the sessions a pool admits, and the runs in flight at once, a whole number (0 for no cap). */
const isCeilings = Schema.is(Schema.Struct({ sessions: Schema.Finite, runs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }));

/**
 * The ceilings the last pass ran with (`tickFile`), or undefined before any pass has written them, or when the file does not read as them.
 */
export function lastCeilings(): { sessions: number; runs: number } | undefined {
  let text: string;
  try {
    text = fs.readFileSync(tickFile(), 'utf8');
  } catch {
    return undefined;
  }
  const c = jsonOr(text);
  return isCeilings(c) ? { sessions: c.sessions, runs: c.runs } : undefined;
}

/**
 * The ceilings a pass runs with, written down for `nemia ls` and `nemia decide` — only when they differ from what is there, and through a
 * hidden file renamed over it, so a reader never reads half of it. A store that cannot be written loses only this: a reader falls back to
 * its own environment, and the pass goes on.
 */
export function recordCeilings(c: { sessions: number; runs: number }): void {
  const last = lastCeilings();
  if (last && last.sessions === c.sessions && last.runs === c.runs) return;
  const hidden = path.join(HOME, `.tick.json.${process.pid}`);
  try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(hidden, JSON.stringify({ sessions: c.sessions, runs: c.runs }, null, 2));
    fs.renameSync(hidden, tickFile());
  } catch {}
}

/**
 * What the last pass cost, phase by phase: `$WF_ROOT/tick-stats.json`, written by the pass that measured it, `nemia up`'s or `nemia
 * tick`'s, and read by `nemia up --stats` and the api. One pass's numbers, replaced by the next's: nothing reads it to decide.
 */
export const statsFile = (): string => path.join(HOME, 'tick-stats.json');

const PhaseCostSchema = Schema.StructWithRest(Schema.Struct({ ms: Count, calls: Count, bytes: Count, reads: Count, spawned: Count }), Rest);
const HarnessCostSchema = Schema.StructWithRest(
  Schema.Struct({ calls: Count, ms: Count, listed: Count, spawned: Count, unread: Schema.optionalKey(Count) }),
  Rest,
);

/**
 * A pass's cost as `recordPassCost` writes it (`PassCost`), every phase and `rested` there, and what it saw (`Seen`) where an older tick
 * that kept none did not write it. A key it does not name is kept, as a newer `nemia` may write one.
 */
const isPassCost = Schema.is(
  Schema.StructWithRest(
    Schema.Struct({
      at: Schema.String,
      ms: Count,
      phases: Schema.Struct(Object.fromEntries(PHASES.map((p) => [p, PhaseCostSchema])) as Record<Phase, typeof PhaseCostSchema>),
      harnesses: Schema.Record(Schema.String, HarnessCostSchema),
      records: Count,
      bytes: Count,
      spawned: Count,
      overheadMs: Count,
      rested: Count,
      runs: Schema.optionalKey(Count),
      tasks: Schema.optionalKey(Count),
      queued: Schema.optionalKey(Count),
      admitted: Schema.optionalKey(Count),
      unobserved: Schema.optionalKey(Schema.Array(Schema.String)),
    }),
    Rest,
  ),
);

/** A pass's cost as it reads off disk, or undefined when it does not read as one: a file from another version, or half of one. */
export const parsePassCost = (text: string): PassCostRead | undefined => {
  const c = jsonOr(text);
  return isPassCost(c) ? c : undefined;
};

/** The last pass's cost (`statsFile`), or undefined before any pass has written one, or when the file does not read as one. */
export function lastPassCost(): PassCostRead | undefined {
  let text: string;
  try {
    text = fs.readFileSync(statsFile(), 'utf8');
  } catch {
    return undefined;
  }
  return parsePassCost(text);
}

/**
 * A pass's cost written down, through a hidden file renamed over the last, so a reader never reads half of it. A store that cannot be
 * written loses only this, which the next pass writes again, and the pass goes on. Answers with the time the write took, which is
 * measuring's too.
 */
export function recordPassCost(cost: PassCost): number {
  const t0 = performance.now();
  const hidden = path.join(HOME, `.tick-stats.json.${process.pid}`);
  try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(hidden, JSON.stringify(cost, null, 2));
    fs.renameSync(hidden, statsFile());
  } catch {}
  return performance.now() - t0;
}

/** `$WF_ROOT/daemon.json`: the store taken by one daemon, the api or a `nemia up`, written by it alone (`daemon.ts`). */
export const daemonFile = (): string => path.join(HOME, DAEMON_FILE);

const When = Schema.String.check(Schema.makeFilter((at: string) => !Number.isNaN(Date.parse(at))));

/** A monotonic reading as the daemon writes one beside a stamp (`Monotonic`): its boot's id, and whole milliseconds. */
const MonotonicSchema = Schema.Struct({ boot: Schema.String.check(Schema.isNonEmpty()), ms: Schema.Finite });

/** What a daemon serves on its own port, by harness name: opaque cards. */
const Cards = Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Unknown));

/**
 * `daemon.json` as a daemon writes it (`DaemonFile`). A pid that is not a positive whole number is not read as one: `kill(0)` and
 * `kill(-n)` signal process groups, not a process. `passedAt` may be absent, and is read as `null`. A key it does not name is dropped: the
 * file is the daemon's alone, and written whole by it. The kind and the cards' key a daemon wrote before `up` and `serves` are still
 * read, so a lease written before is held, and never written (`upgraded`).
 */
const DaemonFileSchema = Schema.Struct({
  pid: Schema.Int.check(Schema.isGreaterThan(0)),
  by: Schema.optionalKey(Schema.Literals(['api', 'up', 'wf up'])),
  url: Schema.optionalKey(Schema.String),
  startedAt: When,
  startedMono: Schema.optionalKey(MonotonicSchema),
  cwd: Schema.String,
  every: Schema.Finite.check(Schema.isGreaterThan(0)),
  passedAt: Schema.optional(Schema.NullOr(When)),
  passedMono: Schema.optionalKey(MonotonicSchema),
  beatAt: Schema.optionalKey(When),
  beatMono: Schema.optionalKey(MonotonicSchema),
  procStart: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  stoppedAt: Schema.optionalKey(When),
  release: Schema.optionalKey(
    Schema.Struct({
      kind: Schema.Literals(['checkout', 'install']),
      root: Schema.String,
      tag: Schema.optionalKey(Schema.String),
      commit: Schema.optionalKey(Schema.String),
    }),
  ),
  serves: Schema.optionalKey(Cards),
  holder: Schema.optionalKey(Cards),
});

/**
 * The file as read, in today's words: a `by` absent or of the earlier spelling is a `nemia up`'s, `up`; the cards under `holder` are
 * held as `serves`, and the `holder` key is dropped, so the next write carries only `serves`.
 */
const upgraded = ({ by, holder, serves, ...file }: typeof DaemonFileSchema.Type): DaemonFile => {
  const cards = serves ?? holder;
  return { ...file, by: by === 'api' ? 'api' : 'up', passedAt: file.passedAt ?? null, ...(cards ? { serves: cards } : {}) };
};

/** The file as a daemon writes it, or undefined when the text does not read as one (`DaemonFileSchema`). */
export function parseDaemonFile(text: string): DaemonFile | undefined {
  const decoded = Schema.decodeUnknownResult(DaemonFileSchema)(jsonOr(text));
  return Result.isFailure(decoded) ? undefined : upgraded(decoded.success);
}

/**
 * The file's text, or undefined when there is none. Any other failure to read it is thrown: a store that cannot be read cannot be judged
 * free.
 */
function readDaemonText(): string | undefined {
  try {
    return fs.readFileSync(daemonFile(), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

/** The file read: its text and what it holds, or undefined when there is none. */
function readDaemon(): DaemonRead | undefined {
  const text = readDaemonText();
  return text === undefined ? undefined : { text, file: parseDaemonFile(text) };
}

/** Whether `pid` is a live process on this host: a signal 0 delivered, or refused for want of permission, which still means it is there. */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * When process `pid` started, in clock ticks since boot: field 22 of `/proc/<pid>/stat`, read after the last `)`, as the command name
 * before it may hold spaces and parentheses. Undefined where there is no `/proc`, or the process is gone.
 */
export function procStartOf(pid: number): number | undefined {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const start = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]);
    return Number.isInteger(start) ? start : undefined;
  } catch {
    return undefined;
  }
}

/** What the process table says of the file's pid (`Identity` in daemon.ts): alive, and whether it is the process that wrote the file. */
export function identify(file: DaemonFile): Identity {
  if (!alive(file.pid)) return 'gone';
  const start = file.procStart === undefined ? undefined : procStartOf(file.pid);
  if (start === undefined) return alive(file.pid) ? 'unknown' : 'gone';
  return start === file.procStart ? 'same' : 'other';
}

/** Where Linux keeps the id of the running boot, a fresh one at each. */
const BOOT_ID_FILE = '/proc/sys/kernel/random/boot_id';

let boot: string | null | undefined;

/** The running boot's id, read once; `null` where the machine does not say, and no monotonic reading is taken. */
const bootId = (): string | null => {
  if (boot === undefined) {
    try {
      boot = fs.readFileSync(BOOT_ID_FILE, 'utf8').trim() || null;
    } catch {
      boot = null;
    }
  }
  return boot;
};

/** The monotonic clock now, in whole milliseconds, under the boot's id; undefined where the boot id cannot be read. */
export const monoNow = (): Monotonic | undefined => {
  const id = bootId();
  return id === null ? undefined : { boot: id, ms: Number(process.hrtime.bigint() / 1_000_000n) };
};

/** Now, on both clocks: the wall clock's `Date.now()`, and the monotonic reading where there is one. */
export const instantNow = (): Instant => {
  const mono = monoNow();
  return { at: Date.now(), ...(mono ? { mono } : {}) };
};

/** The monotonic key written beside each wall stamp a running daemon writes. */
const MONO_OF = { passedAt: 'passedMono', beatAt: 'beatMono' } as const;

/**
 * `file` with its wall stamp `stamp` set to `now`, and the monotonic reading beside it: written with it, or, where `now` has none, left out
 * rather than an earlier one kept beside a later stamp.
 */
function stamped(file: DaemonFile, stamp: keyof typeof MONO_OF, now: Instant): DaemonFile {
  const next = { ...file };
  next[stamp] = new Date(now.at).toISOString();
  if (now.mono) next[MONO_OF[stamp]] = now.mono;
  else delete next[MONO_OF[stamp]];
  return next;
}

/** Where the store stands now: who holds it, and whether it ticks (`daemonStanding` in daemon.ts, off the file and the process table). */
export const daemonStanding = (now: Instant = instantNow()): DaemonStanding => standingOf(readDaemon(), { now, identify });

/** The file written whole, through a hidden file renamed over it, so a reader never reads half of it. */
function writeDaemon(file: DaemonFile): void {
  const hidden = path.join(HOME, `.${DAEMON_FILE}.${process.pid}`);
  fs.writeFileSync(hidden, daemonText(file));
  fs.renameSync(hidden, daemonFile());
}

/** What `takeStore` took: the file this daemon now holds the store by, and where the store stood before it. */
export type TakenStore = { held: DaemonFile; replaced: DaemonStanding };

/** The lease this process writes as a daemon of kind `by`, started at `now`, with the release it runs where it is given. */
function leaseOf(every: number, cwd: string, by: HolderKind, now: Instant, release: LeaseRelease | undefined): DaemonFile {
  const procStart = procStartOf(process.pid);
  return {
    pid: process.pid,
    by,
    startedAt: new Date(now.at).toISOString(),
    ...(now.mono ? { startedMono: now.mono } : {}),
    cwd,
    every,
    passedAt: null,
    ...(procStart !== undefined ? { procStart } : {}),
    ...(release !== undefined ? { release } : {}),
  };
}

/**
 * A daemon takes the store, as the kind it is (`by`): refused by name, exit 2, while another daemon of either kind ticks it, in the words
 * for the kind that asks (`holdRefusal`); otherwise the file names this process and its kind.
 * An empty store is claimed with a link, which fails when the file appeared in between, so two starts on an empty store cannot both win —
 * the loser judges again. A file already there is replaced by a rename; two takeovers of one stale file both rename, and the loser learns
 * it at its first pass (`stillHeld`).
 */
export function takeStore({
  every,
  cwd,
  by,
  release,
  now = instantNow(),
}: {
  every: number;
  cwd: string;
  by: HolderKind;
  release?: LeaseRelease;
  now?: Instant;
}): TakenStore {
  fs.mkdirSync(HOME, { recursive: true });
  const held = leaseOf(every, cwd, by, now, release);
  for (let tries = 0; ; tries++) {
    const replaced = daemonStanding(now);
    const holder = holderAgainst(replaced, process.pid);
    if (holder) throw new Conflict({ message: holdRefusal(holder, by === 'api' ? 'api' : 'up', HOME, now.at) });
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
 * Whether the store is still this daemon's, read at the start of each pass: undefined when it is — the file names this process, or there is
 * no file or none that reads, which the next write puts right — or the file of whoever took it over.
 */
export function stillHeld(held: DaemonFile): DaemonFile | undefined {
  const file = readDaemon()?.file;
  return file && file.pid !== held.pid ? file : undefined;
}

/**
 * Write down a pass this daemon completed, at `now` on both clocks — only while the store is still its own: a file that names another
 * holder is that holder's to write. Stamped on the file as it stands when it names this daemon, so what was written since it took the
 * store — its url, its beat — stays. Answers the file as it now stands.
 */
export function passed(held: DaemonFile, now: Instant = instantNow()): DaemonFile {
  const file = readDaemon()?.file;
  if (file && file.pid !== held.pid) return stamped(held, 'passedAt', now);
  const next = stamped(file ?? held, 'passedAt', now);
  writeDaemon(next);
  return next;
}

/**
 * Write down where the api serves, `url`, into the file this process holds the store by — only while it names this process and has not
 * let the store go: a file of another holder, or none, is not this process's to write. Answers whether it was written.
 */
export function heldUrl(url: string): boolean {
  const file = readDaemon()?.file;
  if (file?.pid !== process.pid || file.stoppedAt) return false;
  writeDaemon({ ...file, url });
  return true;
}

/**
 * Write down what the engine of this process serves on its own port, `cards`, by harness name, into the file this process holds the
 * store by — only while it names this process and has not let the store go: a file of another holder, or none, is not this process's
 * to write, as `heldUrl`'s is not. One writer of the lease, as ever. Answers whether it was written.
 *
 * The cards carry nothing secret, and this file is no place for one: the token a viewer needs is the holder engine's own, kept 0600
 * in its store, and asked for there (`holderTokenOf`).
 */
export function heldServes(cards: Record<string, Record<string, unknown>>): boolean {
  const file = readDaemon()?.file;
  if (file?.pid !== process.pid || file.stoppedAt) return false;
  writeDaemon({ ...file, serves: cards });
  return true;
}

/**
 * What another process on this store holds and serves, by harness name, or `undefined` — what a viewer configures its engine's
 * `holder` from, read afresh at every follow, never captured.
 *
 * Nothing is answered unless the lease is ticking and its pid is not this process's. A lease that stopped, whose process is gone or
 * that has gone stalled names a port no one is listening on, so there is nothing to dial; and a lease *this* process holds names
 * this process's own port, which it must never dial — it answers that follow off its own engine, and a viewer that dialled itself
 * would ask its own port for a session it already holds.
 */
export function servesOnStore(now: Instant = instantNow()): Record<string, Record<string, unknown>> | undefined {
  const standing = daemonStanding(now);
  if (standing.kind !== 'ticking' || standing.file.pid === process.pid) return undefined;
  return standing.file.serves;
}

/**
 * The daemon's beat, on a timer of its interval: `beatAt` and `beatMono`, at `now` on both clocks, written into its own file, whatever the
 * pass is doing — only while the file names this daemon, as it took the store, and it has not let it go; a file gone or unreadable is the
 * next pass's to write. Never thrown: it runs on a timer, where a throw would end the process mid-pass.
 */
export function beat(held: DaemonFile, now: Instant = instantNow()): void {
  try {
    const file = readDaemon()?.file;
    if (file?.pid === held.pid && file.startedAt === held.startedAt && !file.stoppedAt) writeDaemon(stamped(file, 'beatAt', now));
  } catch {}
}

/**
 * Let the store go: `stoppedAt` written, so the store reads free at once and a reused pid never holds it — only while the file still names
 * this daemon. Never thrown: it runs as the process stops, on a signal or a failure, and a store that cannot be written is read free anyway
 * once the process is gone.
 */
export function releaseStore(held: DaemonFile, at = new Date().toISOString()): void {
  try {
    const file = readDaemon()?.file;
    if (file?.pid === held.pid && !file.stoppedAt) writeDaemon({ ...file, stoppedAt: at });
  } catch {}
}

/**
 * Why a pass by hand may not run now — a daemon of either kind ticks the store, named — or undefined when it may. A `nemia tick` never
 * writes the file.
 */
export function storeRefusal(verb: 'tick', now: Instant = instantNow()): string | undefined {
  const holder = holderAgainst(daemonStanding(now), process.pid);
  return holder ? holdRefusal(holder, verb, HOME, now.at) : undefined;
}

/**
 * The recent passes, oldest first: `$WF_ROOT/tick-recent.json`, the tick's alone to write (`recordRecentPass`), at most `RECENT_KEPT` of
 * them, and read by `nemia passes` and the api. Kept on disk, so a restarted daemon and the command line read what the daemon's passes
 * cost; nothing reads it to decide.
 */
export const recentFile = (): string => path.join(HOME, 'tick-recent.json');

/** A pass as `recordRecentPass` keeps it (`RecentPass`): a key it does not name is kept, as a newer `nemia` may write one. */
const isRecentPass = Schema.is(
  Schema.StructWithRest(
    Schema.Struct({
      at: Schema.String,
      ms: Count,
      runs: Count,
      tasks: Count,
      queued: Count,
      admitted: Count,
      records: Count,
      rested: Count,
      reads: Count,
      phases: Schema.Struct(Object.fromEntries(PHASES.map((p) => [p, Count])) as Record<Phase, typeof Count>),
      waitMs: Schema.optionalKey(Count),
      load: Schema.optionalKey(Count),
      quota: Schema.optionalKey(Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Finite))),
      checks: Schema.optionalKey(
        Schema.Array(Schema.Struct({ factory: Schema.String, workflow: Schema.String, step: Schema.String, agent: Schema.String })),
      ),
      disk: Schema.optionalKey(
        Schema.Struct({
          at: Schema.String,
          free: Count,
          size: Count,
          entries: Schema.Array(
            Schema.Struct({
              part: Schema.Literals(DISK_PARTS),
              kind: Schema.optionalKey(Schema.Literals(ALL_KINDS)),
              factory: Schema.optionalKey(Schema.String),
              bytes: Schema.optionalKey(Count),
              unread: Count,
            }),
          ),
        }),
      ),
    }),
    Rest,
  ),
);

/** The recent passes as `text` holds them, and how many of its entries do not read as one; none of either for a text that is no list. */
export const parseRecentPasses = (text: string): { passes: RecentPass[]; unread: number } => {
  const list = jsonOr(text);
  if (!Array.isArray(list)) return { passes: [], unread: 0 };
  const passes = list.filter((entry): entry is RecentPass => isRecentPass(entry));
  return { passes, unread: list.length - passes.length };
};

/** The file's text, or undefined where there is none yet. */
const recentText = (): string | undefined => {
  try {
    return fs.readFileSync(recentFile(), 'utf8');
  } catch {
    return undefined;
  }
};

/**
 * The recent passes (`recentFile`), oldest first: none before any pass kept one, or for a file that is not a list. An entry that does not
 * read as a pass is left out, and the file named once on stderr with how many; the next pass writes the file without them.
 */
export function recentPasses(): RecentPass[] {
  const text = recentText();
  if (text === undefined) return [];
  const { passes, unread } = parseRecentPasses(text);
  if (unread) process.stderr.write(`${recentFile()}: ${unread} of its passes did not read as one and were left out.\n`);
  return passes;
}

/**
 * The pass whose cost is `cost` kept among the recent (`recentOf`, with what it is kept with, `also`), after those
 * the file holds and the oldest left out past `keep`, written through a hidden file renamed over the last, as `recordPassCost` writes. A
 * store that cannot be written loses only this. Answers with the time it took, which is measuring's, and the passes kept, oldest first.
 */
export function recordRecentPass(cost: PassCost, keep = RECENT_KEPT, also: AlsoKept = {}): { ms: number; kept: RecentPass[] } {
  const t0 = performance.now();
  const text = recentText();
  const kept = [...(text === undefined ? [] : parseRecentPasses(text).passes), recentOf(cost, also)].slice(-keep);
  const hidden = path.join(HOME, `.tick-recent.json.${process.pid}`);
  try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(hidden, JSON.stringify(kept));
    fs.renameSync(hidden, recentFile());
  } catch {}
  return { ms: performance.now() - t0, kept };
}
