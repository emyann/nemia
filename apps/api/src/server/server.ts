/**
 * The server group's handlers (`objects`' `Api`, `ServerGroup`): the server and the machine, the store's pause and the feed followed, each
 * calling the orchestrator by type — an entry of its table with its input (`PASSES`, `SERIES`, `STATS`, `PAUSE`, …) or a plain function —
 * through the request's services (`inRequest`), every refusal answered by the one map (`answered`, objects/refused.ts).
 *
 * - `GET /api/health` — `{ ok: true }` while the api answers.
 * - `GET /api/version` — `{ version, release, latest? }`, the orchestrator's package version (`VERSION`), the code the api runs
 *   (`RELEASE`), a checkout or an install: what the board's bottom bar says; and the newest release the daemon's release check read,
 *   where it read one (`latestRelease`), which the board says when it is newer.
 * - `GET /api/capabilities` — what the repository offers a step, read from the checkout on each request (capabilities/capabilities.ts), and
 *   what each step of each workflow gets of it (capabilities/reach.ts). Each MCP server the settings enable is started and asked for its
 *   tools once while the app runs (`McpAsker`); one that fails is an `error` on its entry, never a failed request.
 * - `GET /api/repository` — the repository a start runs in, as the request's `?factory=` and `?repo=` resolve it: what the start form
 *   lists the runs of, for a run to wait on.
 * - `GET /api/store` — your store's folders, how a factory is filed in it and how Nemia is turned on (`yourStore`, workflows/yours.ts),
 *   under the request's store root.
 * - `GET /api/ceilings` — the cap on runs in flight the daemon's last pass ran with, and the runs it counts and holds (`ceilingsOf`): what
 *   the Factory says over its floor. 422 for a `WF_MAX_RUNS` in the api's environment that is not a count, before any pass wrote the
 *   daemon's.
 * - `GET /api/passes` — what the recent passes of the tick cost, as `nemia passes --json` prints it (`PASSES`): read off the store's
 *   `tick-recent.json`, which the ticking process keeps. `?last=<n>` keeps the last n; 422 for one that is not a whole number from 1.
 * - `GET /api/series` — the system's series over a range, as `nemia series --json` prints it (`SERIES`), a past day off the app's memo
 *   while its file has not moved; `?range=24h` (the default), `7d`, `30d` or `all`, 422 for another.
 * - `GET /api/metrics` — the process's metrics (`metricsOf`), in the registry of the app's runtime: the files the runtime read for each
 *   request by its route's pattern (`api.poll.reads`), and the pass's only where this process ticks.
 * - `GET /api/daemon` — whether a nemia up ticks the store, and since when, and when it last passed (`readDaemon`), never written. 500 for
 *   a daemon.json that is there and cannot be read (`Failed`).
 * - `GET /api/quota` — the subscription's quota, as the engine's `quota` answers it for the default harness, asked at most once a keep
 *   however many boards read (`QuotaAsker`). Every case is a 200 with a sentence.
 * - `GET /api/stats` — the flow numbers of every run in the store, as `nemia stats --json` prints them (`statsOf`, stats/stats.ts).
 * - `GET /api/pause` — the store's pause, what still finishes under it, each session it parked and each check it holds (`PAUSED`).
 * - `GET /api/pause/now` — what a pause at once would stop, `{ interrupts, cost }` (`PAUSE_NOW`), read off one view of the engine.
 * - `GET /api/pause/timeout` — the store's pause timeout in force, as bare `nemia pause-timeout` says it (`PAUSE_TIMEOUT`): `{ timeout,
 *   wrote }`, `timeout` its milliseconds, whether the store's file set it and since when; ten minutes where none is set. 422 for a file
 *   that does not read (`Invalid`), naming how to set it again.
 * - `PUT /api/pause/timeout` — the store's pause timeout set, as `nemia pause-timeout <d>` sets it (`PAUSE_TIMEOUT`), its body
 *   `{ timeout }` (objects' `PauseTimeoutWrite`, as `10m`): what each later pause, restart and upgrade gives a call in flight. 422 for a
 *   timeout out of its form (`Invalid`), nothing written.
 * - `POST /api/pause` — the store paused, as `nemia pause` pauses it (`PAUSE`), its body `{ why?, by?, timeout?, now? }` (objects'
 *   `PauseWrite`): every session parks at its tool call's end within `timeout` (the store's where left out), written on the pause as
 *   `timeoutMs`; with `now`, it pauses at once (`pauseNow`), keeping a pause that stands, and answers `{ pause, kept, interrupted,
 *   skipped }`. The verb takes no yes: the board asks its own question, reading `GET /api/pause/now`. Refuses what `nemia pause` refuses
 *   of its arguments — `why` or `by` blank or over its cap, a timeout out of its form or given with `now` — with 422 (`Invalid`), and a
 *   pause that stands without `now` with 409 (`Conflict`).
 * - `DELETE /api/pause` — the store's pause lifted, as `nemia resume` lifts it (`RESUME`), and the sessions' drain with it; it reads no
 *   body. None standing is a 404 (`Missing`). Its 200 is `{ pause }`, the pause lifted.
 * - `GET /api/feed/stream` — the workflow feed followed, as server-sent events (`feedOpened`, gauges/feed.ts).
 * - `GET /api/feed/wait` — `nemia wait` (`WAIT`): the feed read from `?from=` (its end where none is given) until the first lines a
 *   `?labelSelector=` takes, given again for another, or `?for=` (4m where none is given) with none, answering
 *   `{ ended, lines, cursor }`, each line an `Event` as the Event lists build one (`eventKept`) and the cursor the next wait starts
 *   from. A long poll: it answers once, at its first match or its bound, never later than 270s. 422 for a selector, a cursor or a
 *   bound refused (`Invalid`), in the words that say the fix.
 *
 * - `POST /api/session` — the board's session: the bearer the caller gate judged, set as the board's HttpOnly cookie (`signIn`,
 *   session.ts), `{ cookie: 'set' }`; 400 (`BadRequest`) for a request with no bearer.
 * - `DELETE /api/session` — the board's cookie cleared (`signOut`), `{ cookie: 'cleared' }`.
 *
 * A failure that is no refusal is a 500 in its own words (`Failed`, `answeredWrite`), as on every route the api served on Hono.
 */
import { Effect, Metric } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import type { HttpServerRequest } from 'effect/http';
import {
  eventKept,
  latestRelease,
  leaseRelease,
  PASSES,
  PAUSE,
  PAUSE_NOW,
  PAUSE_TIMEOUT,
  PAUSED,
  RESUME,
  runningRelease,
  SERIES,
  VERSION,
  WAIT,
  type WaitAnswer,
} from 'agent-orchestrator';
import { DEFAULT_HARNESS } from 'agent-orchestrator/workflow';
import { Api, type Event, type FeedWait } from 'objects';
import { capabilitiesWithSteps } from '../capabilities/index.ts';
import { ceilingsOf, feedOpened, metricsOf, readDaemon } from '../gauges/index.ts';
import { answeredWrite, ServedNow } from '../objects/refused.ts';
import { statsOf } from '../stats/stats.ts';
import { signIn, signOut } from './session.ts';
import { engineRead } from '../store.ts';
import { yourStore } from '../workflows/index.ts';

/**
 * `work` over the request's services, a refusal answered as the one map says, and any other failure a 500 in its own words (`Failed`), as
 * the api answered every error of these routes on Hono (`answerError`, app.ts): a read whose files the package refuses to call good.
 */
const answered = answeredWrite;

/** The code this process runs, as the lease records it: an install's kind, folder, tag and commit, not its source; a checkout's folder. */
const RUNNING = runningRelease();
const RELEASE = leaseRelease(RUNNING);

/**
 * Each `?selector=` of `request`, in order: the label queries of `GET /api/stats` and `GET /api/feed/stream`, read off the request since
 * objects declares no field under the retired spelling of `labelSelector` (`StatsQuery`, `FeedQuery`).
 */
const selectorsOf = (request: HttpServerRequest.HttpServerRequest): string[] =>
  new URL(request.url, 'http://api').searchParams.getAll('selector');

/**
 * A wait's answer as `GET /api/feed/wait` sends it (`FeedWait`): each line an `Event` named by the byte it starts at, as a page of events
 * builds one (`eventKept`, asked no namespace and no selector: the wait's own selectors already took the line), and the cursor as text.
 */
const waitSent = ({ ended, lines, cursor }: WaitAnswer): FeedWait => {
  const kept = eventKept({});
  return {
    ended,
    lines: lines.flatMap(({ line, from, to }): Event[] => {
      const event = kept(line, from, to);
      return event === undefined ? [] : [event];
    }),
    cursor: String(cursor),
  };
};

export const serverHandlers = HttpApiBuilder.group(Api, 'server', (handlers) =>
  handlers
    .handle('health', () => Effect.succeed({ ok: true } as const))
    .handle('version', () =>
      answered(async ({ home }) => {
        const latest = latestRelease(home, RUNNING);
        return latest === undefined ? { version: VERSION, release: RELEASE } : { version: VERSION, release: RELEASE, latest };
      }),
    )
    .handle('capabilities', () =>
      answered(({ e, placeService, config, env, repo, home, mcp, inRequest, trace }) =>
        capabilitiesWithSteps(repo, { e, placeService, config, trace, env, home, asker: mcp, inRequest }),
      ),
    )
    .handle('repository', () => answered(async ({ repo }) => ({ repo })))
    .handle('store', () => answered(async ({ home }) => yourStore(home)))
    .handle('ceilings', () => answered(ceilingsOf))
    .handle('passes', ({ query: { last } }) => answered((s) => s.inRequest(PASSES.handler(last === undefined ? {} : { last }))))
    .handle('series', ({ query: { range } }) =>
      answered((s) => s.inRequest(SERIES.handler(range === undefined ? {} : { range }, { series: s.memo.series }))),
    )
    .handle('metrics', () => answered(async (s) => metricsOf(await s.inRequest(Metric.snapshot))))
    .handle('daemon', () => answeredWrite(async ({ home }) => readDaemon(home)))
    .handle('quota', () =>
      answered(({ e, env, quota }) => quota({ env, harness: DEFAULT_HARNESS, ask: () => engineRead('quota', e.quota(DEFAULT_HARNESS)) })),
    )
    .handle('stats', ({ query, request }) => answered((s) => statsOf({ ...query, selector: selectorsOf(request) }, s)))
    .handle('paused', () => answered((s) => s.inRequest(PAUSED.handler({}))))
    .handle('pauseNow', () => answered((s) => s.inRequest(PAUSE_NOW.handler({}, { records: { pause: s.memo.records.pause } }))))
    .handle('pauseTimeout', () => answered((s) => s.inRequest(PAUSE_TIMEOUT.handler({}))))
    .handle('setPauseTimeout', ({ payload }) => answeredWrite((s) => s.inRequest(PAUSE_TIMEOUT.handler(payload))))
    .handle('pause', ({ payload }) => answeredWrite((s) => s.inRequest(PAUSE.handler(payload))))
    .handle('resume', () => answeredWrite((s) => s.inRequest(RESUME.handler({}))))
    .handle('wait', ({ query }) =>
      answered(async (s) =>
        waitSent(
          await s.inRequest(
            WAIT.handler({
              selector: typeof query.labelSelector === 'string' ? [query.labelSelector] : [...(query.labelSelector ?? [])],
              ...(query.from === undefined ? {} : { from: query.from }),
              ...(query.for === undefined ? {} : { for: query.for }),
            }),
          ),
        ),
      ),
    )
    .handle('signIn', ({ request }) => signIn(request))
    .handle('signOut', ({ request }) => signOut(request))
    .handle('feed', ({ query, headers, request }) =>
      Effect.gen(function* () {
        const s = yield* ServedNow;
        const context = yield* Effect.promise(() => s.inRequest(Effect.context()));
        return yield* feedOpened({ ...query, selector: selectorsOf(request) }, headers['last-event-id'], s.beats, context, s.home);
      }),
    ),
);
