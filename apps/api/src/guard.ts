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
 * A write that presents a bearer token (`Authorization: Bearer <token>`) passes the host and the site: a page on another site cannot send
 * that header without the browser asking the api first, which it never answers, and cannot know a token; behind a proxy or a tunnel the
 * `Host` is the store's public name, which only a token makes safe. The token itself is judged before the guard (`callerGate`,
 * src/caller/caller.ts), so one refused there never reaches it. It still says a JSON body.
 *
 * A write that presents a token by the board's cookie alone (`TOKEN_COOKIE`, the HttpOnly cookie `POST /api/session` sets,
 * server/session.ts) passes the host, but not the site: a site whose name was pointed at this machine is another origin, which the
 * browser never hands the cookie, and a board reached at a private network's address names that address; but a page on another port of
 * the same host is sent the cookie too (`SameSite=Strict` is by site, and a cookie is scoped by host, not port), so only the board's
 * own page, `same-origin`, or no browser, writes by it.
 *
 * A write that presents no token at all reaches the guard on a pairing route alone (`PAIR_PATH`, src/caller/caller.ts), which judges its
 * own secret: every other route under `/api/` needs a token on every store, loopback included, and the gate refuses one with none 401
 * `token-required` before the guard reads it (`needOf`, `callerGate`). No write is the person's for presenting none, on loopback or not;
 * the host and the site are still read for it, so a page on another site, or a site whose name points here, asks no pairing.
 *
 * Not `Origin` against `Host`: vite's proxy rewrites `Host` to the api's (`changeOrigin`), so the board's own write would read as another
 * site's.
 */
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { Forbidden, TOKEN_COOKIE, UnsupportedMediaType } from 'objects';
import type { WriteRefusal, WriteRefused, WriteRequest } from '../contracts/write-guard.contract.ts';
import { loopback } from './address/address.ts';
import { mediaOf, saysJson } from './media/media.ts';

export type { WriteRefusal, WriteRequest } from '../contracts/write-guard.contract.ts';
export { loopback } from './address/address.ts';
export { saysJson } from './media/media.ts';

/** What a request's `Authorization` header presents: no header (`undefined`), a bearer token, or a header of another shape (`null`). */
export function bearerOf(header: string | undefined): string | undefined | null {
  if (header === undefined) return undefined;
  const match = /^Bearer +(\S+)\s*$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/** The token the board's cookie (`TOKEN_COOKIE`) holds, or `undefined` where the request sends none, or an empty one. */
export const cookieTokenOf = (c: Context): string | undefined => {
  const token = getCookie(c, TOKEN_COOKIE);
  return token === undefined || token === '' ? undefined : token;
};

/**
 * Why a write is refused before its body is read, or null: its host first, neither where it presents a bearer token or the board's
 * cookie; then its site, not where it presents a bearer token; then its body's type; a read never.
 */
export const writeRefused: WriteRefused = (request) => {
  if (request.method === 'GET' || request.method === 'HEAD') return null;
  if (!request.bearer && !request.cookie && request.host !== undefined && !loopback(request.host)) return 'host';
  if (!request.bearer && request.site !== undefined && request.site !== 'same-origin') return 'site';
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
  const bearer = typeof bearerOf(c.req.header('authorization')) === 'string';
  const request: WriteRequest = {
    method: c.req.method,
    host: c.req.header('host'),
    site: c.req.header('sec-fetch-site'),
    contentType: c.req.header('content-type'),
    bearer,
    cookie: !bearer && cookieTokenOf(c) !== undefined,
  };
  const refusal = writeRefused(request);
  if (refusal === null) return next();
  const answer = answerOf(refusal, `${request.method} ${path}`, request);
  return c.json(Object.fromEntries(Object.entries(answer)), answer instanceof Forbidden ? 403 : 415);
};

/**
 * One status and what to do next: what the inbox's own check of a card's folder answers before it hands a request to the
 * package (`inbox/inbox.ts`).
 */
export type Refusal = { status: 400 | 403 | 404 | 409 | 415 | 422; error: string };
