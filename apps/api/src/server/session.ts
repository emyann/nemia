/**
 * The board's session on this daemon (`objects`' `SessionGroup`, `signIn` and `signOut`, served by `sessionHandlers`): the token a person
 * pastes into the board, kept by the browser as an HttpOnly cookie (`TOKEN_COOKIE`) that the api sets and clears, so no script of the page
 * ever reads it, and that the browser then sends on every read, stream and write of the board's (`callerGate`, caller/caller.ts;
 * `writeGuard`, guard.ts).
 *
 * - `POST /api/session` — the token presented as `Authorization: Bearer <token>`, which the caller gate judged before any route (a token
 *   the store never minted is its 401 `unknown-token`), set as the cookie: `HttpOnly; SameSite=Strict; Path=/; Max-Age` 30 days, and
 *   `Secure` only where the request came over https (`overHttps`): a browser drops a `Secure` cookie on plain http, as the board is reached
 *   at a private network's address. A request with no bearer is refused 400 (`BadRequest`), naming how to send one. Answers
 *   `{ cookie: 'set' }`, never the token.
 * - `DELETE /api/session` — the cookie cleared (`Max-Age=0`), `{ cookie: 'cleared' }`.
 *
 * The cookie renews itself while it is used: each read (`GET`) the person's cookie alone signed in sets it again for its whole keeping
 * (`cookieRenewed`, server/renewal.ts, asked by `callerGate`), so its 30 days run from the last visit. Forget (`DELETE /api/session`)
 * and a token removed (`nemia token rm`, refused `unknown-token`, which clears it) end it.
 */
import { Effect } from 'effect';
import { HttpEffect, type HttpServerRequest, HttpServerResponse } from 'effect/http';
import { Api, BadRequest, TOKEN_COOKIE, type SessionAnswer } from 'objects';
import { bearerOf } from '../guard.ts';
import { readsBounded } from '../objects/answer-bound.ts';
import { httpsBy, KEPT } from './keeping.ts';

/**
 * Whether `request` came over https: its own URL's scheme, or a proxy in front that says so (`X-Forwarded-Proto: https`).
 * @param request The request, its URL and its headers.
 */
export const overHttps = (request: HttpServerRequest.HttpServerRequest): boolean =>
  httpsBy(request.headers['x-forwarded-proto'], request.originalUrl);

/** The board's cookie as the browser keeps it, `Secure` where `secure`. */
const cookieOptions = (secure: boolean) => ({ httpOnly: true, sameSite: 'strict', path: '/', secure }) as const;

/**
 * The response's cookie, set to `token` or, with none, cleared, as the handler's answer is sent: what `POST /api/session` sets, and
 * `POST /api/links/claim` too (pairing/pairing.ts), each over the request `overHttps` reads.
 * @param token The token the cookie is set to, or undefined to clear it.
 * @param secure Whether the cookie is sent only over https (overHttps).
 */
export const cookieSent = (token: string | undefined, secure: boolean) =>
  HttpEffect.appendPreResponseHandler((_request, response) =>
    Effect.orDie(
      token === undefined
        ? HttpServerResponse.expireCookie(response, TOKEN_COOKIE, cookieOptions(secure))
        : HttpServerResponse.setCookie(response, TOKEN_COOKIE, token, { ...cookieOptions(secure), maxAge: KEPT }),
    ),
  );

/**
 * `POST /api/session`: the bearer the gate judged, set as the board's cookie; refused 400 where the request presents none.
 * @param request The request, whose Authorization header and scheme are read.
 */
export const signIn = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<SessionAnswer, BadRequest, HttpServerRequest.HttpServerRequest> =>
  Effect.gen(function* () {
    const token = bearerOf(request.headers.authorization);
    if (typeof token !== 'string')
      return yield* Effect.fail(
        new BadRequest({
          error:
            "POST /api/session takes the token to keep as `Authorization: Bearer <token>`, and this request sent none: paste a token of yours — `nemia token add <name>`, at the store's machine, mints one — and send it as that header.",
        }),
      );
    yield* cookieSent(token, overHttps(request));
    return { cookie: 'set' } as const;
  });

/**
 * `DELETE /api/session`: the board's cookie cleared.
 * @param request The request, whose scheme is read.
 */
export const signOut = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<SessionAnswer, never, HttpServerRequest.HttpServerRequest> =>
  Effect.as(cookieSent(undefined, overHttps(request)), { cookie: 'cleared' } as const);

export const sessionHandlers = readsBounded(Api, 'session', (handlers) =>
  handlers.handle('signIn', ({ request }) => signIn(request)).handle('signOut', ({ request }) => signOut(request)),
);
