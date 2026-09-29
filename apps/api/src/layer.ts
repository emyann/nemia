/**
 * What the api's handlers run on: the services every route may read, the runtime an app builds from their layer (`appOf` in app.ts), and
 * `served`, which runs a handler on the request's runtime over them. A test gives the api another environment, engine, root or asker by
 * building an app over a layer of its own; nothing a handler reads is fixed when a module loads, the orchestrator's `HOME` aside.
 */
import { Context, Effect, Layer, type ManagedRuntime } from 'effect';
import { McpAsker, repoOf } from './capabilities/capabilities.ts';
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

/** Every service a handler may read: what an app's layer provides whole. */
export type Services = ApiConfig | Engine | StoreRoot | McpAsker | QuotaAsker;

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
      };
      return yield* Effect.promise(async () => handle(s));
    }),
  );
