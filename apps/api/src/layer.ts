/**
 * What the api's handlers run on: the services every route may read, the runtime an app builds from their layer (`appOf` in app.ts), and
 * `served`, which runs a handler on the request's runtime over them. A test gives the api another environment, engine, root, asker or
 * memo by building an app over a layer of its own, and what the app keeps between requests is its own (`ReadMemo`, the askers). What the
 * package's own verbs read is not a service: the runs, the inbox and the daemon's file are under the package's `HOME`, fixed as it loads
 * (`StoreRoot`, store.ts).
 */
import { Context, Effect, Layer, type ManagedRuntime } from 'effect';
import { McpAsker, repoOf } from './capabilities/capabilities.ts';
import type { LastSaid } from './detail/detail.ts';
import { QuotaAsker } from './factory/quota.ts';
import { type RestingMemo, restingMemo } from './runs/resting.ts';
import type { RunSummary } from './runs/runs.ts';
import { Engine, type Filings, StoreRoot } from './store.ts';

/**
 * The environment the api reads its settings from, on each request, as it read `process.env` before: `HKB_REPO` (`repoOf`), `WF_MAX_RUNS`
 * (`maxRuns`), `WF_VERIFY_REST` (`verifiesRest`) and `HKB_QUOTA_*` (`makeQuota`), each refused, or defaulted, in its reader's words. The
 * live layer holds `process.env` itself, not a copy.
 */
export class ApiConfig extends Context.Service<ApiConfig, { readonly env: NodeJS.ProcessEnv }>()('api/ApiConfig') {
  static readonly layer = (env: NodeJS.ProcessEnv): Layer.Layer<ApiConfig> => Layer.succeed(ApiConfig)({ env });
}

/**
 * What an app's reads keep between requests, each read through its engine: the list's memo of runs at rest (`resting`, runs/resting.ts),
 * the feed's filing times (`filings`, `filedTimes`), and where each blocked session's conversation was last read (`said`). One for an app,
 * built with its runtime (`live`), so an app over another engine starts with none. A cache: nothing is decided by it.
 */
export class ReadMemo extends Context.Service<
  ReadMemo,
  { readonly resting: RestingMemo<Omit<RunSummary, 'startedAt'>>; readonly filings: Filings; readonly said: LastSaid }
>()('api/ReadMemo') {
  static readonly live: Layer.Layer<ReadMemo> = Layer.sync(ReadMemo)(() => ({
    resting: restingMemo(),
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
 * The services as a handler reads them, each under the name the helpers it calls take it by, and `repo`, the repository the board serves,
 * read off `env` (`repoOf`).
 */
export type Served = {
  env: NodeJS.ProcessEnv;
  repo: string;
  e: Engine['Service'];
  home: string;
  mcp: McpAsker['Service'];
  quota: QuotaAsker['Service'];
  memo: ReadMemo['Service'];
};

/**
 * `handle` over the request's services, run on the app's runtime: what it returns, or its rejection itself, so a refusal thrown inside it
 * reaches `app.onError` as the instance it was and is answered by its kind. The handler's body stays a plain function: a failure yielded
 * inside `Effect.gen` never reaches a `try` around it, and the routes catch what they word themselves.
 */
export const served = <A>(c: { var: ApiEnv['Variables'] }, handle: (s: Served) => A | Promise<A>): Promise<A> =>
  c.var.runtime.runPromise(
    Effect.gen(function* () {
      const { env } = yield* ApiConfig;
      const s: Served = {
        env,
        repo: repoOf(env),
        e: yield* Engine,
        home: yield* StoreRoot,
        mcp: yield* McpAsker,
        quota: yield* QuotaAsker,
        memo: yield* ReadMemo,
      };
      return yield* Effect.promise(async () => handle(s));
    }),
  );
