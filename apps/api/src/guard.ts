/**
 * The guard on every write the api serves: a request refused before its body is read, whatever route it is for, by its method, three
 * headers and the names the store is served at (`writeRefused`, proved by `apps/api/contracts/write-guard.contract.ts`), and one Hono
 * middleware that applies it to every request under `/api/` but a GET or a HEAD (`writeGuard`, which app.ts registers before any route).
 * No route keeps words of its own for it: a refusal names the request's method and path, and where the document says what each route takes.
 *
 * Why each: a write is what an agent acts on in the repository — once a tick files it, at once, or once a person starts the card or the
 * workflow — or a person's idea or step gone, or its place, so a page on another site must not be able to make any of them; and a `fetch`
 * with a body, from any page, reaches the api without the browser asking it first, unless the body is JSON.
 *
 * - Addressed to a name that is not this machine (`Host`): a site whose name was pointed at 127.0.0.1, which the browser treats as that
 *   site's own origin. Absent — a client that sends none — is this machine, and so is the loopback on any port. On a store marked
 *   exposed, so is a name it is served at (the contract's `served`, `servedAt` over `servedNamesOf`): the address it binds (`NEMIA_BIND`,
 *   read off `ApiConfig`) and the names the person declares it reached by (`WF_SERVED_NAMES`, read off `StoreConfig`), so a browser on
 *   another device asks a pairing, or claims a link, at the name it opened the board at. Refused 403, `Forbidden`'s reason `host`, in
 *   words that name `WF_SERVED_NAMES` on an exposed store and the loopback on any other.
 * - Made by a page on another site (`Sec-Fetch-Site`, which the browser sets and no page can): anything but `same-origin`, which the board
 *   is, through vite's proxy too. `same-site` is refused: another port on localhost is the same site. Absent is a client outside a
 *   browser, such as curl. Refused 403, `Forbidden`'s reason `site`.
 * - Not sent as `application/json`: the one body a page on another site cannot send without the browser asking the api first, and the api
 *   answers no such question. That holds in a browser too old to send `Sec-Fetch-Site`. Refused 415 (`UnsupportedMediaType`).
 *
 * A write that presents a bearer token (`Authorization: Bearer <token>`) passes the host and the site: a page on another site cannot send
 * that header without the browser asking the api first, which it never answers, and cannot know a token; behind a proxy or a tunnel the
 * `Host` is the store's public name, which only a token makes safe. The token itself is judged before the guard (`callerGate`,
 * src/caller/caller.ts), so one refused there never reaches it. It still says a JSON body, or a form of files (`multipart/form-data`): the
 * one write that sends one, a file uploaded for a start (`POST /api/namespaces/<namespace>/files`), is a client's with a token, and a
 * form a page on another site posts carries no `Authorization` without the browser asking first.
 *
 * A write that presents a token by the board's cookie alone (`TOKEN_COOKIE`, the HttpOnly cookie `POST /api/session` sets,
 * server/session.ts) passes the host, but not the site: a site whose name was pointed at this machine is another origin, which the
 * browser never hands the cookie, and a board reached at a private network's address names that address; but a page on another port of
 * the same host is sent the cookie too (`SameSite=Strict` is by site, and a cookie is scoped by host, not port), so only the board's
 * own page, `same-origin`, or no browser, writes by it.
 *
 * A form of files by the board's cookie (a file the board uploads for a start) passes where it carries the header a script sets
 * (`SCRIPTED_HEADER`, `X-Requested-With`, not empty; the contract's `scripted`), and is refused 415 without it. No HTML form sends that
 * header, and a script of another origin — another site, or another port of this host — cannot set it without the browser asking the
 * api first (a CORS preflight). **This rests on the api answering no CORS**: no `OPTIONS` route and no `Access-Control-Allow-*` header
 * on any answer (`test/no-cors.test.ts`). A change that lets another origin send this header (an `Access-Control-Allow-Headers` naming
 * it, or a wildcard) lets that origin's page make the store keep a file by the person's cookie. The site is still read first, where the
 * browser says it. Not `Sec-Fetch-Site: same-origin` alone: a browser sends no `Sec-Fetch-*` to an address that is not potentially
 * trustworthy (a store exposed over plain http at a network's address), nor does an old one, and that store's board would upload
 * nothing. Not the file's bytes in JSON: a third more bytes, held whole in the api's memory.
 *
 * A write that presents no token at all reaches the guard on an open route alone (a pairing asked or claimed, a first-visit link claimed:
 * `needOf`, src/caller/caller.ts), which judges its own secret: every other route under `/api/` needs a token on every store, loopback
 * included, and the gate refuses one with none 401 `token-required` before the guard reads it (`needOf`, `callerGate`). No write is the
 * person's for presenting none, on loopback or not; the host and the site are still read for it, so a page on another site, or a site whose
 * name points here, asks no pairing.
 *
 * Not `Origin` against `Host`: vite's proxy rewrites `Host` to the api's (`changeOrigin`), so the board's own write would read as another
 * site's.
 */
import { Effect } from 'effect';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { Forbidden, SCRIPTED_HEADER, TOKEN_COOKIE, UnsupportedMediaType } from 'objects';
import type { WriteRefusal, WriteRefused, WriteRequest } from '../contracts/write-guard.contract.ts';
import { servedNamesOf } from 'agent-orchestrator';
import { loopback, nameOf, servedAt } from './address/address.ts';
import { ApiConfig, type ApiEnv } from './layer.ts';
import { bindOf } from './port.ts';
import { StoreConfig } from './store.ts';
import { mediaOf, saysForm, saysJson } from './media/media.ts';

export type { WriteRefusal, WriteRequest } from '../contracts/write-guard.contract.ts';
export { loopback } from './address/address.ts';
export { saysJson } from './media/media.ts';

/**
 * What a request's `Authorization` header presents: no header (`undefined`), a bearer token, or a header of another shape (`null`).
 * @param header The Authorization header's value, or undefined where the request sends none.
 */
export function bearerOf(header: string | undefined): string | undefined | null {
  if (header === undefined) return undefined;
  const match = /^Bearer +(\S+)\s*$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/**
 * The token the board's cookie (`TOKEN_COOKIE`) holds, or `undefined` where the request sends none, or an empty one.
 * @param c The request's context, whose cookies are read.
 */
export const cookieTokenOf = (c: Context): string | undefined => {
  const token = getCookie(c, TOKEN_COOKIE);
  return token === undefined || token === '' ? undefined : token;
};

/**
 * Why a write is refused before its body is read, or null: its host first, neither where it presents a bearer token or the board's
 * cookie; then its site, not where it presents a bearer token; then its body's type, JSON, or a form of files with a bearer token or by
 * the board's cookie with the header a script sets; a read never.
 * @param request The request's method, host, site, content type and whether it presents a bearer token or the board's cookie, and sends
 * the header a script sets.
 */
export const writeRefused: WriteRefused = (request) => {
  if (request.method === 'GET' || request.method === 'HEAD') return null;
  if (!request.bearer && !request.cookie && request.host !== undefined && !loopback(request.host) && !request.served) return 'host';
  if (!request.bearer && request.site !== undefined && request.site !== 'same-origin') return 'site';
  if (request.contentType === undefined) return 'media';
  if (saysJson(request.contentType)) return null;
  if (saysForm(request.contentType) && (request.bearer || (request.cookie && request.scripted))) return null;
  return 'media';
};

/** Where every route is listed, with what it takes. */
const DOCUMENT = 'GET /openapi/v3/nemia/v1';

/**
 * Why a request addressed to `host` is refused, in words that name the fix where it came from: on a store marked exposed (`exposed`), the
 * setting that declares a name it is served at; on any other, the loopback, the one name it is reached at.
 */
const hostWords = (route: string, host: string | undefined, exposed: boolean): string =>
  exposed
    ? `${route} refuses a request with no token addressed to ${host}: this exposed store takes one only at the loopback, the address it binds (NEMIA_BIND) and the names declared in WF_SERVED_NAMES, so that a site whose name points here cannot write through it. If it is a name you reach this store by, declare it in the service's environment, beside the names already there: nemia service install --bind <address> --env WF_SERVED_NAMES=${host === undefined ? '<name>' : nameOf(host)}; nemia doctor says the names it takes.`
    : `${route} refuses a request addressed to ${host}: the api writes only for a request to this machine — localhost, 127.0.0.1 or [::1] — so that a site whose name points here cannot write through it. Reach the api at http://127.0.0.1:<port>.`;

/**
 * `refusal` of the request `route` names, as `objects`' error answers it: in words that say what to do instead, a host's by whether the
 * store is marked exposed (`exposed`).
 */
const answerOf = (refusal: WriteRefusal, route: string, request: WriteRequest, exposed: boolean): Forbidden | UnsupportedMediaType => {
  if (refusal === 'host') return new Forbidden({ reason: 'host', error: hostWords(route, request.host, exposed) });
  if (refusal === 'site')
    return new Forbidden({
      reason: 'site',
      error: `${route} refuses a request made by a page on another site (Sec-Fetch-Site: ${request.site}): a write is what an agent acts on in this repository, or a person's work gone. Make it from the board, or with \`nemia\`.`,
    });
  const media = request.contentType === undefined ? '' : mediaOf(request.contentType);
  if (request.cookie && request.contentType !== undefined && saysForm(request.contentType))
    return new UnsupportedMediaType({
      error: `${route} takes a form of files by the board's cookie only with the header a script sets (\`${SCRIPTED_HEADER}: XMLHttpRequest\`), which no form on another site can send: upload from the board's Start form, or with \`nemia start --input <file>\`.`,
    });
  return new UnsupportedMediaType({
    error: `${route} takes its body as \`content-type: application/json\`, and this request sent ${media ? `\`${media}\`` : 'no content-type'} — a body any page can send without asking. Send JSON with that header, \`{}\` where it takes none: ${DOCUMENT} says what it takes.`,
  });
};

/**
 * Whether the store is marked exposed, and the names it is served at besides the loopback (`servedNamesOf`): the address the api binds,
 * read off the app's environment (`NEMIA_BIND`, as `bindOf` reads it), and the names declared in the store's settings
 * (`WF_SERVED_NAMES`), whose refusal of a value set wrong is thrown.
 */
const servingOf = Effect.gen(function* () {
  const config = yield* StoreConfig;
  const { env } = yield* ApiConfig;
  const exposed = config.exposed;
  if (!exposed) return { exposed, names: [] as readonly string[] };
  const bind = bindOf(env.NEMIA_BIND, exposed);
  return { exposed, names: servedNamesOf(exposed, bind.kind === 'bound' ? bind.host : '', config.servedNames) };
});

/**
 * Every request under `/api/` but a GET or a HEAD, refused before any route reads it where `writeRefused` refuses it: 403 `{ error,
 * reason }` for its host or its site, 415 `{ error }` for a body not sent as JSON. The store's served names (`servingOf`) are read only
 * for a write with no token addressed to a name that is not the loopback, the one the host decides.
 * @param c The request's context.
 * @param next The rest of the request's handling, reached where the write is not refused.
 */
export const writeGuard: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (!path.startsWith('/api/')) return next();
  const bearer = typeof bearerOf(c.req.header('authorization')) === 'string';
  const cookie = !bearer && cookieTokenOf(c) !== undefined;
  const host = c.req.header('host');
  const method = c.req.method;
  const asks = method !== 'GET' && method !== 'HEAD' && !bearer && !cookie && host !== undefined && !loopback(host);
  const serving = asks ? await c.var.runtime.runPromise(servingOf) : { exposed: false, names: [] };
  const request: WriteRequest = {
    method,
    host,
    site: c.req.header('sec-fetch-site'),
    contentType: c.req.header('content-type'),
    bearer,
    cookie,
    served: host !== undefined && servedAt(host, serving.names),
    scripted: (c.req.header(SCRIPTED_HEADER) ?? '').trim() !== '',
  };
  const refusal = writeRefused(request);
  if (refusal === null) return next();
  const answer = answerOf(refusal, `${request.method} ${path}`, request, serving.exposed);
  return c.json(Object.fromEntries(Object.entries(answer)), answer instanceof Forbidden ? 403 : 415);
};

/**
 * One status and what to do next: what the inbox's own check of a card's folder answers before it hands a request to the
 * package (`inbox/inbox.ts`).
 */
export type Refusal = { status: 400 | 403 | 404 | 409 | 415 | 422; error: string };
