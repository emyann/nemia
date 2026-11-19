/**
 * Pairing and first-visit links, as `objects` says them (`PairingsGroup`, `LinksGroup`): a browser with no token asks for a pairing
 * (`POST /api/pairings`), shows its code and claims it with its secret until the person approves it (`POST /api/pairings/:id/claim`); a
 * browser opened on a first-visit link claims it (`POST /api/links/claim`), which sets the board's cookie; a signed-in board lists the
 * pairings (`GET /api/pairings`) and approves one by the code the client shows (`POST /api/pairings/approve`, the code in its body).
 */
import { queryOptions } from '@tanstack/react-query';
import { LinkClaimed, Pairing, PairingAsked, PairingClaimed, PairingList } from 'objects';
import { call, read, write } from './objects.ts';

/** How often the pairings are read again while a page shows them: a client's ask is seen within this. */
const PAIRINGS_EVERY_MS = 5_000;

/** The pairings the store keeps, newest first; never a code nor a secret. */
export const pairingsQuery = queryOptions({
  queryKey: ['pairings'],
  queryFn: () => call((c) => c.pairings.list(), read(PairingList)),
  refetchInterval: PAIRINGS_EVERY_MS,
});

/**
 * A pairing asked for under the client name `client`: its id, the code the person approves, the secret it is claimed with.
 * @param client The name the client asks under, which the person reads on the pairing.
 */
export const askPairing = (client: string) =>
  call(
    (c) => c.pairings.ask({ payload: { client } }),
    write(PairingAsked, 'A pairing may have been asked for: it lapses by itself, so ask again.'),
  );

/**
 * A pairing's claim: `waiting` until the person approves it, then `claimed` once, with the token minted for this browser.
 * @param id The pairing's id, as its ask answered.
 * @param secret The secret its ask answered.
 */
export const claimPairing = (id: string, secret: string) =>
  call(
    (c) => c.pairings.claim({ params: { id }, payload: { secret } }),
    write(PairingClaimed, 'The pairing may be used already: ask for another one if this browser still asks for a token.'),
  );

/**
 * A first-visit link claimed: the api sets this browser's cookie, and answers the token's name, never the token.
 * @param secret The secret the first-visit link carries.
 */
export const claimLink = (secret: string) =>
  call(
    (c) => c.links.claim({ payload: { secret } }),
    write(LinkClaimed, 'The link may be used: reload the page to see whether this browser is signed in.'),
  );

/**
 * A pairing approved by the code its client shows, typed by the person: answers the pairing, now claimable.
 * @param code The code the client shows, as the person typed it.
 */
export const approvePairing = (code: string) =>
  call(
    (c) => c.pairings.approve({ payload: { code } }),
    write(Pairing, 'The pairing may be approved: read the pairings again before approving it again.'),
  );
