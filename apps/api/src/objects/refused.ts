/**
 * Every refusal the api answers, as `objects`' error classes, each carrying its own status (`httpApiStatus`): the one map from a refusal
 * to what the api answers (`refusedAs`), read by the `Api`'s handlers (`answered`, `answeredWrite`) and by Hono's routes still beside it
 * (`answerError`, app.ts) alike. The orchestrator's refusals by their tag — `Missing` a 404, `Conflict` a 409 with the `users` that hold
 * the thing, `Invalid` a 422, `Forbidden` a 403 with its reason — the api's own session-token refusal (`Unauthorized`, caller/caller.ts) a
 * 401, and an error of `objects`' a handler throws as it is. No status is written here: each is the class's own (`statusOf`).
 *
 * And what a handler reads its request's services through (`ServedNow`), and the place a namespace names (`answeredIn`).
 */
import { Context, Effect, Schema } from 'effect';
import { HttpEffect, HttpServerResponse } from 'effect/http';
import { isRefusal } from 'agent-orchestrator';
import {
  BadRequest,
  Conflict,
  Failed,
  Forbidden,
  Gone,
  Invalid,
  Missing,
  ReadFailed,
  TooLarge,
  Unauthorized,
  Unjudged,
  UnsupportedMediaType,
  WriteFailed,
} from 'objects';
import { Unauthorized as TokenRefused } from '../caller/index.ts';
import type { Refusal } from '../guard.ts';
import type { Served } from '../layer.ts';

/** The services of the request a handler answers, built by `served` in the mount that hands the request on (serve.ts). */
export class ServedNow extends Context.Service<ServedNow, Served>()('api/objects/ServedNow') {}

/** Every error class the api answers with, each its status declared on it. */
const API_ERRORS = [
  BadRequest,
  Missing,
  Conflict,
  Invalid,
  Forbidden,
  Unauthorized,
  UnsupportedMediaType,
  Failed,
  WriteFailed,
  Unjudged,
  ReadFailed,
  TooLarge,
  Gone,
  TooLarge,
] as const;

/** One of the classes the api answers with. */
type ApiErrorClass = (typeof API_ERRORS)[number];

/** An error the api answers with, its status its class's. */
export type ApiError = InstanceType<ApiErrorClass>;

/** The class `err` is of, among those the api answers with. */
const classOf = (err: unknown) => API_ERRORS.find((kind) => err instanceof kind);

/**
 * `err` as the error the api answers it with, or none where it is no refusal: an error of `objects`' as it is; the orchestrator's refusal
 * by its tag, as the class of the same name; the api's own refusal of a session token as `Unauthorized`.
 * @param err What was thrown, of any type.
 */
export const refusedAs = (err: unknown) => {
  if (classOf(err) !== undefined) return err as ApiError;
  if (err instanceof TokenRefused)
    return new Unauthorized({
      error: err.message,
      ...(err.reason === undefined ? {} : { reason: err.reason }),
      ...(err.exposed === undefined ? {} : { exposed: err.exposed }),
    });
  if (!isRefusal(err)) return undefined;
  switch (err._tag) {
    case 'Missing':
      return new Missing({ error: err.message });
    case 'Conflict':
      return new Conflict({ error: err.message, ...(err.users ? { users: [...err.users] } : {}) });
    case 'Invalid':
      return new Invalid({ error: err.message });
    case 'Forbidden':
      return new Forbidden({ error: err.message, reason: err.reason });
  }
};

/**
 * What `error` answers in its body: its own fields, `{ error }` and what its class carries beside it (`users`, `reason`).
 * @param error The api's error.
 */
export const bodyOf = (error: ApiError) =>
  Object.fromEntries(Object.entries(error)) satisfies Record<string, unknown> as Record<string, unknown>;

/** The status `kind` answers with: its `httpApiStatus`, which every class of `objects`' declares. */
const statusOfClass = (kind: ApiErrorClass) => {
  const status: unknown = Schema.resolveAnnotations(kind)?.httpApiStatus;
  if (typeof status !== 'number') throw new Error(`${kind.name} declares no httpApiStatus: give it one in objects' api-errors.ts.`);
  return status;
};

/**
 * The status `error` answers with: its class's.
 * @param error The api's error, as refusedAs answers it.
 */
export const statusOf = (error: ApiError) => {
  const kind = classOf(error);
  if (kind === undefined) throw new Error('statusOf was handed no error of the api: hand it what refusedAs answers.');
  return statusOfClass(kind);
};

/**
 * One of the api's own refusals (`{ status, error }`, said by a reader before the package is asked) as the class among `kinds` — the
 * errors its endpoint declares — whose status it is: no status folded into another. One whose status no class of `kinds` answers is a
 * fault of the reader's, thrown as such.
 * @param kinds The error classes the endpoint declares.
 */
export const declaredAs = <K extends Exclude<ApiErrorClass, typeof Gone>>(
  kinds: readonly K[],
  { status, error }: { status: number; error: string },
) => {
  const kind = kinds.find((k) => statusOfClass(k) === status);
  if (kind === undefined)
    throw new Error(`A refusal of status ${status} reached an endpoint that declares none (${error}): declare its class on the endpoint.`);
  return new kind({ error }) satisfies ApiError;
};

/**
 * The errors a write of the api's own readers refuses with (`Refusal`), by status, as a card's and a definition's endpoints declare them.
 */
const READER_ERRORS = [BadRequest, Missing, Conflict, Invalid] as const;

/**
 * One of the api's own `Refusal`s as the `Api`'s error of its status: 400 `BadRequest`, 404 `Missing`, 409 `Conflict`, 422 `Invalid`.
 * @param refusal The api's own refusal, its status and its words.
 */
export const readerRefused = (refusal: Refusal) => declaredAs(READER_ERRORS, refusal) satisfies ApiError;

/**
 * `work` over the request's services, failing with the error the api answers a refusal with (`refusedAs`), dying with anything else, a
 * 500; or, where `failed`, a failure that is an `Error` and no refusal — the disk refusing a file the package let through — `Failed`, a 500
 * in its own words.
 */
const answering =
  (failed: boolean) =>
  <A>(work: (s: Served) => Promise<A>) =>
    Effect.gen(function* () {
      const s = yield* ServedNow;
      return yield* Effect.tryPromise({ try: () => work(s), catch: (err) => err }).pipe(
        Effect.catch((err) => {
          const refused = refusedAs(err);
          if (refused) return Effect.fail(refused);
          return failed && err instanceof Error ? Effect.fail(new Failed({ error: err.message })) : Effect.die(err);
        }),
      );
    });

/** `work` over the request's services, a refusal answered as the api answers it, anything else a 500 with no body. */
export const answered = answering(false);

/** `answered` for a write that touches the disk: an `Error` that is no refusal answers `Failed`, a 500 in its own words. */
export const answeredWrite = answering(true);

/**
 * `work` over the request's services placed in the factory `namespace` names and on the repository its `?repo=` names (`Served.placedIn`):
 * `default` your library, and the repository a `?repo=` names. What a handler of a namespaced kind runs on that is answered in its
 * namespace's place.
 * @param namespace The namespace the request names, which names its factory.
 * @param work The handler's body, given the services placed in that factory.
 */
export const answeredIn = <A>(namespace: string, work: (s: Served) => Promise<A>) =>
  answered(async (s) => work({ ...s, ...(await s.placedIn(namespace)) }));

/**
 * `answeredIn` for a write that touches the disk (`answeredWrite`).
 * @param namespace The namespace the request names, which names its factory.
 * @param work The handler's body, given the services placed in that factory.
 */
export const answeredWriteIn = <A>(namespace: string, work: (s: Served) => Promise<A>) =>
  answeredWrite(async (s) => work({ ...s, ...(await s.placedIn(namespace)) }));

/**
 * The answer of a start that made the run `id` given its address, `Location: /api/runs/<id>`, where the run object is read whatever
 * namespace the start placed it in: set on the response as it is sent, by the handler that started it.
 * @param id The run's id.
 */
export const locatedAt = (id: string) =>
  HttpEffect.appendPreResponseHandler((_request, response) =>
    Effect.succeed(HttpServerResponse.setHeader(response, 'Location', `/api/runs/${encodeURIComponent(id)}`)),
  );

/**
 * `work`, a failure that is no refusal answered as `app.onError` answers one on a Hono route (`answerError`, app.ts): said on stderr, and a
 * 500 in its own words, `{ error }` — a start that git or the place refused before anything was written, which the queue tries again.
 * What a start answers where the `Api` has no error for it; a refusal is thrown on, for `answered` to answer.
 * @param work The handler's body, given the request's services.
 */
export const orFailed =
  <A>(work: (s: Served) => Promise<A>) =>
  async (s: Served) => {
    try {
      return await work(s);
    } catch (err) {
      if (refusedAs(err) !== undefined || !(err instanceof Error)) throw err;
      console.error(err);
      return HttpServerResponse.jsonUnsafe({ error: err.message }, { status: 500 });
    }
  };
