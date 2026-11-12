/**
 * A detached run's file, as the worker (`bin/ae-worker.ts`) and the spawn write it: its schema, its read, the first one a spawn
 * writes, and its state as a sighting says it, the lease of its heartbeat included.
 */
import { Result, Schema, SchemaIssue } from 'effect';
import type { SessionState } from '../../core/index.ts';
import { instantNow } from '../../core/engine/now.ts';
import type { LeaseWord } from '../../../contracts/lease.contract.ts';
import { IMAGE } from '../image.ts';
import { elapsedMs, type Instant, type Monotonic } from '../../core/clock.ts';

export { TERMINATION_MESSAGE_BYTES } from './termination-message.ts';

/**
 * What a resumed session's parent printed and its own totals carry on: cost, API time, and its whole session's tokens in their
 * classes (`carriedOf`). Each absent when the parent gave none; the tokens absent from a run file written before they were kept.
 */
export const CarriedSchema = Schema.Struct({
  costUsd: Schema.optional(Schema.Finite),
  apiMs: Schema.optional(Schema.Finite),
  uncachedTokens: Schema.optional(Schema.Finite),
  cacheWriteTokens: Schema.optional(Schema.Finite),
  cacheReadTokens: Schema.optional(Schema.Finite),
  outputTokens: Schema.optional(Schema.Finite),
});

/**
 * How long a run file may go unbeaten before `observe` looks for its worker's process, and calls it dead once that is gone or cannot be
 * told (`leaseWord`): never a bound on a start, since a live worker slow to beat is working. The worker beats every 5s. Measured from
 * its `beat` on the monotonic clock when it was written in this boot, else from its `heartbeatAt` on the wall clock (`elapsedMs`).
 */
export const STALE_MS = 30_000;

/** What the detached worker writes of its harness's process: its own words, which a run file on disk keeps. */
type WorkerState = 'working' | 'done' | 'failed' | 'stopped';

/**
 * A run file's state in A2A's names — the one place this runner translates, since codex, the check and a Claude Code job all
 * run under the worker:
 *
 *   working, heartbeat fresh                         → working    the worker is at work
 *   working, heartbeat stale, worker seen running    → working    slow, not dead: its first beat not yet written, or late under load
 *   working, heartbeat stale, worker gone or unknown → failed     nobody is left to write its end: the whole lease
 *   done                                             → completed  the harness exited 0
 *   failed                                           → failed     it exited otherwise, or the worker could not start it
 *   stopped                                          → canceled   a stop ended it
 *
 * The worker is seen by the identity its spawn recorded (`WorkerSeen`, `launched.ts`); a run that names none, spawned before one was
 * recorded or on a machine with no `/proc`, is judged by the clock alone, as it was before.
 *
 * No run is waiting on a person: a harness the worker runs has no registry that says so (`Sighting.waitingFor`).
 */
const WORKER_STATES: Record<WorkerState, SessionState> = { working: 'working', done: 'completed', failed: 'failed', stopped: 'canceled' };

/** What one look found of a run's worker process (`lease.contract.ts`): `running`, `gone`, or `unknown` where nothing can say. */
export type WorkerSeen = 'running' | 'gone' | 'unknown';

/**
 * The word a run file's state is read as (`lease.contract.ts`): the worker's own word, except a `working` one whose beat is past the
 * lease while its worker is not seen running, which is `failed`. An age that cannot be read (`NaN`) is past it.
 */
export const leaseWord: LeaseWord = (state, beatAgeMs, leaseMs, worker) =>
  state !== 'working' || beatAgeMs <= leaseMs || worker === 'running' ? state : 'failed';

/** What of a run file its lease reads: its state, and its last beat on both clocks. */
type Beaten = { state: string; heartbeatAt: string; beat?: Monotonic };

/**
 * The run's word as of `now` (`leaseWord`), its worker looked for (`worker`) only where its beat is stale, since that costs a read of
 * `/proc`: given as a thunk, it is asked at most once.
 */
export const leased = (run: Beaten, now: Instant, worker: WorkerSeen | (() => WorkerSeen)): string => {
  const age = elapsedMs({ at: Date.parse(run.heartbeatAt), mono: run.beat }, now);
  const fresh = run.state !== 'working' || age <= STALE_MS;
  return leaseWord(run.state, age, STALE_MS, fresh ? 'unknown' : typeof worker === 'function' ? worker() : worker);
};

/** A word of a run file as a sighting says it. A word no worker writes is `failed`, as a lease gone is. */
export const stateOfWord = (word: string): SessionState =>
  Object.hasOwn(WORKER_STATES, word) ? WORKER_STATES[word as WorkerState] : 'failed';

/** A run file's state as a sighting says it, as of `now`, its worker as `worker` found it (`leased`). */
export const detachedStateOf = (run: Beaten, now: Instant, worker: WorkerSeen | (() => WorkerSeen)): SessionState =>
  stateOfWord(leased(run, now, worker));

/**
 * A run file as the worker (`bin/ae-worker.ts`) and the spawn write it: what the worker writes about one session, and the
 * whole of what a detached harness knows of it.
 *
 * Its `state` is the worker's own word, kept on disk as it is — one of `working | stopped | done | failed`, the four
 * `ae-worker.ts` writes: `detachedStateOf` translates it, and reads a word no worker writes as `failed`, so the schema takes
 * any text there. **Never `blocked`**: these harnesses run a process and watch it exit, and a process that is waiting on
 * somebody is, from out here, a process that is running. So no detached session reaches the engine's `needs-human`, and
 * none carries a `Sighting.waitingFor`: there is nothing to carry, not something dropped. Only a harness that says a session
 * is waiting, and says what for — a remote A2A agent's Task — can fill that field.
 *
 * The file is the session: `stop` finds the worker by it. Removed, alone or with the store it is in, the worker takes it
 * for a stop, ends its harness and exits, and never writes the file again.
 */
const RunFileSchema = Schema.StructWithRest(
  Schema.Struct({
    name: Schema.optional(Schema.String),
    state: Schema.String,
    pid: Schema.Finite,
    heartbeatAt: Schema.String,
    /** The same beat on the monotonic clock, with its boot's id; absent where the writer could not read one. */
    beat: Schema.optional(Schema.Struct({ boot: Schema.String, ms: Schema.Finite })),
    startedAt: Schema.optional(Schema.String),
    nativeId: Schema.optional(Schema.String),
    logFile: Schema.String,
    exitCode: Schema.optional(Schema.Finite),
    /** For a command given `config.terminationMessagePath`: the file the worker reads once at the process's exit. */
    terminationMessagePath: Schema.optional(Schema.String),
    /**
     * What that file held at the exit, its first `TERMINATION_MESSAGE_BYTES` bytes (`terminationMessageAt`), written beside
     * `exitCode`. Absent where the file was missing or no regular file.
     */
    terminationMessage: Schema.optional(Schema.String),
    /**
     * For a run under a memory limit: the limit in bytes its scope holds (`MemoryMax=`), written by the spawn. Absent: no limit, and
     * the worker reads no cgroup.
     */
    memoryLimit: Schema.optional(Schema.Finite),
    /**
     * What the run's scope said of its memory (`cgroupMemoryOf`), read by the worker on each beat and at the harness's exit, the last
     * read kept: the run's `Sighting.memory`. Absent where it ran under no limit, or no read found its cgroup.
     */
    memory: Schema.optional(
      Schema.Struct({ limitBytes: Schema.Finite, peakBytes: Schema.optional(Schema.Finite), oomKills: Schema.Finite }),
    ),
    /** The harness's own id this run resumed, kept only for a spec whose printed totals carry the parent's. */
    resumeFrom: Schema.optional(Schema.String),
    /**
     * The totals its parent printed, read once at the spawn of a run that kept `resumeFrom`, and taken off its own: each
     * absent when the parent printed none, `{}` when there was no parent. Absent from a run file spawned before it was
     * written, whose parent is looked for among the run files instead.
     */
    carried: Schema.optional(CarriedSchema),
    /**
     * The code the run's worker runs (`IMAGE`), written by the spawn and kept by the worker: the run's `Sighting.image`. Absent from a
     * run file spawned before it was written.
     */
    image: Schema.optional(Schema.String),
    /**
     * The mode its spec's command runs the session in (`HarnessSpec.command`'s `ranIn`), written by the spawn: the run's
     * `Sighting.ranIn` where its output says none. Absent where the command gave none, and from a run file spawned before it was written.
     */
    ranIn: Schema.optional(Schema.String),
    /** For a spec with `input`: what the worker writes on the harness's stdin (`RunInput`). Absent, the run takes no words. */
    input: Schema.optional(
      Schema.Struct({
        first: Schema.String,
        inbox: Schema.String,
        from: Schema.Finite,
        closesOn: Schema.Struct({ key: Schema.String, value: Schema.String }),
      }),
    ),
    /**
     * How far into the inbox the worker has written on, in bytes: every line before it was handed to the harness, or was
     * about to be — the worker writes this before it writes the line, so a worker started again on this run file never
     * writes one twice. Absent, nothing has been, and the worker starts at `input.from`.
     */
    inputAt: Schema.optional(Schema.Finite),
    /** The worker's stop grace and heartbeat, as the spawn wrote them (`DetachedOptions`); absent from a run file written before. */
    stopGraceMs: Schema.optional(Schema.Finite),
    beatMs: Schema.optional(Schema.Finite),
    /** The harness printed the line that closes its input, and the worker ended its stdin: words said now reach nobody. */
    inputClosed: Schema.optional(Schema.Literal(true)),
    /**
     * The harness printed its start event (`HarnessSpec.start`) with no id there: the 1-based `line` of its stdout, the `field`
     * read, and what was `found` in it, as JSON cut at 200 characters, or `nothing`. The run is unread (`startRefusalOf`).
     */
    startRefused: Schema.optional(Schema.Struct({ line: Schema.Finite, field: Schema.String, found: Schema.String })),
    /**
     * The harness's process, as the worker wrote it the moment it spawned it: its pid, which leads the harness's process group, and when
     * it started (`processStart`), absent where there is no `/proc`. What a run left behind is found by it once its worker has ended or
     * is gone (`left.ts`). Absent before the harness was started, and from a run file written before it was kept.
     */
    harness: Schema.optional(Schema.Struct({ pid: Schema.Finite, start: Schema.optional(Schema.String) })),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

export type RunFile = typeof RunFileSchema.Type;

/** A run file read, by the name its run is under. */
export type Run = { name: string; run: RunFile };

/** What a resumed run's parent printed as its totals, as `RunFileSchema` keeps it. */
export type Carried = NonNullable<RunFile['carried']>;

const isRunFile = Schema.is(RunFileSchema);

/**
 * The run file in `text`, or why it is none: the first field a worker would have written otherwise. JSON that does not parse
 * is none too — a worker rewriting it is caught mid-write, and the next read finds it whole.
 */
export const runFileIn = (text: string): RunFile | string => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return `it is not JSON yet (${e instanceof Error ? e.message : String(e)})`;
  }
  if (isRunFile(parsed)) return parsed;
  const decoded = Schema.decodeUnknownResult(RunFileSchema)(parsed);
  if (Result.isSuccess(decoded)) return decoded.success;
  const [first] = formatter(decoded.failure.issue).issues;
  const key = first?.path?.map((p) => (typeof p === 'object' && p !== null && 'key' in p ? String(p.key) : String(p))).join('.');
  return key ? `its \`${key}\` is not what a worker writes (${first?.message ?? 'refused'})` : 'it is no run file a worker writes';
};

const formatter = SchemaIssue.makeFormatterStandardSchemaV1();

/**
 * The run file the spawn writes before its worker starts: `plan`, working, with no pid yet, its first beat on both clocks, and the
 * code it is spawned from (`image`).
 */
export const firstRunFile = (plan: object): string => {
  const now = instantNow();
  return JSON.stringify({ ...plan, image: IMAGE, state: 'working', pid: 0, heartbeatAt: new Date(now.at).toISOString(), beat: now.mono });
};
