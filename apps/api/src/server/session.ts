/**
 * The board's session on this daemon (`objects`' `ServerGroup`, `signIn` and `signOut`): the token a person pastes into the board, kept
 * by the browser as an HttpOnly cookie (`TOKEN_COOKIE`) that the api sets and clears, so no script of the page ever reads it, and that
 * the browser then sends on every read, stream and write of the board's (`callerGate`, caller/caller.ts; `writeGuard`, guard.ts).
 *
 * - `POST /api/session` — the token presented as `Authorization: Bearer <token>`, which the caller gate judged before any route (a token
 *   the store never minted is its 401 `unknown-token`), set as the cookie: `HttpOnly; SameSite=Strict; Path=/; Max-Age` 30 days, and
 *   `Secure` only where the request came over https (`overHttps`): a browser drops a `Secure` cookie on plain http, as the board is reached
 *   at a private network's address. A request with no bearer is refused 400 (`BadRequest`), naming how to send one. Answers
 *   `{ cookie: 'set' }`, never the token.
 * - `DELETE /api/session` — the cookie cleared (`Max-Age=0`), `{ cookie: 'cleared' }`.
 */
import { Duration, Effect } from 'effect';
import { HttpEffect, type HttpServerRequest, HttpServerResponse } from 'effect/http';
import { BadRequest, TOKEN_COOKIE, type SessionAnswer } from 'objects';
import { bearerOf } from '../guard.ts';

/** How long the browser keeps the board's cookie: a person signs in again once a month, or as the token is removed. */
const KEPT = Duration.days(30);

/** The first value of `header`, a proxy's list (`https, http`) read at its first, in lower case. */
const firstOf = (header: string | undefined): string => (header ?? '').split(',')[0]?.trim().toLowerCase() ?? '';

/** Whether `request` came over https: its own URL's scheme, or a proxy in front that says so (`X-Forwarded-Proto: https`). */
export function overHttps(request: HttpServerRequest.HttpServerRequest): boolean {
  if (firstOf(request.headers['x-forwarded-proto']) === 'https') return true;
  try {
    return new URL(request.originalUrl).protocol === 'https:';
  } catch {
    return false;
  }
}

/** The board's cookie as the browser keeps it, `Secure` where `secure`. */
const cookieOptions = (secure: boolean) => ({ httpOnly: true, sameSite: 'strict', path: '/', secure }) as const;

/** The response's cookie, set to `token` or, with none, cleared, as the handler's answer is sent. */
const cookieSent = (token: string | undefined, secure: boolean) =>
  HttpEffect.appendPreResponseHandler((_request, response) =>
    Effect.orDie(
      token === undefined
        ? HttpServerResponse.expireCookie(response, TOKEN_COOKIE, cookieOptions(secure))
        : HttpServerResponse.setCookie(response, TOKEN_COOKIE, token, { ...cookieOptions(secure), maxAge: KEPT }),
    ),
  );

/** `POST /api/session`: the bearer the gate judged, set as the board's cookie; refused 400 where the request presents none. */
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

/** `DELETE /api/session`: the board's cookie cleared. */
export const signOut = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<SessionAnswer, never, HttpServerRequest.HttpServerRequest> =>
  Effect.as(cookieSent(undefined, overHttps(request)), { cookie: 'cleared' } as const);
