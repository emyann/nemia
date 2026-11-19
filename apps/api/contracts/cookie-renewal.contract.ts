/**
 * Whether a request renews the board's sign-in (apps/api, src/server/renewal.ts, `cookieRenewed`, asked by `callerGate` in
 * src/caller/caller.ts once the request's token is judged live): the board's HttpOnly cookie (`TOKEN_COOKIE`) is set again with its
 * whole keeping (thirty days) on a read the cookie alone signed in, so a person who opens the board within thirty days of their last
 * visit never meets the page that asks for a token. Renewal sets the cookie the browser already sent: it mints nothing, widens nothing,
 * and no token's record changes.
 *
 * Only the person's sign-in is renewed: a token an agent holds — its session's, or a standing one minted for it — kept in a browser's
 * cookie lapses with the cookie, never renewed. Only a read (`GET`) renews it, so a write keeps the one cookie its own handler sets or
 * clears (`POST /api/session`, `DELETE /api/session`, `POST /api/links/claim`), and only a request whose token came from the cookie: a
 * bearer (the person's `nemia`, an agent, an MCP host) has no cookie to renew. What ends it is left as it is: `Forget this browser's
 * token` clears the cookie (`DELETE /api/session`), and a token retired (`nemia token rm`) is refused `unknown-token`, which clears it.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { CallerKind } from 'objects';

/**
 * Where the token a request was judged by came from: `bearer`, its `Authorization: Bearer <token>`; `cookie`, the board's cookie, read
 * where it presents no bearer; `none`, neither.
 */
export type Presented = 'bearer' | 'cookie' | 'none';

/** The method a read is sent with: the only one that renews. */
const READ = 'GET';

const cookieRenewedSpec = spec<(method: string, presented: Presented, caller: CallerKind) => boolean>({
  ensures: {
    onlyThePersonIsRenewed: {
      description: 'A sign-in an agent holds — its session’s token or a standing one minted for it — is never renewed',
      condition: ({ input: [, , caller], output }) => !output || caller === 'person',
    },
    onlyTheCookieIsRenewed: {
      description: 'A request signed in by a bearer, or by nothing, sets no cookie: only the cookie the browser sent is renewed',
      condition: ({ input: [, presented], output }) => !output || presented === 'cookie',
    },
    onlyAReadRenews: {
      description: 'A write renews nothing, so the cookie a sign-in, a sign-out or a link’s claim sets is the only one its answer carries',
      condition: ({ input: [method], output }) => !output || method === READ,
    },
    thePersonsReadByCookieRenews: {
      description: 'A read the person’s cookie alone signed in renews it, so a board in use stays signed in',
      condition: ({ input: [method, presented, caller], output }) =>
        !(method === READ && presented === 'cookie' && caller === 'person') || output,
    },
  },
});

/** `cookieRenewed`'s type, which `src/server/renewal.ts` takes: it then imports nothing of tsverify. */
export type CookieRenewed = Implementation<typeof cookieRenewedSpec>;
