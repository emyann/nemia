/**
 * What the api's handlers run on: the services every route may read, the runtime an app builds from their layer (`appOf` in app.ts), and
 * `served`, which runs a handler on the request's runtime over them. A test gives the api another environment, engine, root, asker or
 * memo by building an app over a layer of its own, and what the app keeps between requests is its own (`ReadMemo`, the askers, the steps
 * followed: `Followings`). The root and the settings are the app's own services, given where the app's layer is composed from its
 * environment (`StoreRoot` and `StoreConfig`, store.ts; `storeConfigLayer` at `app.ts`), the one root every read of the package's is
 * handed: it keeps none of its own as it loads.
 */
import { Context, type Duration, Effect, Layer, type ManagedRuntime, Metric, Tracer } from 'effect';
import type { Context as RequestContext } from 'hono';
import {
  freshStatsMemo,
  seriesMemo,
  type Running,
  type SeriesMemo,
  type Factory,
  type StatsMemo,
  Informer,
  type InformerMemo,
  recordMemo,
  type PauseRuns,
  type RecordMemo,
  type ScheduleRuns,
  PlaceService,
  type ProposalCaller,
  EngineService,
  type LastSaid,
} from 'agent-orchestrator';
import { McpAsker } from './capabilities/capabilities.ts';
import { routeOf } from './request/request.ts';
import { type Place, placeFor } from './factory/place.ts';
import { QuotaAsker } from './gauges/quota.ts';
import { Followings } from './steps/following.ts';
import { Engine, type RequestTrace, StoreConfig, StoreRoot } from './store.ts';
import type { StepRun } from './step/step.ts';

/**
 * The environment the api reads its settings from, on each request, as it read `process.env` before: `HKB_REPO` (`repoOf`), `WF_MAX_RUNS`
 * (`maxRuns`), `WF_VERIFY_REST` (`verifiesRest`) and `HKB_QUOTA_*` (`makeQuota`), each refused, or defaulted, in its reader's words. The
 * live layer holds `process.env` itself, not a copy. Beside it, the code the api runs (`running`), where its repository is an install's
 * source (`repoOf`); none where a test gives no release.
 */
export class ApiConfig extends Context.Service<ApiConfig, { readonly env: NodeJS.ProcessEnv; readonly running?: Running }>()(
  'api/ApiConfig',
) {
  static readonly layer = (env: NodeJS.ProcessEnv, running?: Running): Layer.Layer<ApiConfig> =>
    Layer.succeed(ApiConfig)(running === undefined ? { env } : { env, running });
}

/**
 * What an app's reads keep between requests, each read through its engine, beside its informer of each run's judgement (`Informer`, given
 * in `liveOf`): the stats' memo of each run's facts (`stats`, the package's `StatsMemo`), where each blocked session's conversation was
 * last read (`said`), the series' days read (`series`, the package's `SeriesMemo`), and `records`, one memo per read that wants a little
 * of every run (the package's `RecordMemo`, keyed by the run's stamp alone): the factories' schedules, the pause's current tasks and a
 * step's recent runs. One for an app, built with its runtime (`live`), so an app over another engine starts with none. A cache: nothing
 * is decided by it.
 */
export class ReadMemo extends Context.Service<
  ReadMemo,
  {
    readonly stats: StatsMemo;
    readonly said: LastSaid;
    readonly series: SeriesMemo;
    readonly records: {
      readonly factories: ScheduleRuns;
      readonly pause: PauseRuns;
      readonly step: RecordMemo<StepRun>;
    };
  }
>()('api/ReadMemo') {
  static readonly live: Layer.Layer<ReadMemo> = Layer.sync(ReadMemo)(() => ({
    stats: freshStatsMemo(),
    said: new Map(),
    series: seriesMemo(),
    records: { factories: recordMemo(), pause: recordMemo(), step: recordMemo() },
  }));
}

/**
 * How often the api's streams read again what nothing pushes to them: a step's conversation no live stream can be had of (`step`,
 * `readAgain` in steps/steps.ts), Nemia's chat where her session cannot be followed (`chat`) and the look at her chat's files
 * (`chatFiles`, both `followChat`'s, nemia/chat.ts), the feed's file for the lines no hub brought (`feed`, `followFeed`), and a watched
 * list read again though no line came (`watch`, watch/watch.ts). Each left
 * out is the default beat its own module names (`STEP_BEAT_MS`, the package's `RECORD_BEAT_MS` and `FILES_CHECK_MS`, and its own for
 * the feed), so this file imports none of them; a test gives shorter ones with
 * `appOf(Layer.merge(liveOf(), Layer.succeed(Beats)({ ...Beats.defaultValue(), step: … })))` rather than wait them out.
 */
export type BeatsShape = {
  readonly step?: number;
  readonly chat?: number;
  readonly chatFiles?: number;
  readonly feed?: Duration.Input;
  /** How often a watched list is read again though no feed line came (`WATCH_RESYNC`, watch/watch.ts). */
  readonly watch?: Duration.Input;
};
export const Beats = Context.Reference<BeatsShape>('api/Beats', { defaultValue: () => ({}) });

/**
 * Every service a handler may read: what an app's layer provides whole, the steps followed live among them (`Followings`), and the place
 * the package's programs ask (`PlaceService`).
 */
export type Services = ApiConfig | Engine | StoreRoot | StoreConfig | McpAsker | QuotaAsker | ReadMemo | Followings | PlaceService;

/** The runtime an app runs its handlers on, built once from its layer. */
export type ApiRuntime = ManagedRuntime.ManagedRuntime<Services, never>;

/**
 * The api's Hono environment: the app's runtime on every request, the request's server span (`span`, put there by `saidRequest`,
 * request/request.ts, none before it), and who the request is from (`caller`, by the session token it presents, caller/caller.ts), each
 * put there by app.ts before any router is reached.
 */
export type ApiEnv = { Variables: { runtime: ApiRuntime; span?: Tracer.Span; caller: ProposalCaller } };

/**
 * The trace the request's programs join (`RequestTrace`, store.ts): the tracer of the runtime `trace` is read on, and the request's server
 * span; none before `saidRequest` has opened one.
 */
export const traceOf = Effect.fnUntraced(function* (c: RequestContext<ApiEnv>) {
  const span = c.var.span;
  return span === undefined ? undefined : ({ tracer: yield* Tracer.Tracer, span } satisfies RequestTrace);
});

/** `program` under the request's server span, where `saidRequest` opened one. */
const underRequest = <A, E, R>(c: RequestContext<ApiEnv>, program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  c.var.span === undefined ? program : Effect.withParentSpan(program, c.var.span);

/**
 * The services as a handler reads them, each under the name the helpers it calls take it by (`placeService` the place a package program
 * asks, given with `runPlaced`), and where the request is answered (`placeFor`, factory/place.ts): `repo`, the repository it is answered
 * on, and `factory`, the factory it names, none for the default.
 */
export type Served = {
  env: NodeJS.ProcessEnv;
  running: Running | undefined;
  repo: string;
  factory: Factory | undefined;
  e: Engine['Service'];
  placeService: PlaceService['Service'];
  home: string;
  /** The store's settings the app's layer gave (`StoreConfig`), which a package program run apart is given (`runPlaced`). */
  config: StoreConfig['Service'];
  mcp: McpAsker['Service'];
  quota: QuotaAsker['Service'];
  memo: ReadMemo['Service'];
  /**
   * This app's informer of each run's judgement (`Informer`, the package's): what the store's daemon's pass judged of each run, read by
   * the run object, its sub-resources and the runs list, and kept by them on a miss; none in an app whose layer gives none, which judges
   * every run on demand.
   */
  informer: InformerMemo | undefined;
  followings: Followings['Service'];
  beats: BeatsShape;
  /** Who the request is from: the person, or the agent's session its token names (`callerGate`, caller/caller.ts). */
  caller: ProposalCaller;
  /** The trace the request's programs join (`runPlaced`, store.ts): the app's tracer and the request's server span; none outside one. */
  trace: RequestTrace | undefined;
  /**
   * `program` run over the request's own services — the app's, the orchestrator's engine (`EngineService`, the request's `e`), its place
   * and its store's root among them — under the request's server span: its answer, or its rejection with the failure itself, as `served`
   * rejects. The one way a handler runs a program of the package's: a verb, a command entry's handler, a door (`AgentDoor`, `SkillDoor`).
   * A door's default reads the files at the app's `StoreRoot`, and a door a test merged into the app's layer (`Layer.merge(liveOf(),
   * agentDoorMemory())`) is the one the program reads.
   */
  inRequest: <A, E>(program: Effect.Effect<A, E, Services | EngineService>) => Promise<A>;
  /**
   * Where the request is answered for a kind in `namespace`: the factory the namespace names (`default` the api's own) and the repository
   * the request's `?repo=` names, resolved and refused as `placeFor` resolves and refuses them (factory/place.ts). What a handler of a
   * namespaced kind is placed by (`answeredIn`, objects/refused.ts), never a route of its own.
   */
  placedIn: (namespace: string) => Place;
};

/** The upper bounds of a request's reads, the files the runtime read for it, one past the last for more. */
const READ_BOUNDS: readonly number[] = [0, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];

/**
 * The files the runtime read for each request, its journals and every other file it reads (the engine's `io`), by the route it was
 * served on (`route`, the route's pattern, never its path: a request the mount served under its endpoint's path, `routeOf`), in the
 * registry of the app's runtime: the process's own unless its layer
 * gives another. A read is one of bytes: a journal is counted when the engine reads what was appended to it since it last read it, and a
 * journal it finds as it left it costs a `stat` and is not counted. Counted off the engine's running totals before and after the handler,
 * so about: a pass or another request reading at the same time is counted here too.
 */
export const POLL_READS = Metric.histogram('api.poll.reads', {
  description: 'the files the runtime read for a request',
  boundaries: READ_BOUNDS,
});

/** The files the engine has read so far, its journals among them, or none for an engine that keeps no count (a test's fake). */
const readsOf = (e: Engine['Service']): Effect.Effect<number | undefined> =>
  typeof e.io === 'function' ? Effect.map(e.io(), (io) => io.reads) : Effect.succeed(undefined);

/**
 * `handle` over the request's services, run on the app's runtime, in the factory and on the repository the request names (`placeFor`):
 * what it returns, or its rejection itself, so a refusal thrown inside it — the place's among them, before `handle` runs — reaches
 * `app.onError` as the instance it was and is answered by its kind. The handler's body stays a plain function: a failure yielded inside
 * `Effect.gen` never reaches a `try` around it, and the routes catch what they word themselves. The files the runtime read for it are
 * counted into `POLL_READS`, whether it answered or threw. It runs under the request's server span, so a program it runs on the app's
 * runtime (`inRequest`) is that span's child, and one run apart (`runPlaced`) is made so by `trace`.
 */
export const served = <A>(c: RequestContext<ApiEnv>, handle: (s: Served) => A | Promise<A>): Promise<A> =>
  c.var.runtime.runPromise(
    underRequest(
      c,
      Effect.gen(function* () {
        const { env, running } = yield* ApiConfig;
        const context = yield* Effect.context<Services>();
        const e = yield* Engine;
        const inRequest = <A, E>(program: Effect.Effect<A, E, Services | EngineService>): Promise<A> =>
          Effect.runPromiseWith(context)(underRequest(c, Effect.provideService(program, EngineService, e)));
        const home = yield* StoreRoot;
        const placedIn = (namespace: string): Place => placeFor({ factory: namespace, repo: c.req.query('repo') }, env, home, running);
        const services = {
          env,
          running,
          e,
          placeService: yield* PlaceService,
          home,
          config: yield* StoreConfig,
          mcp: yield* McpAsker,
          quota: yield* QuotaAsker,
          memo: yield* ReadMemo,
          informer: yield* Informer,
          followings: yield* Followings,
          beats: yield* Beats,
          caller: c.var.caller,
          trace: yield* traceOf(c),
          inRequest,
          placedIn,
        };
        const before = yield* readsOf(services.e);
        return yield* Effect.promise(async () =>
          handle({ ...services, ...placeFor({ factory: c.req.query('factory'), repo: c.req.query('repo') }, env, home, running) }),
        ).pipe(
          Effect.ensuring(
            Effect.flatMap(readsOf(services.e), (after) =>
              before === undefined || after === undefined
                ? Effect.void
                : Metric.update(Metric.withAttributes(POLL_READS, { route: routeOf(c) ?? '/*' }), after - before),
            ),
          ),
        );
      }),
    ),
  );
