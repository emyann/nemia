/**
 * The board's session with an api that asks for a token (`POST` and `DELETE /api/session`, `objects`' `server.signIn` and `signOut`):
 * the token a person pastes is sent once as its bearer, and the api answers by setting it as this browser's cookie, which the browser
 * then sends with every read, the streams' included; the board never reads or writes that cookie itself, the api setting it HttpOnly.
 */
import { SessionAnswer } from 'objects';
import { call, write } from './objects.ts';

/** Sends `token` as the bearer of `POST /api/session`, which sets it as this browser's cookie; rejects where the api refuses it. */
export const signIn = (token: string): Promise<SessionAnswer> =>
  call((c) => c.server.signIn(), {
    ...write(SessionAnswer, 'The token may be kept: reload the page before pasting it again.'),
    headers: { authorization: `Bearer ${token}` },
  });

/** `DELETE /api/session`: the api clears the cookie, so this browser sends no token until one is pasted again. */
export const signOut = (): Promise<SessionAnswer> =>
  call((c) => c.server.signOut(), write(SessionAnswer, 'The token may be forgotten: reload the page to see whether it is asked for.'));
