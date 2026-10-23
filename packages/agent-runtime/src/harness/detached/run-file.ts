/**
 * A detached run's file, as the worker (`bin/ae-worker.ts`) and the spawn write it: its schema, its read, the first one a spawn
 * writes, and its state as a sighting says it, the lease of its heartbeat included.
 */
import { Result, Schema, SchemaIssue } from 'effect';
import type { SessionState } from '../../core/index.ts';
import { instantNow } from '../../core/engine/now.ts';
import { elapsedMs, type Instant, type Monotonic } from '../../core/clock.ts';

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
 * How long a run file may go unbeaten before `observe` calls it dead. The worker beats every 5s. Measured from its `beat` on the
 * monotonic clock when it was written in this boot, else from its `heartbeatAt` on the wall clock (`elapsedMs`).
 */
export const STALE_MS = 30_000;

/** What the detached worker writes of its harness's process: its own words, which a run file on disk keeps. */
type WorkerState = 'working' | 'done' | 'failed' | 'stopped';

/**
 * A run file's state in A2A's names — the one place this runner translates, since codex, the check and claude-detached all
 * run under the worker:
 *
 *   working, heartbeat fresh  → working    the worker is at work
 *   working, heartbeat stale  → failed     the worker is gone, and its process with it: the whole lease
 *   done                      → completed  the harness exited 0
 *   failed                    → failed     it exited otherwise, or the worker could not start it
 *   stopped                   → canceled   a stop ended it
 *
 * No run is waiting on a person: a harness the worker runs has no registry that says so (`Sighting.waitingFor`).
 */
const WORKER_STATES: Record<WorkerState, SessionState> = { working: 'working', done: 'completed', failed: 'failed', stopped: 'canceled' };

/** What of a run file its lease reads: its state, and its last beat on both clocks. */
type Beaten = { state: string; heartbeatAt: string; beat?: Monotonic };

/** A `working` run whose heartbeat has stopped is not working: `failed`. In the worker's words. */
export const leased = (run: Beaten, now: Instant): string =>
  run.state === 'working' && elapsedMs({ at: Date.parse(run.heartbeatAt), mono: run.beat }, now) > STALE_MS ? 'failed' : run.state;

/** A run file's state as a sighting says it. A word no worker writes is `failed`, as a lease gone is. */
export const detachedStateOf = (run: Beaten, now: Instant): SessionState => {
  const word = leased(run, now);
  return Object.hasOwn(WORKER_STATES, word) ? WORKER_STATES[word as WorkerState] : 'failed';
};

/** Whether a run is over as of now: anything but `working`, a lease gone included. */
export const overNow = (run: Beaten): boolean => detachedStateOf(run, instantNow()) !== 'working';

/**
 * A run file as the worker (`bin/ae-worker.ts`) and the spawn write it: what the worker writes about one session, and the
 * whole of what a detached harness knows of it.
 *
 * Its `state` is the worker's own word, kept on disk as it is — one of `working | stopped | done | failed`, the four
 * `ae-worker.ts` writes: `detachedStateOf` translates it, and reads a word no worker writes as `failed`, so the schema takes
 * any text there. **Never `blocked`**: these harnesses run a process and watch it exit, and a process that is waiting on
 * somebody is, from out here, a process that is running. So no detached session reaches the engine's `needs-human`, and
 * none carries a `Sighting.waitingFor`: there is nothing to carry, not something dropped. Only a harness with a registry
 * that says a session is waiting, and says what for — Claude Code's `claude agents --json` — can fill that field.
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
    /** The harness's own id this run resumed, kept only for a spec whose printed totals carry the parent's. */
    resumeFrom: Schema.optional(Schema.String),
    /**
     * The totals its parent printed, read once at the spawn of a run that kept `resumeFrom`, and taken off its own: each
     * absent when the parent printed none, `{}` when there was no parent. Absent from a run file spawned before it was
     * written, whose parent is looked for among the run files instead.
     */
    carried: Schema.optional(CarriedSchema),
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

/** The run file the spawn writes before its worker starts: `plan`, working, with no pid yet, and its first beat on both clocks. */
export const firstRunFile = (plan: object): string => {
  const now = instantNow();
  return JSON.stringify({ ...plan, state: 'working', pid: 0, heartbeatAt: new Date(now.at).toISOString(), beat: now.mono });
};
