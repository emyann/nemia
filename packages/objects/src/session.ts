/**
 * The board's session on a daemon (`SessionGroup`), added to the one `Api` (`api.ts`) beside the pairings, the links and the tokens: a
 * browser signs in with one of the person's tokens, which the api keeps as the board's HttpOnly cookie, and signs out by clearing it.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from 'effect/http-api';
import { BadRequest } from './api-errors.ts';
import { SESSION_COOKIE_STATES } from './words.ts';

/**
 * `POST /api/session` and `DELETE /api/session`: the browser's session on this daemon. A post presents one of the person's tokens as a
 * bearer, which the caller gate judges before any route; the answer sets it as the board's HttpOnly cookie (`TOKEN_COOKIE`), which the
 * browser then sends on every read, stream and write of the board's, and which no script of the page can read. A delete clears the
 * cookie. Either answers that it did, and never the token.
 */
export const SessionAnswer = Schema.Struct({
  cookie: Schema.Literals(SESSION_COOKIE_STATES).annotate({
    description: "What the call did to the board's cookie: set it, or cleared it.",
  }),
});
export type SessionAnswer = typeof SessionAnswer.Type;

/** The board's session: signed in with a bearer the request carries, and signed out. */
export class SessionGroup extends HttpApiGroup.make('session').add(
  HttpApiEndpoint.post('signIn', '/api/session', { success: SessionAnswer, error: [BadRequest] }).annotate(
    OpenApi.Description,
    "Signs the board in with the bearer the request carries, setting it as the board's HttpOnly cookie, which no script of the page can read. Answers SessionAnswer, that it did, never the token.",
  ),
  HttpApiEndpoint.delete('signOut', '/api/session', { success: SessionAnswer }).annotate(
    OpenApi.Description,
    'Signs the board out, clearing its cookie. Answers SessionAnswer, that it did.',
  ),
) {}
