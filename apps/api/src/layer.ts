/**
 * What the api's handlers run on: the services every route may read, the runtime an app builds from their layer (`appOf` in app.ts), and
 * `served`, which runs a handler on the request's runtime over them. A test gives the api another environment, engine, root, asker or
 * memo by building an app over a layer of its own, and what the app keeps between requests is its own (`ReadMemo`, the askers). What the
 * package's own verbs read is not a service: the runs, the inbox and the daemon's file are under the package's `HOME`, fixed as it loads
 * (`StoreRoot`, store.ts).
 */
import { Context, Effect, Layer, type ManagedRuntime, Metric } from 'effect';
import type { Context as RequestContext } from 'hono';
import { routePath } from 'hono/route';
import {
  freshStatsMemo,
  type Factory,
  type StatsMemo,
  type Filings,
  type RestingMemo,
  restingMemo,
  type RunSummary,
} from 'agent-orchestrator';
import { McpAsker } from './capabilities/capabilities.ts';
import type { LastSaid } from './detail/detail.ts';
import { placeFor } from './factories/place.ts';
import { QuotaAsker } from './factory/quota.ts';
import { Engine, StoreRoot } from './store.ts';

/**
 * The environment the api reads its settings from, on each request, as it read `process.env` before: `HKB_REPO` (`repoOf`), `WF_MAX_RUNS`
 * (`maxRuns`), `WF_VERIFY_REST` (`verifiesRest`) and `HKB_QUOTA_*` (`makeQuota`), each refused, or defaulted, in its reader's words. The
 * live layer holds `process.env` itself, not a copy.
 */
export class ApiConfig extends Context.Service<ApiConfig, { readonly env: NodeJS.ProcessEnv }>()('api/ApiConfig') {
  static readonly layer = (env: NodeJS.ProcessEnv): Layer.Layer<ApiConfig> => Layer.succeed(ApiConfig)({ env });
}

/**
 * What an app's reads keep between requests, each read through its engine: the list's memo of runs at rest (`resting`, the package's
 * `RestingMemo`), the stats' memo of each run's facts (`stats`, the package's `StatsMemo`), the feed's filing times (`filings`,
 * `filedTimes`), and where each blocked session's conversation was last read (`said`). One for an app, built with its runtime (`live`),
 * so an app over another engine starts with none. A cache: nothing is decided by it.
 */
export class ReadMemo extends Context.Service<
  ReadMemo,
  {
    readonly resting: RestingMemo<Omit<RunSummary, 'startedAt'>>;
    readonly stats: StatsMemo;
    readonly filings: Filings;
    readonly said: LastSaid;
  }
>()('api/ReadMemo') {
  static readonly live: Layer.Layer<ReadMemo> = Layer.sync(ReadMemo)(() => ({
    resting: restingMemo(),
    stats: freshStatsMemo(),
    filings: { filed: new Map(), cursor: 0 },
    said: new Map(),
  }));
}

/** Every service a handler may read: what an app's layer provides whole. */
export type Services = ApiConfig | Engine | StoreRoot | McpAsker | QuotaAsker | ReadMemo;

/** The runtime an app runs its handlers on, built once from its layer. */
export type ApiRuntime = ManagedRuntime.ManagedRuntime<Services, never>;

/** The api's Hono environment: the app's runtime on every request, put there by app.ts before any router is reached. */
export type ApiEnv = { Variables: { runtime: ApiRuntime } };

/**
 * The services as a handler reads them, each under the name the helpers it calls take it by, and where the request is answered
 * (`placeFor`, factories/place.ts): `repo`, the repository it is answered on, and `factory`, the factory it names, none for the default.
 */
export type Served = {
  env: NodeJS.ProcessEnv;
  repo: string;
  factory: Factory | undefined;
  e: Engine['Service'];
  home: string;
  mcp: McpAsker['Service'];
  quota: QuotaAsker['Service'];
  memo: ReadMemo['Service'];
};

/** The upper bounds of a request's journal reads, one past the last for more. */
const READ_BOUNDS: readonly number[] = [0, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];

/**
 * The journals each request read, by the route it was served on (`route`, the route's pattern, never its path), in the registry of the
 * app's runtime: the process's own unless its layer gives another. Counted off the engine's running totals before and after the handler,
 * so about: a pass or another request reading at the same time is counted here too.
 */
export const POLL_READS = Metric.histogram('api.poll.reads', { description: 'the journals a request read', boundaries: READ_BOUNDS });

/** The journals the engine has read so far, or none for an engine that keeps no count (a test's fake). */
const readsOf = (e: Engine['Service']): number | undefined => (typeof e.io === 'function' ? e.io().reads : undefined);

/**
 * `handle` over the request's services, run on the app's runtime, in the factory and on the repository the request names (`placeFor`):
 * what it returns, or its rejection itself, so a refusal thrown inside it — the place's among them, before `handle` runs — reaches
 * `app.onError` as the instance it was and is answered by its kind. The handler's body stays a plain function: a failure yielded inside
 * `Effect.gen` never reaches a `try` around it, and the routes catch what they word themselves. The journals it read are counted into
 * `POLL_READS`, whether it answered or threw.
 */
export const served = <A>(c: RequestContext<ApiEnv>, handle: (s: Served) => A | Promise<A>): Promise<A> =>
  c.var.runtime.runPromise(
    Effect.gen(function* () {
      const { env } = yield* ApiConfig;
      const services = {
        env,
        e: yield* Engine,
        home: yield* StoreRoot,
        mcp: yield* McpAsker,
        quota: yield* QuotaAsker,
        memo: yield* ReadMemo,
      };
      const before = readsOf(services.e);
      return yield* Effect.promise(async () =>
        handle({ ...services, ...placeFor({ factory: c.req.query('factory'), repo: c.req.query('repo') }, env) }),
      ).pipe(
        Effect.ensuring(
          Effect.suspend(() => {
            const after = readsOf(services.e);
            return before === undefined || after === undefined
              ? Effect.void
              : Metric.update(Metric.withAttributes(POLL_READS, { route: routePath(c) }), after - before);
          }),
        ),
      );
    }),
  );
