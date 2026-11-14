/**
 * The machine's gauges, as the server group answers them: the daemon's pass costs and the cap it runs under (`Ceilings`), the recent
 * passes and their histogram (`PassesRead`), the system's series, the process's metrics, the daemon's own file (`Daemon`) and the plan's
 * quota. Each is a plain Schema of JSON; a part another reader owns is said as JSON and typed by that reader.
 */
import { Schema } from 'effect';
import { describedNumber, describedOne } from './meta.ts';
import { DAEMON_IDENTITIES, DAEMON_KINDS, METRIC_TYPES, QUOTA_STATES, SERIES_RANGES, SERIES_SPANS } from './words.ts';

/** A text that may be absent from the record it is read from: null. */
const OrNull = <S extends Schema.Top>(s: S, description: string) => Schema.NullOr(s).annotate({ description });

/** A part of an answer said as JSON, typed by its own reader, and what it holds. */
const Json = (description: string) => describedOne(Schema.Unknown, description);

/** What the last pass cost, as it wrote it: its time, what it saw, and its phases and harnesses, each read by its own reader. */
export const PassCost = Schema.Struct({
  at: Schema.String.annotate({ description: 'When the pass was written, as an ISO 8601 time.' }),
  ms: describedNumber('How long the pass took, in milliseconds.'),
  phases: Schema.Record(Schema.String, Schema.Unknown).annotate({
    description: "The pass's cost by phase, each as the meter reads it.",
  }),
  harnesses: Schema.Record(Schema.String, Schema.Unknown).annotate({
    description: "The pass's cost of reading each harness, by the harness's name.",
  }),
  records: describedNumber('How many run records the pass read.'),
  bytes: describedNumber('How many bytes the pass read.'),
  spawned: describedNumber('How many processes the pass spawned.'),
  overheadMs: describedNumber('The time the counting itself took, in milliseconds.'),
  rested: describedNumber("How many runs at rest the pass answered from the tick's memory, with no read of their own."),
  unobserved: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description: 'Why the runtime could not read a harness on this pass, each a sentence; absent where it could.',
    }),
  ),
  runs: Schema.optionalKey(describedNumber('How many runs the store listed to the pass; absent in a record from before it was counted.')),
  tasks: Schema.optionalKey(
    describedNumber('How many tasks the runtime reported not settled; absent in a record from before it was counted.'),
  ),
  queued: Schema.optionalKey(describedNumber('How many sessions wait for a slot; absent in a record from before it was counted.')),
  admitted: Schema.optionalKey(
    describedNumber(
      'How many sessions hold a slot, at work or admitted and not yet started; absent in a record from before it was counted.',
    ),
  ),
  waitMs: Schema.optionalKey(
    describedNumber(
      'How long the oldest queued session has waited since it was filed, in milliseconds; 0 with none; absent in an older record.',
    ),
  ),
  load: Schema.optionalKey(describedNumber("The machine's load over the last minute per core it has; absent in an older record.")),
});
export type PassCost = typeof PassCost.Type;

/** A run the cap holds: the count it is held at, the cap, and `nemia ls`'s words on it. */
export const HeldRun = Schema.Struct({
  run: Schema.String.annotate({ description: "The held run's id." }),
  inFlight: describedNumber('How many runs count against the cap where this one is held.'),
  cap: describedNumber('The cap it is held at.'),
  word: Schema.String.annotate({ description: "What `nemia ls` says of the run's wait." }),
});

/**
 * `GET /api/ceilings`: what the daemon's last pass ran with (`last`), the cap a run is judged by (`cap`, 0 for none), the runs that count
 * against it (`inFlight`, null with no cap), the runs it holds (`held`), and what the last pass cost (`pass`).
 */
export const Ceilings = Schema.Struct({
  last: OrNull(
    Schema.Struct({
      sessions: describedNumber('How many sessions the last pass ran with.'),
      runs: describedNumber('How many runs the last pass ran with.'),
    }),
    "What the daemon's last pass ran with: its sessions and runs; null where none has.",
  ),
  cap: describedNumber('The cap a run is judged by, on the runs in flight; 0 for none.'),
  inFlight: OrNull(Schema.Array(Schema.String), 'The ids of the runs that count against the cap; null with no cap.'),
  held: Schema.Array(HeldRun).annotate({ description: 'The runs the cap holds.' }),
  pass: OrNull(PassCost, 'What the last pass cost; null where none has run.'),
});
export type Ceilings = typeof Ceilings.Type;

/** One recent pass of the tick: when, how long, what it saw and read, its phases' times, and its quota, checks and disk where kept. */
export const RecentPass = Schema.Struct({
  at: Schema.String.annotate({ description: 'When the pass was written, as an ISO 8601 time.' }),
  ms: describedNumber('How long the pass took, in milliseconds.'),
  records: describedNumber('How many run records the pass read.'),
  rested: describedNumber("How many runs at rest the pass answered from the tick's memory."),
  reads: describedNumber('How many reads the pass made.'),
  runs: describedNumber('How many runs the store listed to the pass.'),
  tasks: describedNumber('How many tasks the runtime reported not settled.'),
  queued: describedNumber('How many sessions wait for a slot.'),
  admitted: describedNumber('How many sessions hold a slot.'),
  waitMs: Schema.optionalKey(describedNumber('How long the oldest queued session has waited, in milliseconds; absent in an older record.')),
  load: Schema.optionalKey(describedNumber("The machine's load over the last minute per core it has; absent in an older record.")),
  phases: Schema.Record(Schema.String, Schema.Number).annotate({
    description: "The pass's time in each phase, in milliseconds, by phase.",
  }),
  quota: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Number)).annotate({
      description: 'The quota windows of each harness the pass read, as numbers by harness and window; absent where none was kept.',
    }),
  ),
  checks: Schema.optionalKey(
    Schema.Array(Schema.Unknown).annotate({ description: 'The checks the pass filed; absent where none was kept.' }),
  ),
  disk: Schema.optionalKey(Json('The disk the pass measured, as the meter reads it; absent where it was not.')),
});

/** `GET /api/passes`: the recent passes, oldest first, the histogram over `bounds`, the phases' parts and the summary. */
export const PassesRead = Schema.Struct({
  recent: Schema.Array(RecentPass).annotate({ description: 'The recent passes of the tick, oldest first.' }),
  histogram: Schema.Array(
    Schema.Struct({
      le: OrNull(Schema.Number, 'The upper bound of the bucket, in milliseconds; null for the last, which has none.'),
      count: describedNumber('How many passes fell in the bucket.'),
    }),
  ).annotate({ description: 'The passes counted over the `bounds`, one bucket each, the last open.' }),
  parts: Schema.Array(
    Schema.Struct({
      phase: Schema.String.annotate({ description: "The phase's name." }),
      ms: describedNumber('Its time in the recent passes, in milliseconds.'),
      share: describedNumber("Its share of the passes' time, from 0 to 1."),
    }),
  ).annotate({ description: "Each phase's part of the recent passes' time." }),
  summary: OrNull(
    Schema.Struct({
      passes: describedNumber('How many recent passes it sums.'),
      medianMs: describedNumber("The median pass's time, in milliseconds."),
      slowestMs: describedNumber("The slowest pass's time, in milliseconds."),
      reads: describedNumber("The last pass's reads."),
      at: Schema.String.annotate({ description: 'When the last pass was written, as an ISO 8601 time.' }),
      runs: describedNumber('How many runs the last pass saw.'),
      tasks: describedNumber('How many tasks the last pass saw.'),
      queued: describedNumber('How many sessions the last pass saw queued.'),
      admitted: describedNumber('How many sessions the last pass saw admitted.'),
    }),
    'The recent passes in a few numbers, the last pass beside them; null where none has run.',
  ),
  bounds: Schema.Array(Schema.Number).annotate({ description: "The histogram's bucket bounds, in milliseconds, in order." }),
});
export type PassesRead = typeof PassesRead.Type;

/** One point of a series: its span's start, and of the samples in it how many, their mean, least, most and last, and percentiles. */
export const SeriesPoint = Schema.Struct({
  t: Schema.String.annotate({ description: "The start of the point's span, as an ISO 8601 time." }),
  n: describedNumber('How many samples are in the span.'),
  mean: describedNumber('The mean of the samples.'),
  min: describedNumber('The least sample.'),
  max: describedNumber('The most sample.'),
  last: describedNumber('The last sample.'),
  p50: Schema.optionalKey(describedNumber('The median of the samples; absent where the series keeps none.')),
  p95: Schema.optionalKey(describedNumber('The 95th percentile of the samples; absent where the series keeps none.')),
});

/** `GET /api/series`: a range, the span of its points, and each series and label set's points in time. */
export const SeriesRead = Schema.Struct({
  range: Schema.Literals(SERIES_RANGES).annotate({ description: 'The range the points are read over.' }),
  span: Schema.Literals(SERIES_SPANS).annotate({ description: 'The span of one point: a minute, an hour or a day.' }),
  from: Schema.String.annotate({ description: 'The start of the range, as an ISO 8601 time.' }),
  to: Schema.String.annotate({ description: 'The end of the range, as an ISO 8601 time.' }),
  series: Schema.Array(
    Schema.Struct({
      s: Schema.String.annotate({ description: "The series' name." }),
      l: Schema.Record(Schema.String, Schema.String).annotate({ description: "The series' labels, each a key and its value." }),
      points: Schema.Array(SeriesPoint).annotate({ description: 'Its points in time, oldest first.' }),
    }),
  ).annotate({ description: 'Each series and label set, with its points.' }),
});
export type SeriesRead = typeof SeriesRead.Type;

/**
 * One metric of the process: its name, kind, description and attributes, and its value — a counter's `count`, a gauge's `value`, or a
 * histogram's `count`, `sum`, `min`, `max` and cumulative `buckets`.
 */
export const MetricRead = Schema.Struct({
  name: Schema.String.annotate({ description: "The metric's name." }),
  type: Schema.Literals(METRIC_TYPES).annotate({ description: "The metric's kind, in Effect's own words for it." }),
  description: OrNull(Schema.String, 'What the metric measures, as its maker said it; null where none did.'),
  attributes: Schema.Record(Schema.String, Schema.String).annotate({ description: "The metric's attributes, each a key and its value." }),
  count: Schema.optionalKey(describedNumber("A counter's count, or a histogram's number of samples.")),
  value: Schema.optionalKey(describedNumber("A gauge's value.")),
  sum: Schema.optionalKey(describedNumber("A histogram's sum of its samples.")),
  min: Schema.optionalKey(describedNumber("A histogram's least sample.")),
  max: Schema.optionalKey(describedNumber("A histogram's most sample.")),
  buckets: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        le: describedNumber("The bucket's upper bound."),
        count: describedNumber('How many samples fell at or under the bound, cumulatively.'),
      }),
    ).annotate({ description: "A histogram's cumulative buckets." }),
  ),
});
export type MetricRead = typeof MetricRead.Type;

/** `GET /api/metrics`: every metric of the app's runtime, by name and then attributes. */
export const Metrics = Schema.Array(MetricRead);

/** A file of the daemon's, read as it says itself: who it is, where it serves, and when it last moved. */
export const Daemon = Schema.Struct({
  kind: Schema.Literals(DAEMON_KINDS).annotate({
    description: "Where the store's daemon stands: none, a file that does not read, stopped, gone, stalled, or ticking.",
  }),
  by: OrNull(Schema.String, 'Who started it; null where its file says none.'),
  url: OrNull(Schema.String, 'The address it serves on; null where it serves none.'),
  start: Schema.String.annotate({ description: 'The command that started it.' }),
  ticking: Schema.Boolean.annotate({ description: 'Whether it is the one moving the runs now.' }),
  pid: OrNull(Schema.Number, "The daemon's process id; null with no file."),
  cwd: OrNull(Schema.String, 'The folder it runs in; null with no file.'),
  every: OrNull(Schema.Number, 'Its pass interval, in milliseconds; null with no file.'),
  startedAt: OrNull(Schema.String, 'When it started, as an ISO 8601 time; null with no file.'),
  passedAt: OrNull(Schema.String, 'When its last pass ended, as an ISO 8601 time; null where none has.'),
  lastHeardAt: OrNull(Schema.String, 'When it was last heard from, as an ISO 8601 time; null where it never was.'),
  stoppedAt: OrNull(Schema.String, 'When it stopped, as an ISO 8601 time; null while it has not.'),
  staleAfterMs: OrNull(
    Schema.Number,
    'How long without a pass makes it stale, in milliseconds, worked from its interval; null with no file.',
  ),
  identity: OrNull(
    Schema.Literals(DAEMON_IDENTITIES),
    'What the process table says of its pid: the same process, another, not known, or gone; null with no pid.',
  ),
  line: Schema.String.annotate({ description: "The line `nemia ls` says of the daemon's standing." }),
  unobserved: Schema.Array(Schema.String).annotate({
    description: 'Why the runtime could not read a harness on its last pass, each a sentence; empty where it could.',
  }),
  branchesLine: Schema.optionalKey(
    OrNull(
      Schema.String,
      'The line `nemia ls` says of where the result branches stand, where its last pass is old or none; null where a ticking daemon read them lately; left out by an older api.',
    ),
  ),
});
export type Daemon = typeof Daemon.Type;

/** A window of the plan's quota, as the board shows it. */
export const QuotaWindow = Schema.Struct({
  key: Schema.String.annotate({ description: "The window's name as Claude Code reports it (five_hour, seven_day)." }),
  label: Schema.String.annotate({ description: "The board's word for the window." }),
  usedPercentage: describedNumber('How much of the window is used, in percent.'),
  resetsAt: OrNull(Schema.String, 'When the window begins again, as an ISO 8601 time; null where none was given.'),
  reset: Schema.Boolean.annotate({
    description: 'Whether that time has passed since the reading, so the number is about the window before.',
  }),
  marked: Schema.Boolean.annotate({ description: 'Whether the window is used past the percent at which the board marks it.' }),
});
export type QuotaWindow = typeof QuotaWindow.Type;

/** `GET /api/quota`: the subscription's quota as the board is given it, every case a 200 with a sentence (`said`) but `fresh`. */
export const Quota = Schema.Struct({
  state: Schema.Literals(QUOTA_STATES).annotate({ description: 'Where the quota stands: fresh with its windows, or why there are none.' }),
  askedAt: OrNull(Schema.String, 'When the held answer was asked, as an ISO 8601 time; null while none is held.'),
  ageMs: OrNull(Schema.Number, 'How old the held answer is, in milliseconds; null while none is held.'),
  againAt: OrNull(Schema.String, 'When a read will next ask, as an ISO 8601 time; null while no answer is held.'),
  subscription: OrNull(Schema.String, 'The subscription Claude Code is signed in to; null where it is not or does not say.'),
  windows: Schema.Array(QuotaWindow).annotate({ description: "The plan's windows, in the board's order; empty unless fresh." }),
  last: OrNull(
    Schema.Struct({
      askedAt: Schema.String.annotate({ description: 'When that answer was asked, as an ISO 8601 time.' }),
      windows: Schema.Array(QuotaWindow).annotate({ description: 'The windows it held.' }),
    }),
    'The last answer that had windows, where the state is not fresh; null where there is none.',
  ),
  keepMs: describedNumber('How long an answer is kept before the quota is asked again, in milliseconds.'),
  markAt: describedNumber('The percent of a window at which the board marks it.'),
  said: OrNull(Schema.String, 'The sentence that says the case and what to do, for every state but fresh; null for fresh.'),
  heard: Schema.optionalKey(
    OrNull(
      Schema.Struct({
        at: Schema.String.annotate({ description: "When a session's turn received the windows, as an ISO 8601 time." }),
        ageMs: describedNumber('How long ago that was, in milliseconds.'),
      }),
      "Where the windows are those the newest rate_limit_event of the sessions said, when it was received; null while none has been; left out where the windows are get_usage's own and by an older api.",
    ),
  ),
});
export type Quota = typeof Quota.Type;
