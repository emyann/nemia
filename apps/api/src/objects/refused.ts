/**
 * The package's refusals as the `Api`'s errors (`objects`), as `REFUSAL_STATUS` maps them for Hono's routes (app.ts): `Missing` a 404,
 * `Conflict` a 409 with the `users` that hold the thing, `Invalid` a 422, each `{ error }` in the package's words; and `answered`, which
 * runs a handler's work over the request's services (`ServedNow`) and fails with those, any other failure left to die, a 500. A handler
 * may throw the `Api`'s own errors, which pass as they are (an `Invalid` keeps its `way` and its `steps`), and words one of the api's
 * `Refusal`s by its status (`statusRefused`). A run's named action answers the refusals of the command pipeline it runs (`actionAnswered`,
 * `actionRefused`): a 400 `BadRequest` and a 502 `WriteFailed` besides.
 */
import { Context, Effect } from 'effect';
import { HttpServerResponse } from 'effect/http';
import { isRefusal } from 'agent-orchestrator';
import { BadRequest, Conflict, Failed, Invalid, Missing, WriteFailed } from 'objects';
import type { CommandRefusal } from '../commands/routes.ts';
import type { Refusal } from '../guard.ts';
import type { Served } from '../layer.ts';

/** The services of the request a handler answers, built by `served` in the Hono route that hands the request on (serve.ts). */
export class ServedNow extends Context.Service<ServedNow, Served>()('api/objects/ServedNow') {}

/** An error the `Api` answers, or the failure itself where it is none of the package's refusals. */
export const refusedAs = (err: unknown): Missing | Conflict | Invalid | undefined => {
  if (err instanceof Missing || err instanceof Conflict || err instanceof Invalid) return err;
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

/** One of the api's `Refusal`s as the `Api`'s error: 404 `Missing`, 409 `Conflict`, any other (400, 403) `Invalid`, a 422. */
export const statusRefused = ({ status, error }: Refusal): Missing | Conflict | Invalid =>
  status === 404 ? new Missing({ error }) : status === 409 ? new Conflict({ error }) : new Invalid({ error });

/**
 * `answered` for a definition's verbs, whose writes touch the disk: a failure that is no refusal of the package's — the disk refusing a
 * file the package let through — answers `Failed`, a 500 in the error's own words, rather than a 500 with no body.
 */
export const answeredWrite = <A>(work: (s: Served) => Promise<A>): Effect.Effect<A, Missing | Conflict | Invalid | Failed, ServedNow> =>
  Effect.gen(function* () {
    const s = yield* ServedNow;
    return yield* Effect.tryPromise({ try: () => work(s), catch: (err) => err }).pipe(
      Effect.catch((err) => {
        const refused = refusedAs(err);
        if (refused) return Effect.fail(refused);
        return err instanceof Error ? Effect.fail(new Failed({ error: err.message })) : Effect.die(err);
      }),
    );
  });

/** What a run's named action refuses with (`objects`' `runActionErrors`). */
export type ActionError = BadRequest | Missing | Conflict | Invalid | WriteFailed;

/**
 * A refusal of the command pipeline (`commandAnswered`, commands/routes.ts) as the `Api`'s error, by its status: 400 `BadRequest`, 404
 * `Missing`, 409 `Conflict`, 422 `Invalid`, 502 `WriteFailed`. The guard's 403 and 415 come before the pipeline, on the route that hands
 * the request on (serve.ts), and are none of its refusals: any other status is a `BadRequest`.
 */
export const actionRefused = ({ status, error }: CommandRefusal): ActionError =>
  status === 404
    ? new Missing({ error })
    : status === 409
      ? new Conflict({ error })
      : status === 422
        ? new Invalid({ error })
        : status === 502
          ? new WriteFailed({ error })
          : new BadRequest({ error });

/**
 * `work` over the request's services for a run's named action: a refusal of the package's, or one of the `Api`'s errors it throws, as
 * `answered` fails with them, the action's own (`BadRequest`, `WriteFailed`) passed as they are; anything else dies, a 500.
 */
export const actionAnswered = <A>(work: (s: Served) => Promise<A>): Effect.Effect<A, ActionError, ServedNow> =>
  Effect.gen(function* () {
    const s = yield* ServedNow;
    return yield* Effect.tryPromise({ try: () => work(s), catch: (err) => err }).pipe(
      Effect.catch((err) => {
        if (err instanceof BadRequest || err instanceof WriteFailed) return Effect.fail(err);
        const refused = refusedAs(err);
        return refused ? Effect.fail(refused) : Effect.die(err);
      }),
    );
  });

/** Whether `err` is a refusal: the package's, or one of the `Api`'s errors a handler throws. */
const refusal = (err: unknown): boolean =>
  isRefusal(err) || [Missing, Conflict, Invalid, BadRequest, WriteFailed, Failed].some((kind) => err instanceof kind);

/**
 * `work`, a failure that is no refusal answered as `app.onError` answers one on a Hono route (`answerError`, app.ts): said on stderr, and a
 * 500 in its own words, `{ error }` — a start that git or the place refused before anything was written, which the queue tries again.
 * What a start answers where the `Api` has no error for it; a refusal is thrown on, for `answered` or `actionAnswered` to answer.
 */
export const orFailed =
  <A>(work: (s: Served) => Promise<A>) =>
  async (s: Served): Promise<A | HttpServerResponse.HttpServerResponse> => {
    try {
      return await work(s);
    } catch (err) {
      if (refusal(err) || !(err instanceof Error)) throw err;
      console.error(err);
      return HttpServerResponse.jsonUnsafe({ error: err.message }, { status: 500 });
    }
  };
