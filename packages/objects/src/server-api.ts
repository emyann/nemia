/**
 * The group of the server and the machine (`ServerGroup`), added to the one `Api` (`api.ts`) beside the objects: whether the api answers
 * and what it runs, what the repository offers a step, your store, the floor's gauges (the run slots, the passes, the series, the
 * metrics, the daemon, the quota), the store's pause read, put and lifted and its timeout read and set, the flow numbers, and the feed
 * followed as server-sent events.
 * None of them is a kind, so discovery lists none (`resourcesOf` skips a group no kind has).
 *
 * Each answer is a plain Schema of JSON here. Where an answer holds a deep part another reader owns — a pass's phases, a group of the flow
 * numbers, a step's reach — the part is said as JSON (`Schema.Unknown`) and its own reader types it; every key at the top is declared,
 * since a key a Schema does not declare is not encoded.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api';
import { BadRequest, Conflict, Failed, Invalid, Missing } from './api-errors.ts';
import {
  DAEMON_IDENTITIES,
  DAEMON_KINDS,
  FEED_STREAM_EVENTS,
  FINISHING_KINDS,
  SESSION_COOKIE_STATES,
  INTERRUPT_KINDS,
  METRIC_TYPES,
  QUOTA_STATES,
  SERIES_RANGES,
  SERIES_SPANS,
  STATS_BY,
} from './words.ts';
import { SubscriptionScope } from './subscription.ts';
import { SessionReleaseSchema } from './run.ts';
import { Event } from './event.ts';

/** A part of an answer said as JSON, typed by its own reader. */
const Json = Schema.Unknown;

/** A text that may be absent from the record it is read from: null. */
const OrNull = <S extends Schema.Top>(s: S) => Schema.NullOr(s);

/** `GET /api/health`: the api answers. */
export const Health = Schema.Struct({ ok: Schema.Literal(true), release: Schema.optionalKey(Schema.String) });
export type Health = typeof Health.Type;

/** Where the code runs from: the two words a session's release says (`SessionRelease`, run.ts). */
const ReleaseKind = Schema.Union([SessionReleaseSchema.members[0].fields.kind, SessionReleaseSchema.members[1].fields.kind]);

/** The code the api runs, as the lease records it: the repository's working copy's folder, or an install's folder, tag and commit. */
export const Release = Schema.Struct({
  kind: ReleaseKind,
  root: Schema.String,
  tag: Schema.optionalKey(Schema.String),
  commit: Schema.optionalKey(Schema.String),
});
export type Release = typeof Release.Type;

/**
 * The newest release the daemon's release check last read (`$WF_ROOT/releases/latest.json`): its version, and whether it is newer than
 * the one the api runs. Absent where no check has read one: code run from a repository, a store whose check is off, or one not yet made.
 */
export const LatestRelease = Schema.Struct({ version: Schema.String, newer: Schema.Boolean });
export type LatestRelease = typeof LatestRelease.Type;

/**
 * `GET /api/version`: the release's version (the root package.json's), the code the api runs, and the newest release the daemon
 * knows of (`latest`), which the board and `nemia version` say when it is newer.
 */
export const VersionAnswer = Schema.Struct({ version: Schema.String, release: Release, latest: Schema.optionalKey(LatestRelease) });
export type VersionAnswer = typeof VersionAnswer.Type;

/**
 * `POST /api/session` and `DELETE /api/session`: the browser's session on this daemon. A post presents one of the person's tokens as a
 * bearer, which the caller gate judges before any route; the answer sets it as the board's HttpOnly cookie (`TOKEN_COOKIE`), which the
 * browser then sends on every read, stream and write of the board's, and which no script of the page can read. A delete clears the
 * cookie. Either answers that it did, and never the token.
 */
export const SessionAnswer = Schema.Struct({ cookie: Schema.Literals(SESSION_COOKIE_STATES) });
export type SessionAnswer = typeof SessionAnswer.Type;

/** `GET /api/repository`: the repository a start runs in, as the request's `?factory=` and `?repo=` resolve it. */
export const RepositoryAnswer = Schema.Struct({ repo: Schema.String });
export type RepositoryAnswer = typeof RepositoryAnswer.Type;

/** `GET /api/store`: your store's folders, the line that files a factory in it and the line that turns Nemia on. */
export const YourStore = Schema.Struct({
  workflows: Schema.String,
  agents: Schema.String,
  skills: Schema.String,
  fileFactory: Schema.String,
  turnOnNemia: Schema.String,
});
export type YourStore = typeof YourStore.Type;

/**
 * Why the Capabilities page reads no repository: `several-factories`, the store has several and the request names none of them;
 * `several-repositories`, the factory it is read in works on several and the request names none of them; `no-factory`, the store has no
 * factory and the api no repository of its own.
 */
export const CAPABILITIES_UNREAD = ['several-factories', 'several-repositories', 'no-factory'] as const;
export type CapabilitiesUnreadReason = (typeof CAPABILITIES_UNREAD)[number];

/**
 * The Capabilities page's answer where it reads no repository: why (`reason`), in a sentence (`message`), the factory whose repositories
 * are `repos` for `several-repositories` (each read with `?factory=<factory>&repo=<repo>`), and the lines that file a factory for
 * `no-factory` (`commands`); empty where they say nothing.
 */
export const CapabilitiesUnread = Schema.Struct({
  reason: Schema.Literals(CAPABILITIES_UNREAD),
  message: Schema.String,
  factory: Schema.NullOr(Schema.String),
  repos: Schema.Array(Schema.String),
  commands: Schema.Array(Schema.String),
});
export type CapabilitiesUnread = typeof CapabilitiesUnread.Type;

/**
 * `GET /api/capabilities`: what the repository offers a step — its skills, agents, MCP servers and permission rules, each a list read by
 * the Capabilities page — the measured set and the read-only commands, and what each step of each workflow gets. Where no repository is
 * read, `repo` is left out, every list is empty and `unread` says why and what to do.
 */
export const CapabilitiesWithSteps = Schema.Struct({
  repo: Schema.optionalKey(Schema.String),
  unread: Schema.optionalKey(CapabilitiesUnread),
  skills: Schema.Array(Json),
  agents: Schema.Array(Json),
  mcp: Schema.Array(Json),
  denied: Schema.Array(Json),
  asked: Schema.Array(Json),
  allowed: Schema.Array(Json),
  warnings: Schema.Array(Schema.String),
  measured: Json,
  readOnly: Json,
  steps: Schema.Array(Json),
});
export type CapabilitiesWithSteps = typeof CapabilitiesWithSteps.Type;

/** What the last pass cost, as it wrote it: its time, what it saw, and its phases and harnesses, each read by its own reader. */
export const PassCost = Schema.Struct({
  at: Schema.String,
  ms: Schema.Number,
  phases: Schema.Record(Schema.String, Json),
  harnesses: Schema.Record(Schema.String, Json),
  records: Schema.Number,
  bytes: Schema.Number,
  spawned: Schema.Number,
  overheadMs: Schema.Number,
  rested: Schema.Number,
  unobserved: Schema.optionalKey(Schema.Array(Schema.String)),
  runs: Schema.optionalKey(Schema.Number),
  tasks: Schema.optionalKey(Schema.Number),
  queued: Schema.optionalKey(Schema.Number),
  admitted: Schema.optionalKey(Schema.Number),
  waitMs: Schema.optionalKey(Schema.Number),
  load: Schema.optionalKey(Schema.Number),
});
export type PassCost = typeof PassCost.Type;

/** A run the cap holds: the count it is held at, the cap, and `nemia ls`'s words on it. */
export const HeldRun = Schema.Struct({ run: Schema.String, inFlight: Schema.Number, cap: Schema.Number, word: Schema.String });

/**
 * `GET /api/ceilings`: what the daemon's last pass ran with (`last`), the cap a run is judged by (`cap`, 0 for none), the runs that count
 * against it (`inFlight`, null with no cap), the runs it holds (`held`), and what the last pass cost (`pass`).
 */
export const Ceilings = Schema.Struct({
  last: OrNull(Schema.Struct({ sessions: Schema.Number, runs: Schema.Number })),
  cap: Schema.Number,
  inFlight: OrNull(Schema.Array(Schema.String)),
  held: Schema.Array(HeldRun),
  pass: OrNull(PassCost),
});
export type Ceilings = typeof Ceilings.Type;

/** One recent pass of the tick: when, how long, what it saw and read, its phases' times, and its quota, checks and disk where kept. */
export const RecentPass = Schema.Struct({
  at: Schema.String,
  ms: Schema.Number,
  records: Schema.Number,
  rested: Schema.Number,
  reads: Schema.Number,
  runs: Schema.Number,
  tasks: Schema.Number,
  queued: Schema.Number,
  admitted: Schema.Number,
  waitMs: Schema.optionalKey(Schema.Number),
  load: Schema.optionalKey(Schema.Number),
  phases: Schema.Record(Schema.String, Schema.Number),
  quota: Schema.optionalKey(Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Number))),
  checks: Schema.optionalKey(Schema.Array(Json)),
  disk: Schema.optionalKey(Json),
});

/** `GET /api/passes`: the recent passes, oldest first, the histogram over `bounds`, the phases' parts and the summary. */
export const PassesRead = Schema.Struct({
  recent: Schema.Array(RecentPass),
  histogram: Schema.Array(Schema.Struct({ le: OrNull(Schema.Number), count: Schema.Number })),
  parts: Schema.Array(Schema.Struct({ phase: Schema.String, ms: Schema.Number, share: Schema.Number })),
  summary: OrNull(
    Schema.Struct({
      passes: Schema.Number,
      medianMs: Schema.Number,
      slowestMs: Schema.Number,
      reads: Schema.Number,
      at: Schema.String,
      runs: Schema.Number,
      tasks: Schema.Number,
      queued: Schema.Number,
      admitted: Schema.Number,
    }),
  ),
  bounds: Schema.Array(Schema.Number),
});
export type PassesRead = typeof PassesRead.Type;

/** One point of a series: its span's start, and of the samples in it how many, their mean, least, most and last, and percentiles. */
export const SeriesPoint = Schema.Struct({
  t: Schema.String,
  n: Schema.Number,
  mean: Schema.Number,
  min: Schema.Number,
  max: Schema.Number,
  last: Schema.Number,
  p50: Schema.optionalKey(Schema.Number),
  p95: Schema.optionalKey(Schema.Number),
});

/** `GET /api/series`: a range, the span of its points, and each series and label set's points in time. */
export const SeriesRead = Schema.Struct({
  range: Schema.Literals(SERIES_RANGES),
  span: Schema.Literals(SERIES_SPANS),
  from: Schema.String,
  to: Schema.String,
  series: Schema.Array(
    Schema.Struct({ s: Schema.String, l: Schema.Record(Schema.String, Schema.String), points: Schema.Array(SeriesPoint) }),
  ),
});
export type SeriesRead = typeof SeriesRead.Type;

/**
 * One metric of the process: its name, kind, description and attributes, and its value — a counter's `count`, a gauge's `value`, or a
 * histogram's `count`, `sum`, `min`, `max` and cumulative `buckets`.
 */
export const MetricRead = Schema.Struct({
  name: Schema.String,
  type: Schema.Literals(METRIC_TYPES),
  description: OrNull(Schema.String),
  attributes: Schema.Record(Schema.String, Schema.String),
  count: Schema.optionalKey(Schema.Number),
  value: Schema.optionalKey(Schema.Number),
  sum: Schema.optionalKey(Schema.Number),
  min: Schema.optionalKey(Schema.Number),
  max: Schema.optionalKey(Schema.Number),
  buckets: Schema.optionalKey(Schema.Array(Schema.Struct({ le: Schema.Number, count: Schema.Number }))),
});
export type MetricRead = typeof MetricRead.Type;

/** `GET /api/metrics`: every metric of the app's runtime, by name and then attributes. */
export const Metrics = Schema.Array(MetricRead);

/** The store's pause: since when, by whom, why, and the timeout it parks sessions within. */
export const Pause = Schema.Struct({
  at: Schema.String,
  by: Schema.String,
  why: Schema.optionalKey(Schema.String),
  timeoutMs: Schema.optionalKey(Schema.Number),
});
export type Pause = typeof Pause.Type;

/** A step of a run, as the pause names one. */
const RunStep = { run: Schema.String, step: Schema.String };

/** A task a pause at once would cut, or cut: its run, its step, a session or a check, and its task. */
export const Interrupt = Schema.Struct({ ...RunStep, kind: Schema.Literals(INTERRUPT_KINDS), taskId: Schema.String });
export type Interrupt = typeof Interrupt.Type;

/**
 * `GET /api/pause`: the store's pause or null; each task still finishing under it; each session it parked at a tool call's end; each
 * landing it holds with its merge staged; and each other check it holds.
 */
export const Paused = Schema.Struct({
  pause: OrNull(Pause),
  finishing: Schema.Array(
    Schema.Struct({
      ...RunStep,
      kind: Schema.Literals(FINISHING_KINDS),
      stopping: Schema.optionalKey(Schema.Literal(true)),
      resumed: Schema.optionalKey(Schema.Literal(true)),
      calling: Schema.optionalKey(Schema.String),
    }),
  ),
  parked: Schema.Array(Schema.Struct({ ...RunStep, after: Schema.optionalKey(Schema.String), cut: Schema.optionalKey(Schema.String) })),
  staged: Schema.Array(Schema.Struct({ ...RunStep, repo: Schema.String })),
  held: Schema.Array(Schema.Struct(RunStep)),
});
export type Paused = typeof Paused.Type;

/** `GET /api/pause/now`: what a pause at once would cut, each task at work but a landing, and the sentence of what that costs. */
export const PauseNowRead = Schema.Struct({ interrupts: Schema.Array(Interrupt), cost: Schema.String });
export type PauseNowRead = typeof PauseNowRead.Type;

/**
 * `POST /api/pause`'s body, `nemia pause`'s flags: why, by whom, how long a call in flight is given (`"15m"`; the store's timeout where
 * left out), and `now`, which pauses at once. Each kept as the text it was sent as, so a wrong one is refused in the package's words, a
 * 422.
 */
export const PauseWrite = Schema.Struct({
  why: Schema.optionalKey(Schema.String),
  by: Schema.optionalKey(Schema.String),
  timeout: Schema.optionalKey(Schema.String),
  now: Schema.optionalKey(Schema.Boolean),
});
export type PauseWrite = typeof PauseWrite.Type;

/** What `POST /api/pause` answers: the pause put; with `now`, the pause and what it cut (`interrupted`) and left (`skipped`). */
export const PauseAnswer = Schema.Union([
  Schema.Struct({
    pause: Pause,
    kept: Schema.Boolean,
    interrupted: Schema.Array(Interrupt),
    skipped: Schema.Array(Interrupt),
  }),
  Schema.Struct({ pause: Pause }),
]);
export type PauseAnswer = typeof PauseAnswer.Type;

/** What `DELETE /api/pause` answers: the pause lifted. */
export const Resumed = Schema.Struct({ pause: Pause });
export type Resumed = typeof Resumed.Type;

/** The store's pause timeout in force: its milliseconds, whether the store's file set it, and since when where it says. */
export const PauseTimeout = Schema.Struct({ ms: Schema.Number, set: Schema.Boolean, at: Schema.optionalKey(Schema.String) });
export type PauseTimeout = typeof PauseTimeout.Type;

/**
 * What `GET` and `PUT /api/pause/timeout` answer, as `nemia pause-timeout` does: the timeout in force, and whether this call wrote it.
 */
export const PauseTimeoutAnswer = Schema.Struct({ timeout: PauseTimeout, wrote: Schema.Boolean }).annotate({
  identifier: 'PauseTimeoutAnswer',
});
export type PauseTimeoutAnswer = typeof PauseTimeoutAnswer.Type;

/**
 * `PUT /api/pause/timeout`'s body, `nemia pause-timeout <d>`'s duration: digits and s, m or h, from 1s to 23h (`"10m"`), kept as the text
 * it was sent as, so a wrong one is refused in the package's words, a 422.
 */
export const PauseTimeoutWrite = Schema.Struct({ timeout: Schema.String }).annotate({ identifier: 'PauseTimeoutWrite' });
export type PauseTimeoutWrite = typeof PauseTimeoutWrite.Type;

/** A file of the daemon's, read as it says itself: who it is, where it serves, and when it last moved. */
export const Daemon = Schema.Struct({
  kind: Schema.Literals(DAEMON_KINDS),
  by: OrNull(Schema.String),
  url: OrNull(Schema.String),
  start: Schema.String,
  ticking: Schema.Boolean,
  pid: OrNull(Schema.Number),
  cwd: OrNull(Schema.String),
  every: OrNull(Schema.Number),
  startedAt: OrNull(Schema.String),
  passedAt: OrNull(Schema.String),
  lastHeardAt: OrNull(Schema.String),
  stoppedAt: OrNull(Schema.String),
  staleAfterMs: OrNull(Schema.Number),
  identity: OrNull(Schema.Literals(DAEMON_IDENTITIES)),
  line: Schema.String,
  unobserved: Schema.Array(Schema.String),
  /**
   * The line `nemia ls` says of where the result branches stand: how long ago the tick's last pass read them, where that is older than
   * `staleAfterMs` or nothing ticks, or that no pass has; null where a ticking daemon read them lately. Left out by an older api.
   */
  branchesLine: Schema.optionalKey(OrNull(Schema.String)),
});
export type Daemon = typeof Daemon.Type;

/** A window of the plan's quota, as the board shows it. */
export const QuotaWindow = Schema.Struct({
  key: Schema.String,
  label: Schema.String,
  usedPercentage: Schema.Number,
  resetsAt: OrNull(Schema.String),
  reset: Schema.Boolean,
  marked: Schema.Boolean,
});
export type QuotaWindow = typeof QuotaWindow.Type;

/** `GET /api/quota`: the subscription's quota as the board is given it, every case a 200 with a sentence (`said`) but `fresh`. */
export const Quota = Schema.Struct({
  state: Schema.Literals(QUOTA_STATES),
  askedAt: OrNull(Schema.String),
  ageMs: OrNull(Schema.Number),
  againAt: OrNull(Schema.String),
  subscription: OrNull(Schema.String),
  windows: Schema.Array(QuotaWindow),
  last: OrNull(Schema.Struct({ askedAt: Schema.String, windows: Schema.Array(QuotaWindow) })),
  keepMs: Schema.Number,
  markAt: Schema.Number,
  said: OrNull(Schema.String),
});
export type Quota = typeof Quota.Type;

/**
 * `GET /api/stats`' query: `from` and `to` UTC days, `by` what the rows go by, and the facts kept by `agent`, `step`, `workflow`,
 * `ofFactory` and `ofRepo` (named so beside `factory` and `repo`, which name the place every route is answered in). Each kept as the text
 * it was sent as, refused in the package's words, a 422. `labelSelector`, a label query given once or again (`nemia stats -l`), the runs
 * whose labels one of them takes; the api reads its former key off the request beside it, the retired spelling this table holds no
 * field of.
 */
export const StatsQuery = {
  from: Schema.optionalKey(Schema.String),
  to: Schema.optionalKey(Schema.String),
  by: Schema.optionalKey(Schema.String),
  agent: Schema.optionalKey(Schema.String),
  step: Schema.optionalKey(Schema.String),
  workflow: Schema.optionalKey(Schema.String),
  ofFactory: Schema.optionalKey(Schema.String),
  ofRepo: Schema.optionalKey(Schema.String),
  labelSelector: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
};

/**
 * `GET /api/stats`: the flow numbers of every run in the store, as `nemia stats --json` prints them — the range, what the rows go by,
 * the filters, every run's group and each group's, the runs that did not read, and the system's health over the range. A group is read
 * by the board's own reader.
 */
export const Stats = Schema.Struct({
  from: OrNull(Schema.String),
  to: Schema.String,
  by: OrNull(Schema.Literals(STATS_BY)),
  filters: Schema.Record(Schema.String, Schema.String),
  all: Json,
  groups: Schema.Array(Json),
  unreadable: Schema.Array(Schema.String),
  health: Json,
});
export type Stats = typeof Stats.Type;

/**
 * `POST /api/subscriptions/:name`'s body, `nemia subscribe`'s task and flags: the long-lived task told, the selectors of the lines that
 * wake it (`-l`; waits=person where left out), the minutes a digest waits (60), and the level a run's factory is at least at. `atLeast`
 * kept as text, so a word that is no level is refused in the package's words, a 422.
 */
export const SubscriptionWrite = Schema.Struct({
  task: Schema.String,
  selectors: Schema.optionalKey(Schema.Array(Schema.String)),
  digestEvery: Schema.optionalKey(Schema.Number),
  atLeast: Schema.optionalKey(Schema.String),
});
export type SubscriptionWrite = typeof SubscriptionWrite.Type;

/**
 * What `POST /api/subscriptions/:name` answers: the subscription put under its name, its news from the feed's byte `from`; and `hints`,
 * a sentence for each former word one of its selectors still says, naming what it says now (none where none does; left out by an older
 * api).
 */
export const Subscribed = Schema.Struct({
  name: Schema.String,
  subscription: Schema.Struct({
    task: Schema.String,
    selectors: Schema.Array(Schema.String),
    digestEvery: Schema.Number,
    from: Schema.Number,
    scope: Schema.optionalKey(SubscriptionScope),
  }),
  hints: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type Subscribed = typeof Subscribed.Type;

/** What `DELETE /api/subscriptions/:name` answers: the name taken away. */
export const Unsubscribed = Schema.Struct({ name: Schema.String });
export type Unsubscribed = typeof Unsubscribed.Type;

/**
 * One event of the feed's stream: its name (`FEED_STREAM_EVENTS`), its data the JSON of what it says — a line as the feed wrote it, a
 * hint's `{ message }`, a failed read's `{ error, retrying }`, `{}` for `readable`, nothing for `opened` and `bookmark` — and, for a line
 * and a bookmark, its id, the cursor an EventSource sends back as Last-Event-ID.
 */
export const FeedStreamEvent = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  event: Schema.Literals(FEED_STREAM_EVENTS),
  data: Schema.String,
});
export type FeedStreamEvent = typeof FeedStreamEvent.Type;

/**
 * `GET /api/feed/stream`'s query: `from=end`, the feed's end; `after`, a cursor this stream gave (a Last-Event-ID wins over it);
 * `until=end`, the feed read once. Each kept as text, refused in the api's words before the stream. The label query, given again for
 * another, the api reads off the request as it reads `GET /api/stats`' (`StatsQuery`).
 */
export const FeedQuery = {
  from: Schema.optionalKey(Schema.String),
  after: Schema.optionalKey(Schema.String),
  until: Schema.optionalKey(Schema.String),
};

/** Why a wait ended: `matched`, a line a label query takes was read; `bound`, its bound came with none. */
export const FEED_WAIT_ENDS = ['matched', 'bound'] as const;

/** One of `FEED_WAIT_ENDS`. */
export type FeedWaitEnd = (typeof FEED_WAIT_ENDS)[number];

/**
 * What `GET /api/feed/wait` (`nemia wait`) answers: why it ended, the lines its label queries took (none at its bound), each an
 * `Event`, and the cursor after the last line it read, from which the next wait starts and loses no line.
 */
export const FeedWait = Schema.Struct({
  ended: Schema.Literals(FEED_WAIT_ENDS),
  lines: Schema.Array(Event),
  cursor: Schema.String,
}).annotate({ identifier: 'FeedWait' });
export type FeedWait = typeof FeedWait.Type;

/**
 * `GET /api/feed/wait`'s query: `labelSelector`, a label query given once or again (`-l`), each kept as `nemia watch -l` takes it;
 * `from`, the cursor to read from (the feed's end when none); `for`, the bound as `nemia wait --for` takes it (`30s`, `4m`).
 */
export const FeedWaitQuery = {
  labelSelector: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  from: Schema.optionalKey(Schema.String),
  for: Schema.optionalKey(Schema.String),
};

/** A query of the place a request is answered in, which a route of the server reads: the factory and the repository it names. */
const placeQuery = { factory: Schema.optionalKey(Schema.String), repo: Schema.optionalKey(Schema.String) };

/**
 * What a read of the package's refuses with: a value it does not take, or a file that does not read, a 422; and a failure that is no
 * refusal, a 500 in its own words (`Failed`).
 */
const readErrors = [Invalid, Failed];

/** The server, the machine, the store's pause and the feed followed. */
export class ServerGroup extends HttpApiGroup.make('server').add(
  HttpApiEndpoint.get('health', '/api/health', { success: Health }),
  HttpApiEndpoint.get('version', '/api/version', { success: VersionAnswer, error: readErrors }),
  HttpApiEndpoint.post('signIn', '/api/session', { success: SessionAnswer, error: [BadRequest] }),
  HttpApiEndpoint.delete('signOut', '/api/session', { success: SessionAnswer }),
  HttpApiEndpoint.get('capabilities', '/api/capabilities', {
    query: placeQuery,
    success: CapabilitiesWithSteps,
    error: [Missing, ...readErrors],
  }),
  HttpApiEndpoint.get('repository', '/api/repository', { query: placeQuery, success: RepositoryAnswer, error: [Missing, ...readErrors] }),
  HttpApiEndpoint.get('store', '/api/store', { success: YourStore, error: readErrors }),
  HttpApiEndpoint.get('ceilings', '/api/ceilings', { success: Ceilings, error: readErrors }),
  HttpApiEndpoint.get('passes', '/api/passes', {
    query: { last: Schema.optionalKey(Schema.String) },
    success: PassesRead,
    error: readErrors,
  }),
  HttpApiEndpoint.get('series', '/api/series', {
    query: { range: Schema.optionalKey(Schema.String) },
    success: SeriesRead,
    error: readErrors,
  }),
  HttpApiEndpoint.get('metrics', '/api/metrics', { success: Metrics, error: readErrors }),
  HttpApiEndpoint.get('daemon', '/api/daemon', { success: Daemon, error: readErrors }),
  HttpApiEndpoint.get('quota', '/api/quota', { success: Quota, error: readErrors }),
  HttpApiEndpoint.get('stats', '/api/stats', { query: StatsQuery, success: Stats, error: readErrors }),
  HttpApiEndpoint.get('paused', '/api/pause', { success: Paused, error: [Missing, ...readErrors] }),
  HttpApiEndpoint.get('pauseNow', '/api/pause/now', { success: PauseNowRead, error: [Missing, ...readErrors] }),
  HttpApiEndpoint.get('pauseTimeout', '/api/pause/timeout', { success: PauseTimeoutAnswer, error: readErrors }),
  HttpApiEndpoint.put('setPauseTimeout', '/api/pause/timeout', {
    payload: PauseTimeoutWrite,
    success: PauseTimeoutAnswer,
    error: [BadRequest, Invalid, Failed],
  }),
  HttpApiEndpoint.post('pause', '/api/pause', {
    payload: PauseWrite,
    success: PauseAnswer,
    error: [BadRequest, Conflict, Invalid, Failed],
  }),
  HttpApiEndpoint.delete('resume', '/api/pause', { success: Resumed, error: [Missing, Failed] }),
  HttpApiEndpoint.get('wait', '/api/feed/wait', { query: FeedWaitQuery, success: FeedWait, error: [BadRequest, Invalid] }),
  HttpApiEndpoint.get('feed', '/api/feed/stream', {
    query: FeedQuery,
    headers: { 'last-event-id': Schema.optionalKey(Schema.String) },
    success: HttpApiSchema.StreamSse({ events: FeedStreamEvent }),
    error: [BadRequest, Invalid],
  }),
) {}
