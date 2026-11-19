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
import { Actor } from './token.ts';
import { describedNumber, describedOne } from './meta.ts';
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from 'effect/http-api';
import { BadRequest, Conflict, Failed, Invalid, Missing } from './api-errors.ts';
import { Ceilings, Daemon, Metrics, PassesRead, Quota, SeriesRead } from './server-machine.ts';
import { FEED_LINE_EVENTS, type FeedStreamEventName, FINISHING_KINDS, INTERRUPT_KINDS, STATS_BY } from './words.ts';
import { SubscriptionScope } from './subscription.ts';
import { SessionReleaseSchema } from './run.ts';
import { Event } from './event.ts';

export {
  Ceilings,
  Daemon,
  HeldRun,
  MetricRead,
  Metrics,
  PassCost,
  PassesRead,
  Quota,
  QuotaWindow,
  RecentPass,
  SeriesPoint,
  SeriesRead,
} from './server-machine.ts';

/** A part of an answer said as JSON, typed by its own reader, and what it holds. */
const Json = (description: string) => describedOne(Schema.Unknown, description);

/** A text that may be absent from the record it is read from: null. */
const OrNull = <S extends Schema.Top>(s: S, description: string) => Schema.NullOr(s).annotate({ description });

/** `GET /api/health`: the api answers. */
export const Health = Schema.Struct({
  ok: Schema.Literal(true).annotate({ description: 'That the api answers: always true.' }),
  release: Schema.optionalKey(Schema.String.annotate({ description: 'The version the api runs, where it knows it.' })),
});
export type Health = typeof Health.Type;

/** Where the code runs from: the two words a session's release says (`SessionRelease`, run.ts). */
const ReleaseKind = Schema.Literals([
  SessionReleaseSchema.members[0].fields.kind.literal,
  SessionReleaseSchema.members[1].fields.kind.literal,
]);

/** The code the api runs, as the lease records it: the repository's working copy's folder, or an install's folder, tag and commit. */
export const Release = Schema.Struct({
  kind: ReleaseKind.annotate({ description: 'Where the code runs from: the repository, a working copy, or an install.' }),
  root: Schema.String.annotate({ description: "The folder it runs from: the working copy's, or the install's." }),
  tag: Schema.optionalKey(Schema.String.annotate({ description: "The install's release tag; absent for a working copy." })),
  commit: Schema.optionalKey(Schema.String.annotate({ description: "The install's commit; absent for a working copy." })),
});
export type Release = typeof Release.Type;

/**
 * The newest release the daemon's release check last read (`$WF_ROOT/releases/latest.json`): its version, whether it is newer than
 * the one the api runs, its tag (what `POST /api/upgrades` takes), and the address of its notes where the release publishes one
 * (`notes` in its `latest.json`). Absent where no check has read one: code run from a repository, a store whose check is off, or one
 * not yet made.
 */
export const LatestRelease = Schema.Struct({
  version: Schema.String.annotate({ description: "The newest release's version." }),
  newer: Schema.Boolean.annotate({ description: 'Whether it is newer than the version the api runs.' }),
  tag: Schema.optionalKey(Schema.String.annotate({ description: 'Its tag, which `POST /api/upgrades` takes.' })),
  notes: Schema.optionalKey(Schema.String.annotate({ description: 'The address of its notes, where the release publishes one.' })),
}).annotate({ description: 'The newest release the daemon last read: its version, whether it is newer, its tag and its notes.' });
export type LatestRelease = typeof LatestRelease.Type;

/**
 * `GET /api/version`: the release's version (the root package.json's), the code the api runs, and the newest release the daemon
 * knows of (`latest`), which the board and `nemia version` say when it is newer.
 */
export const VersionAnswer = Schema.Struct({
  version: Schema.String.annotate({ description: "The release's version, the root package.json's." }),
  release: Release.annotate({ description: 'The code the api runs, as the lease records it.' }),
  latest: Schema.optionalKey(LatestRelease),
});
export type VersionAnswer = typeof VersionAnswer.Type;

/** `GET /api/repository`: the repository a start runs in, as the request's `?factory=` and `?repo=` resolve it. */
export const RepositoryAnswer = Schema.Struct({
  repo: Schema.String.annotate({ description: 'The repository a start runs in, as the request resolves it.' }),
});
export type RepositoryAnswer = typeof RepositoryAnswer.Type;

/** `GET /api/store`: your store's folders, the line that files a factory in it and the line that turns Nemia on. */
export const YourStore = Schema.Struct({
  workflows: Schema.String.annotate({ description: "The folder of the store's workflows." }),
  agents: Schema.String.annotate({ description: "The folder of the store's agents." }),
  skills: Schema.String.annotate({ description: "The folder of the store's skills." }),
  fileFactory: Schema.String.annotate({ description: 'The line that files a factory in the store.' }),
  turnOnNemia: Schema.String.annotate({ description: 'The line that turns Nemia on.' }),
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
  reason: Schema.Literals(CAPABILITIES_UNREAD).annotate({
    description: 'Why no repository is read: several factories, several repositories, or no factory.',
  }),
  message: Schema.String.annotate({ description: 'What to do about it, as a sentence a person reads.' }),
  factory: OrNull(Schema.String, 'The factory whose repositories are `repos`, for several-repositories; null otherwise.'),
  repos: Schema.Array(Schema.String).annotate({
    description: 'The repositories the factory works on, each read with ?factory=<factory>&repo=<repo>; empty unless several-repositories.',
  }),
  commands: Schema.Array(Schema.String).annotate({ description: 'The lines that file a factory, for no-factory; empty otherwise.' }),
}).annotate({ description: 'Why the Capabilities page reads no repository, and what to do.' });
export type CapabilitiesUnread = typeof CapabilitiesUnread.Type;

/**
 * `GET /api/capabilities`: what the repository offers a step — its skills, agents, MCP servers and permission rules, each a list read by
 * the Capabilities page — the measured set and the read-only commands, and what each step of each workflow gets. Where no repository is
 * read, `repo` is left out, every list is empty and `unread` says why and what to do.
 */
export const CapabilitiesWithSteps = Schema.Struct({
  repo: Schema.optionalKey(Schema.String.annotate({ description: 'The repository read; left out where none is read.' })),
  unread: Schema.optionalKey(CapabilitiesUnread),
  skills: Schema.Array(Schema.Unknown).annotate({
    description: 'The skills the repository offers a step, each as the Capabilities page reads it.',
  }),
  agents: Schema.Array(Schema.Unknown).annotate({
    description: 'The agents the repository offers, each as the Capabilities page reads it.',
  }),
  mcp: Schema.Array(Schema.Unknown).annotate({
    description: 'The MCP servers the repository offers, each as the Capabilities page reads it.',
  }),
  denied: Schema.Array(Schema.Unknown).annotate({ description: 'The permission rules that deny, each as the Capabilities page reads it.' }),
  asked: Schema.Array(Schema.Unknown).annotate({ description: 'The permission rules that ask, each as the Capabilities page reads it.' }),
  allowed: Schema.Array(Schema.Unknown).annotate({
    description: 'The permission rules that allow, each as the Capabilities page reads it.',
  }),
  warnings: Schema.Array(Schema.String).annotate({ description: 'What the read warned of, each a sentence; empty where nothing.' }),
  measured: Json('The measured set: what the repository offers that a step is measured by, as the Capabilities page reads it.'),
  readOnly: Json('The read-only commands a step is allowed, as the Capabilities page reads them.'),
  steps: Schema.Array(Schema.Unknown).annotate({
    description: 'What each step of each workflow gets, each as the Capabilities page reads it.',
  }),
});
export type CapabilitiesWithSteps = typeof CapabilitiesWithSteps.Type;

/** The store's pause: since when, by whom, why, and the timeout it parks sessions within. */
export const Pause = Schema.Struct({
  at: Schema.String.annotate({ description: 'Since when the store is paused, as an ISO 8601 time.' }),
  by: Schema.String.annotate({ description: 'Who paused it.' }),
  why: Schema.optionalKey(Schema.String.annotate({ description: 'Why it was paused; absent where none was said.' })),
  timeoutMs: Schema.optionalKey(
    describedNumber('How long a call in flight is given to finish, in milliseconds; absent where the store timeout applies.'),
  ),
  actor: Schema.optionalKey(Actor),
}).annotate({ description: "The store's pause: since when, by whom, why, and the timeout it parks sessions within." });
export type Pause = typeof Pause.Type;

/** A step of a run, as the pause names one. */
const RunStep = {
  run: Schema.String.annotate({ description: "The run's id." }),
  step: Schema.String.annotate({ description: "The run's step." }),
};

/** A task a pause at once would cut, or cut: its run, its step, a session or a check, and its task. */
export const Interrupt = Schema.Struct({
  ...RunStep,
  kind: Schema.Literals(INTERRUPT_KINDS).annotate({ description: "What the task is: a step's session or its check." }),
  taskId: Schema.String.annotate({ description: "The task's id." }),
}).annotate({ description: 'A task a pause at once would cut, or cut: its run, its step, its kind and its id.' });
export type Interrupt = typeof Interrupt.Type;

/**
 * `GET /api/pause`: the store's pause or null; each task still finishing under it; each session it parked at a tool call's end; each
 * landing it holds with its merge staged; and each other check it holds.
 */
export const Paused = Schema.Struct({
  pause: OrNull(Pause, "The store's pause; null where it is not paused."),
  finishing: Schema.Array(
    Schema.Struct({
      ...RunStep,
      kind: Schema.Literals(FINISHING_KINDS).annotate({ description: 'What is finishing: a session, a check or a landing.' }),
      stopping: Schema.optionalKey(Schema.Literal(true).annotate({ description: 'True where it is being stopped; absent otherwise.' })),
      resumed: Schema.optionalKey(Schema.Literal(true).annotate({ description: 'True where it was resumed; absent otherwise.' })),
      calling: Schema.optionalKey(Schema.String.annotate({ description: 'The tool call it waits on; absent where none.' })),
    }),
  ).annotate({ description: 'Each task still finishing under the pause.' }),
  parked: Schema.Array(
    Schema.Struct({
      ...RunStep,
      after: Schema.optionalKey(Schema.String.annotate({ description: 'The tool call it was parked after; absent where none.' })),
      cut: Schema.optionalKey(Schema.String.annotate({ description: 'The tool call that was cut; absent where none.' })),
    }),
  ).annotate({ description: "Each session the pause parked at a tool call's end." }),
  staged: Schema.Array(
    Schema.Struct({ ...RunStep, repo: Schema.String.annotate({ description: 'The repository the merge is staged in.' }) }),
  ).annotate({ description: 'Each landing the pause holds with its merge staged.' }),
  held: Schema.Array(Schema.Struct(RunStep)).annotate({ description: 'Each other check the pause holds.' }),
});
export type Paused = typeof Paused.Type;

/** `GET /api/pause/now`: what a pause at once would cut, each task at work but a landing, and the sentence of what that costs. */
export const PauseNowRead = Schema.Struct({
  interrupts: Schema.Array(Interrupt).annotate({ description: 'Each task a pause at once would cut.' }),
  cost: Schema.String.annotate({ description: 'The sentence of what that costs.' }),
});
export type PauseNowRead = typeof PauseNowRead.Type;

/**
 * `POST /api/pause`'s body, `nemia pause`'s flags: why, by whom, how long a call in flight is given (`"15m"`; the store's timeout where
 * left out), and `now`, which pauses at once. Each kept as the text it was sent as, so a wrong one is refused in the package's words, a
 * 422.
 */
export const PauseWrite = Schema.Struct({
  why: Schema.optionalKey(Schema.String.annotate({ description: 'Why to pause.' })),
  by: Schema.optionalKey(Schema.String.annotate({ description: 'Who pauses.' })),
  timeout: Schema.optionalKey(
    Schema.String.annotate({ description: 'How long a call in flight is given, as 15m; the store timeout where left out.' }),
  ),
  now: Schema.optionalKey(Schema.Boolean.annotate({ description: 'Whether to pause at once, cutting what is at work.' })),
});
export type PauseWrite = typeof PauseWrite.Type;

/** What `POST /api/pause` answers: the pause put; with `now`, the pause and what it cut (`interrupted`) and left (`skipped`). */
export const PauseAnswer = Schema.Union([
  Schema.Struct({
    pause: Pause,
    kept: Schema.Boolean.annotate({ description: 'Whether an earlier pause was kept, which this call left as it was.' }),
    interrupted: Schema.Array(Interrupt).annotate({ description: 'The tasks the pause at once cut.' }),
    skipped: Schema.Array(Interrupt).annotate({ description: 'The tasks it left, which a pause at once does not cut.' }),
  }),
  Schema.Struct({ pause: Pause }),
]);
export type PauseAnswer = typeof PauseAnswer.Type;

/** What `DELETE /api/pause` answers: the pause lifted. */
export const Resumed = Schema.Struct({ pause: Pause });
export type Resumed = typeof Resumed.Type;

/** The store's pause timeout in force: its milliseconds, whether the store's file set it, and since when where it says. */
export const PauseTimeout = Schema.Struct({
  ms: describedNumber('The timeout in milliseconds.'),
  set: Schema.Boolean.annotate({ description: "Whether the store's file set it; false for the default." }),
  at: Schema.optionalKey(Schema.String.annotate({ description: 'When it was set, where the file says.' })),
});
export type PauseTimeout = typeof PauseTimeout.Type;

/**
 * What `GET` and `PUT /api/pause/timeout` answer, as `nemia pause-timeout` does: the timeout in force, and whether this call wrote it.
 */
export const PauseTimeoutAnswer = Schema.Struct({
  timeout: PauseTimeout.annotate({
    description: 'The pause timeout in force: what each later pause, restart and upgrade gives a call in flight to finish.',
  }),
  wrote: Schema.Boolean.annotate({ description: 'Whether this call wrote it (PUT); false for a read.' }),
}).annotate({
  identifier: 'PauseTimeoutAnswer',
});
export type PauseTimeoutAnswer = typeof PauseTimeoutAnswer.Type;

/**
 * `PUT /api/pause/timeout`'s body, `nemia pause-timeout <d>`'s duration: digits and s, m or h, from 1s to 23h (`"10m"`), kept as the text
 * it was sent as, so a wrong one is refused in the package's words, a 422.
 */
export const PauseTimeoutWrite = Schema.Struct({
  timeout: Schema.String.annotate({
    description: 'The new timeout (`nemia pause-timeout <d>`): digits and s, m or h, from 1s to 23h, as 10m.',
  }),
}).annotate({ identifier: 'PauseTimeoutWrite' });
export type PauseTimeoutWrite = typeof PauseTimeoutWrite.Type;

/**
 * `GET /api/stats`' query: `from` and `to` UTC days, `by` what the rows go by, and the facts kept by `agent`, `step`, `workflow`,
 * `ofFactory` and `ofRepo` (named so beside `factory` and `repo`, which name the place every route is answered in). Each kept as the text
 * it was sent as, refused in the package's words, a 422. `labelSelector`, a label query given once or again (`nemia stats -l`), the runs
 * whose labels one of them takes; the api reads its former key off the request beside it, the retired spelling this table holds no
 * field of.
 */
export const StatsQuery = {
  from: Schema.optionalKey(Schema.String.annotate({ description: 'The first UTC day of the range, as YYYY-MM-DD.' })),
  to: Schema.optionalKey(Schema.String.annotate({ description: 'The last UTC day of the range, as YYYY-MM-DD.' })),
  by: Schema.optionalKey(Schema.String.annotate({ description: 'What the rows go by: agent, step, factory, workflow or repo.' })),
  agent: Schema.optionalKey(Schema.String.annotate({ description: 'Keep the facts of this agent.' })),
  step: Schema.optionalKey(Schema.String.annotate({ description: 'Keep the facts of this step.' })),
  workflow: Schema.optionalKey(Schema.String.annotate({ description: 'Keep the facts of this workflow.' })),
  ofFactory: Schema.optionalKey(Schema.String.annotate({ description: 'Keep the facts of this factory.' })),
  ofRepo: Schema.optionalKey(Schema.String.annotate({ description: 'Keep the facts of this repository.' })),
  labelSelector: Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Array(Schema.String)]).annotate({
      description: 'A label query, given once or again: keep the runs whose labels one of them takes.',
    }),
  ),
};

/**
 * `GET /api/stats`: the flow numbers of every run in the store, as `nemia stats --json` prints them — the range, what the rows go by,
 * the filters, every run's group and each group's, the runs that did not read, and the system's health over the range. A group is read
 * by the board's own reader.
 */
export const Stats = Schema.Struct({
  from: OrNull(Schema.String, 'The first day of the range, as YYYY-MM-DD; null where it has none.'),
  to: Schema.String.annotate({ description: 'The last day of the range, as YYYY-MM-DD.' }),
  by: OrNull(Schema.Literals(STATS_BY), 'What the rows go by; null where they go by nothing.'),
  filters: Schema.Record(Schema.String, Schema.String).annotate({
    description: 'The filters the facts were kept by, each a name and its value.',
  }),
  all: Json("Every run's group: its headline, days, steps, tiles, marks, tallies and slow landings, as the board reads it."),
  groups: Schema.Array(Schema.Unknown).annotate({
    description: 'Each group of runs the rows go by, under its key, as the board reads it.',
  }),
  unreadable: Schema.Array(Schema.String).annotate({ description: 'The ids of the runs that did not read.' }),
  health: Json("The system's health over the range: a pass's time, the store, the queue, the load and the quota windows."),
});
export type Stats = typeof Stats.Type;

/**
 * `POST /api/subscriptions/:name`'s body, `nemia subscribe`'s task and flags: the long-lived task told, the selectors of the lines that
 * wake it (`-l`; waits=person where left out), the minutes a digest waits (60), and the level a run's factory is at least at. `atLeast`
 * kept as text, so a word that is no level is refused in the package's words, a 422.
 */
export const SubscriptionWrite = Schema.Struct({
  task: Schema.String.annotate({ description: 'The task told to the long-lived session when a line wakes it.' }),
  selectors: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({ description: 'The selectors of the lines that wake it; waits=person where left out.' }),
  ),
  digestEvery: Schema.optionalKey(describedNumber('The minutes a digest waits; 60 where left out.')),
  atLeast: Schema.optionalKey(Schema.String.annotate({ description: "The level a run's factory is at least at; kept as text." })),
});
export type SubscriptionWrite = typeof SubscriptionWrite.Type;

/**
 * What `POST /api/subscriptions/:name` answers: the subscription put under its name, its news from the feed's byte `from`; and `hints`,
 * a sentence for each former word one of its selectors still says, naming what it says now (none where none does; left out by an older
 * api).
 */
export const Subscribed = Schema.Struct({
  name: Schema.String.annotate({ description: 'The name the subscription is put under.' }),
  subscription: Schema.Struct({
    task: Schema.String.annotate({ description: 'The task told when a line wakes it.' }),
    selectors: Schema.Array(Schema.String).annotate({ description: 'The selectors of the lines that wake it.' }),
    digestEvery: describedNumber('The minutes a digest waits.'),
    from: describedNumber("The feed's byte its news starts from."),
    scope: Schema.optionalKey(SubscriptionScope.annotate({ description: 'Whose lines it is told by level; absent where not given.' })),
  }).annotate({ description: 'The subscription put: its task, selectors, digest wait, where its news starts and its scope.' }),
  hints: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description:
        'A sentence for each former word one of its selectors still says, naming what it says now; empty where none does; left out by an older api.',
    }),
  ),
});
export type Subscribed = typeof Subscribed.Type;

/** What `DELETE /api/subscriptions/:name` answers: the name taken away. */
export const Unsubscribed = Schema.Struct({ name: Schema.String.annotate({ description: 'The name of the subscription taken away.' }) });
export type Unsubscribed = typeof Unsubscribed.Type;

/**
 * A line of the feed as its stream sends it, the data of a `store`, `daemon`, `factory`, `step`, `removed` and `run` event: the fields a
 * reader says it by — its time and word; the run and step, the store, the factory or the daemon it is about; its note, and who paused the
 * store and why — and every other key the line carries kept as written, so a reader that prints the line whole loses none. The fields are
 * named in the order the feed writes them, before every other key, so the line encodes to the bytes it was written as.
 */
export const FeedStreamLine = Schema.StructWithRest(
  Schema.Struct({
    at: Schema.String.annotate({ description: 'When the line was written, an ISO time.' }),
    run: Schema.optionalKey(Schema.String.annotate({ description: "The run's id, on a run's and a step's line." })),
    step: Schema.optionalKey(Schema.String.annotate({ description: "The step's name, on a step's line." })),
    store: Schema.optionalKey(Schema.String.annotate({ description: "store, on the store's line." })),
    factory: Schema.optionalKey(Schema.String.annotate({ description: "The factory's name, on a factory's line." })),
    daemon: Schema.optionalKey(describedNumber("The daemon's pid, on a daemon's line.")),
    word: Schema.String.annotate({ description: 'What happened, as the tick said it.' }),
    note: Schema.optionalKey(Schema.String.annotate({ description: 'What the word is qualified with, where it is.' })),
    by: Schema.optionalKey(Schema.String.annotate({ description: "Who paused the store, on the store's line that says so." })),
    why: Schema.optionalKey(Schema.String.annotate({ description: "Why the store was paused, on the store's line that says so." })),
  }),
  [Schema.Record(Schema.String, describedOne(Schema.Unknown, 'Another key of the line, kept as the feed wrote it.'))],
).annotate({ description: 'A line of the feed, every key it carries kept as written.' });
export type FeedStreamLine = typeof FeedStreamLine.Type;

/** A `hint` event's data: the sentence a person reads of a labelSelector that names a former word. */
export const FeedStreamHint = Schema.Struct({
  message: Schema.String.annotate({ description: 'The hint, naming what the labelSelector says now.' }),
}).annotate({ description: 'A hint of a labelSelector that names a former word.' });
export type FeedStreamHint = typeof FeedStreamHint.Type;

/** An `unreadable` event's data: why a read of the feed failed, and whether the stream reads again or ends. */
export const FeedStreamUnreadable = Schema.Struct({
  error: Schema.String.annotate({ description: 'Why the read failed.' }),
  retrying: Schema.Boolean.annotate({
    description: 'Whether the stream reads again on its next beat (true) or ends, the feed cut under its cursor (false).',
  }),
}).annotate({ description: 'A read of the feed that failed.' });
export type FeedStreamUnreadable = typeof FeedStreamUnreadable.Type;

/** The cursor an EventSource sends back as Last-Event-ID, on a line and a bookmark. */
const feedCursorId = Schema.String.annotate({ description: 'The cursor an EventSource sends back as Last-Event-ID.' });

/** An event whose data is the JSON of `data`, with no id. */
const feedSaid = <E extends FeedStreamEventName, D extends Schema.Top>(event: E, data: D, said: string) =>
  Schema.Struct({
    event: Schema.Literal(event).annotate({ description: "The event's name." }),
    data: Schema.fromJsonString(data).pipe(Schema.annotateEncoded({ description: said })),
  });

/**
 * One event of the feed's stream, by its name (`FEED_STREAM_EVENTS`), its data the JSON of what it says: a line as the feed wrote it
 * (`FeedStreamLine`) with its id the cursor after it; a hint (`FeedStreamHint`); a failed read (`FeedStreamUnreadable`); `{}` for
 * `readable`; and nothing for `opened` and for `bookmark`, whose id is where the stream has read to.
 */
export const FeedStreamEvent = Schema.Union([
  Schema.Struct({
    event: Schema.Literals(FEED_LINE_EVENTS).annotate({ description: 'What the line is about, as the event is named.' }),
    id: feedCursorId,
    data: Schema.fromJsonString(FeedStreamLine).pipe(Schema.annotateEncoded({ description: 'The JSON of the line.' })),
  }),
  Schema.Struct({
    event: Schema.Literal('bookmark').annotate({ description: "The event's name." }),
    id: feedCursorId,
    data: Schema.Literal('').annotate({ description: 'Empty: where the stream has read to is its id.' }),
  }),
  Schema.Struct({
    event: Schema.Literal('opened').annotate({ description: "The event's name: the stream's first, which a reader skips." }),
    data: Schema.Literal('').annotate({ description: 'Empty.' }),
  }),
  feedSaid('hint', FeedStreamHint, 'The JSON of the hint.'),
  feedSaid('unreadable', FeedStreamUnreadable, 'The JSON of why the read failed.'),
  feedSaid('readable', Schema.Struct({}), 'The JSON `{}`.'),
]);
export type FeedStreamEvent = typeof FeedStreamEvent.Type;

/**
 * `GET /api/feed/stream`'s query: `from=end`, the feed's end; `after`, a cursor this stream gave (a Last-Event-ID wins over it);
 * `until=end`, the feed read once. Each kept as text, refused in the api's words before the stream. The label query, given again for
 * another, the api reads off the request as it reads `GET /api/stats`' (`StatsQuery`).
 */
export const FeedQuery = {
  from: Schema.optionalKey(Schema.String.annotate({ description: "end, to start from the feed's end." })),
  after: Schema.optionalKey(
    Schema.String.annotate({ description: 'A cursor this stream gave, to read the lines after; a Last-Event-ID wins over it.' }),
  ),
  until: Schema.optionalKey(Schema.String.annotate({ description: 'end, to read the feed once and stop.' })),
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
  ended: Schema.Literals(FEED_WAIT_ENDS).annotate({
    description: 'Why the wait ended: matched, a line its label queries take was read; bound, its bound came with none.',
  }),
  lines: Schema.Array(Event).annotate({ description: 'The lines its label queries took, each an Event; empty at its bound.' }),
  cursor: Schema.String.annotate({
    description: 'The cursor after the last line it read, from which the next wait starts (?from=) and loses no line.',
  }),
}).annotate({ identifier: 'FeedWait' });
export type FeedWait = typeof FeedWait.Type;

/**
 * `GET /api/feed/wait`'s query: `labelSelector`, a label query given once or again (`-l`), each kept as `nemia watch -l` takes it;
 * `from`, the cursor to read from (the feed's end when none); `for`, the bound as `nemia wait --for` takes it (`30s`, `4m`).
 */
export const FeedWaitQuery = {
  labelSelector: Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Array(Schema.String)]).annotate({
      description: 'A label query, given once or again, each as `nemia watch -l` takes it.',
    }),
  ),
  from: Schema.optionalKey(Schema.String.annotate({ description: "The cursor to read from; the feed's end when none." })),
  for: Schema.optionalKey(Schema.String.annotate({ description: 'The bound, as `nemia wait --for` takes it (30s, 4m).' })),
};

/** A query of the place a request is answered in, which a route of the server reads: the factory and the repository it names. */
const placeQuery = {
  factory: Schema.optionalKey(Schema.String.annotate({ description: 'The factory the request is answered in.' })),
  repo: Schema.optionalKey(Schema.String.annotate({ description: 'The repository of that factory the request is answered in.' })),
};

/**
 * What a read of the package's refuses with: a value it does not take, or a file that does not read, a 422; and a failure that is no
 * refusal, a 500 in its own words (`Failed`).
 */
const readErrors = [Invalid, Failed];

/** The server, the machine, the store's pause and the feed followed. */
export class ServerGroup extends HttpApiGroup.make('server').add(
  HttpApiEndpoint.get('health', '/api/health', { success: Health }).annotate(
    OpenApi.Description,
    'Says the api answers, and the version it runs where it knows it. Answers Health.',
  ),
  HttpApiEndpoint.get('version', '/api/version', { success: VersionAnswer, error: readErrors }).annotate(
    OpenApi.Description,
    'Reads the release the api runs, the code it was built from, and the newest release the daemon knows of. Answers VersionAnswer.',
  ),
  HttpApiEndpoint.get('capabilities', '/api/capabilities', {
    query: placeQuery,
    success: CapabilitiesWithSteps,
    error: [Missing, ...readErrors],
  }).annotate(
    OpenApi.Description,
    "Reads what the repository the request's ?factory= and ?repo= resolve offers a step: its skills, agents, MCP servers and permission rules, the read-only commands, and what each step of each workflow gets. Answers the capabilities, or why no repository was read.",
  ),
  HttpApiEndpoint.get('repository', '/api/repository', {
    query: placeQuery,
    success: RepositoryAnswer,
    error: [Missing, ...readErrors],
  }).annotate(
    OpenApi.Description,
    "Reads the repository a start runs in, as the request's ?factory= and ?repo= resolve it. Answers RepositoryAnswer.",
  ),
  HttpApiEndpoint.get('store', '/api/store', { success: YourStore, error: readErrors }).annotate(
    OpenApi.Description,
    "Reads your store's folders of workflows, agents and skills, the line that files a factory in it and the line that turns Nemia on. Answers YourStore.",
  ),
  HttpApiEndpoint.get('ceilings', '/api/ceilings', { success: Ceilings, error: readErrors }).annotate(
    OpenApi.Description,
    "Reads the run slots: what the daemon's last pass ran with, the cap on runs in flight, the runs that count against it and those it holds, and what the last pass cost. Answers Ceilings.",
  ),
  HttpApiEndpoint.get('passes', '/api/passes', {
    query: { last: Schema.optionalKey(Schema.String.annotate({ description: 'How many of the recent passes to read.' })) },
    success: PassesRead,
    error: readErrors,
  }).annotate(
    OpenApi.Description,
    "Reads the daemon's recent passes, oldest first, with the histogram of their lengths, their phases and a summary. Answers PassesRead.",
  ),
  HttpApiEndpoint.get('series', '/api/series', {
    query: {
      range: Schema.optionalKey(Schema.String.annotate({ description: 'The range the series are read over: 24h, 7d, 30d or all.' })),
    },
    success: SeriesRead,
    error: readErrors,
  }).annotate(
    OpenApi.Description,
    "Reads the floor's series over a range (24h, 7d, 30d or all), each series and label set's points in time. Answers SeriesRead.",
  ),
  HttpApiEndpoint.get('metrics', '/api/metrics', { success: Metrics, error: readErrors }).annotate(
    OpenApi.Description,
    "Reads every metric of the api's runtime, by name and then attributes. Answers the list of metrics.",
  ),
  HttpApiEndpoint.get('daemon', '/api/daemon', { success: Daemon, error: readErrors }).annotate(
    OpenApi.Description,
    "Reads the store's daemon as its file says itself: where it stands, who started it, where it serves and when it last moved. Answers Daemon.",
  ),
  HttpApiEndpoint.get('quota', '/api/quota', { success: Quota, error: readErrors }).annotate(
    OpenApi.Description,
    "Reads the subscription's quota as the board is given it: its windows when fresh, or why there are none. Answers Quota.",
  ),
  HttpApiEndpoint.get('stats', '/api/stats', { query: StatsQuery, success: Stats, error: readErrors }).annotate(
    OpenApi.Description,
    "Reads the flow numbers of every run in the store over the range and filters asked: each group's, the runs that did not read, and the system's health. Answers Stats.",
  ),
  HttpApiEndpoint.get('paused', '/api/pause', { success: Paused, error: [Missing, ...readErrors] }).annotate(
    OpenApi.Description,
    "Reads the store's pause, or null where none stands, with each task still finishing under it and each session, landing and check it holds. Answers Paused.",
  ),
  HttpApiEndpoint.get('pauseNow', '/api/pause/now', { success: PauseNowRead, error: [Missing, ...readErrors] }).annotate(
    OpenApi.Description,
    'Reads what a pause at once would cut, each task at work but a landing, and what that costs. Answers PauseNowRead.',
  ),
  HttpApiEndpoint.get('pauseTimeout', '/api/pause/timeout', { success: PauseTimeoutAnswer, error: readErrors }).annotate(
    OpenApi.Description,
    "Reads the store's pause timeout in force, how long a tool call in flight is given to end when the store is paused or restarted before it is cut. Answers PauseTimeoutAnswer.",
  ),
  HttpApiEndpoint.put('setPauseTimeout', '/api/pause/timeout', {
    payload: PauseTimeoutWrite,
    success: PauseTimeoutAnswer,
    error: [BadRequest, Invalid, Failed],
  }).annotate(
    OpenApi.Description,
    "Sets the store's pause timeout from the body. Answers PauseTimeoutAnswer, the timeout in force and that this call wrote it.",
  ),
  HttpApiEndpoint.post('pause', '/api/pause', {
    payload: PauseWrite,
    success: PauseAnswer,
    error: [BadRequest, Conflict, Invalid, Failed],
  }).annotate(
    OpenApi.Description,
    'Pauses the store: no pass starts new work, and each session parks at the end of its tool call, a call still in flight past the timeout cut; with now, the work in flight is cut at once. Answers the pause put, with what it cut and left, or that an earlier pause was kept.',
  ),
  HttpApiEndpoint.delete('resume', '/api/pause', { success: Resumed, error: [Missing, Failed] }).annotate(
    OpenApi.Description,
    "Lifts the store's pause: each parked session goes on as the same try, and the next pass files what waits. Answers Resumed, the pause lifted.",
  ),
  HttpApiEndpoint.get('wait', '/api/feed/wait', { query: FeedWaitQuery, success: FeedWait, error: [BadRequest, Invalid] }).annotate(
    OpenApi.Description,
    "Waits on the feed for lines the label queries take, from a cursor, up to a bound. Answers FeedWait: why it ended, the lines as Events, and the cursor the next wait starts from. It is the fallback for a client that can only call tools, and it polls: the MCP port's instructions name the two ways that need no polling, a channel and a subscriptions/listen stream of the feed's resources.",
  ),
  HttpApiEndpoint.get('feed', '/api/feed/stream', {
    query: FeedQuery,
    headers: {
      'last-event-id': Schema.optionalKey(
        Schema.String.annotate({ description: 'The id of the last event received, which an EventSource sends on reconnecting.' }),
      ),
    },
    success: HttpApiSchema.StreamSse({ events: FeedStreamEvent }),
    error: [BadRequest, Invalid],
  }).annotate(
    OpenApi.Description,
    'Follows the feed as server-sent events from a cursor or the last event id: each line as it is written, bookmarks and hints. Answers a stream of FeedStreamEvent.',
  ),
) {}
