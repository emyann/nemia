/**
 * The package's refusals as the `Api`'s errors (`objects`), as `REFUSAL_STATUS` maps them for Hono's routes (app.ts): `Missing` a 404,
 * `Conflict` a 409 with the `users` that hold the thing, `Invalid` a 422, each `{ error }` in the package's words; and `answered`, which
 * runs a handler's work over the request's services (`ServedNow`) and fails with those, any other failure left to die, a 500.
 */
import { Context, Effect } from 'effect';
import { isRefusal } from 'agent-orchestrator';
import { Conflict, Invalid, Missing } from 'objects';
import type { Served } from '../layer.ts';

/** The services of the request a handler answers, built by `served` in the Hono route that hands the request on (serve.ts). */
export class ServedNow extends Context.Service<ServedNow, Served>()('api/objects/ServedNow') {}

/** An error the `Api` answers, or the failure itself where it is none of the package's refusals. */
export const refusedAs = (err: unknown): Missing | Conflict | Invalid | undefined => {
  if (!isRefusal(err)) return undefined;
  if (err._tag === 'Missing') return new Missing({ error: err.message });
  if (err._tag === 'Invalid') return new Invalid({ error: err.message });
  return new Conflict({ error: err.message, ...(err.users ? { users: [...err.users] } : {}) });
};

/** `work` over the request's services, failing with the `Api`'s error for a refusal of the package's, dying with anything else. */
export const answered = <A>(work: (s: Served) => Promise<A>): Effect.Effect<A, Missing | Conflict | Invalid, ServedNow> =>
  Effect.gen(function* () {
    const s = yield* ServedNow;
    return yield* Effect.tryPromise({ try: () => work(s), catch: (err) => err }).pipe(
      Effect.catch((err) => {
        const refused = refusedAs(err);
        return refused ? Effect.fail(refused) : Effect.die(err);
      }),
    );
  });
