/**
 * The one typed client of the `Api`: every consumer of the api — the client (`apps/cli`) and the board — makes its client here
 * (`apiClient`), and no other `HttpApiClient` of the `Api` is made in the repository (`tools/guards/test/one-api-client.test.ts`).
 * What it decides once, around the contract both sides share:
 *
 * - each write without a body is sent as `{}` in JSON (`jsonBodied`), as the api's write guard takes it;
 * - the token, a session's or a person's, is presented as `Authorization: Bearer <token>`;
 * - the caller's headers (an `Accept` that asks a list for its `Table`) are set beside it;
 * - every call has a bound (`READ_BOUND_MS` unless the caller gives one), from the request to its body read whole, after which it fails
 *   with the `HttpClientError` of a timeout (`timedOut`); a stream's bound ends at its head;
 * - an answer the `Api` declares no error for, a status outside 2xx, is decoded once into `Answered`: its status, its path and the
 *   api's own words (its JSON body's `error`) where it gave some.
 *
 * Each caller maps a failure into its own error type, since each prints and exits by its own rules.
 */
import { Cause, Data, Effect } from 'effect';
import { HttpClient, HttpClientError, HttpClientRequest, type HttpClientResponse } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import { Api } from './api.ts';
import { jsonBodied } from './write-body.ts';

/**
 * How long a call waits on the api before it gives up: the whole call, from the request to its body read. Thirty seconds, some twenty
 * times the coldest read the client asks on the measured store (the run list, 1.3 s on 100 runs; a run's page, 0.9 s:
 * `tools/store-measure/baselines/s2-vs-s1.txt`), so a store ten times as large on a loaded machine still answers, while a person at the
 * terminal is told within half a minute that an api which took the connection is not answering.
 */
export const READ_BOUND_MS = 30_000;

/** Where the api is and how its caller is known: its token, a session's or a person's, its headers, and its bound. */
export type ApiClientOptions = {
  /** The api's address; `''` for a page served by the api itself, whose requests go to its own origin. */
  readonly baseUrl: string;
  /** The token presented as `Authorization: Bearer <token>`; none where the caller has none. */
  readonly token?: string | undefined;
  /** Headers set on every request beside the token, as an `Accept` that asks a list for its `Table`. */
  readonly headers?: Readonly<Record<string, string>> | undefined;
  /** The bound of each call, in milliseconds: `READ_BOUND_MS` where none is given. */
  readonly boundMs?: number | undefined;
};

/** An answer of the api's that the `Api` declares no error for: its status, the path it was answered to and the api's words, if any. */
export class Answered extends Data.TaggedError('Answered')<{
  readonly status: number;
  readonly path: string;
  readonly said: string | undefined;
}> {}

/** Whether `failed` is a call that gave up at its bound. */
export const timedOut = (failed: unknown): boolean =>
  HttpClientError.isHttpClientError(failed) && failed.reason._tag === 'TransportError' && Cause.isTimeoutError(failed.reason.cause);

/** Whether `response` is a stream of events, whose body is read as it comes and never whole. */
const streams = (response: HttpClientResponse.HttpClientResponse): boolean =>
  (response.headers['content-type'] ?? '').startsWith('text/event-stream');

/** The path of `url`, as an answer names it: past its origin, before its query. */
const pathOf = (url: string): string => url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '').replace(/[?#].*$/, '') || '/';

/** The api's words in `response`'s JSON body (its `error`), where it gave some. */
const saidIn = (response: HttpClientResponse.HttpClientResponse): Effect.Effect<string | undefined> =>
  response.json.pipe(
    Effect.map((body) => {
      const error = (body as { error?: unknown } | null)?.error;
      return typeof error === 'string' && error !== '' ? error : undefined;
    }),
    Effect.orElseSucceed(() => undefined),
  );

/** `failed`, where it is a status outside 2xx the `Api` declares no error for, decoded into `Answered`; else as it is. */
const decodedFailure = (failed: unknown): Effect.Effect<never, unknown> => {
  if (!HttpClientError.isHttpClientError(failed) || !('response' in failed.reason)) return Effect.fail(failed);
  const { response } = failed.reason;
  if (response === undefined || (response.status >= 200 && response.status < 300)) return Effect.fail(failed);
  return Effect.flatMap(saidIn(response), (said) =>
    Effect.fail(new Answered({ status: response.status, path: pathOf(response.request.url), said })),
  );
};

/**
 * The typed client of the `Api` at `options.baseUrl`, as every consumer of the api makes it; it asks for the `HttpClient` it sends with
 * (`FetchHttpClient.layer`, or a page's own `Fetch`).
 */
export const apiClient = (options: ApiClientOptions) =>
  Effect.flatMap(HttpClient.HttpClient, (sent) => {
    const headers = {
      ...(options.token === undefined || options.token === '' ? {} : { authorization: `Bearer ${options.token}` }),
      ...options.headers,
    };
    const httpClient = sent.pipe(
      HttpClient.mapRequest(jsonBodied),
      HttpClient.mapRequest(HttpClientRequest.setHeaders(headers)),
      HttpClient.tap((response) => (streams(response) ? Effect.void : Effect.ignore(response.arrayBuffer))),
      HttpClient.timeout(options.boundMs ?? READ_BOUND_MS),
    );
    return HttpApiClient.makeWith(Api, {
      httpClient,
      baseUrl: options.baseUrl,
      transformResponse: (effect) => Effect.catch(effect, decodedFailure),
    }).pipe(Effect.map((client): HttpApiClient.ForApi<typeof Api, Answered> => client));
  });

/** The typed client `apiClient` makes: every group of the `Api`, each endpoint a method. */
export type ApiClient = Effect.Success<ReturnType<typeof apiClient>>;
