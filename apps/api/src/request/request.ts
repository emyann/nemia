/**
 * Every request the api answers, said once and traced once (`saidRequest`, the one writer): a line through the app's logger in the
 * daemon's time-first layout — the method, the path, the status and how long it took — inside a server span of the request's own, both
 * carrying OpenTelemetry's HTTP attributes (`attributesOf`). A refusal (4xx) is said a level above an answer and a failure (5xx) a level
 * above that (`sayOf`). A streamed answer says two lines: one when it opens, and one when its body is done, with how long it was open
 * (`piped`); its span ends at the answer, as a span that waits for a connection held for hours is never exported.
 */
import { Effect } from 'effect';
import type { Context, MiddlewareHandler } from 'hono';
import { matchedRoutes } from 'hono/route';
import type { ApiEnv } from '../layer.ts';

/**
 * What a request's line and its span both carry, as OpenTelemetry names them: the method, the path asked for, the status answered, and
 * the route as the router matched it, left off where nothing but the wildcard did (`routeOf`), which is what OTel's semantics ask of a
 * request that reached no route.
 */
export type RequestAttributes = {
  readonly 'http.request.method': string;
  readonly 'url.path': string;
  readonly 'http.response.status_code': number;
  readonly 'http.route'?: string;
};

/** The route the middleware itself is registered on: a match that is only this one is no route of the api's. */
const WILDCARD = '/*';

/**
 * The route the router matched the request to, as its pattern (`/api/runs/:id`), or undefined where nothing but the middleware's own
 * wildcard matched, which is what OTel asks of a request that reached no route. The last of the matched routes, not Hono's own helper for
 * the request's route, which reads the one at the index the dispatcher moves as it runs each handler: what that index names depends on
 * when it is read, while the last line matched is the route whichever handler is running.
 */
const routeOf = (c: Context<ApiEnv>): string | undefined => {
  const path = matchedRoutes(c).at(-1)?.path;
  return path === undefined || path === WILDCARD ? undefined : path;
};

/** The HTTP attributes of `c` once it is answered: its method, its path, its status, and its route where one matched. */
export const attributesOf = (c: Context<ApiEnv>): RequestAttributes => {
  const route = routeOf(c);
  return {
    'http.request.method': c.req.method,
    'url.path': pathOf(c),
    'http.response.status_code': c.res.status,
    ...(route === undefined ? {} : { 'http.route': route }),
  };
};

/** How long a request took or a stream was open, in the daemon's words: whole milliseconds under a second, else seconds to one decimal. */
export const tookOf = (ms: number): string => (ms < 1_000 ? `${Math.round(ms)}ms` : `${(ms / 1_000).toFixed(1)}s`);

/** How a request of `status` is said: an answer at Info, a refusal (4xx) at Warning, a failure (5xx) at Error. */
const sayOf = (status: number): ((message: string) => Effect.Effect<void>) =>
  status >= 500 ? Effect.logError : status >= 400 ? Effect.logWarning : Effect.logInfo;

/** The path a request asked for, its query left off. */
const pathOf = (c: Context<ApiEnv>): string => new URL(c.req.url).pathname;

/**
 * What a request's span is named and carries before it is answered, read without touching `c.res`, whose getter would answer the request
 * with an empty response: the method and the route as OTel names a server span, the method alone where no route matched, and the method,
 * the path and the route as attributes. Its status is annotated on it once it is answered.
 */
const spanOf = (c: Context<ApiEnv>): { name: string; attributes: Record<string, string> } => {
  const route = routeOf(c);
  return {
    name: route === undefined ? c.req.method : `${c.req.method} ${route}`,
    attributes: {
      'http.request.method': c.req.method,
      'url.path': pathOf(c),
      ...(route === undefined ? {} : { 'http.route': route }),
    },
  };
};

/** The request's line, `tail` after its status, at the level its status asks for, annotated with the same attributes its span carries. */
const line = (attributes: RequestAttributes, tail: string): Effect.Effect<void> =>
  sayOf(attributes['http.response.status_code'])(
    `${attributes['http.request.method']} ${attributes['url.path']} ${attributes['http.response.status_code']} ${tail}`,
  ).pipe(Effect.annotateLogs(attributes));

/** Whether the answer is a stream of server-sent events, which says a second line when its body is done. */
const streamed = (c: Context<ApiEnv>): boolean => c.res.headers.get('content-type')?.startsWith('text/event-stream') === true;

/**
 * `body`, the streamed answer's own, relayed through a response of the same status and headers, which says the closing line with how long
 * it was open once the relay is over, however it ended: the writer closed, or the reader gone, which cancels `body` and so reaches the
 * stream's `onAbort` as the reader's own cancel did before. A line the runtime can no longer say is dropped: the api's own shutdown
 * disposes the runtime as its program ends, and a relay that settles after it would reject with nothing left to say it to.
 */
const piped = (c: Context<ApiEnv>, body: ReadableStream<Uint8Array>, attributes: RequestAttributes, began: number): Response => {
  const relay = new TransformStream<Uint8Array, Uint8Array>();
  const closed = (): void => {
    const said = line(attributes, `${tookOf(performance.now() - began)} stream closed`);
    void c.var.runtime.runPromise(said).catch(() => undefined);
  };
  void body.pipeTo(relay.writable).then(closed, closed);
  return new Response(relay.readable, { status: c.res.status, headers: c.res.headers });
};

/** The request answered, then said and annotated on the span it runs in: one line, and a second one due where the answer is a stream. */
const answered = Effect.fnUntraced(function* (c: Context<ApiEnv>, next: () => Promise<void>) {
  const began = performance.now();
  yield* Effect.promise(() => next());
  const took = performance.now() - began;
  const attributes = attributesOf(c);
  yield* Effect.annotateCurrentSpan(attributes);
  const body = streamed(c) ? c.res.body : null;
  yield* line(attributes, body === null ? tookOf(took) : `${tookOf(took)} stream open`);
  if (body !== null) c.res = piped(c, body, attributes, began);
});

/**
 * Every request said and traced, on the app's runtime (`c.var.runtime`), so the line goes through the logger the app's layer holds and the
 * span through its tracer. Registered after the middleware that puts the runtime on the request and before every router, so the route the
 * router matched is already known: Hono matches before it runs a handler, and `matchedRoutes` holds every line the request matched.
 */
export const saidRequest: MiddlewareHandler<ApiEnv> = (c, next) => {
  const span = spanOf(c);
  return c.var.runtime.runPromise(answered(c, next).pipe(Effect.withSpan(span.name, { kind: 'server', attributes: span.attributes })));
};
