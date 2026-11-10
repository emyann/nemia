/**
 * The guard on every write the api serves: a request refused before its body is read, whatever route it is for, by its method and three
 * headers alone (`writeRefused`, proved by `apps/api/contracts/write-guard.contract.ts`), and one Hono middleware that applies it to every
 * request under `/api/` but a GET or a HEAD (`writeGuard`, which app.ts registers before any route). No route keeps words of its own for
 * it: a refusal names the request's method and path, and where the document says what each route takes.
 *
 * Why each: a write is what an agent acts on in the repository — once a tick files it, at once, or once a person starts the card or the
 * workflow — or a person's idea or step gone, or its place, so a page on another site must not be able to make any of them; and a `fetch`
 * with a body, from any page, reaches the api without the browser asking it first, unless the body is JSON.
 *
 * - Addressed to a name that is not this machine (`Host`): a site whose name was pointed at 127.0.0.1, which the browser treats as that
 *   site's own origin. Absent — a client that sends none — is this machine. Refused 403, `Forbidden`'s reason `host`.
 * - Made by a page on another site (`Sec-Fetch-Site`, which the browser sets and no page can): anything but `same-origin`, which the board
 *   is, through vite's proxy too. `same-site` is refused: another port on localhost is the same site. Absent is a client outside a
 *   browser, such as curl. Refused 403, `Forbidden`'s reason `site`.
 * - Not sent as `application/json`: the one body a page on another site cannot send without the browser asking the api first, and the api
 *   answers no such question. That holds in a browser too old to send `Sec-Fetch-Site`. Refused 415 (`UnsupportedMediaType`).
 *
 * Not `Origin` against `Host`: vite's proxy rewrites `Host` to the api's (`changeOrigin`), so the board's own write would read as another
 * site's.
 */
import type { MiddlewareHandler } from 'hono';
import { Forbidden, UnsupportedMediaType } from 'objects';
import type { WriteRefused } from '../contracts/write-guard.contract.ts';

/** A request as the guard reads it: its method, and its `Host`, `Sec-Fetch-Site` and `Content-Type` headers, each absent where not sent. */
export type WriteRequest = {
  readonly method: string;
  readonly host: string | undefined;
  readonly site: string | undefined;
  readonly contentType: string | undefined;
};

/** Which refusal a write meets: another host, another site, or a body that is not JSON. */
export type WriteRefusal = 'host' | 'site' | 'media';

/** The names a write may be addressed to: this machine's loopback, on any port. The api listens on 127.0.0.1 alone (port.ts). */
const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

/** Whether `host` names this machine's loopback, on any port, in any case, the white space around it left out. */
export const loopback = (host: string): boolean => LOOPBACK_HOST.test(host.trim());

/** The media type `type` says, its parameters (`; charset=utf-8`), its case and its white space left out. */
const mediaOf = (type: string): string => type.split(';')[0]?.trim().toLowerCase() ?? '';

/** Whether `type` says a JSON body: `application/json`, whatever its parameters, case and white space. */
export const saysJson = (type: string): boolean => mediaOf(type) === 'application/json';

/** Why a write is refused before its body is read, or null: its host first, then its site, then its body's type; a read never. */
export const writeRefused: WriteRefused = (request) => {
  if (request.method === 'GET' || request.method === 'HEAD') return null;
  if (request.host !== undefined && !loopback(request.host)) return 'host';
  if (request.site !== undefined && request.site !== 'same-origin') return 'site';
  if (request.contentType === undefined || !saysJson(request.contentType)) return 'media';
  return null;
};

/** Where every route is listed, with what it takes. */
const DOCUMENT = 'GET /openapi/v3/nemia/v1';

/** `refusal` of the request `route` names, as `objects`' error answers it: in words that say what to do instead. */
const answerOf = (refusal: WriteRefusal, route: string, request: WriteRequest): Forbidden | UnsupportedMediaType => {
  if (refusal === 'host')
    return new Forbidden({
      reason: 'host',
      error: `${route} refuses a request addressed to ${request.host}: the api writes only for a request to this machine — localhost, 127.0.0.1 or [::1] — so that a site whose name points here cannot write through it. Reach the api at http://127.0.0.1:<port>.`,
    });
  if (refusal === 'site')
    return new Forbidden({
      reason: 'site',
      error: `${route} refuses a request made by a page on another site (Sec-Fetch-Site: ${request.site}): a write is what an agent acts on in this repository, or a person's work gone. Make it from the board, or with \`nemia\`.`,
    });
  const media = request.contentType === undefined ? '' : mediaOf(request.contentType);
  return new UnsupportedMediaType({
    error: `${route} takes its body as \`content-type: application/json\`, and this request sent ${media ? `\`${media}\`` : 'no content-type'} — a body any page can send without asking. Send JSON with that header, \`{}\` where it takes none: ${DOCUMENT} says what it takes.`,
  });
};

/**
 * Every request under `/api/` but a GET or a HEAD, refused before any route reads it where `writeRefused` refuses it: 403 `{ error,
 * reason }` for its host or its site, 415 `{ error }` for a body not sent as JSON.
 */
export const writeGuard: MiddlewareHandler = async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (!path.startsWith('/api/')) return next();
  const request: WriteRequest = {
    method: c.req.method,
    host: c.req.header('host'),
    site: c.req.header('sec-fetch-site'),
    contentType: c.req.header('content-type'),
  };
  const refusal = writeRefused(request);
  if (refusal === null) return next();
  const answer = answerOf(refusal, `${request.method} ${path}`, request);
  return c.json(Object.fromEntries(Object.entries(answer)), answer instanceof Forbidden ? 403 : 415);
};

/**
 * One status and what to do next: what the api's own readers (body.ts, the inbox's and the extensions' checks) answer before they hand a
 * request to the package. Kept here until the parts that move those readers onto the `Api`'s Schemas remove it.
 */
export type Refusal = { status: 400 | 403 | 404 | 409 | 415 | 422; error: string };

/**
 * A write as the guard's refusals once worded it, route by route. No longer read: the guard is `writeGuard`'s, with no words of a route's.
 * Kept only for the words the builder still spells (workflows/builder.ts `buildGuard`), removed by the part that moves its route onto the
 * `Api`.
 */
export type Guarded = {
  route: string;
  does: string;
  forAnother: string;
  why: string;
  reach: string;
  instead: string;
  shape: string;
};
